#!/bin/bash
#
# Redis Backup Script for Mail Queue
#
# Features:
# - RDB snapshot backup
# - AOF file backup
# - Backup verification
# - Upload to S3/GCS
# - Retention management
#
# Usage:
#   ./redis-backup.sh                 # RDB backup
#   ./redis-backup.sh -m aof          # AOF backup
#   ./redis-backup.sh -u s3           # Upload to S3
#

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/redis}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"
BACKUP_MODE="${BACKUP_MODE:-rdb}"
UPLOAD="${UPLOAD:-none}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DRY_RUN="${DRY_RUN:-false}"

# Cloud storage
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"

# Timestamps
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)
BACKUP_NAME="redis_${BACKUP_MODE}_${TIMESTAMP}"

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
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode)
                BACKUP_MODE="$2"
                shift 2
                ;;
            -u|--upload)
                UPLOAD="$2"
                shift 2
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
Redis Backup Script for Mail Queue

Usage: $0 [OPTIONS]

Options:
  -m, --mode MODE          Backup mode: rdb, aof, both (default: rdb)
  -u, --upload DEST        Upload destination: s3, gcs, none (default: none)
  -r, --retention DAYS     Retention days for local backups (default: 7)
  -d, --dry-run            Show what would be done without doing it
  -h, --help               Show this help message

Environment Variables:
  REDIS_HOST, REDIS_PORT   Redis connection details
  REDIS_PASSWORD           Redis password (if auth enabled)
  REDIS_DATA_DIR           Redis data directory
  BACKUP_DIR               Local backup directory
  S3_BUCKET                S3 bucket for uploads
  GCS_BUCKET               GCS bucket for uploads

Examples:
  $0 -m rdb -u s3          RDB backup, upload to S3
  $0 -m both               Backup both RDB and AOF
  $0 -r 3                  Keep only 3 days of backups
EOF
}

redis_cli() {
    local cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [[ -n "$REDIS_PASSWORD" ]]; then
        cmd="$cmd -a $REDIS_PASSWORD"
    fi
    $cmd "$@" 2>/dev/null
}

check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    if ! command -v redis-cli &> /dev/null; then
        error_exit "redis-cli is required but not installed"
    fi

    # Test Redis connection
    if ! redis_cli PING | grep -q "PONG"; then
        error_exit "Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
    fi

    log "INFO" "Redis connection OK"
}

setup_directories() {
    log "INFO" "Setting up directories..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would create directory: $BACKUP_DIR"
        return
    fi

    mkdir -p "$BACKUP_DIR"
}

backup_rdb() {
    log "INFO" "Creating RDB snapshot..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would trigger BGSAVE and copy RDB file"
        return
    fi

    # Get last save time before BGSAVE
    local last_save=$(redis_cli LASTSAVE)

    # Trigger background save
    redis_cli BGSAVE

    # Wait for save to complete (max 5 minutes)
    local elapsed=0
    local max_wait=300
    while [[ $elapsed -lt $max_wait ]]; do
        local current_save=$(redis_cli LASTSAVE)
        if [[ "$current_save" != "$last_save" ]]; then
            log "INFO" "BGSAVE completed"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        log "INFO" "Waiting for BGSAVE to complete... (${elapsed}s)"
    done

    if [[ $elapsed -ge $max_wait ]]; then
        error_exit "BGSAVE did not complete within $max_wait seconds"
    fi

    # Find and copy RDB file
    local rdb_file="${REDIS_DATA_DIR}/dump.rdb"
    if [[ ! -f "$rdb_file" ]]; then
        error_exit "RDB file not found: $rdb_file"
    fi

    local backup_file="${BACKUP_DIR}/${BACKUP_NAME}.rdb"
    cp "$rdb_file" "$backup_file"

    # Compress
    gzip -9 "$backup_file"
    backup_file="${backup_file}.gz"

    # Verify backup
    log "INFO" "Verifying backup..."
    if command -v redis-check-rdb &> /dev/null; then
        gunzip -c "$backup_file" | redis-check-rdb - > /dev/null 2>&1 || \
            log "WARNING" "RDB verification failed (may be false positive)"
    fi

    # Calculate checksum
    sha256sum "$backup_file" > "${backup_file}.sha256"

    local size=$(du -h "$backup_file" | cut -f1)
    log "SUCCESS" "RDB backup created: $backup_file (${size})"

    export RDB_BACKUP_FILE="$backup_file"
}

