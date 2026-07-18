from rest_framework import serializers
from .models import OtherIncome


class OtherIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OtherIncome
        fields = ["id", "title", "category", "amount", "income_date", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class DateRangeQuerySerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
