import pytest
from django.core.cache import caches


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Rate-limit counters live in the 'throttle' cache; start every test with
    empty counters so tests cannot affect one another."""
    caches["throttle"].clear()
    yield
    caches["throttle"].clear()


def _fix_django_context_copy_on_py314():
    """
    Django < 5.2 + Python 3.14: copy(Context()) raises
    "'super' object has no attribute 'dicts'". Django's test client copies every
    rendered template's context, so any test that renders a template (e.g. the
    password-reset email) would crash. This applies Django's own upstream fix
    only when the problem is detected, and only while running the tests.
    """
    try:
        from copy import copy
        from django.template.context import BaseContext, Context
        try:
            copy(Context())
            return
        except AttributeError:
            pass

        def __copy__(self):
            duplicate = BaseContext()
            duplicate.__class__ = self.__class__
            duplicate.__dict__ = copy(self.__dict__)
            duplicate.dicts = self.dicts[:]
            return duplicate

        BaseContext.__copy__ = __copy__
    except Exception:
        pass


_fix_django_context_copy_on_py314()