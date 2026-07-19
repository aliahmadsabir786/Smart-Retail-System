from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views

app_name = "authentication"

router = DefaultRouter()
router.register("users", views.UserManagementViewSet, basename="user-management")

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("refresh/", views.CustomTokenRefreshView.as_view(), name="token-refresh"),

    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path("password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="password-reset-confirm"),

    path("verify-email/confirm/", views.EmailVerificationConfirmView.as_view(), name="verify-email-confirm"),

    path("profile/", views.ProfileView.as_view(), name="profile"),
] + router.urls
