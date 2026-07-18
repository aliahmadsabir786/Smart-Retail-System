from django.contrib.auth.tokens import default_token_generator
from django.utils import timezone
from rest_framework import generics, status, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema

from .models import User, UserActivityLog
from .serializers import (
    RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer,
    ChangePasswordSerializer, PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer, EmailVerificationConfirmSerializer,
    build_uid_token_link,
)
from .tokens import email_verification_token
from .tasks import send_verification_email, send_password_reset_email


class LogoutInputSerializer(serializers.Serializer):
    refresh = serializers.CharField()


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def _log_activity(user, action, request, **metadata):
    UserActivityLog.objects.create(
        user=user, action=action,
        ip_address=_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
        metadata=metadata,
    )


class RegisterView(generics.CreateAPIView):
    """POST /api/v1/auth/register/ — public self-registration (customer/salesperson only)."""
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        uid, token, link = build_uid_token_link(
            user, "/verify-email", token_generator=email_verification_token
        )
        send_verification_email.delay(user.id, link)

        return Response({
            "success": True,
            "message": "Account created. Please check your email to verify your account.",
            "user": UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/ — JWT login with role/profile claims embedded."""
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                user = User.objects.get(email=request.data.get("email"))
                user.last_login_ip = _client_ip(request)
                user.last_login = timezone.now()
                user.save(update_fields=["last_login_ip", "last_login"])
                _log_activity(user, UserActivityLog.Action.LOGIN, request)
            except User.DoesNotExist:
                pass
        return response


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklists the given refresh token."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LogoutInputSerializer

    @extend_schema(request=LogoutInputSerializer)
    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
        except KeyError:
            return Response({"success": False, "error": {"message": "refresh token is required"}},
                             status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"success": False, "error": {"message": "Invalid or already blacklisted token"}},
                             status=status.HTTP_400_BAD_REQUEST)

        _log_activity(request.user, UserActivityLog.Action.LOGOUT, request)
        return Response({"success": True, "message": "Logged out successfully."}, status=status.HTTP_200_OK)


class CustomTokenRefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh/ — rotates refresh token (ROTATE_REFRESH_TOKENS=True)."""
    permission_classes = [permissions.AllowAny]


class ChangePasswordView(generics.GenericAPIView):
    """POST /api/v1/auth/change-password/ — authenticated password change."""
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log_activity(request.user, UserActivityLog.Action.PASSWORD_CHANGE, request)
        return Response({"success": True, "message": "Password changed successfully."})


class PasswordResetRequestView(generics.GenericAPIView):
    """POST /api/v1/auth/password-reset/ — always returns 200 to avoid user enumeration."""
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email=email).first()
        if user:
            _, _, link = build_uid_token_link(user, "/reset-password")
            send_password_reset_email.delay(user.id, link)

        return Response({
            "success": True,
            "message": "If an account with that email exists, a reset link has been sent.",
        })


class PasswordResetConfirmView(generics.GenericAPIView):
    """POST /api/v1/auth/password-reset/confirm/ — sets new password from uid+token."""
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        _log_activity(user, UserActivityLog.Action.PASSWORD_RESET, request)
        return Response({"success": True, "message": "Password has been reset. You can now log in."})


class EmailVerificationConfirmView(generics.GenericAPIView):
    """POST /api/v1/auth/verify-email/confirm/ — activates the account via uid+token link."""
    serializer_class = EmailVerificationConfirmSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        _log_activity(user, UserActivityLog.Action.EMAIL_VERIFIED, request)
        return Response({"success": True, "message": "Email verified successfully."})


class ProfileView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/profile/ — current authenticated user's own profile."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        serializer.save()
        _log_activity(self.request.user, UserActivityLog.Action.PROFILE_UPDATE, self.request)
