// ═══════════════════════════════════════════════════════════════
// SmartRetail ERP — API Client
// Talks to the Django REST backend. Handles JWT storage + auto-refresh.
// Change API_BASE_URL if your backend runs somewhere other than localhost:8000.
// ═══════════════════════════════════════════════════════════════

// Same-origin now that Django serves this frontend directly — relative path
// works regardless of host/port, and no CORS handshake is needed at all.
const API_BASE_URL = '/api/v1';

const TokenStore = {
  getAccess() { return localStorage.getItem('sr_access_token'); },
  getRefresh() { return localStorage.getItem('sr_refresh_token'); },
  set(access, refresh) {
    localStorage.setItem('sr_access_token', access);
    if (refresh) localStorage.setItem('sr_refresh_token', refresh);
  },
  clear() {
    localStorage.removeItem('sr_access_token');
    localStorage.removeItem('sr_refresh_token');
    localStorage.removeItem('sr_user');
  },
  setUser(user) { localStorage.setItem('sr_user', JSON.stringify(user)); },
  getUser() {
    const raw = localStorage.getItem('sr_user');
    return raw ? JSON.parse(raw) : null;
  },
};

/**
 * Core request helper. Automatically attaches the JWT access token,
 * retries once after a silent refresh on 401, and throws a normalized
 * Error with `.status` and `.data` (the parsed error body) on failure.
 */
