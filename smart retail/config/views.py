from pathlib import Path
from django.conf import settings
from django.http import HttpResponse

FRONTEND_DIR = Path(settings.BASE_DIR) / "frontend"

# Assets referenced by a plain "filename" src/href in index.html that should
# get a cache-busting ?v=<mtime> query string appended automatically.
_CACHE_BUSTED_ASSETS = ("script.js", "api.js", "style.css")


def _asset_version(filename):
    """Last-modified time (as an int) of a frontend asset, used as a cheap
    cache-busting token — it changes automatically the moment the file is
    redeployed, so browsers never need a manual hard refresh to pick up the
    latest script.js/api.js/style.css."""
    try:
        return str(int((FRONTEND_DIR / filename).stat().st_mtime))
    except OSError:
        return "0"


def frontend_index(request):
    """
    Serves /frontend/index.html as raw HTML — deliberately NOT run through
    Django's template engine, since the file is a hand-written SPA full of
    literal `{{ }}` -free JS but we still don't want any accidental template
    tag interpretation. FileResponse-style raw read keeps it byte-for-byte.
    """
    index_path = FRONTEND_DIR / "index.html"
    html = index_path.read_text(encoding="utf-8")

    for asset in _CACHE_BUSTED_ASSETS:
        version = _asset_version(asset)
        html = html.replace(f'"{asset}"', f'"{asset}?v={version}"')

    response = HttpResponse(html, content_type="text/html")
    # The HTML shell itself must always be re-fetched (it's what carries the
    # ?v= cache-busting query strings) — only the versioned assets it points
    # to are safe to cache aggressively.
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response