# Makes PyMySQL usable as Django's MySQL backend without needing the
# mysqlclient C extension (which needs a compiler + MySQL dev headers).
# Harmless no-op if you're using Postgres — the import is wrapped in a
# try/except so it never breaks non-Postgres setups.
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass

from .celery import app as celery_app

__all__ = ("celery_app",)
