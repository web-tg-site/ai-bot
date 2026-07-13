#!/bin/sh
set -e

mkdir -p /app/storage/voice-previews
chown -R node:node /app/storage

exec su node -s /bin/sh -c "cd /app && npx prisma migrate deploy && node dist/src/main.js"
