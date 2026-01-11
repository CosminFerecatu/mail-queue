#!/bin/bash
#
# PostgreSQL Backup Script for Mail Queue
#
# Features:
# - Full pg_dump with compression
# - Optional encryption with GPG
# - Upload to S3/GCS
# - Retention management
# - Slack notifications
#
# Usage:
#   ./pg-backup.sh                    # Basic backup
#   ./pg-backup.sh -c zstd            # Use zstd compression
#   ./pg-backup.sh -e                 # Encrypt with GPG
#   ./pg-backup.sh -u s3              # Upload to S3
#   ./pg-backup.sh -n                 # Send Slack notification
#

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION="${COMPRESSION:-gzip}"
ENCRYPT="${ENCRYPT:-false}"
UPLOAD="${UPLOAD:-none}"
NOTIFY="${NOTIFY:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Database connection
DATABASE_URL="${DATABASE_URL:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mailqueue}"
DB_USER="${DB_USER:-postgres}"

# Cloud storage
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"

# Notifications
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

# Timestamps
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)
BACKUP_NAME="mailqueue_${TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[$timestamp] [$level] $message"
}

error_exit() {
    log "ERROR" "$1"
    send_notification "failure" "$1"
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--compression)
                COMPRESSION="$2"
                shift 2
                ;;
            -e|--encrypt)
                ENCRYPT=true
                shift
                ;;
            -u|--upload)
                UPLOAD="$2"
                shift 2
                ;;
            -n|--notify)
                NOTIFY=true
                shift
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done
}

show_help() {
    cat << EOF
PostgreSQL Backup Script for Mail Queue

Usage: $0 [OPTIONS]

Options:
  -c, --compression TYPE   Compression type: gzip, zstd, none (default: gzip)
  -e, --encrypt            Encrypt backup with GPG
  -u, --upload DEST        Upload destination: s3, gcs, none (default: none)
  -n, --notify             Send Slack notification
  -r, --retention DAYS     Retention days for local backups (default: 30)
  -d, --dry-run            Show what would be done without doing it
  -h, --help               Show this help message

Environment Variables:
  DATABASE_URL             PostgreSQL connection string
  DB_HOST, DB_PORT         Database connection details
  DB_NAME, DB_USER         Database name and user
  BACKUP_DIR               Local backup directory
  S3_BUCKET                S3 bucket for uploads
  GCS_BUCKET               GCS bucket for uploads
  SLACK_WEBHOOK_URL        Slack webhook for notifications
  GPG_RECIPIENT            GPG key ID for encryption

Examples:
  $0 -c zstd -u s3 -n      Backup with zstd, upload to S3, notify
  $0 -e -u gcs             Encrypted backup, upload to GCS
  $0 -r 7                  Keep only 7 days of local backups
EOF
}

check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    if ! command -v pg_dump &> /dev/null; then
        error_exit "pg_dump is required but not installed"
    fi

    case $COMPRESSION in
        gzip)
            if ! command -v gzip &> /dev/null; then
                error_exit "gzip is required but not installed"
            fi
            ;;
        zstd)
            if ! command -v zstd &> /dev/null; then
                error_exit "zstd is required but not installed"
            fi
            ;;
    esac

    if [[ "$ENCRYPT" == "true" ]]; then
        if ! command -v gpg &> /dev/null; then
            error_exit "gpg is required for encryption but not installed"
        fi
    fi

    if [[ "$UPLOAD" == "s3" ]]; then
        if ! command -v aws &> /dev/null; then
            error_exit "aws-cli is required for S3 upload but not installed"
        fi
    fi

    if [[ "$UPLOAD" == "gcs" ]]; then
        if ! command -v gsutil &> /dev/null; then
            error_exit "gsutil is required for GCS upload but not installed"
        fi
    fi
}

setup_directories() {
    log "INFO" "Setting up directories..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would create directory: $BACKUP_DIR"
        return
    fi

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/daily"
    mkdir -p "$BACKUP_DIR/weekly"
    mkdir -p "$BACKUP_DIR/monthly"
}

get_connection_string() {
    if [[ -n "$DATABASE_URL" ]]; then
        echo "$DATABASE_URL"
    else
        echo "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    fi
}