async function apiRequest(path, { method = 'GET', body = null, isForm = false, auth = true, _retried = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = TokenStore.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  // Access token expired — try one silent refresh, then retry the original call.
  if (response.status === 401 && auth && !_retried && TokenStore.getRefresh()) {
    const refreshed = await AuthAPI.refreshToken();
    if (refreshed) {
      return apiRequest(path, { method, body, isForm, auth, _retried: true });
    }
    TokenStore.clear();
    window.location.reload();
    return;
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }

  if (!response.ok) {
    const message = (data && data.error && data.error.message) || (data && data.detail) || response.statusText;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

function buildQuery(params = {}) {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!usable.length) return '';
  return '?' + usable.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// ── AUTH ─────────────────────────────────────────────────────────
const AuthAPI = {
  async login(email, password) {
    const data = await apiRequest('/auth/login/', { method: 'POST', body: { email, password }, auth: false });
    TokenStore.set(data.access, data.refresh);
    TokenStore.setUser(data.user);
    return data.user;
  },

  async refreshToken() {
    try {
      const data = await apiRequest('/auth/refresh/', {
        method: 'POST', body: { refresh: TokenStore.getRefresh() }, auth: false,
      });
      TokenStore.set(data.access, data.refresh);
      return true;
    } catch (_) {
      return false;
    }
  },

  async logout() {
    try {
      await apiRequest('/auth/logout/', { method: 'POST', body: { refresh: TokenStore.getRefresh() } });
    } catch (_) { /* ignore — clearing local tokens is enough either way */ }
    TokenStore.clear();
  },

  async profile() {
    return apiRequest('/auth/profile/');
  },

  isLoggedIn() {
    return !!TokenStore.getAccess();
  },
};

// ── PRODUCTS / CATALOG ───────────────────────────────────────────
const ProductsAPI = {
  list(params = {}) { return apiRequest(`/products/${buildQuery(params)}`); },
  get(id) { return apiRequest(`/products/${id}/`); },
  create(data) { return apiRequest('/products/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/products/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/products/${id}/`, { method: 'DELETE' }); },
  lowStock() { return apiRequest('/products/low_stock/'); },
  barcodeImageUrl(id) { return `${API_BASE_URL}/products/${id}/barcode-image/`; },
  qrImageUrl(id) { return `${API_BASE_URL}/products/${id}/qr-image/`; },
};

const CategoriesAPI = {
  list(params = {}) { return apiRequest(`/categories/${buildQuery(params)}`); },
  tree() { return apiRequest('/categories/tree/'); },
  create(data) { return apiRequest('/categories/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/categories/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/categories/${id}/`, { method: 'DELETE' }); },
};

const BrandsAPI = {
  list(params = {}) { return apiRequest(`/brands/${buildQuery(params)}`); },
  create(data) { return apiRequest('/brands/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/brands/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/brands/${id}/`, { method: 'DELETE' }); },
};

const WarehousesAPI = {
  list(params = {}) { return apiRequest(`/warehouses/${buildQuery(params)}`); },
  create(data) { return apiRequest('/warehouses/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/warehouses/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/warehouses/${id}/`, { method: 'DELETE' }); },
};

// ── INVENTORY ────────────────────────────────────────────────────
const InventoryAPI = {
  stockItems(params = {}) { return apiRequest(`/inventory/stock-items/${buildQuery(params)}`); },
  lowStock() { return apiRequest('/inventory/stock-items/low-stock/'); },
  outOfStock() { return apiRequest('/inventory/stock-items/out-of-stock/'); },
  transactions(params = {}) { return apiRequest(`/inventory/transactions/${buildQuery(params)}`); },
  stockIn(data) { return apiRequest('/inventory/stock-in/', { method: 'POST', body: data }); },
  stockOut(data) { return apiRequest('/inventory/stock-out/', { method: 'POST', body: data }); },
  adjust(data) { return apiRequest('/inventory/adjust/', { method: 'POST', body: data }); },
  transfers(params = {}) { return apiRequest(`/inventory/transfers/${buildQuery(params)}`); },
  createTransfer(data) { return apiRequest('/inventory/transfers/', { method: 'POST', body: data }); },
};

// ── PEOPLE ───────────────────────────────────────────────────────
const CustomersAPI = {
  list(params = {}) { return apiRequest(`/customers/${buildQuery(params)}`); },
  get(id) { return apiRequest(`/customers/${id}/`); },
  create(data) { return apiRequest('/customers/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/customers/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/customers/${id}/`, { method: 'DELETE' }); },
  groups() { return apiRequest('/customers/groups/'); },
};

const SuppliersAPI = {
  list(params = {}) { return apiRequest(`/suppliers/${buildQuery(params)}`); },
  create(data) { return apiRequest('/suppliers/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/suppliers/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/suppliers/${id}/`, { method: 'DELETE' }); },
};

// ── SALES / POS ──────────────────────────────────────────────────
const SalesAPI = {
  list(params = {}) { return apiRequest(`/sales/${buildQuery(params)}`); },
  get(id) { return apiRequest(`/sales/${id}/`); },
  create(data) { return apiRequest('/sales/', { method: 'POST', body: data }); },
  pay(id, data) { return apiRequest(`/sales/${id}/pay/`, { method: 'POST', body: data }); },
  processReturn(id, data) { return apiRequest(`/sales/${id}/return/`, { method: 'POST', body: data }); },
  coupons() { return apiRequest('/sales/coupons/'); },
};

// ── PURCHASING ───────────────────────────────────────────────────
const PurchaseAPI = {
  list(params = {}) { return apiRequest(`/purchase-orders/${buildQuery(params)}`); },
  get(id) { return apiRequest(`/purchase-orders/${id}/`); },
  create(data) { return apiRequest('/purchase-orders/', { method: 'POST', body: data }); },
  receive(id, data) { return apiRequest(`/purchase-orders/${id}/receive/`, { method: 'POST', body: data }); },
  pay(id, data) { return apiRequest(`/purchase-orders/${id}/pay/`, { method: 'POST', body: data }); },
};

// ── MONEY ────────────────────────────────────────────────────────
const ExpensesAPI = {
  list(params = {}) { return apiRequest(`/expenses/${buildQuery(params)}`); },
  create(data) { return apiRequest('/expenses/', { method: 'POST', body: data }); },
  update(id, data) { return apiRequest(`/expenses/${id}/`, { method: 'PATCH', body: data }); },
  remove(id) { return apiRequest(`/expenses/${id}/`, { method: 'DELETE' }); },
  categories() { return apiRequest('/expenses/categories/'); },
  summary(params = {}) { return apiRequest(`/expenses/summary/${buildQuery(params)}`); },
};

const FinanceAPI = {
  profitLoss(params = {}) { return apiRequest(`/finance/profit-loss/${buildQuery(params)}`); },
  cashFlow(params = {}) { return apiRequest(`/finance/cash-flow/${buildQuery(params)}`); },
};

// ── INSIGHTS ─────────────────────────────────────────────────────
const DashboardAPI = {
  summary() { return apiRequest('/dashboard/summary/'); },
  salesChart(days = 30) { return apiRequest(`/dashboard/charts/sales/?days=${days}`); },
};

const ReportsAPI = {
  url(reportName, params = {}) { return `${API_BASE_URL}/reports/${reportName}/${buildQuery(params)}`; },
  fetch(reportName, params = {}) { return apiRequest(`/reports/${reportName}/${buildQuery(params)}`); },
  /** Opens a CSV/Excel/PDF export in a new tab (auth token is added as a query param since
   * <a>/window.open cannot send custom headers). Requires the backend to also accept
   * ?access_token= as a fallback, OR simplest: fetch as blob and trigger a download client-side. */
  async download(reportName, format, params = {}) {
    const query = buildQuery({ ...params, format });
    const response = await fetch(`${API_BASE_URL}/reports/${reportName}/${query}`, {
      headers: { Authorization: `Bearer ${TokenStore.getAccess()}` },
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportName}.${format === 'excel' ? 'xlsx' : format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

// ── NOTIFICATIONS / AUDIT / SETTINGS ─────────────────────────────
const NotificationsAPI = {
  list() { return apiRequest('/notifications/'); },
  markRead(id) { return apiRequest(`/notifications/${id}/mark-read/`, { method: 'POST' }); },
  markAllRead() { return apiRequest('/notifications/mark-all-read/', { method: 'POST' }); },
  unreadCount() { return apiRequest('/notifications/unread-count/'); },
};

const AuditAPI = {
  list(params = {}) { return apiRequest(`/audit-logs/${buildQuery(params)}`); },
};

const SettingsAPI = {
  getCompany() { return apiRequest('/settings/company/'); },
  updateCompany(data) { return apiRequest('/settings/company/', { method: 'PATCH', body: data }); },
};