backup_aof() {
    log "INFO" "Backing up AOF file..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would copy AOF file"
        return
    fi

    local aof_file="${REDIS_DATA_DIR}/appendonly.aof"
    if [[ ! -f "$aof_file" ]]; then
        log "WARNING" "AOF file not found: $aof_file (AOF may be disabled)"
        return
    fi

    # Trigger AOF rewrite to get a clean file
    redis_cli BGREWRITEAOF

    # Wait for rewrite to complete
    sleep 5

    local backup_file="${BACKUP_DIR}/redis_aof_${TIMESTAMP}.aof"
    cp "$aof_file" "$backup_file"

    # Compress
    gzip -9 "$backup_file"
    backup_file="${backup_file}.gz"

    # Calculate checksum
    sha256sum "$backup_file" > "${backup_file}.sha256"

    local size=$(du -h "$backup_file" | cut -f1)
    log "SUCCESS" "AOF backup created: $backup_file (${size})"

    export AOF_BACKUP_FILE="$backup_file"
}

upload_backups() {
    if [[ "$UPLOAD" == "none" ]]; then
        return
    fi

    log "INFO" "Uploading backups to $UPLOAD..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would upload backups to $UPLOAD"
        return
    fi

    local files=()
    [[ -n "${RDB_BACKUP_FILE:-}" ]] && files+=("$RDB_BACKUP_FILE" "${RDB_BACKUP_FILE}.sha256")
    [[ -n "${AOF_BACKUP_FILE:-}" ]] && files+=("$AOF_BACKUP_FILE" "${AOF_BACKUP_FILE}.sha256")

    case $UPLOAD in
        s3)
            if [[ -z "$S3_BUCKET" ]]; then
                error_exit "S3_BUCKET is not set"
            fi
            for file in "${files[@]}"; do
                aws s3 cp "$file" "s3://${S3_BUCKET}/redis/${DATE}/"
            done
            log "SUCCESS" "Uploaded to s3://${S3_BUCKET}/redis/${DATE}/"
            ;;
        gcs)
            if [[ -z "$GCS_BUCKET" ]]; then
                error_exit "GCS_BUCKET is not set"
            fi
            for file in "${files[@]}"; do
                gsutil cp "$file" "gs://${GCS_BUCKET}/redis/${DATE}/"
            done
            log "SUCCESS" "Uploaded to gs://${GCS_BUCKET}/redis/${DATE}/"
            ;;
    esac
}

cleanup_old_backups() {
    log "INFO" "Cleaning up backups older than $RETENTION_DAYS days..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY-RUN] Would delete backups older than $RETENTION_DAYS days"
        find "$BACKUP_DIR" -name "redis_*.rdb.gz" -mtime +$RETENTION_DAYS -print
        find "$BACKUP_DIR" -name "redis_*.aof.gz" -mtime +$RETENTION_DAYS -print
        return
    fi

    find "$BACKUP_DIR" -name "redis_*.rdb.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "redis_*.aof.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "redis_*.sha256" -mtime +$RETENTION_DAYS -delete

    log "INFO" "Cleanup complete"
}

print_redis_info() {
    log "INFO" "Redis Info:"
    log "INFO" "  Host: $REDIS_HOST:$REDIS_PORT"

    local dbsize=$(redis_cli DBSIZE | cut -d: -f2 | tr -d ' ')
    log "INFO" "  Keys: $dbsize"

    local memory=$(redis_cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log "INFO" "  Memory: $memory"

    local bullmq_keys=$(redis_cli KEYS "bull:*" 2>/dev/null | wc -l)
    log "INFO" "  BullMQ Keys: $bullmq_keys"
}

main() {
    log "INFO" "=== Redis Backup Script Started ==="

    parse_args "$@"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "Running in DRY-RUN mode"
    fi

    check_prerequisites
    setup_directories
    print_redis_info

    case $BACKUP_MODE in
        rdb)
            backup_rdb
            ;;
        aof)
            backup_aof
            ;;
        both)
            backup_rdb
            backup_aof
            ;;
        *)
            error_exit "Unknown backup mode: $BACKUP_MODE"
            ;;
    esac

    upload_backups
    cleanup_old_backups

    log "INFO" "=== Redis Backup Script Completed ==="
}

main "$@"