perform_backup() {
    log "INFO" "Starting backup of database: $DB_NAME"

    local backup_file="${BACKUP_DIR}/${BACKUP_NAME}.dump"
    local final_file="$backup_file"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would create backup: $backup_file"
        return
    fi

    # Create backup
    log "INFO" "Creating pg_dump..."
    pg_dump \
        --format=custom \
        --verbose \
        --file="$backup_file" \
        --dbname="$(get_connection_string)" \
        2>&1 | tee -a "${BACKUP_DIR}/backup.log"

    if [[ ! -f "$backup_file" ]]; then
        error_exit "Backup file was not created"
    fi

    local size=$(du -h "$backup_file" | cut -f1)
    log "INFO" "Backup created: $backup_file (${size})"

    # Compress
    case $COMPRESSION in
        gzip)
            log "INFO" "Compressing with gzip..."
            gzip -9 "$backup_file"
            final_file="${backup_file}.gz"
            ;;
        zstd)
            log "INFO" "Compressing with zstd..."
            zstd -19 --rm "$backup_file"
            final_file="${backup_file}.zst"
            ;;
    esac

    # Encrypt
    if [[ "$ENCRYPT" == "true" ]]; then
        log "INFO" "Encrypting backup..."
        gpg --encrypt --recipient "${GPG_RECIPIENT:-backup@mailqueue.local}" \
            --output "${final_file}.gpg" "$final_file"
        rm "$final_file"
        final_file="${final_file}.gpg"
    fi

    # Calculate checksum
    sha256sum "$final_file" > "${final_file}.sha256"

    local final_size=$(du -h "$final_file" | cut -f1)
    log "SUCCESS" "Final backup: $final_file (${final_size})"

    # Export for other functions
    export FINAL_BACKUP_FILE="$final_file"
}

upload_backup() {
    if [[ "$UPLOAD" == "none" ]]; then
        return
    fi

    log "INFO" "Uploading backup to $UPLOAD..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would upload $FINAL_BACKUP_FILE to $UPLOAD"
        return
    fi

    case $UPLOAD in
        s3)
            if [[ -z "$S3_BUCKET" ]]; then
                error_exit "S3_BUCKET is not set"
            fi
            aws s3 cp "$FINAL_BACKUP_FILE" "s3://${S3_BUCKET}/postgresql/${DATE}/"
            aws s3 cp "${FINAL_BACKUP_FILE}.sha256" "s3://${S3_BUCKET}/postgresql/${DATE}/"
            log "SUCCESS" "Uploaded to s3://${S3_BUCKET}/postgresql/${DATE}/"
            ;;
        gcs)
            if [[ -z "$GCS_BUCKET" ]]; then
                error_exit "GCS_BUCKET is not set"
            fi
            gsutil cp "$FINAL_BACKUP_FILE" "gs://${GCS_BUCKET}/postgresql/${DATE}/"
            gsutil cp "${FINAL_BACKUP_FILE}.sha256" "gs://${GCS_BUCKET}/postgresql/${DATE}/"
            log "SUCCESS" "Uploaded to gs://${GCS_BUCKET}/postgresql/${DATE}/"
            ;;
    esac
}

cleanup_old_backups() {
    log "INFO" "Cleaning up backups older than $RETENTION_DAYS days..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would delete backups older than $RETENTION_DAYS days"
        find "$BACKUP_DIR" -name "mailqueue_*.dump*" -mtime +$RETENTION_DAYS -print
        return
    fi

    find "$BACKUP_DIR" -name "mailqueue_*.dump*" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "mailqueue_*.sha256" -mtime +$RETENTION_DAYS -delete

    log "INFO" "Cleanup complete"
}

send_notification() {
    local status=$1
    local message=${2:-"Backup completed successfully"}

    if [[ "$NOTIFY" != "true" ]] || [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        return
    fi

    local color
    local icon
    if [[ "$status" == "success" ]]; then
        color="good"
        icon=":white_check_mark:"
    else
        color="danger"
        icon=":x:"
    fi

    local payload=$(cat << EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "$icon Mail Queue Database Backup",
            "text": "$message",
            "fields": [
                {"title": "Database", "value": "$DB_NAME", "short": true},
                {"title": "Timestamp", "value": "$TIMESTAMP", "short": true}
            ]
        }
    ]
}
EOF
)

    curl -s -X POST -H 'Content-type: application/json' \
        --data "$payload" "$SLACK_WEBHOOK_URL" > /dev/null || true
}

main() {
    log "INFO" "=== PostgreSQL Backup Script Started ==="

    parse_args "$@"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "Running in DRY-RUN mode"
    fi

    check_prerequisites
    setup_directories
    perform_backup
    upload_backup
    cleanup_old_backups

    send_notification "success" "Backup completed: ${FINAL_BACKUP_FILE:-N/A}"

    log "INFO" "=== PostgreSQL Backup Script Completed ==="
}

main "$@"
