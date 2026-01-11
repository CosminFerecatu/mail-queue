# Backup and Restore Guide

This guide covers backup and restore procedures for Mail Queue data stores.

## Overview

| Component | Backup Method | RPO Target | RTO Target |
|-----------|---------------|------------|------------|
| PostgreSQL | pg_dump + WAL | 1 hour | 30 minutes |
| Redis | RDB + AOF | 15 minutes | 15 minutes |

## PostgreSQL Backup

### Automated Daily Backups

Use the provided backup script:

```bash
# Full backup with compression and S3 upload
./scripts/backup/pg-backup.sh -c gzip -u s3 -n

# Options:
#   -c gzip|zstd   Compression type
#   -e             Encrypt with GPG
#   -u s3|gcs      Upload destination
#   -n             Send Slack notification
#   -r DAYS        Retention days (default: 30)
```

### Cron Schedule

```bash
# /etc/cron.d/mailqueue-backup

# Daily full backup at 3 AM UTC
0 3 * * * root /opt/mail-queue/scripts/backup/pg-backup.sh -c gzip -u s3 -n >> /var/log/mailqueue/backup.log 2>&1

# Weekly full backup with longer retention
0 4 * * 0 root /opt/mail-queue/scripts/backup/pg-backup.sh -c zstd -u s3 -r 90

# Hourly WAL archive sync (if using PITR)
0 * * * * postgres /opt/mail-queue/scripts/backup/sync-wal.sh
```

### Point-in-Time Recovery (PITR)

For production systems, enable WAL archiving:

```conf
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://bucket/wal/%f'
archive_timeout = 300
```

### Restore Procedure

1. **Stop all services**
   ```bash
   kubectl scale deployment --all --replicas=0 -n mail-queue
   ```

2. **Download backup**
   ```bash
   aws s3 cp s3://bucket/postgresql/2024-01-15/mailqueue_20240115_030000.dump.gz ./
   gunzip mailqueue_20240115_030000.dump.gz
   ```

3. **Restore database**
   ```bash
   # Drop and recreate database
   psql -c "DROP DATABASE IF EXISTS mailqueue"
   psql -c "CREATE DATABASE mailqueue"

   # Restore
   pg_restore -d mailqueue --verbose mailqueue_20240115_030000.dump
   ```

4. **Apply WAL logs (if PITR)**
   ```bash
   # Copy WAL files to pg_wal
   aws s3 sync s3://bucket/wal/ /var/lib/postgresql/data/pg_wal/

   # Create recovery signal
   touch /var/lib/postgresql/data/recovery.signal

   # Add recovery target
   echo "recovery_target_time = '2024-01-15 12:30:00'" >> postgresql.conf

   # Start PostgreSQL
   pg_ctl start
   ```

5. **Verify and restart services**
   ```bash
   psql -c "SELECT COUNT(*) FROM emails"
   kubectl scale deployment --all --replicas=1 -n mail-queue
   ```

## Redis Backup

### Automated Backups

```bash
# RDB backup
./scripts/backup/redis-backup.sh -m rdb -u s3

# AOF backup
./scripts/backup/redis-backup.sh -m aof -u s3

# Both
./scripts/backup/redis-backup.sh -m both -u s3
```

### Cron Schedule

```bash
# Hourly RDB backup
0 * * * * root /opt/mail-queue/scripts/backup/redis-backup.sh -m rdb -u s3

# Daily AOF backup
0 4 * * * root /opt/mail-queue/scripts/backup/redis-backup.sh -m aof -u s3
```

### Restore Procedure

1. **Stop Redis**
   ```bash
   systemctl stop redis
   # or: kubectl scale deployment redis --replicas=0
   ```

2. **Download and restore**
   ```bash
   aws s3 cp s3://bucket/redis/2024-01-15/redis_rdb_20240115_120000.rdb.gz ./
   gunzip redis_rdb_20240115_120000.rdb.gz

   # Replace dump.rdb
   mv redis_rdb_20240115_120000.rdb /var/lib/redis/dump.rdb
   chown redis:redis /var/lib/redis/dump.rdb
   ```

