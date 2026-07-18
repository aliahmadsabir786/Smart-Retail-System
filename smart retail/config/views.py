from pathlib import Path
from django.conf import settings
from django.http import HttpResponse


def frontend_index(request):
    """
    Serves /frontend/index.html as raw HTML — deliberately NOT run through
    Django's template engine, since the file is a hand-written SPA full of
    literal `{{ }}` -free JS but we still don't want any accidental template
    tag interpretation. FileResponse-style raw read keeps it byte-for-byte.
    """
    index_path = Path(settings.BASE_DIR) / "frontend" / "index.html"
    return HttpResponse(index_path.read_text(encoding="utf-8"), content_type="text/html")
