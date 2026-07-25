from django.contrib.auth.forms import UserCreationForm as BaseUserCreationForm
from django.contrib.auth.forms import UserChangeForm as BaseUserChangeForm

from .models import User


class UserCreationForm(BaseUserCreationForm):
    """
    Add-user form for the Django admin (/admin/authentication/user/add/).

    Django's built-in UserCreationForm is built around AbstractUser's
    'username' field. This project's User model has no username at all —
    email is the login identifier (USERNAME_FIELD = "email") — so using the
    stock form crashes the admin add page with a FieldError. Pointing
    Meta.model/fields at this model (email instead of username) is the
    standard fix for a custom, username-less user model.
    """

    class Meta(BaseUserCreationForm.Meta):
        model = User
        fields = ("email",)


class UserChangeForm(BaseUserChangeForm):
    """Edit-user form for the Django admin — same fix, applied to the
    change/edit page instead of add."""

    class Meta(BaseUserChangeForm.Meta):
        model = User
        fields = "__all__"