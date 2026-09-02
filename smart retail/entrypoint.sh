#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DEBUG: DATABASE_URL is NOT SET"
else
  echo "DEBUG: DATABASE_URL IS SET (starts with: $(echo $DATABASE_URL | cut -c1-15)...)"
fi

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting gunicorn..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 3