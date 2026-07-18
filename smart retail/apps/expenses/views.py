from django.db.models import Sum
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsManagerOrAbove
from .models import Expense, ExpenseCategory
from .serializers import ExpenseSerializer, ExpenseCategorySerializer


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsManagerOrAbove]


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("category", "warehouse", "approved_by")
    serializer_class = ExpenseSerializer
    permission_classes = [IsManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "warehouse", "status"]
    search_fields = ["title", "description"]
    ordering_fields = ["expense_date", "amount", "created_at"]

    def perform_create(self, serializer):
        serializer.save(approved_by=self.request.user if serializer.validated_data.get(
            "status", Expense.Status.APPROVED) == Expense.Status.APPROVED else None)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """GET /expenses/summary/?category=&date_from=&date_to= — total expenses grouped by category."""
        qs = self.filter_queryset(self.get_queryset())
        total = qs.aggregate(total=Sum("amount"))["total"] or 0
        by_category = list(
            qs.values("category__name").annotate(total=Sum("amount")).order_by("-total")
        )
        return Response({"success": True, "total": total, "by_category": by_category})
