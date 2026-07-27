# SmartRetail ERP — Backend (Complete: Phases 1–5)

Production-grade Django REST backend for the SmartRetail ERP & POS system —
**all 20+ modules from the original spec are implemented, migrated, and tested.**

**67 automated tests, all passing.** Every stock/money-moving operation
(sales, purchases, transfers, payments, returns) runs through an atomic
`services.py` layer with full rollback on failure — see Architecture note below.

## Tech Stack
- Python 3.13, Django 5, Django REST Framework
- PostgreSQL, Redis (cache + Celery broker)
- JWT auth (SimpleJWT) with role claims
- Celery for background email/SMS/push tasks
- drf-spectacular for Swagger/OpenAPI docs
- python-barcode + qrcode for barcode/QR generation
- openpyxl + reportlab for Excel/PDF report exports
- pytest + pytest-django + factory-boy for tests
- Docker & Docker Compose

## Modules

| # | Module | App | Highlights |
|---|---|---|---|
| 1 | Authentication | `authentication` | JWT login/refresh/logout, register, password reset, email verify, activity log |
| 2 | Dashboard | `dashboard` | Today/week/month sales, revenue, profit, inventory value, top products, low/out-of-stock, charts API |
| 3 | User Management | `authentication` | Custom User model, 7 RBAC roles, admin panel |
| 4 | Customer Management | `customers` | Groups, loyalty points, credit limit, outstanding balance |
| 5 | Supplier Management | `suppliers` | Directory, outstanding payable |
| 6 | Product Management | `products` | SKU, auto-barcode, images, variants, tax/discount pricing |
| 7 | Category Management | `categories` | Nested/self-referential, `tree/` endpoint |
| 8 | Brand Management | `brands` | CRUD |
| 9 | Inventory Management | `inventory` | Append-only stock ledger, stock in/out/adjust, low-stock alerts |
| 10 | Warehouse Management | `warehouse` | Multi-warehouse, transfers |
| 11 | Barcode System | `products` | Barcode + QR PNG generation endpoints |
| 12 | Point of Sale | `sales` | Invoice creation, discounts, tax, coupons, returns |
| 13 | Sales Management | `sales` | Orders, invoices, payments (full/partial), returns |
| 14 | Purchase Management | `purchase` | POs, partial/full receiving, supplier payments |
| 15 | Expense Management | `expenses` | Categories, approval status, summary by category |
| 16 | Financial Management | `finance` | Income, P&L, cash flow (from real sales/purchase/expense data) |
| 17 | Reports | `reports` | Sales/Purchase/Inventory/Profit/Customer/Supplier/Tax/Expense — **CSV/Excel/PDF export** |
| 18 | Notifications | `notifications` | In-app + Email (live) + SMS/Push (stubbed integration points) |
| 19 | Audit Logs | `audit` | Generic CRUD trail for Product/Sale/PO/Customer/Supplier/Expense/Warehouse |
| 20 | Settings | `settings` | Singleton company profile, currency, tax, invoice numbering |
| 21 | API Documentation | — | Full Swagger/ReDoc via drf-spectacular |
| 22 | Security | — | JWT, RBAC, CORS, throttling, custom exception envelopes, password hashing |

## Project Structure
```
smartretail/
├── config/                 settings (base/dev/prod), urls, celery, wsgi/asgi
├── apps/
│   ├── core/                base models, pagination, exceptions, middleware, RBAC permissions
│   ├── authentication/       custom User, JWT, RBAC, activity log
│   ├── warehouse/  categories/  brands/  products/    ← catalog
│   ├── inventory/                                       ← stock ledger + services.py
│   ├── customers/  suppliers/                          ← people
│   ├── sales/                                           ← POS/invoicing + services.py
│   ├── purchase/                                        ← POs + services.py
│   ├── expenses/  finance/                             ← money
│   ├── reports/                                        ← exportable reports + utils/export.py
│   ├── notifications/                                  ← in-app/email/sms/push
│   ├── audit/                                          ← generic CRUD trail + thread-local middleware
│   ├── dashboard/                                      ← analytics aggregation
│   └── settings/                                       ← singleton company settings
├── frontend/                     index.html + script.js + api.js + style.css
│                                  (served directly by Django — see config/urls.py)
├── templates/emails/        verification, password reset
├── requirements/            base.txt / dev.txt / prod.txt
├── docker-compose.yml / docker-compose.dev.yml / Dockerfile
├── pytest.ini
└── .env.example
```

