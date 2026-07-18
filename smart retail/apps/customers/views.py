from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsManagerOrAbove
from .models import Customer, CustomerGroup
from .serializers import CustomerSerializer, CustomerGroupSerializer


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
