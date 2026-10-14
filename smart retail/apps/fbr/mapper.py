"""
Sale -> FBR Digital Invoicing payload (spec v1.12).

Pure read-only mapping: nothing here writes to, or changes the behaviour of,
any existing model. The POS total is never altered; this only RE-EXPRESSES
each line the way FBR wants it:

  * The POS adds tax to a line and then takes the discount off the tax-
    inclusive price. Each line's final (tax-inclusive) amount is therefore
    taken as the source of truth, any invoice-level discount (manual/coupon)
    is spread across lines in proportion to their value, and the line is then
    split back into "value excluding sales tax" + "sales tax at the line's rate".
  * Because FBR validates tax = rate x value, tax is computed from the rounded
    value, so totalValues can differ from the POS line by at most 1 paisa.
"""
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from apps.sales.models import Sale

TWO = Decimal("0.01")
FOUR = Decimal("0.0001")
HUNDRED = Decimal("100")

ELIGIBLE_STATUSES = (Sale.Status.COMPLETED, Sale.Status.EDITED)

# Only UoM labels that appear verbatim in FBR's own documentation are mapped
# automatically. Anything else must be set per product (or as the default).
KNOWN_UOM_BY_LOCAL_UNIT = {
    "pcs": "Numbers, pieces, units",
    "kg": "KG",
}

# FBR's `discount` field is left at 0 because valueSalesExcludingST already
# has every discount taken off. If FBR's sandbox turns out to expect the
# pre-discount value instead, change this in one place.
SEND_DISCOUNT_FIELD = False


class MappingError(Exception):
    """The sale can't be expressed as a valid FBR invoice yet (missing/invalid data)."""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__("; ".join(self.problems))


def _q2(v) -> Decimal:
    return Decimal(v).quantize(TWO, rounding=ROUND_HALF_UP)


def _digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def _rate_label(rate: Decimal) -> str:
    return f"{Decimal(rate).normalize():f}%"


def _get_related(obj, attr):
    try:
        return getattr(obj, attr)
    except ObjectDoesNotExist:
        return None


def _seller_block(cfg, problems):
    from apps.settings.models import CompanySettings

    company = CompanySettings.objects.first()
    name = (cfg.seller_business_name or (company.company_name if company else "")).strip()
    address = (cfg.seller_address or (company.address if company else "")).strip()
    ntn = _digits(cfg.seller_ntn_cnic)
    if len(ntn) not in (7, 13):
        problems.append("Seller NTN (7 digits) or CNIC (13 digits) is not set in FBR settings")
    if not name:
        problems.append("Seller business name is missing")
    if not address:
        problems.append("Seller address is missing")
    if not cfg.seller_province.strip():
        problems.append("Seller province is not set in FBR settings")
    return {
        "sellerNTNCNIC": ntn,
        "sellerBusinessName": name,
        "sellerProvince": cfg.seller_province.strip(),
        "sellerAddress": address,
    }


def _buyer_block(sale, cfg, seller, problems):
    customer = sale.customer
    profile = _get_related(customer, "fbr_profile") if customer else None

    registered = bool(profile and profile.registration_type == "Registered")
    if registered:
        ntn = _digits(profile.ntn_cnic)
        if len(ntn) not in (7, 9, 13):
            problems.append(f"Customer '{customer.name}' is marked Registered but has no valid NTN/CNIC in FBR profile")
    else:
        ntn = _digits(profile.ntn_cnic) if profile and profile.ntn_cnic else ""
        if not ntn and customer and len(_digits(customer.cnic)) == 13:
            ntn = _digits(customer.cnic)

    name = (customer.name.strip() if customer and customer.name else "") or "Walk-in Customer"
    province = (profile.province.strip() if profile and profile.province else "") or seller["sellerProvince"]
    address = ((customer.address or customer.city or "").strip() if customer else "") or seller["sellerAddress"]

    return {
        "buyerNTNCNIC": ntn,
        "buyerBusinessName": name,
        "buyerProvince": province,
        "buyerAddress": address,
        "buyerRegistrationType": "Registered" if registered else "Unregistered",
    }


