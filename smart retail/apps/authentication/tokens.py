from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Same HMAC scheme as Django's password reset token, scoped to email verification
    by mixing in is_verified so a token becomes invalid once already used."""

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{timestamp}{user.is_verified}{user.email}"


email_verification_token = EmailVerificationTokenGenerator()
