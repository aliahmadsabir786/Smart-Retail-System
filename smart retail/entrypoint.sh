#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DEBUG: DATABASE_URL is NOT SET"
else
  echo "DEBUG: DATABASE_URL IS SET (starts with: $(echo $DATABASE_URL | cut -c1-15)...)"
fi

echo "Running database migrations..."
python manage.py migrate --noinput

# When Railway runs this image as the WEB service, it passes no custom
# start command, so "$@" is empty here and we fall through to gunicorn as
# before. When it runs this SAME image as a separate Cron Job service
# (Settings → Custom Start Command: "python manage.py run_backup"), "$@"
# is that command — we skip collectstatic/gunicorn entirely and just run
# it, so one Docker image serves both the live app and the monthly backup
# job without needing a second Dockerfile.
if [ "$#" -gt 0 ]; then
  echo "Running custom command: $@"
  exec "$@"
fi

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting gunicorn..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 3