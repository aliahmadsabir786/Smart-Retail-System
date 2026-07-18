import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from .models import Notification

logger = logging.getLogger("apps")


def notify(user, title, message, channel=Notification.Channel.IN_APP):
    """Creates an in-app Notification row. For EMAIL/SMS/PUSH channels also
    dispatches via the relevant background task."""
    notification = Notification.objects.create(user=user, channel=channel, title=title, message=message)

    if channel == Notification.Channel.EMAIL:
        send_email_notification.delay(user.id, title, message)
    elif channel == Notification.Channel.SMS:
        send_sms_notification.delay(user.id, message)
    elif channel == Notification.Channel.PUSH:
        send_push_notification.delay(user.id, title, message)

    return notification


def notify_many(users, title, message, channel=Notification.Channel.IN_APP):
    return [notify(u, title, message, channel) for u in users]


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_email_notification(self, user_id, title, message):
    from apps.authentication.models import User
    try:
        user = User.objects.get(pk=user_id)
        send_mail(subject=title, message=message, from_email=settings.DEFAULT_FROM_EMAIL,
                   recipient_list=[user.email])
    except Exception as exc:
        logger.exception("Failed to send email notification to user %s", user_id)
        raise self.retry(exc=exc)


@shared_task
def send_sms_notification(user_id, message):
    # Placeholder integration point for an SMS gateway (Twilio, etc).
    logger.info("SMS to user %s: %s", user_id, message)


@shared_task
def send_push_notification(user_id, title, message):
    # Placeholder integration point for a push provider (FCM, APNs, etc).
    logger.info("Push to user %s: %s — %s", user_id, title, message)
