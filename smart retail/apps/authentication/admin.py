from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User, UserActivityLog


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ["-date_joined"]
    list_display = ["email", "get_full_name", "role", "is_verified", "is_active", "is_staff", "date_joined"]
    list_filter = ["role", "is_active", "is_verified", "is_staff"]
    search_fields = ["email", "first_name", "last_name", "phone"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal Info", {"fields": ("first_name", "last_name", "phone", "avatar")}),
        ("Role & Permissions", {"fields": ("role", "is_active", "is_staff", "is_superuser", "is_verified",
                                            "groups", "user_permissions")}),
        ("Important Dates", {"fields": ("last_login", "date_joined", "last_login_ip")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "first_name", "last_name", "role", "password1", "password2"),
        }),
    )


@admin.register(UserActivityLog)
class UserActivityLogAdmin(admin.ModelAdmin):
    list_display = ["user", "action", "ip_address", "created_at"]
    list_filter = ["action"]
    search_fields = ["user__email", "ip_address"]
    readonly_fields = [f.name for f in UserActivityLog._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False
