#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Define database connection URL
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/timesheet"
export DATABASE_URL

# Run database migrations
echo "Running database migrations..."
bun run db:migrate

# Now execute the command provided as arguments to this script (e.g., the CMD from Dockerfile)
echo "Starting server..."
exec "$@" 