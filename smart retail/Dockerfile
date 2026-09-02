FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/prod.txt

COPY . .

RUN mkdir -p /app/logs /app/staticfiles /app/media

EXPOSE 8000

# Shell form (not exec-array form) is required here so that $PORT actually
# gets substituted — Railway (and most PaaS platforms) assign a random port
# at runtime via the PORT env var and route traffic to THAT port, not 8000.
# The old exec-array CMD hardcoded 8000, which works fine for local
# `docker run`/docker-compose, but on Railway specifically, requests to the
# container's actual port would never reach it, and the deploy would sit
# there looking "stuck"/failing even though the image built successfully.
#
# migrate + collectstatic also need to happen here: Railway builds and runs
# the Dockerfile directly, it does NOT read docker-compose.yml, so the
# migrate/collectstatic steps that used to only live in docker-compose.yml's
# `web.command` never ran on Railway at all.
CMD sh -c "python manage.py migrate --noinput && \
           python manage.py collectstatic --noinput && \
           gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 3"