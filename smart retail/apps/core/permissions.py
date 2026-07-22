from rest_framework.permissions import BasePermission, SAFE_METHODS


class HasRole(BasePermission):
    """
    Generic role-based permission. Use via IsRole.roles([...]) factory below,
    or subclass and set `allowed_roles`.
    """
    allowed_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in self.allowed_roles


def roles_required(*roles):
    """
    Factory that builds a permission class allowing only the given roles.
    Usage: permission_classes = [roles_required("admin", "manager")]
    """
    class _RoleRequired(HasRole):
        allowed_roles = roles
    return _RoleRequired


class IsSuperAdmin(HasRole):
    allowed_roles = ("super_admin",)


class IsAdminOrAbove(HasRole):
    allowed_roles = ("super_admin", "admin")


class IsManagerOrAbove(HasRole):
    allowed_roles = ("super_admin", "admin", "manager")


class IsInventoryManagerOrAbove(HasRole):
    allowed_roles = ("super_admin", "admin", "manager", "inventory_manager")


class IsCashierOrAbove(HasRole):
    # Salesperson needs the same create/hold/finalize/pay access as a
    # cashier — Order Booking and Sale Slips are built entirely on
    # SaleViewSet, which is gated by this permission class.
    allowed_roles = ("super_admin", "admin", "manager", "cashier", "salesperson")


class IsOwnerOrReadOnly(BasePermission):
    """Object-level permission: only the owner (or an admin) may modify."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        owner = getattr(obj, "created_by", None) or getattr(obj, "user", None)
        return request.user.is_superuser or owner == request.user