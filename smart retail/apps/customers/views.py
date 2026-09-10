from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction as db_transaction

from apps.core.permissions import IsManagerOrAbove
from . import services
from .models import Customer, CustomerGroup
from .serializers import CustomerSerializer, CustomerGroupSerializer, CollectPaymentSerializer


class CustomerGroupViewSet(viewsets.ModelViewSet):
    queryset = CustomerGroup.objects.all()
    serializer_class = CustomerGroupSerializer
    permission_classes = [IsManagerOrAbove]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related("group", "user")
    serializer_class = CustomerSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["group", "is_active"]
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["name", "outstanding_balance", "created_at"]

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """
        POST /customers/bulk-create/ — create many customers in ONE request.

        Body: {"items": [{name, phone?, email?, address?, cnic?, loyalty_points?}, ...]}

        Built for bulk import from CSV/Excel — replaces sending one POST per
        row (100 customers = 100 round-trips) with a single request. Every
        row is still validated and saved independently (its own savepoint),
        so one bad row is reported in "errors" without blocking the rest.
        """
        items = request.data.get("items")
        if not isinstance(items, list) or not items:
            return Response({"detail": "Expected a non-empty 'items' list."}, status=status.HTTP_400_BAD_REQUEST)

        created, errors = [], []
        for idx, row in enumerate(items):
            try:
                with db_transaction.atomic():
                    serializer = CustomerSerializer(data=row, context={"request": request})
                    serializer.is_valid(raise_exception=True)
                    customer = serializer.save()
                    created.append(CustomerSerializer(customer, context={"request": request}).data)
            except Exception as exc:
                detail = exc.detail if hasattr(exc, "detail") else str(exc)
                errors.append({"index": idx, "row": row, "error": detail})

        return Response(
            {"success": True, "created_count": len(created), "error_count": len(errors),
             "created": created, "errors": errors},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        """GET /customers/{id}/ledger/ — full statement of account: what's
        owed in total, what's been paid so far, and a dated line for every
        invoice, return, and payment, each with the balance remaining
        right after it."""
        customer = self.get_object()
        ledger = services.get_customer_ledger(customer)
        return Response({"success": True, "customer": customer.name,
                          "amount_owed": ledger["amount_owed"], "total_paid": ledger["total_paid"],
                          "remaining": ledger["remaining"], "entries": ledger["entries"]})

    @action(detail=True, methods=["post"], url_path="collect-payment")
    def collect_payment(self, request, pk=None):
        """POST /customers/{id}/collect-payment/ — record a general cash
        collection against this customer's running balance, for daily
        credit-collection rounds that aren't tied to one specific invoice.
        Shows up as its own dated row in the Ledger Accounts screen."""
        from apps.sales import services as sales_services
        from apps.sales.models import Payment
        from apps.sales.serializers import PaymentSerializer

        customer = self.get_object()
        serializer = CollectPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        payment = sales_services.collect_customer_payment(
            customer, amount=v["amount"], method=v.get("method", Payment.Method.CASH),
            user=request.user, reference=v.get("reference", ""),
        )
        if v.get("occurred_on"):
            Payment.objects.filter(pk=payment.pk).update(created_at=v["occurred_on"])
            payment.refresh_from_db(fields=["created_at"])

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)