def _split_extra_discount(line_totals, extra):
    """Spreads `extra` (tax-inclusive, in rupees) over lines in proportion to their value."""
    if extra <= 0 or not line_totals:
        return [Decimal("0.00")] * len(line_totals)
    total = sum(line_totals)
    if total <= 0:
        return [Decimal("0.00")] * len(line_totals)
    shares, running = [], Decimal("0.00")
    for i, lt in enumerate(line_totals):
        if i == len(line_totals) - 1:
            share = _q2(extra - running)
        else:
            share = _q2(extra * lt / total)
        share = min(share, lt)
        shares.append(share)
        running += share
    return shares


def build_payload(sale, cfg) -> dict:
    problems = []

    if sale.status not in ELIGIBLE_STATUSES:
        raise MappingError([f"Only completed invoices can be sent to FBR (this one is '{sale.status}')"])

    items = list(sale.items.select_related("product"))
    if not items:
        raise MappingError(["This invoice has no items"])

    seller = _seller_block(cfg, problems)
    buyer = _buyer_block(sale, cfg, seller, problems)

    line_totals = [it.line_total for it in items]
    extra = max(Decimal("0.00"), _q2(sum(line_totals) - sale.total_amount))
    extra_shares = _split_extra_discount(line_totals, extra)

    out_items = []
    for idx, (it, lt, share) in enumerate(zip(items, line_totals, extra_shares), start=1):
        product = it.product
        profile = _get_related(product, "fbr_profile")

        hs_code = ((profile.hs_code if profile else "") or cfg.default_hs_code).strip()
        uom = ((profile.uom if profile else "")
               or KNOWN_UOM_BY_LOCAL_UNIT.get(product.unit, "")
               or cfg.default_uom).strip()
        sale_type = ((profile.sale_type if profile else "") or cfg.default_sale_type).strip()
        label = f"'{product.name}' ({product.sku})"
        if not hs_code:
            problems.append(f"Product {label} has no HS code (set it in the product's FBR profile or the default)")
        if not uom:
            problems.append(f"Product {label} has no FBR unit of measure")
        if not sale_type:
            problems.append(f"Product {label} has no FBR sale type")

        rate = Decimal(it.tax_percent)
        net_total = max(Decimal("0.00"), lt - share)
        value_excl = _q2(net_total / (Decimal("1") + rate / HUNDRED))
        tax = _q2(value_excl * rate / HUNDRED)
        further_pct = Decimal(profile.further_tax_percent) if profile else Decimal("0")
        further = _q2(value_excl * further_pct / HUNDRED)

        out_items.append({
            "hsCode": hs_code,
            "productDescription": product.name,
            "rate": _rate_label(rate),
            "uoM": uom,
            "quantity": float(Decimal(it.quantity).quantize(FOUR)),
            "totalValues": float(value_excl + tax),
            "valueSalesExcludingST": float(value_excl),
            "fixedNotifiedValueOrRetailPrice": 0.0,
            "salesTaxApplicable": float(tax),
            "salesTaxWithheldAtSource": 0.0,
            "extraTax": 0.0,
            "furtherTax": float(further),
            "sroScheduleNo": (profile.sro_schedule_no if profile else ""),
            "fedPayable": 0.0,
            "discount": float(_q2(it.line_discount)) if SEND_DISCOUNT_FIELD else 0.0,
            "saleType": sale_type,
            "sroItemSerialNo": (profile.sro_item_serial_no if profile else ""),
        })

    if problems:
        raise MappingError(problems)

    payload = {
        "invoiceType": "Sale Invoice",
        "invoiceDate": timezone.localtime(sale.created_at).date().isoformat(),
        **seller,
        **buyer,
        "invoiceRefNo": "",
        "items": out_items,
    }
    if cfg.is_sandbox:
        payload["scenarioId"] = (cfg.sandbox_scenario_id or "SN001").strip()
    return payload


def payload_fingerprint(payload: dict) -> str:
    """Stable hash of what was sent, ignoring the sandbox-only scenario id."""
    body = {k: v for k, v in payload.items() if k != "scenarioId"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
