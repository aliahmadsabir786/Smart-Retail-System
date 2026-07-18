import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import User

logger = logging.getLogger("apps")


@receiver(post_save, sender=User)
def log_user_created(sender, instance, created, **kwargs):
    if created:
        logger.info("New user created: %s (role=%s)", instance.email, instance.role)
