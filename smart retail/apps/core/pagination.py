from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    # NOTE: several places in the frontend (product/customer lookup caches used
    # by search-as-you-type widgets, brand/category/supplier dropdowns) ask for
    # page_size=500 so they can hold the *entire* list client-side. With the
    # old cap of 100, anything beyond the first 100 rows was silently missing
    # from those caches — e.g. a brand that already existed but wasn't in the
    # first 100 would look "new" to the frontend and it would try to re-create
    # it, hitting the unique constraint. Raised so those bulk lookups actually
    # get everything they ask for.
    max_page_size = 2000

    def get_paginated_response(self, data):
        return Response({
            "success": True,
            "count": self.page.paginator.count,
            "total_pages": self.page.paginator.num_pages,
            "current_page": self.page.number,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })


class LargeResultsPagination(StandardResultsPagination):
    page_size = 50
    max_page_size = 500