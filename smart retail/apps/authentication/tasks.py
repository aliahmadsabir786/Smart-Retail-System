import logging
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger("apps")


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_verification_email(self, user_id, verification_link):
    from .models import User
    try:
        user = User.objects.get(pk=user_id)
        html_message = render_to_string(
            "emails/verify_email.html",
            {"user": user, "verification_link": verification_link},
        )
        send_mail(
            subject="Verify your SmartRetail ERP account",
            message=strip_tags(html_message),
            html_message=html_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
    except Exception as exc:
        logger.exception("Failed to send verification email to user %s", user_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_password_reset_email(self, user_id, reset_link):
    from .models import User
    try:
        user = User.objects.get(pk=user_id)
        html_message = render_to_string(
            "emails/password_reset.html",
            {"user": user, "reset_link": reset_link},
        )
        send_mail(
            subject="Reset your SmartRetail ERP password",
            message=strip_tags(html_message),
            html_message=html_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
    except Exception as exc:
        logger.exception("Failed to send password reset email to user %s", user_id)
        raise self.retry(exc=exc)
