from rest_framework import serializers
from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    path = serializers.CharField(source="get_path", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "description", "image",
                  "is_active", "path", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def validate_parent(self, value):
        if value and self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError("A category cannot be its own parent.")
        if value and self.instance and value.pk in self.instance.get_descendant_ids():
            raise serializers.ValidationError("Cannot set a descendant as the parent (circular reference).")
        return value


class CategoryTreeSerializer(serializers.ModelSerializer):
    """Recursive serializer for building a full nested category tree."""
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "is_active", "children"]

    def get_children(self, obj):
        children = obj.children.filter(is_deleted=False)
        return CategoryTreeSerializer(children, many=True).data
