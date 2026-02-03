#!/bin/sh

# Generate pgpass file with environment variables in a writable location
echo "postgres:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > /tmp/pgpass
chmod 600 /tmp/pgpass

# Start pgAdmin using the original entrypoint
exec /entrypoint.sh
