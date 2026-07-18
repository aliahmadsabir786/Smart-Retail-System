from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from .managers import UserManager


class Role(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Admin"
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Manager"
    CASHIER = "cashier", "Cashier"
    SALESPERSON = "salesperson", "Salesperson"
    INVENTORY_MANAGER = "inventory_manager", "Inventory Manager"
    CUSTOMER = "customer", "Customer"


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """
    Custom user model. Email is the login identifier.
    Role drives RBAC permissions across the whole ERP (see apps.core.permissions).
    """

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=30, choices=Role.choices, default=Role.CUSTOMER)

    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

    date_joined = models.DateTimeField(default=timezone.now)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "auth_user"
        verbose_name = "User"
        verbose_name_plural = "Users"
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["role"]),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name

    @property
    def is_management(self):
        return self.role in {Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER}


class UserActivityLog(TimeStampedModel):
    """Tracks security-relevant user activity: logins, password changes, role changes, etc."""

    class Action(models.TextChoices):
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        PASSWORD_CHANGE = "password_change", "Password Changed"
        PASSWORD_RESET = "password_reset", "Password Reset"
        EMAIL_VERIFIED = "email_verified", "Email Verified"
        PROFILE_UPDATE = "profile_update", "Profile Updated"
        ROLE_CHANGE = "role_change", "Role Changed"
        FAILED_LOGIN = "failed_login", "Failed Login Attempt"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_logs")
    action = models.CharField(max_length=30, choices=Action.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "user_activity_log"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "action"])]

    def __str__(self):
        return f"{self.user.email} — {self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
