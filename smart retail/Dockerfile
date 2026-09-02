FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# NOTE ON PATHS: Railway keeps losing/ignoring the "Root Directory" setting
# for this repo, so this Dockerfile is written to work with the build
# CONTEXT set to the REPO ROOT (Root Directory left EMPTY) and the
# "Dockerfile Path" set to "smart retail/Dockerfile". That means every
# source path below is relative to the repo root, not to this file's own
# folder. The folder is named "smart retail" (with a space), so any COPY
# that references it must use the JSON-array ("exec") form — the plain
# `COPY a b` form splits on whitespace and breaks on a space in the path.
COPY ["smart retail/requirements/", "requirements/"]
RUN pip install --no-cache-dir -r requirements/prod.txt

COPY ["smart retail/", "."]

RUN mkdir -p /app/logs /app/staticfiles /app/media

# entrypoint.sh already copied in via the line above (it lives inside
# "smart retail/"). Make it executable and use it as the container's entry.
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]