**Architecture note:** every module that mutates state (stock, sales, purchases,
payments) puts that logic in a `services.py` file, wrapped in `@transaction.atomic`.
Views are thin — validate input via a serializer, call the service function,
serialize the result. A sale that runs out of stock on item 3 of 5 rolls back
cleanly, including any stock already deducted for items 1–2. Audit logging is
similarly decoupled: `apps/audit/middleware.py` stashes the current user in
thread-local storage so model signal handlers (which have no request access)
can still attribute changes to the right person.

## Roles (RBAC)
`super_admin`, `admin`, `manager`, `cashier`, `salesperson`, `inventory_manager`, `customer`

```python
from apps.core.permissions import IsManagerOrAbove, roles_required
class SomeView(APIView):
    permission_classes = [IsManagerOrAbove]
```

## Using MySQL Instead of Postgres

This project supports MySQL out of the box via `DB_ENGINE=mysql` in `.env`
(already the default in `.env.example`). It uses **PyMySQL** — a pure-Python
driver — instead of `mysqlclient`, so there's no C compiler or MySQL dev
headers needed to install it (works cleanly in Anaconda environments too).

```bash
# In MySQL/MariaDB, once:
CREATE DATABASE smartretail_db CHARACTER SET utf8mb4;
CREATE USER 'smartretail_user'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('your-password');
GRANT ALL PRIVILEGES ON smartretail_db.* TO 'smartretail_user'@'localhost';
FLUSH PRIVILEGES;
```

Then in `.env`: set `DB_ENGINE=mysql`, `DB_USER`, `DB_PASSWORD` to match, and
run `python manage.py migrate` as usual — same command as Postgres.

**Requires MySQL 5.7.8+ / MariaDB 10.2.7+** (needed for the native JSON column
type used by a couple of models — audit logs, activity logs).

**If you'll run `pytest`** against this MySQL server, also grant privileges on
the test database Django creates automatically (`test_` + your DB name):
```sql
GRANT ALL PRIVILEGES ON `test_smartretail_db`.* TO 'smartretail_user'@'localhost';
FLUSH PRIVILEGES;
```

**Note on `mysql_native_password`:** recent MySQL/MariaDB defaults some
accounts to `auth_socket`/`unix_socket` or `caching_sha2_password`, which can
reject PyMySQL's plain password login. Creating the user `IDENTIFIED VIA
mysql_native_password` (shown above) avoids that; `cryptography` is already
in `requirements/base.txt` as a fallback for `caching_sha2_password` if you'd
rather use that instead.

To switch back to Postgres later: set `DB_ENGINE=postgresql` in `.env` and
uncomment the Postgres block there — no code changes needed either way.

## Quick Start — ONE server, ONE command

The frontend (`/frontend/index.html` + `script.js` + `api.js` + `style.css`)
is served directly by Django itself — same origin as the API, no CORS, no
second terminal, no second port. Just:

```bash
python -m venv .venv && source .venv/bin/activate      # or: conda create/activate
pip install -r requirements/dev.txt
cp .env.example .env             # point DB_HOST=localhost, run local Postgres + Redis
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```

Then open **http://localhost:8000/** — that's the full app (UI + API, one server).
- Swagger docs: http://localhost:8000/api/docs/
- Django admin: http://localhost:8000/admin/

## Quick Start (Docker — also single command, includes Postgres+Redis)
```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
docker compose exec web python manage.py seed_data   # in a second terminal, one-time only
```
Same URL: **http://localhost:8000/**

> The frontend lives in `/frontend/` inside this same project — it's wired up
> in `config/urls.py` (root `/` serves `index.html`; `/script.js`, `/api.js`,
> `/style.css` are served alongside it) and in `config/views.py`. There is no
> separate frontend server or build step.

## Demo Accounts (`seed_data`)
| Role | Email | Password |
|---|---|---|
| Super Admin | admin@smartretail.com | Admin123! |
| Manager | manager@smartretail.com | Manager123! |
| Cashier | cashier@smartretail.com | Cashier123! |
| Salesperson | sales@smartretail.com | Sales123! |
| Inventory Manager | inventory@smartretail.com | Inventory123! |
| Customer | customer@smartretail.com | Customer123! |

## API Docs
- Swagger UI: `http://localhost:8000/api/docs/`
- ReDoc: `http://localhost:8000/api/redoc/`
- Raw schema: `http://localhost:8000/api/schema/`