3. **Start Redis**
   ```bash
   systemctl start redis
   redis-cli DBSIZE  # Verify data loaded
   ```

## Disaster Recovery Runbook

### Scenario: Complete Data Center Failure

**RTO Target**: 2 hours
**RPO Target**: 1 hour

#### Steps:

1. **Assess situation** (5 min)
   - Confirm primary DC is unavailable
   - Activate DR team

2. **Provision infrastructure** (30 min)
   - Deploy to backup region using Terraform/Pulumi
   - Configure DNS failover

3. **Restore PostgreSQL** (30 min)
   - Download latest backup from S3
   - Restore to new RDS instance
   - Apply WAL logs for PITR

4. **Restore Redis** (15 min)
   - Download latest RDB
   - Restore to new ElastiCache

5. **Deploy application** (15 min)
   - Apply Kubernetes manifests
   - Update secrets
   - Verify health checks

6. **Validate and cutover** (15 min)
   - Run smoke tests
   - Update DNS to new region
   - Monitor for errors

### Scenario: Database Corruption

1. **Identify corruption extent**
   ```bash
   pg_dump -Fc mailqueue > /tmp/test.dump
   # If this fails, database is corrupted
   ```

2. **Stop writes immediately**
   ```bash
   kubectl scale deployment mail-queue-api --replicas=0
   kubectl scale deployment mail-queue-worker --replicas=0
   ```

3. **Attempt table-level recovery**
   ```bash
   # Try to dump unaffected tables
   pg_dump -t emails mailqueue > emails.sql
   ```

4. **Full restore if needed**
   ```bash
   # See PostgreSQL restore procedure above
   ```

### Scenario: Redis Data Loss

BullMQ jobs are transient, but some state loss is acceptable:

1. **Assess impact**
   - Check failed jobs can be retried
   - Check scheduled jobs are in database

2. **Restore from backup**
   ```bash
   ./scripts/backup/redis-restore.sh -s s3 latest
   ```

3. **Requeue orphaned jobs**
   ```bash
   # Re-add scheduled jobs from database
   curl -X POST http://localhost:3000/v1/scheduled-jobs/requeue-all
   ```

## Backup Verification

### Weekly Verification

```bash
#!/bin/bash
# verify-backups.sh

# Test PostgreSQL restore
pg_restore --list latest-backup.dump > /dev/null
echo "PostgreSQL backup: OK"

# Test Redis backup
redis-check-rdb latest-backup.rdb > /dev/null
echo "Redis backup: OK"

# Verify backup age
BACKUP_AGE=$(( $(date +%s) - $(stat -c %Y latest-backup.dump) ))
if [[ $BACKUP_AGE -gt 86400 ]]; then
    echo "WARNING: Backup is older than 24 hours"
fi
```

### Monthly DR Test

1. Restore to isolated environment
2. Run application test suite
3. Verify data integrity
4. Document findings and improvements

## Retention Policy

| Type | Daily | Weekly | Monthly |
|------|-------|--------|---------|
| PostgreSQL Full | 7 days | 4 weeks | 12 months |
| PostgreSQL WAL | 7 days | - | - |
| Redis RDB | 3 days | 2 weeks | 3 months |

## Encryption

### At Rest

```bash
# GPG encryption for backups
./scripts/backup/pg-backup.sh -e

# Requires GPG_RECIPIENT environment variable
export GPG_RECIPIENT=backup@mailqueue.local
```

### In Transit

- S3: Use `aws s3 cp --sse aws:kms`
- GCS: Use `gsutil -o GSUtil:encryption_key=...`

## Monitoring

### Alerts

Set up alerts for:
- Backup job failures
- Backup age > 24 hours
- Backup size anomalies (±50%)
- Storage quota warnings

### Metrics

```prometheus
# Backup success rate
mailqueue_backup_success_total
mailqueue_backup_failure_total

# Backup duration
mailqueue_backup_duration_seconds

# Backup size
mailqueue_backup_size_bytes
```
