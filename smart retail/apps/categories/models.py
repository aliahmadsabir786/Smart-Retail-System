from django.db import models
from django.utils.text import slugify
from apps.core.models import BaseModel


class Category(BaseModel):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=170, unique=True, blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True,
        related_name="children", on_delete=models.CASCADE,
    )
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "category"
        ordering = ["name"]
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.get_path()

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def get_path(self):
        """Returns 'Electronics > Phones > Accessories' style breadcrumb."""
        parts = [self.name]
        node = self.parent
        while node:
            parts.insert(0, node.name)
            node = node.parent
        return " > ".join(parts)

    def get_descendant_ids(self):
        """All descendant category IDs (for 'show products in category & subcategories')."""
        ids = [self.id]
        for child in self.children.all():
            ids.extend(child.get_descendant_ids())
        return ids