## Endpoint Map (`/api/v1/...`)
```
auth/                register, login, logout, refresh, change-password,
                     password-reset(+confirm), verify-email/confirm, profile
warehouses/          CRUD
categories/          CRUD + tree/
brands/              CRUD
products/            CRUD + low_stock/, {id}/barcode-image/, {id}/qr-image/, {id}/images/
products/variants/   CRUD
inventory/           stock-items/ (+low-stock/, out-of-stock/), transactions/ (ledger),
                     stock-in/, stock-out/, adjust/, transfers/
customers/           CRUD + groups/
suppliers/           CRUD
sales/               create (full POS transaction), {id}/pay/, {id}/return/, coupons/
purchase-orders/     create, {id}/receive/, {id}/pay/
expenses/            CRUD + categories/, summary/
finance/             other-income/, profit-loss/, cash-flow/
notifications/       list mine, {id}/mark-read/, mark-all-read/, unread-count/
audit-logs/          read-only CRUD trail
dashboard/           summary/, charts/sales/
reports/             sales/, purchase/, inventory/, profit/, customers/,
                     suppliers/, tax/, expenses/   — each supports ?format=csv|excel|pdf
settings/            company/  (singleton)
```

## Example: Creating a POS Sale
```json
POST /api/v1/sales/
{
  "warehouse": 1,
  "customer": 3,
  "items": [
    {"product": 10, "quantity": 2, "discount_percent": "5.00"},
    {"product": 14, "quantity": 1}
  ],
  "is_credit_sale": false,
  "notes": "Walk-in customer"
}
```
One call: validates stock for every line, deducts it atomically, computes
subtotal/discount/tax/total, and (if `is_credit_sale`) checks the customer's
credit limit, updates their balance, and awards loyalty points — all in one
DB transaction.

## Example: Exporting a Report
```
GET /api/v1/reports/sales/?date_from=2026-06-01&date_to=2026-06-30&format=excel
GET /api/v1/reports/inventory/?format=pdf
GET /api/v1/reports/expenses/?format=csv
```

## Running Tests
```bash
pytest
```
67 tests covering: auth flows, RBAC enforcement, category trees, product
pricing, inventory service layer (stock in/out/adjust/transfer + rollback),
sales service layer (creation, credit limits, payments, returns + rollback),
purchase service layer (PO creation, receiving, supplier payments), finance
calculations (P&L, cash flow), dashboard aggregation, and audit-log signal
capture.

## What's Deliberately Simplified
This is a complete, working backend — not a padded one. A few things are
intentionally lean rather than gold-plated, and are the natural next steps
for a real production rollout:
- **SMS/Push notifications** are stubbed (log-only) — wire in Twilio/FCM in
  `apps/notifications/services.py` where marked.
- **COGS in the P&L report** uses each product's *current* cost_price rather
  than historical cost-at-time-of-sale (would need cost snapshotting on
  `SaleItem` for full historical accuracy).
- **Backups** (`Settings.auto_backup_enabled`) is a config flag only — pair
  it with a Celery Beat schedule + `pg_dump`/S3 upload task for real backups.
