#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Run database migrations
echo "Running database migrations..."
bun run db:migrate

# Now execute the command provided as arguments to this script (e.g., the CMD from Dockerfile)
echo "Starting server..."
exec "$@" 