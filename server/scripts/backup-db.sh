#!/bin/sh
# Logical PostgreSQL backup with retention.
#
# Usage:
#   DATABASE_URL='postgresql://...' npm run db:backup
#
# Optional:
#   BACKUP_DIR=./backups       destination directory
#   RETENTION_DAYS=7           delete dumps older than this
#
# Schedule it daily from cron (or a Render cron job), copy the directory off the
# database host, and keep ENCRYPTION_KEY escrowed separately: a restore without
# the same key leaves stored WhatsApp/AI credentials unreadable.

set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-7}

command -v pg_dump >/dev/null 2>&1 || {
  echo "pg_dump not found. Install the PostgreSQL client tools." >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/whatsapp-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump --format=custom --no-owner --no-acl --dbname "$DATABASE_URL" --file "$file"

# Keep the newest dump even if every file is older than the retention window.
find "$BACKUP_DIR" -name 'whatsapp-*.dump' -type f -mtime +"$RETENTION_DAYS" \
  ! -name "$(basename "$file")" -delete

echo "Backup written: $file"
