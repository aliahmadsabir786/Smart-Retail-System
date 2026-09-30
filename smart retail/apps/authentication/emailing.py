"""Password-reset email delivery.

Why this exists: the reset email used to be handed to Celery only
(`send_password_reset_email.delay(...)`). If Redis or the Celery worker isn't
running — which is the normal situation on a dev machine — the request still
returned "a reset link has been sent", but the message was never delivered.

Now the default is to send the email in a background thread straight from the
Django process, so the forgot-password flow works with nothing but SMTP
configured. Set EMAIL_SEND_VIA_CELERY=True (production with a worker) to queue
it through Celery instead; if the broker can't be reached it falls back to the
background thread rather than dropping the email.
"""
import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger("apps")


def _expiry_label():
    minutes = max(1, int(settings.PASSWORD_RESET_TIMEOUT) // 60)
    if minutes % 60 == 0:
        hours = minutes // 60
        return f"{hours} hour" + ("" if hours == 1 else "s")
    return f"{minutes} minutes"


def send_password_reset_email_now(user, reset_link):
    """Render and send the reset email right now. Raises on SMTP failure."""
    context = {"user": user, "reset_link": reset_link, "expires_in": _expiry_label()}
    message = EmailMultiAlternatives(
        subject="Reset your SmartRetail ERP password",
        body=render_to_string("emails/password_reset.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(render_to_string("emails/password_reset.html", context), "text/html")
    message.send(fail_silently=False)
    logger.info("Password reset email sent to user %s", user.pk)


def _send_logged(user, reset_link):
    # Clear, actionable log line instead of a confusing SMTP login error when
    # the mail settings were simply never filled in (.env has no credentials).
    if (settings.EMAIL_BACKEND.endswith("smtp.EmailBackend")
            and not getattr(settings, "EMAIL_HOST_USER", "")):
        logger.error(
            "Password reset email to user %s NOT sent: EMAIL_HOST_USER / EMAIL_HOST_PASSWORD are "
            "empty. Set them in .env (Gmail needs an App Password), or use "
            "config.settings.development which prints the email in the terminal.",
            user.pk,
        )
        return
    try:
        send_password_reset_email_now(user, reset_link)
    except Exception:
        logger.exception(
            "Password reset email to user %s FAILED — check EMAIL_HOST / EMAIL_PORT / EMAIL_HOST_USER / "
            "EMAIL_HOST_PASSWORD (Gmail needs an App Password, not the normal password; some hosts, "
            "e.g. Railway free/hobby plans, block outbound SMTP ports entirely).",
            user.pk,
        )


def _run_in_background(fn, *args):
    threading.Thread(target=fn, args=args, daemon=True).start()


def _deliver(user, reset_link):
    """Runs in a background thread — never on the request itself."""
    if getattr(settings, "EMAIL_SEND_VIA_CELERY", False):
        from .tasks import send_password_reset_email
        try:
            # retry=False: if Redis is down, fail immediately instead of
            # retrying the publish for minutes (that used to freeze the
            # forgot-password request for ~2 minutes).
            send_password_reset_email.apply_async(args=(user.id, reset_link), retry=False)
            return
        except Exception:
            logger.exception("Celery broker unreachable — sending the reset email directly instead.")
    _send_logged(user, reset_link)


def dispatch_password_reset_email(user, reset_link):
    """Deliver the reset email without ever blocking or failing the request.

    Everything (including the Celery hand-off) happens in a background
    thread, so the person always gets an instant response.
    """
    _run_in_background(_deliver, user, reset_link)