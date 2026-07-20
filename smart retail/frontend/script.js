// We inject the Customer Collection page into the DOM after load
document.addEventListener('DOMContentLoaded', function() {
  const contentDiv = document.querySelector('.content');
  if (!contentDiv) return;
  const collectionPage = document.createElement('div');
  collectionPage.className = 'page';
  collectionPage.id = 'page-collection';
  collectionPage.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Customer Collection</h2>
        <p>Track payments, outstanding balances & collection activity</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-ghost btn-sm" onclick="exportCollectionReport()"><i class="fa fa-file-excel"></i> Export</button>
        <button class="btn btn-warning btn-sm" onclick="printTodaysCollectionSheet()"><i class="fa fa-hand-holding-usd"></i> Today's Collection Sheet</button>
        <button class="btn btn-accent btn-sm" onclick="printCollectionReport()"><i class="fa fa-print"></i> Print Report</button>
      </div>
    </div>

    <!-- KPI Stats -->
    <div class="stat-grid" id="col-stats-grid">
      <div class="stat-card blue"><div class="stat-header"><div class="stat-icon blue"><i class="fa fa-users"></i></div></div><div class="stat-value" id="col-total-customers">0</div><div class="stat-label">Total Customers</div></div>
      <div class="stat-card red"><div class="stat-header"><div class="stat-icon red"><i class="fa fa-exclamation-circle"></i></div></div><div class="stat-value" id="col-total-pending">$0</div><div class="stat-label">Total Pending</div></div>
      <div class="stat-card green"><div class="stat-header"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value" id="col-total-received">$0</div><div class="stat-label">Received Today</div></div>
      <div class="stat-card yellow"><div class="stat-header"><div class="stat-icon yellow"><i class="fa fa-clock"></i></div></div><div class="stat-value" id="col-overdue-count">0</div><div class="stat-label">Overdue Accounts</div></div>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:14px 20px">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group-inline" style="margin-bottom:0;flex:1;min-width:180px">
            <label>Search Customer</label>
            <div class="search-bar">
              <i class="fa fa-search"></i>
              <input type="text" id="col-search" placeholder="Name, phone, account..." oninput="renderCollection()" style="font-size:13px">
            </div>
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Date From</label>
            <input class="form-input" type="date" id="col-date-from" style="padding:9px 12px" onchange="renderCollection()">
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Date To</label>
            <input class="form-input" type="date" id="col-date-to" style="padding:9px 12px" onchange="renderCollection()">
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Balance Filter</label>
            <select class="form-input" id="col-balance-filter" onchange="renderCollection()" style="padding:9px 12px;width:160px">
              <option value="">All Customers</option>
              <option value="pending">Has Pending Balance</option>
              <option value="clear">Cleared / Zero Balance</option>
              <option value="overdue">Overdue (> 30 days)</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="clearCollectionFilters()"><i class="fa fa-times"></i> Clear</button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Collection Ledger</div>
        <div style="font-size:12px;color:var(--text-secondary)" id="col-count-label">— accounts</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Account No.</th>
              <th>Previous Balance</th>
              <th>Today's Orders</th>
              <th>Total Pending</th>
              <th>Received</th>
              <th>Remaining</th>
              <th>Last Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="collection-tbody"></tbody>
        </table>
      </div>
    </div>`;
  contentDiv.appendChild(collectionPage);

  // Also inject Record Payment modal at end of body
  const payModal = document.createElement('div');
  payModal.innerHTML = `
  <div class="modal-overlay" id="col-payment-modal">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-title">💳 Record Payment</div>
        <button class="modal-close" onclick="closeModal('col-payment-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="col-pay-cust-id">
        <div class="form-group-inline"><label>Customer</label><input class="form-input" id="col-pay-cust-name" readonly style="background:var(--bg-secondary)"></div>
        <div class="form-row">
          <div class="form-group-inline"><label>Outstanding Balance</label><input class="form-input" id="col-pay-outstanding" readonly style="background:var(--bg-secondary);color:var(--red);font-weight:700"></div>
          <div class="form-group-inline"><label>Payment Amount *</label><input class="form-input" type="number" id="col-pay-amount" placeholder="0.00" step="0.01" min="0" oninput="calcColRemaining()"></div>
        </div>
        <div class="form-row">
          <div class="form-group-inline"><label>Payment Date</label><input class="form-input" type="date" id="col-pay-date"></div>
          <div class="form-group-inline"><label>Payment Method</label>
            <select class="form-input" id="col-pay-method">
              <option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Online</option>
            </select>
          </div>
        </div>
        <div class="form-group-inline"><label>Notes</label><input class="form-input" id="col-pay-notes" placeholder="Optional notes..."></div>
        <div style="background:var(--green-glow);border:1px solid rgba(16,185,129,.2);border-radius:8px;padding:10px;display:flex;justify-content:space-between;font-weight:700">
          <span>Remaining After Payment:</span>
          <span id="col-pay-remaining" style="color:var(--green);font-size:16px">$0.00</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('col-payment-modal')">Cancel</button>
        <button class="btn btn-green" onclick="saveCollectionPayment()"><i class="fa fa-check"></i> Record Payment</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(payModal.firstElementChild);
});
// ── SPLASH SCREEN ──────────────────────────────────────
(function() {
  // Hide login & app while splash shows
  document.addEventListener('DOMContentLoaded', function() {
    // Apply saved theme immediately (before splash fade)
    if (localStorage.getItem('smartretail_theme') === 'light') {
      document.body.classList.add('light-mode');
    }
    const splash = document.getElementById('splash-screen');
    const login  = document.getElementById('login-screen');
    if (!splash || !login) return;

    // Keep login hidden behind splash
    login.style.opacity = '0';
    login.style.pointerEvents = 'none';

    // After 1.4s: fade out splash, reveal login
    function hideSplash() {
      if (splash.dataset.hidden) return;
      splash.dataset.hidden = '1';
      splash.classList.add('hiding');
      setTimeout(function() {
        splash.style.display = 'none';
        login.style.opacity  = '1';
        login.style.pointerEvents = '';
        login.style.transition = 'opacity .4s ease';
      }, 500);
    }
    setTimeout(hideSplash, 1400);
    // Safety: force-hide after 3s no matter what
    setTimeout(hideSplash, 3000);
  });
})();

// ═══════════════════════════════════════════════════════
// DATA STORE
// ═══════════════════════════════════════════════════════
const DB = {
  users: [
    { id: 1, name: 'Admin User', username: 'admin', password: 'admin123', role: 'Admin', email: 'admin@smartretail.com', lastLogin: '2025-01-17 09:00', status: 'Active', permissions: ['dashboard','pos','booking','saleslips','orders','products','inventory','purchases','customers','suppliers','expenses','accounting','reports','users','settings'] },
    { id: 2, name: 'Sub Admin 1', username: 'subadmin1', password: 'sub123', role: 'Sub-Admin', email: 'subadmin1@smartretail.com', lastLogin: '2025-01-17 08:30', status: 'Active', permissions: ['dashboard','pos','booking','saleslips','orders','customers','products'] },
  ],
  categories: ['Beverages','Snacks','Dairy','Bakery','Meat & Poultry','Personal Care','Household','Electronics','Stationery','Frozen Foods'],
  products: [
    { id: 1, name: 'Coca-Cola 330ml', sku: 'BEV-001', category: 'Beverages', brand: 'Coca-Cola', buyPrice: 0.50, sellPrice: 1.25, stock: 5, minStock: 20, barcode: '5449000000996', expiry: '2025-06-01', supplier: 1, icon: '🥤', cartonQty: 10, piecesPerCarton: 24 },
    { id: 2, name: 'Lays Classic Chips', sku: 'SNK-001', category: 'Snacks', brand: 'Frito-Lay', buyPrice: 0.80, sellPrice: 2.00, stock: 45, minStock: 15, barcode: '0028400047418', expiry: '', supplier: 2, icon: '🍟', cartonQty: 5, piecesPerCarton: 20 },
    { id: 3, name: 'Whole Milk 1L', sku: 'DAI-001', category: 'Dairy', brand: 'Fresh Farms', buyPrice: 0.90, sellPrice: 1.80, stock: 8, minStock: 25, barcode: '0070038622516', expiry: '2025-01-20', supplier: 3, icon: '🥛', cartonQty: 4, piecesPerCarton: 12 },
    { id: 4, name: 'White Bread Loaf', sku: 'BAK-001', category: 'Bakery', brand: 'Wonder Bread', buyPrice: 1.20, sellPrice: 2.50, stock: 22, minStock: 10, barcode: '0070038100000', expiry: '2025-01-22', supplier: 4, icon: '🍞', cartonQty: 3, piecesPerCarton: 10 },
    { id: 5, name: 'Dove Soap 100g', sku: 'PC-001', category: 'Personal Care', brand: 'Dove', buyPrice: 0.70, sellPrice: 1.50, stock: 60, minStock: 20, barcode: '0037000232279', expiry: '', supplier: 2, icon: '🧼', cartonQty: 8, piecesPerCarton: 36 },
    { id: 6, name: 'Orange Juice 1L', sku: 'BEV-002', category: 'Beverages', brand: 'Tropicana', buyPrice: 1.50, sellPrice: 3.20, stock: 3, minStock: 15, barcode: '0048500000000', expiry: '2025-02-15', supplier: 1, icon: '🍊', cartonQty: 2, piecesPerCarton: 12 },
    { id: 7, name: 'Eggs (12-pack)', sku: 'DAI-002', category: 'Dairy', brand: 'Happy Hens', buyPrice: 2.00, sellPrice: 4.50, stock: 30, minStock: 20, barcode: '0000000000001', expiry: '2025-01-28', supplier: 3, icon: '🥚', cartonQty: 6, piecesPerCarton: 12 },
    { id: 8, name: 'Chicken Breast 1kg', sku: 'MEAT-001', category: 'Meat & Poultry', brand: 'FreshMeat Co.', buyPrice: 4.50, sellPrice: 8.99, stock: 0, minStock: 10, barcode: '0000000000002', expiry: '2025-01-19', supplier: 3, icon: '🍗', cartonQty: 2, piecesPerCarton: 6 },
    { id: 9, name: 'Shampoo 400ml', sku: 'PC-002', category: 'Personal Care', brand: 'Head & Shoulders', buyPrice: 2.50, sellPrice: 5.99, stock: 35, minStock: 10, barcode: '0037000555555', expiry: '', supplier: 2, icon: '🧴', cartonQty: 4, piecesPerCarton: 12 },
    { id: 10, name: 'Notebook A4', sku: 'STA-001', category: 'Stationery', brand: 'Papermate', buyPrice: 0.60, sellPrice: 1.50, stock: 120, minStock: 30, barcode: '0000000000003', expiry: '', supplier: 5, icon: '📓', cartonQty: 10, piecesPerCarton: 50 },
  ],
  customers: [
    { id: 1, accountNo: 'ACC-0001', name: 'Ahmed Hassan', phone: '+92 300 1234567', email: 'ahmed@email.com', address: 'House 12, Model Town, Lahore', totalPurchases: 1245.50, loyaltyPoints: 124, lastVisit: '2025-01-17', prevBalance: 500.00 },
    { id: 2, accountNo: 'ACC-0002', name: 'Sarah Williams', phone: '+1 555-234-5678', email: 'sarah@email.com', address: '45 Oak Street, New York', totalPurchases: 892.00, loyaltyPoints: 89, lastVisit: '2025-01-16', prevBalance: 0 },
    { id: 3, accountNo: 'ACC-0003', name: 'Muhammad Ali', phone: '+92 333 9876543', email: 'mali@email.com', address: 'Gulberg III, Lahore', totalPurchases: 2100.75, loyaltyPoints: 210, lastVisit: '2025-01-15', prevBalance: 1200.00 },
    { id: 4, accountNo: 'ACC-0004', name: 'Emma Johnson', phone: '+1 555-876-1234', email: 'emma@email.com', address: '78 Maple Ave, Chicago', totalPurchases: 450.00, loyaltyPoints: 45, lastVisit: '2025-01-14', prevBalance: 0 },
    { id: 5, accountNo: 'ACC-0005', name: 'Fatima Sheikh', phone: '+92 321 5556677', email: 'fatima@email.com', address: 'DHA Phase 5, Karachi', totalPurchases: 3450.25, loyaltyPoints: 345, lastVisit: '2025-01-17', prevBalance: 750.00 },
  ],
  suppliers: [
    { id: 1, name: 'Beverage Distributors Ltd', phone: '+1 800-555-0101', email: 'orders@bevdist.com', address: '100 Industrial Park, Chicago', balance: -500.00, status: 'Active' },
    { id: 2, name: 'FMCG Wholesale Co.', phone: '+1 800-555-0202', email: 'supply@fmcg.com', address: '200 Commerce Blvd, Houston', balance: 0, status: 'Active' },
    { id: 3, name: 'Fresh Food Supplies', phone: '+1 800-555-0303', email: 'fresh@foodsup.com', address: '300 Market St, LA', balance: -1200.00, status: 'Active' },
    { id: 4, name: 'Bakery Partners Inc.', phone: '+1 800-555-0404', email: 'orders@bakeryp.com', address: '400 Baker Lane, NY', balance: 0, status: 'Active' },
    { id: 5, name: 'Office Supplies World', phone: '+1 800-555-0505', email: 'stock@offworld.com', address: '500 Office Park, Miami', balance: 0, status: 'Active' },
  ],
  expenses: [
    { id: 1, category: 'Rent', description: 'Monthly store rent', amount: 2500, date: '2025-01-01', ref: 'EXP-001' },
    { id: 2, category: 'Electricity', description: 'Monthly electricity bill', amount: 350, date: '2025-01-05', ref: 'EXP-002' },
    { id: 3, category: 'Salary', description: 'Staff salaries January', amount: 8500, date: '2025-01-31', ref: 'EXP-003' },
    { id: 4, category: 'Transport', description: 'Delivery vehicle fuel', amount: 180, date: '2025-01-10', ref: 'EXP-004' },
    { id: 5, category: 'Marketing', description: 'Social media ads', amount: 200, date: '2025-01-12', ref: 'EXP-005' },
  ],
  orders: [],
  orderBookings: [],
  routes: [
    { id:1, name:'North Zone A', area:'Model Town, Johar Town', person:'Saleem Khan', days:['Monday','Wednesday','Friday'], suppliers:[1,2], status:'Active', notes:'Morning slot preferred' },
    { id:2, name:'South Zone B', area:'DHA, Cantt', person:'Tariq Mehmood', days:['Tuesday','Thursday'], suppliers:[3,4], status:'Active', notes:'' },
    { id:3, name:'East Zone C', area:'Gulberg, Garden Town', person:'Asif Raza', days:['Monday','Saturday'], suppliers:[2,5], status:'Active', notes:'' },
  ],
  purchases: [
    { id: 1, date: '2025-01-10', supplier: 1, items: [{productId:1,name:'Coca-Cola 330ml',qty:100,price:0.50}], total: 50.00, payment: 'Paid', notes: '' },
    { id: 2, date: '2025-01-12', supplier: 3, items: [{productId:3,name:'Whole Milk 1L',qty:50,price:0.90},{productId:7,name:'Eggs (12-pack)',qty:20,price:2.00}], total: 85.00, payment: 'Pending', notes: '' },
  ],
  stockHistory: [],
  activityLog: [
    { time: '09:15:32', user: 'admin', action: 'Login', details: 'Admin logged in', ip: '192.168.1.100' },
    { time: '09:20:14', user: 'cashier', action: 'Sale', details: 'Invoice INV-0001 - $45.50', ip: '192.168.1.102' },
    { time: '09:35:00', user: 'manager', action: 'Product Update', details: 'Updated Coca-Cola stock', ip: '192.168.1.101' },
  ],
  customerLedger: {
    1: [ { date:'2025-01-10', desc:'Opening Balance', debit:500, credit:0, ref:'OB-001' }, { date:'2025-01-15', desc:'Invoice BK-00001 - Coca-Cola', debit:0, credit:57, ref:'BK-00001' } ],
    3: [ { date:'2025-01-01', desc:'Opening Balance', debit:1200, credit:0, ref:'OB-003' }, { date:'2025-01-17', desc:'Invoice BK-00002 - Soap/Shampoo', debit:0, credit:80.88, ref:'BK-00002' } ],
    5: [ { date:'2025-01-05', desc:'Opening Balance', debit:750, credit:0, ref:'OB-005' } ],
  },
  supplierLedger: {
    1: [ { date:'2025-01-10', desc:'Purchase PO-0001 - Coca-Cola', debit:50, credit:0, ref:'PO-0001' }, { date:'2025-01-12', desc:'Payment made', debit:0, credit:50, ref:'PAY-001' } ],
    3: [ { date:'2025-01-12', desc:'Purchase PO-0002 - Milk/Eggs', debit:85, credit:0, ref:'PO-0002' } ],
  },
  sysSettings: {
    storeName: 'SmartRetail Store',
    address: '123 Market Street, City',
    phone: '+1 555-000-1234',
    email: 'store@smartretail.com',
    taxRate: 8,
    currency: 'USD ($)',
    distributorName: '',
    distributorContact: '',
    receiptHeader: 'Thank you for shopping at SmartRetail!',
    receiptFooter: 'All sales are final. Visit us again!',
    logoDataUrl: '',
    showTaxOnReceipt: true,
    lowStockThreshold: 10,
  },
};

// Global safety net: any unhandled promise rejection (failed API call that
// wasn't individually wrapped in try/catch) now surfaces as a toast instead
// of failing silently with an empty-looking page.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled error:', event.reason);
  if (typeof toast === 'function') {
    const msg = (event.reason && event.reason.message) || 'Something went wrong — check the browser console (F12) for details.';
    toast(msg, 'error');
  }
});

let currentUser = null;
let cart = [];
let selectedPayment = 'cash';
let invoiceCounter = 100;
let bookingCounter = 1;
let charts = {};

// Restore session on page refresh if a valid JWT is already stored.
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof AuthAPI !== 'undefined' && AuthAPI.isLoggedIn()) {
    try {
      const user = await AuthAPI.profile();
      await loginAs(user);
    } catch (_) {
      TokenStore.clear();
    }
  }
});
let _lastOrder = null;
let _editingBookingId = null;
let _bookingItems = [];

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value.trim();
  const errorBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errorBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Signing in...';
  try {
    const user = await AuthAPI.login(email, password);
    await loginAs(user);
  } catch (err) {
    errorBox.textContent = err.message || 'Invalid email or password';
    errorBox.style.display = 'block';
    toast(err.message || 'Login failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-sign-in-alt"></i> Sign In';
  }
}
function quickLogin(email, password) {
  document.getElementById('l-user').value = email;
  document.getElementById('l-pass').value = password;
  doLogin();
}
async function loginAs(user) {
  currentUser = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  document.getElementById('u-name').textContent = user.full_name || user.email;
  document.getElementById('u-role').textContent = (user.role || '').replace(/_/g, ' ');
  document.getElementById('u-avatar').textContent = (user.full_name || user.email)[0].toUpperCase();
  document.getElementById('dash-user').textContent = (user.full_name || user.email).split(' ')[0];

  // Full nav for everyone for now — granular per-role page restriction can be
  // re-introduced once every page below is wired to the real backend.
  document.querySelectorAll('.nav-item').forEach(e => e.style.display = '');
  document.getElementById('admin-nav').style.display = '';

  initApp();
}
async function doLogout() {
  if (confirm('Sign out of SmartRetail ERP?')) {
    await AuthAPI.logout();
    document.getElementById('app').classList.remove('visible');
    document.getElementById('login-screen').style.display = 'flex';
    currentUser = null;
    document.getElementById('admin-nav').style.display = '';
    document.querySelectorAll('.nav-item').forEach(e => e.style.display = '');
  }
}

// ── PERMISSION CHECK ─────────────────────────────────────
function hasPermission(page) {
  if (!currentUser) return false;
  if (currentUser.role === 'Admin') return true;
  return (currentUser.permissions || []).includes(page);
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
const pageTitles = {
  dashboard: 'Dashboard Overview',
  pos: 'POS Terminal',
  booking: 'Order Booking',
  saleslips: 'Sale Slips',
  salereturn: 'Sale Return',
  products: 'Product Management',
  inventory: 'Inventory Management',
  orders: 'Order Management',
  customers: 'Customer Management',
  suppliers: 'Supplier Management',
  purchases: 'Purchase Management',
  purchasereturn: 'Purchase Return',
  expenses: 'Expense Management',
  ledger: 'Ledger Accounts',
  balancesheet: 'Balance Sheet',
  accounting: 'Accounting & Ledger',
  reports: 'Reports & Analytics',
  stockreport: 'Stock Report',
  supplyroutes: 'Supply Routes',
  ordersummary: 'Order Summary',
  users: 'User Management',
  settings: 'System Settings',
  collection: 'Customer Collection',
};
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    el.style.display = (page === 'pos') ? 'flex' : 'block';
  }
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[page] || page;
  const renders = {
    dashboard: renderDashboard,
    products: renderProducts,
    inventory: renderInventory,
    orders: renderOrders,
    customers: renderCustomers,
    suppliers: renderSuppliers,
    purchases: renderPurchases,
    expenses: renderExpenses,
    ledger: renderLedger,
    balancesheet: renderBalanceSheet,
    accounting: renderAccounting,
    reports: renderReports,
    stockreport: renderStockReport,
    supplyroutes: renderSupplyRoutes,
    ordersummary: renderOrderSummary,
    users: renderUsers,
    pos: initPOS,
    booking: initBooking,
    saleslips: renderSaleSlips,
    salereturn: renderSaleReturn,
    purchasereturn: renderPurchaseReturns,
    settings: renderSettings,
  };
  if (renders[page]) renders[page]();
  document.getElementById('notif-panel').classList.add('hidden');
  // Close sidebar on mobile after navigation
  closeSidebarMobile();
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
function initApp() {
  initTheme();
  navigate('dashboard');
  setInterval(updateClock, 1000);
  updateClock();
  updatePosCustomers();
  SettingsAPI.getCompany().then(s => { _companySettingsCache = s; }).catch(() => {});
}
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function toggleNotif() {
  document.getElementById('notif-panel').classList.toggle('hidden');
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  let summary;
  try {
    summary = await DashboardAPI.summary();
  } catch (err) {
    // Cashiers/salespersons don't have dashboard permissions (manager+ only) —
    // show zeros instead of crashing the page.
    document.getElementById('d-revenue').textContent = '—';
    document.getElementById('d-orders').textContent = '—';
    document.getElementById('d-customers').textContent = '—';
    document.getElementById('d-lowstock').textContent = '—';
    return;
  }

  document.getElementById('d-revenue').textContent = '$' + Number(summary.today_sales).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('d-orders').textContent = summary.sales_orders_count;
  document.getElementById('d-customers').textContent = summary.total_customers;
  document.getElementById('d-lowstock').textContent = summary.low_stock_items.length;

  // Recent transactions
  const tbody = document.getElementById('recent-tx');
  const salesData = await SalesAPI.list({ ordering: '-created_at', page_size: 6 });
  const recent = salesData.results || salesData;
  tbody.innerHTML = recent.map(o => `
    <tr>
      <td class="td-mono">${o.invoice_number}</td>
      <td>${o.customer_name || 'Walk-in'}</td>
      <td>${o.items.length}</td>
      <td class="fw-700 text-green">$${Number(o.total_amount).toFixed(2)}</td>
      <td><span class="badge badge-blue">${(o.payments[0]?.method||'—').toUpperCase()}</span></td>
      <td><span class="badge badge-green">${o.status}</span></td>
    </tr>`).join('');

  // Top products (real, from backend aggregation)
  const tp = document.getElementById('top-products-list');
  const maxQty = Math.max(1, ...summary.top_selling_products.map(p=>p.total_quantity));
  tp.innerHTML = summary.top_selling_products.map(p => `
    <div style="margin-bottom:14px">
      <div class="flex-between" style="margin-bottom:5px">
        <span style="font-size:13px;font-weight:600">${p.product__name}</span>
        <span style="font-size:12px;color:var(--text-secondary)">${p.total_quantity} units sold</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${(p.total_quantity/maxQty*100).toFixed(0)}%;background:var(--accent)"></div>
      </div>
    </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px">No sales in the last 30 days</div>';

  // Low stock table (real, from backend)
  const lstBody = document.getElementById('low-stock-table');
  lstBody.innerHTML = summary.low_stock_items.map(p => {
    const statusColor = p.quantity === 0 ? 'red' : 'yellow';
    const statusText = p.quantity === 0 ? 'Out of Stock' : 'Low Stock';
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:20px">📦</span><strong>${p.product_name}</strong></div></td>
      <td class="td-mono">${p.sku}</td>
      <td>${p.warehouse}</td>
      <td><strong class="text-${statusColor}">${p.quantity}</strong></td>
      <td>${p.reorder_level}</td>
      <td><span class="badge badge-${statusColor}">${statusText}</span></td>
      <td><button class="btn btn-accent btn-xs" onclick="openStockModal(${p.product_id})">Restock</button></td>
    </tr>`;
  }).join('');

  await renderCharts(summary);
}

async function renderCharts(summary) {
  // Sales chart — real daily totals for the last 7 days
  if (charts.sales) charts.sales.destroy();
  const sc = document.getElementById('salesChart');
  if (sc) {
    const chartData = await DashboardAPI.salesChart(7);
    const series = chartData.series || [];
    charts.sales = new Chart(sc, {
      type: 'bar',
      data: {
        labels: series.map(s => s.day),
        datasets: [{
          label: 'Revenue ($)',
          data: series.map(s => Number(s.total)),
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: 'rgba(59,130,246,1)',
          borderWidth: 2, borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: '#1e2535' }, ticks: { color: '#8892a4' } },
          y: { grid: { color: '#1e2535' }, ticks: { color: '#8892a4' } },
        }
      }
    });
  }

  // Category donut — product count per category (catalog composition, not sales)
  if (charts.cat) charts.cat.destroy();
  const cc = document.getElementById('categoryChart');
  if (cc) {
    const prodData = await ProductsAPI.list({ page_size: 500 });
    const products = prodData.results || prodData;
    const catCounts = {};
    products.forEach(p => { catCounts[p.category_name||'Uncategorized'] = (catCounts[p.category_name||'Uncategorized']||0)+1; });
    charts.cat = new Chart(cc, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catCounts),
        datasets: [{ data: Object.values(catCounts), backgroundColor: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#ec4899','#84cc16'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: '#8892a4', font: { size: 11 }, padding: 12 } } },
        cutout: '65%',
      }
    });
  }
}

// ═══════════════════════════════════════════════════════
// POS
// ═══════════════════════════════════════════════════════
function initPOS() {
  document.getElementById('pos-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  document.getElementById('pos-invoice').textContent = 'INV-' + String(invoiceCounter).padStart(4,'0');
  populatePosCategories();
  renderPosProducts();
  updateCartUI();
}

let _posProductCache = [];
let _posStockByProduct = {};

async function _loadPosProducts() {
  const [prodData, stockData] = await Promise.all([
    ProductsAPI.list({ page_size: 500 }),  // status filter removed — was silently hiding products whose status wasn't exactly 'active'
    InventoryAPI.stockItems({ page_size: 1000 }),
  ]);
  _posProductCache = prodData.results || prodData;
  _posStockByProduct = {};
  (stockData.results || stockData).forEach(si => {
    _posStockByProduct[si.product] = (_posStockByProduct[si.product] || 0) + si.quantity;
  });
}

async function populatePosCategories() {
  const data = await CategoriesAPI.list();
  const cats = data.results || data;
  const sel = document.getElementById('pos-category');
  sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function filterPosProducts() { renderPosProducts(); }

async function renderPosProducts() {
  if (!_posProductCache.length) await _loadPosProducts();
  const q = (document.getElementById('pos-search').value || '').toLowerCase();
  const cat = document.getElementById('pos-category').value;
  const grid = document.getElementById('pos-product-grid');
  const prods = _posProductCache.filter(p =>
    (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode||'').includes(q)) &&
    (!cat || String(p.category) === String(cat))
  );
  grid.innerHTML = prods.map(p => {
    const stock = _posStockByProduct[p.id] || 0;
    return `
    <div class="pos-product-card" onclick="addToCart(${p.id})" ${stock===0?'style="opacity:.4;cursor:not-allowed"':''}>
      <div class="pos-prod-icon">📦</div>
      <div class="pos-prod-name">${p.name}</div>
      <div class="pos-prod-price">$${Number(p.final_price).toFixed(2)}</div>
      <div class="pos-prod-stock ${stock<=5?'text-red':''}">${stock>0?'In stock: '+stock:'Out of stock'}</div>
    </div>`;
  }).join('');
}

function addToCart(pid) {
  const prod = _posProductCache.find(p => p.id === pid);
  const stock = _posStockByProduct[pid] || 0;
  if (!prod || stock === 0) { toast('Product out of stock!', 'error'); return; }
  const existing = cart.find(c => c.id === pid);
  if (existing) {
    if (existing.qty >= stock) { toast('Insufficient stock!', 'warning'); return; }
    existing.qty++;
  } else {
    cart.push({ id: pid, name: prod.name, price: Number(prod.final_price), qty: 1, icon: '📦' });
  }
  updateCartUI();
}

function removeFromCart(pid) {
  cart = cart.filter(c => c.id !== pid);
  updateCartUI();
}

function changeQty(pid, delta) {
  const item = cart.find(c => c.id === pid);
  const stock = _posStockByProduct[pid] || 0;
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { cart = cart.filter(c => c.id !== pid); }
  else if (item.qty > stock) { item.qty = stock; toast('Max stock reached','warning'); }
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cart-items');
  const discount = parseFloat(document.getElementById('cart-discount').value)||0;
  const taxRate = parseFloat(document.getElementById('cart-tax').value)||0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><i class="fa fa-shopping-cart"></i><div style="font-size:13px;font-weight:600">Cart is empty</div><div style="font-size:12px">Click products to add</div></div>`;
  } else {
    container.innerHTML = cart.map(item => `
      <div class="cart-item">
        <span style="font-size:20px">${item.icon}</span>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
        </div>
        <div class="cart-qty">
          <button class="qty-btn" onclick="changeQty(${item.id},-1)">−</button>
          <div class="qty-val">${item.qty}</div>
          <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
        </div>
        <div class="cart-item-total">$${(item.price*item.qty).toFixed(2)}</div>
        <div class="cart-remove" onclick="removeFromCart(${item.id})">✕</div>
      </div>`).join('');
  }

  const subtotal = cart.reduce((a,i) => a + i.price*i.qty, 0);
  const discountAmt = subtotal * discount / 100;
  const taxAmt = (subtotal - discountAmt) * taxRate / 100;
  const total = subtotal - discountAmt + taxAmt;

  document.getElementById('cart-count').textContent = cart.reduce((a,i)=>a+i.qty,0);
  document.getElementById('cart-subtotal').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('cart-discount-val').textContent = '-$' + discountAmt.toFixed(2);
  document.getElementById('cart-tax-val').textContent = '+$' + taxAmt.toFixed(2);
  document.getElementById('cart-total').textContent = '$' + total.toFixed(2);

  const cash = parseFloat(document.getElementById('cash-received').value)||0;
  document.getElementById('change-amt').textContent = '$' + Math.max(0, cash - total).toFixed(2);
}

document.addEventListener('DOMContentLoaded', () => {
  ['cart-discount','cart-tax','cash-received'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateCartUI);
  });
});

function selectPayment(el, method) {
  document.querySelectorAll('.payment-method').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedPayment = method;
}

function clearCart() {
  if (cart.length === 0) return;
  if (confirm('Clear cart?')) { cart = []; updateCartUI(); }
}

async function updatePosCustomers() {
  const sel = document.getElementById('pos-customer');
  if (!sel) return;
  const data = await CustomersAPI.list({ page_size: 500 });
  const customers = data.results || data;
  sel.innerHTML = '<option value="">Walk-in Customer</option>' + customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

const _posPaymentMethodMap = { cash: 'cash', card: 'card', digital: 'mobile_wallet' };

async function processPayment() {
  if (cart.length === 0) { toast('Cart is empty!', 'error'); return; }
  const discount = parseFloat(document.getElementById('cart-discount').value)||0;
  const taxRate = parseFloat(document.getElementById('cart-tax').value)||0;
  const subtotal = cart.reduce((a,i) => a+i.price*i.qty, 0);
  const discountAmt = subtotal * discount / 100;
  const taxAmt = (subtotal-discountAmt)*taxRate/100;
  const total = subtotal - discountAmt + taxAmt;

  if (selectedPayment === 'cash') {
    const cash = parseFloat(document.getElementById('cash-received').value)||0;
    if (cash < total) { toast('Insufficient cash received!', 'error'); return; }
  }

  if (total <= 0) {
    toast('Total is $0.00 — check that the items in the cart have a price set before charging.', 'error');
    return;
  }

  const custId = document.getElementById('pos-customer').value;
  const payBtn = document.querySelector('.btn-checkout, #checkout-btn') || null;
  if (payBtn) payBtn.disabled = true;

  try {
    const warehouseId = await _ensureDefaultWarehouse();
    const items = cart.map(i => ({
      product: i.id,
      quantity: i.qty,
      unit_price: i.price,
      tax_percent: taxRate,
    }));

    const sale = await SalesAPI.create({
      warehouse: warehouseId,
      customer: custId ? parseInt(custId) : null,
      items,
      discount_amount: discountAmt,
      notes: '',
    });

    // Record the payment immediately (this UI is a cash-register checkout,
    // not a credit-sale flow) so the invoice shows as PAID.
    await SalesAPI.pay(sale.id, {
      amount: sale.total_amount,
      method: _posPaymentMethodMap[selectedPayment] || 'other',
    });

    _lastOrder = sale;
    showReceipt(sale);
    cart = [];
    document.getElementById('cart-discount').value = 0;
    document.getElementById('cart-tax').value = 8;
    document.getElementById('cash-received').value = '';
    updateCartUI();
    renderPosProducts();      // refresh stock levels shown in the grid
    toast(`Payment processed! Invoice ${sale.invoice_number}`, 'success');
  } catch (err) {
    toast(err.message || 'Failed to process payment', 'error');
  } finally {
    if (payBtn) payBtn.disabled = false;
  }
}

function showReceipt(sale) {
  const cashReceived = parseFloat(document.getElementById('cash-received').value)||Number(sale.total_amount);
  const change = Math.max(0, cashReceived - Number(sale.total_amount));
  const paymentMethod = (sale.payments && sale.payments[0]) ? sale.payments[0].method : selectedPayment;
  document.getElementById('receipt-body').innerHTML = `
    <div class="receipt-preview">
      <div class="rcp-center" style="font-size:16px;font-weight:700">🏪 SmartRetail Store</div>
      <div class="rcp-center" style="font-size:11px">123 Market Street, City</div>
      <div class="rcp-center" style="font-size:11px">Tel: +1 555-000-1234</div>
      <div class="rcp-line"></div>
      <div class="rcp-row"><span>Invoice:</span><span>${sale.invoice_number}</span></div>
      <div class="rcp-row"><span>Date:</span><span>${(sale.created_at||'').replace('T',' ').slice(0,19)}</span></div>
      <div class="rcp-row"><span>Customer:</span><span>${(document.getElementById('bill-customer-name')?.value?.trim()) || sale.customer_name || 'Walk-in'}</span></div>
      ${(document.getElementById('bill-customer-contact')?.value?.trim()) ? `<div class="rcp-row"><span>Contact:</span><span>${document.getElementById('bill-customer-contact').value.trim()}</span></div>` : ''}
      <div class="rcp-row"><span>Cashier:</span><span>${currentUser.full_name||currentUser.email}</span></div>
      <div class="rcp-line"></div>
      <div style="font-weight:700;margin-bottom:4px">ITEMS</div>
      ${sale.items.map(i=>`<div class="rcp-row"><span>${i.product_name} x${i.quantity}</span><span>$${Number(i.line_total).toFixed(2)}</span></div>`).join('')}
      <div class="rcp-line"></div>
      <div class="rcp-row"><span>Subtotal:</span><span>$${Number(sale.subtotal).toFixed(2)}</span></div>
      ${Number(sale.discount_amount)>0?`<div class="rcp-row"><span>Discount:</span><span>-$${Number(sale.discount_amount).toFixed(2)}</span></div>`:''}
      <div class="rcp-row"><span>Tax:</span><span>+$${Number(sale.tax_amount).toFixed(2)}</span></div>
      <div class="rcp-line"></div>
      <div class="rcp-row" style="font-size:14px;font-weight:700"><span>TOTAL:</span><span>$${Number(sale.total_amount).toFixed(2)}</span></div>
      <div class="rcp-row"><span>Payment:</span><span>${paymentMethod.toUpperCase()}</span></div>
      ${paymentMethod==='cash'?`<div class="rcp-row"><span>Cash Received:</span><span>$${cashReceived.toFixed(2)}</span></div><div class="rcp-row"><span>Change:</span><span>$${change.toFixed(2)}</span></div>`:''}
      <div class="rcp-line"></div>
      <div class="rcp-center" style="font-size:11px">Thank you for shopping at SmartRetail!</div>
      <div class="rcp-center" style="font-size:10px;margin-top:4px">All sales are final. Visit us again!</div>
      <div class="rcp-center" style="font-size:10px;margin-top:4px">|||||||||||||||||||||||||||</div>
      <div class="rcp-center" style="font-family:var(--mono);font-size:10px">${sale.invoice_number}</div>
    </div>`;
  openModal('receipt-modal');
  const billName = document.getElementById('bill-customer-name');
  const billContact = document.getElementById('bill-customer-contact');
  if (billName && !billName.value) billName.value = (sale.customer_name) || '';
  if (billContact) billContact.value = '';
}

// ═══════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════
// ── Local caches so we don't refetch categories/brands/warehouses on every render ──
let _catCache = [];
let _brandCache = [];
let _defaultWarehouseId = null;
let _prodPage = 1;
const _prodPageSize = 20;

// ═══════════════════════════════════════════════════════
// PAGINATION — shared helper used by Products & Customers
// (and any other list page that wants a numbered pager
// instead of "load everything at once").
// ═══════════════════════════════════════════════════════
/**
 * Renders a "« Prev  1 2 3 … 9  Next »" bar into the given container.
 * @param {string} containerId - id of the element to render into
 * @param {number} currentPage - 1-based current page
 * @param {number} totalPages  - total number of pages
 * @param {number} totalCount  - total number of records (for the "Showing X of Y" label)
 * @param {number} pageSize    - records per page (for the "Showing X of Y" label)
 * @param {function(number)} onPageChange - called with the new page number
 */
function renderPaginationBar(containerId, currentPage, totalPages, totalCount, pageSize, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!totalPages || totalPages <= 0) totalPages = 1;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  window.__paginationCallbacks = window.__paginationCallbacks || {};
  window.__paginationCallbacks[containerId] = onPageChange;

  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalCount);

  // Build the list of page numbers to show: first, last, current ±1, with
  // "…" filling the gaps so wide page counts don't produce a huge button row.
  const pages = [];
  const addPage = (n) => { if (!pages.includes(n)) pages.push(n); };
  addPage(1);
  for (let n = currentPage - 1; n <= currentPage + 1; n++) if (n >= 1 && n <= totalPages) addPage(n);
  addPage(totalPages);
  pages.sort((a, b) => a - b);

  let pageBtns = '';
  let prevNum = null;
  pages.forEach(n => {
    if (prevNum !== null && n - prevNum > 1) {
      pageBtns += `<span class="pagination-ellipsis">…</span>`;
    }
    pageBtns += `<button type="button" class="pagination-btn ${n === currentPage ? 'active' : ''}"
      onclick="window.__paginationCallbacks['${containerId}'](${n})">${n}</button>`;
    prevNum = n;
  });

  el.innerHTML = `
    <div class="pagination-info">Showing ${rangeStart}-${rangeEnd} of ${totalCount}</div>
    <div class="pagination-controls">
      <button type="button" class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''}
        onclick="window.__paginationCallbacks['${containerId}'](${currentPage - 1})"><i class="fa fa-chevron-left"></i></button>
      ${pageBtns}
      <button type="button" class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''}
        onclick="window.__paginationCallbacks['${containerId}'](${currentPage + 1})"><i class="fa fa-chevron-right"></i></button>
    </div>`;
}

async function _ensureDefaultWarehouse() {
  if (_defaultWarehouseId) return _defaultWarehouseId;
  const list = await WarehousesAPI.list();
  const results = list.results || list;
  let wh = results.find(w => w.is_default) || results[0];
  if (!wh) {
    wh = await WarehousesAPI.create({ name: 'Main Store', code: 'MAIN', is_default: true });
  }
  _defaultWarehouseId = wh.id;
  return wh.id;
}

async function _findOrCreateBrand(name) {
  name = (name||'').trim();
  if (!name) return null;
  const existing = _brandCache.find(b => b.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  try {
    const created = await BrandsAPI.create({ name });
    _brandCache.push(created);
    return created.id;
  } catch (err) {
    // Cache was stale (e.g. brand created by someone else, or sitting beyond
    // whatever page size we last fetched) — the backend says it already
    // exists, so look it up for real instead of surfacing the error.
    const isDuplicate = err.status === 400 &&
      JSON.stringify(err.data||{}).toLowerCase().includes('already exists');
    if (!isDuplicate) throw err;
    const found = await BrandsAPI.list({ search: name, page_size: 500 });
    const match = (found.results||found).find(b => b.name.trim().toLowerCase() === name.toLowerCase());
    if (match) { _brandCache.push(match); return match.id; }
    throw err;
  }
}

async function renderProducts(page) {
  try {
    await populateCategorySelects();
  } catch (err) {
    toast('Failed to load categories: ' + (err.message||'unknown error'), 'error');
  }
  // A fresh search/filter always jumps back to page 1; otherwise keep (or
  // move to) whichever page was requested by the pagination bar.
  const isNewQuery = page === undefined;
  _prodPage = isNewQuery ? 1 : page;

  const q = (document.getElementById('prod-search')?.value||'').toLowerCase();
  const catId = document.getElementById('prod-cat-filter')?.value||'';
  const tbody = document.getElementById('products-table');
  const params = {
    search: q || undefined,
    category: catId || undefined,
    ordering: 'name',        // A → Z by product name
    page: _prodPage,
    page_size: _prodPageSize,
  };
  let prods = [];
  let totalCount = 0, totalPages = 1;
  try {
    const data = await ProductsAPI.list(params);
    prods = data.results || data;
    totalCount = data.count ?? prods.length;
    totalPages = data.total_pages ?? Math.max(1, Math.ceil(totalCount / _prodPageSize));
    _prodPage = data.current_page ?? _prodPage;
  } catch (err) {
    toast('Failed to load products: ' + (err.message||'unknown error'), 'error');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--red)">Could not load products — ${err.message||'server error'}</td></tr>`;
    return;
  }
  renderPaginationBar('products-pagination', _prodPage, totalPages, totalCount, _prodPageSize, (p) => renderProducts(p));
  tbody.innerHTML = prods.map(p => {
    const status = p.status !== 'active' ? ['badge-yellow', p.status]
      : ['badge-green', 'Active'];
    const stock = Number(p.current_stock) || 0;
    const stockBadge = stock <= 0 ? 'badge-red' : stock <= (p.reorder_level ?? 10) ? 'badge-yellow' : 'badge-green';
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:20px">📦</span><div><div style="font-weight:600">${p.name}</div><div style="font-size:11px;color:var(--text-muted)">${p.brand_name||''}</div></div></div></td>
      <td class="td-mono">${p.sku}</td>
      <td><span class="badge badge-blue">${p.category_name||''}</span></td>
      <td class="fw-700">$${Number(p.cost_price ?? 0).toFixed(2)}</td>
      <td class="fw-700 text-green">$${Number(p.selling_price).toFixed(2)}</td>
      <td><span class="badge ${stockBadge}">${stock}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">—</td>
      <td><span class="badge ${status[0]}">${status[1]}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editProduct(${p.id})"><i class="fa fa-edit"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deleteProduct(${p.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function populateCategorySelects() {
  // page_size:500 so these caches hold the FULL list, not just the default
  // first-20 page — otherwise a brand/category that exists but isn't in the
  // first page looks "missing" to the frontend (see _findOrCreateBrand),
  // and it tries to re-create it, which the backend then rejects as a
  // duplicate ("brand with this name already exists").
  const catData = await CategoriesAPI.list({ page_size: 500 });
  _catCache = catData.results || catData;
  ['prod-cat','prod-cat-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasVal = el.value;
    const isFilter = id.includes('filter');
    el.innerHTML = (isFilter ? '<option value="">All Categories</option>' : '<option value="">Select Category</option>') +
      _catCache.map(c => `<option value="${c.id}" ${String(c.id)===wasVal?'selected':''}>${c.name}</option>`).join('');
  });
  const brandData = await BrandsAPI.list({ page_size: 500 });
  _brandCache = brandData.results || brandData;
  const ps = document.getElementById('prod-supplier');
  if (ps) {
    const supData = await SuppliersAPI.list({ page_size: 500 });
    const suppliers = supData.results || supData;
    ps.innerHTML = '<option value="">Select Supplier</option>' + suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
}

async function openProductModal(id) {
  await populateCategorySelects();
  if (id) { await editProduct(id); return; }
  document.getElementById('prod-modal-title').textContent = 'Add New Product';
  document.getElementById('prod-edit-id').value = '';
  ['prod-name','prod-sku','prod-brand','prod-barcode','prod-icon'].forEach(i => document.getElementById(i).value='');
  ['prod-buy','prod-sell','prod-stock','prod-minstock'].forEach(i => document.getElementById(i).value='');
  document.getElementById('prod-expiry').value='';
  document.getElementById('prod-cat').value='';
  document.getElementById('prod-supplier').value='';
  document.getElementById('prod-stock').value = 0;
  document.getElementById('prod-minstock').value = 10;
  document.getElementById('prod-carton-qty').value = 0;
  document.getElementById('prod-pieces-per-carton').value = 1;
  openModal('product-modal');
}

async function editProduct(id) {
  const p = await ProductsAPI.get(id);
  document.getElementById('prod-modal-title').textContent = 'Edit Product';
  document.getElementById('prod-edit-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-sku').value = p.sku;
  document.getElementById('prod-brand').value = p.brand_name||'';
  document.getElementById('prod-barcode').value = p.barcode;
  document.getElementById('prod-buy').value = p.cost_price;
  document.getElementById('prod-sell').value = p.selling_price;
  document.getElementById('prod-discount').value = p.discount_percent;
  document.getElementById('prod-tax').value = p.tax_rate;
  document.getElementById('prod-minstock').value = p.reorder_level;
  document.getElementById('prod-cat').value = p.category;
  if (typeof calcProdPricing === 'function') calcProdPricing();
  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const sku = document.getElementById('prod-sku').value.trim();
  if (!name || !sku) { toast('Name and SKU are required!', 'error'); return; }
  const editId = parseInt(document.getElementById('prod-edit-id').value);
  const brandName = document.getElementById('prod-brand').value.trim();

  try {
    const brandId = await _findOrCreateBrand(brandName);
    const payload = {
      name, sku,
      category: parseInt(document.getElementById('prod-cat').value) || null,
      brand: brandId,
      cost_price: parseFloat(document.getElementById('prod-buy').value) || 0,
      selling_price: parseFloat(document.getElementById('prod-sell').value) || 0,
      discount_percent: parseFloat(document.getElementById('prod-discount').value) || 0,
      tax_rate: parseFloat(document.getElementById('prod-tax').value) || 0,
      reorder_level: parseInt(document.getElementById('prod-minstock').value) || 10,
    };
    const barcode = document.getElementById('prod-barcode').value.trim();
    if (barcode) payload.barcode = barcode;

    let product;
    if (editId) {
      product = await ProductsAPI.update(editId, payload);
      toast('Product updated!', 'success');
    } else {
      product = await ProductsAPI.create(payload);
      toast('Product added!', 'success');
      // Initial stock quantity (Stock Quantity field) is set via a stock-in
      // ledger entry against the default warehouse — Product itself carries
      // no quantity field in this backend (stock is per-warehouse).
      const initialStock = parseInt(document.getElementById('prod-stock').value) || 0;
      if (initialStock > 0) {
        const warehouseId = await _ensureDefaultWarehouse();
        await InventoryAPI.stockIn({ product: product.id, warehouse: warehouseId, quantity: initialStock, reference: 'Initial stock' });
      }
    }
    closeModal('product-modal');
    renderProducts();
  } catch (err) {
    toast(err.message || 'Failed to save product', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await ProductsAPI.remove(id);
    renderProducts();
    toast('Product deleted','success');
  } catch (err) {
    toast(err.message || 'Failed to delete product', 'error');
  }
}

let _catMgmtCache = [];

async function addCategory() {
  const val = document.getElementById('new-cat-name').value.trim();
  if (!val) return;
  try {
    await CategoriesAPI.create({ name: val });
    document.getElementById('new-cat-name').value='';
    await renderCatList();
    if (typeof populateCategorySelects === 'function') await populateCategorySelects();
    toast('Category added!','success');
  } catch (err) {
    toast(err.message || 'Failed to add category', 'error');
  }
}
async function renderCatList() {
  const data = await CategoriesAPI.list({ page_size: 500 });
  _catMgmtCache = data.results || data;
  document.getElementById('cat-list').innerHTML = _catMgmtCache.map(c=>`
    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px">${c.name}</span>
      <button class="btn btn-ghost btn-xs" onclick="deleteCategory(${c.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
    </div>`).join('');
}
async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    await CategoriesAPI.remove(id);
    await renderCatList();
    if (typeof populateCategorySelects === 'function') await populateCategorySelects();
    toast('Category deleted','success');
  } catch (err) {
    toast(err.message || 'Failed to delete category — it may still be used by products', 'error');
  }
}
const _catModalEl = document.getElementById('cat-modal');
if (_catModalEl) _catModalEl.addEventListener('click', e => { if(e.target===_catModalEl) return; renderCatList(); });

// ═══════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════
let _invProductCache = [];   // full Product objects from backend (for name/sku/category/reorder_level)
let _invStockByProduct = {}; // productId -> { quantity, is_low_stock, is_out_of_stock }

async function _loadInventoryData() {
  const [prodData, stockData] = await Promise.all([
    ProductsAPI.list({ page_size: 500 }),
    InventoryAPI.stockItems({ page_size: 1000 }),
  ]);
  _invProductCache = prodData.results || prodData;
  _invStockByProduct = {};
  const stockItems = stockData.results || stockData;
  stockItems.forEach(si => {
    const existing = _invStockByProduct[si.product] || { quantity: 0, is_low_stock: false, is_out_of_stock: false };
    existing.quantity += si.quantity;
    existing.is_low_stock = existing.is_low_stock || si.is_low_stock;
    existing.is_out_of_stock = existing.quantity <= 0;
    _invStockByProduct[si.product] = existing;
  });
}

async function renderInventory() {
  const q = (document.getElementById('inv-search')?.value||'').toLowerCase();
  await _loadInventoryData();

  const rows = _invProductCache.map(p => {
    const s = _invStockByProduct[p.id] || { quantity: 0, is_low_stock: true, is_out_of_stock: true };
    return { ...p, stock: s.quantity, is_low_stock: s.is_low_stock, is_out_of_stock: s.is_out_of_stock };
  });

  const inStock = rows.filter(p=>!p.is_low_stock && !p.is_out_of_stock).length;
  const lowStock = rows.filter(p=>p.is_low_stock && !p.is_out_of_stock).length;
  const outStock = rows.filter(p=>p.is_out_of_stock).length;
  document.getElementById('inv-total').textContent = rows.length;
  document.getElementById('inv-instock').textContent = inStock;
  document.getElementById('inv-low').textContent = lowStock;
  document.getElementById('inv-out').textContent = outStock;

  const tbody = document.getElementById('inventory-table');
  const filtered = rows.filter(p => (p.name||'').toLowerCase().includes(q));
  tbody.innerHTML = filtered.map(p => {
    const minStock = p.reorder_level || 10;
    const pct = Math.min(100, (p.stock / (minStock*2)) * 100);
    const color = p.is_out_of_stock ? 'var(--red)' : p.is_low_stock ? 'var(--yellow)' : 'var(--green)';
    const statusBadge = p.is_out_of_stock ? 'badge-red' : p.is_low_stock ? 'badge-yellow' : 'badge-green';
    const statusText = p.is_out_of_stock ? 'Out of Stock' : p.is_low_stock ? 'Low Stock' : 'In Stock';
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:18px">📦</span><strong>${p.name}</strong></div></td>
      <td>${p.category_name||'—'}</td>
      <td class="fw-700" style="color:${color}">${p.stock}</td>
      <td>${minStock}</td>
      <td>${minStock*1.5|0}</td>
      <td style="min-width:120px">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${pct.toFixed(0)}%</div>
      </td>
      <td><span class="badge ${statusBadge}">${statusText}</span></td>
      <td><button class="btn btn-ghost btn-xs" onclick="openStockModal(${p.id})"><i class="fa fa-sliders-h"></i> Adjust</button></td>
    </tr>`;
  }).join('');

  const hist = document.getElementById('stock-history');
  const txnData = await InventoryAPI.transactions({ page_size: 10 });
  const allHist = (txnData.results || txnData).map(t => {
    const positiveTypes = ['stock_in','adjustment_increase','transfer_in','purchase','sale_return'];
    const signedQty = positiveTypes.includes(t.transaction_type) ? t.quantity : -t.quantity;
    return {
      date: (t.created_at||'').replace('T',' ').slice(0,16),
      product: t.product_name,
      type: t.transaction_type.replace(/_/g,' '),
      qty: signedQty,
      before: t.balance_after - signedQty,
      after: t.balance_after,
      ref: t.reference || '—',
    };
  });
  hist.innerHTML = allHist.map(h => {
    const typeC = h.qty > 0 ? 'badge-green' : 'badge-red';
    return `<tr>
      <td class="td-mono" style="font-size:11px">${h.date}</td>
      <td>${h.product}</td>
      <td><span class="badge ${typeC}">${h.type}</span></td>
      <td class="${h.qty>0?'text-green':'text-red'} fw-700">${h.qty>0?'+':''}${h.qty}</td>
      <td>${h.before}</td>
      <td>${h.after}</td>
      <td class="td-mono" style="font-size:11px">${h.ref}</td>
    </tr>`;
  }).join('');
}

// ── Stock Adjust helpers ─────────────────────────────
let _adjSelectedPid = null;

function adjSearchProducts(q) {
  const drop = document.getElementById('adj-search-drop');
  if (!q.trim()) { drop.style.display = 'none'; return; }
  const lc = q.toLowerCase();
  const results = _invProductCache.filter(p =>
    (p.name||'').toLowerCase().includes(lc) ||
    (p.sku||'').toLowerCase().includes(lc) ||
    (p.barcode||'').toLowerCase().includes(lc)
  ).slice(0, 12);
  if (!results.length) {
    drop.style.display = '';
    drop.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);text-align:center"><i class="fa fa-search"></i> No products found</div>`;
    return;
  }
  drop.style.display = '';
  drop.innerHTML = results.map(p => {
    const stock = (_invStockByProduct[p.id]||{}).quantity || 0;
    const minStock = p.reorder_level || 10;
    const stockColor = stock <= 0 ? 'var(--red)' : stock <= minStock ? 'var(--yellow)' : 'var(--green)';
    return `<div onclick="selectAdjProductById(${p.id})"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s"
      onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
      <span style="font-size:20px;flex-shrink:0">📦</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">${p.sku||'—'} ${p.barcode?'• '+p.barcode:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:800;color:${stockColor}">${stock}</div>
        <div style="font-size:9px;color:var(--text-muted)">in stock</div>
      </div>
    </div>`;
  }).join('');
}

function selectAdjProductById(pid) {
  const p = _invProductCache.find(x => x.id === pid);
  if (!p) return;
  const stock = (_invStockByProduct[pid]||{}).quantity || 0;
  _adjSelectedPid = pid;
  document.getElementById('adj-product').value = pid;
  document.getElementById('adj-search').value  = p.name;
  document.getElementById('adj-search-drop').style.display = 'none';
  // Show product card
  document.getElementById('adj-product-card').style.display = '';
  document.getElementById('adj-prod-icon').textContent = '📦';
  document.getElementById('adj-prod-name').textContent = p.name;
  document.getElementById('adj-prod-sku').textContent  = (p.sku||'—') + (p.barcode?' | '+p.barcode:'');
  document.getElementById('adj-current-stock').textContent = stock;
  document.getElementById('adj-new-stock').textContent = stock;
  document.getElementById('adj-delta-display').textContent = '±0';
  document.getElementById('adj-qty').value = '';
  updateAdjPreview();
}

function clearAdjProduct() {
  _adjSelectedPid = null;
  document.getElementById('adj-product').value = '';
  document.getElementById('adj-search').value  = '';
  document.getElementById('adj-product-card').style.display = 'none';
  document.getElementById('adj-search-drop').style.display  = 'none';
  document.getElementById('adj-qty').value = '';
}

function selectAdjType(type) {
  document.getElementById('adj-type').value = type;
  ['increase','decrease','damaged','returned'].forEach(t => {
    const tile = document.getElementById('adj-tile-'+t);
    if (!tile) return;
    const isActive = t === type;
    const colors = { increase:'var(--green)', decrease:'var(--red)', damaged:'var(--yellow)', returned:'var(--cyan)' };
    tile.style.borderColor  = isActive ? colors[t] : 'var(--border)';
    tile.style.background   = isActive ? 'rgba('+{
      increase:'16,185,129', decrease:'239,68,68', damaged:'245,158,11', returned:'6,182,212'
    }[t]+',.12)' : 'var(--bg-secondary)';
    tile.style.transform = isActive ? 'scale(1.04)' : '';
  });
  updateAdjPreview();
}

function updateAdjPreview() {
  const pid = _adjSelectedPid;
  if (!pid) return;
  const p = _invProductCache.find(x => x.id === pid);
  if (!p) return;
  const stock = (_invStockByProduct[pid]||{}).quantity || 0;
  const minStock = p.reorder_level || 10;
  const type = document.getElementById('adj-type').value;
  const qty  = parseInt(document.getElementById('adj-qty').value) || 0;
  const increases = ['increase', 'returned'];
  const decreases = ['decrease', 'damaged'];
  let delta = 0, newStock = stock;
  if (increases.includes(type)) { delta = qty; newStock = stock + qty; }
  else if (decreases.includes(type)) { delta = -qty; newStock = Math.max(0, stock - qty); }
  const deltaEl = document.getElementById('adj-delta-display');
  if (deltaEl) {
    deltaEl.textContent = (delta >= 0 ? '+' : '') + delta;
    deltaEl.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const newEl = document.getElementById('adj-new-stock');
  if (newEl) {
    newEl.textContent = newStock;
    newEl.style.color = newStock <= 0 ? 'var(--red)' : newStock <= minStock ? 'var(--yellow)' : 'var(--green)';
  }
  const lowWarn  = document.getElementById('adj-low-warn');
  const negWarn  = document.getElementById('adj-negative-warn');
  if (lowWarn) lowWarn.style.display  = (newStock > 0 && newStock <= minStock) ? '' : 'none';
  if (negWarn) negWarn.style.display  = (decreases.includes(type) && qty > stock) ? '' : 'none';
}

async function openStockModal(pid) {
  if (!_invProductCache.length) await _loadInventoryData();
  // Reset form
  clearAdjProduct();
  selectAdjType('increase');
  document.getElementById('adj-qty').value   = '';
  document.getElementById('adj-notes').value = '';
  document.getElementById('adj-reason').value = 'Stock Count';
  // Pre-select product if pid passed
  if (pid) selectAdjProductById(pid);
  openModal('stock-modal');
}

async function saveStockAdj() {
  const pid  = parseInt(document.getElementById('adj-product').value);
  const type = document.getElementById('adj-type').value;
  const qty  = parseInt(document.getElementById('adj-qty').value) || 0;
  const prod = _invProductCache.find(p => p.id === pid);
  if (!prod) { toast('Select a product first!', 'error'); return; }
  if (qty <= 0) { toast('Enter a valid quantity!', 'error'); return; }

  const reason = document.getElementById('adj-reason').value;
  const notes  = document.getElementById('adj-notes').value;
  const increases = ['increase', 'returned'];
  const typeLabels = { increase:'Stock In', decrease:'Stock Out', damaged:'Damaged', returned:'Returned' };

  try {
    const warehouseId = await _ensureDefaultWarehouse();
    const fullNotes = `${typeLabels[type]}${reason ? ' — '+reason : ''}${notes ? ' | '+notes : ''}`;
    if (increases.includes(type)) {
      await InventoryAPI.stockIn({ product: pid, warehouse: warehouseId, quantity: qty, reference: 'ADJ-'+Date.now(), notes: fullNotes });
    } else {
      await InventoryAPI.stockOut({ product: pid, warehouse: warehouseId, quantity: qty, reference: 'ADJ-'+Date.now(), notes: fullNotes });
    }
    closeModal('stock-modal');
    await renderInventory();
    if (typeof renderProducts === 'function') renderProducts();
    toast(`Stock ${increases.includes(type) ? 'increased' : 'decreased'} by ${qty} — ${prod.name}`, increases.includes(type) ? 'success' : 'warning');
  } catch (err) {
    toast(err.message || 'Failed to adjust stock', 'error');
  }
}

// ── Stock adjust search — close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#adj-search') && !e.target.closest('#adj-search-drop')) {
    const drop = document.getElementById('adj-search-drop');
    if (drop) drop.style.display = 'none';
  }
});
const _orderStatusLabel = { completed:'Completed', cancelled:'Cancelled', returned:'Refunded', partially_returned:'Refunded', draft:'Pending' };
let _orderCache = [];

async function renderOrders() {
  const q = (document.getElementById('ord-search')?.value||'').toLowerCase();
  const sf = document.getElementById('ord-status-filter')?.value||'';
  const data = await SalesAPI.list({ search: q || undefined, ordering: '-created_at', page_size: 200 });
  _orderCache = data.results || data;

  const withLabel = _orderCache.map(o => ({ ...o, statusLabel: _orderStatusLabel[o.status] || o.status }));
  const filtered = withLabel.filter(o => !sf || o.statusLabel === sf);

  document.getElementById('ord-completed').textContent = withLabel.filter(o=>o.statusLabel==='Completed').length;
  document.getElementById('ord-pending').textContent = withLabel.filter(o=>o.statusLabel==='Pending').length;
  document.getElementById('ord-cancelled').textContent = withLabel.filter(o=>o.statusLabel==='Cancelled').length;
  document.getElementById('ord-refunded').textContent = withLabel.filter(o=>o.statusLabel==='Refunded').length;

  const badges = { Completed:'badge-green', Pending:'badge-yellow', Cancelled:'badge-red', Refunded:'badge-purple' };
  document.getElementById('orders-table').innerHTML = filtered.map(o=>`
    <tr>
      <td class="td-mono">${o.invoice_number}</td>
      <td style="font-size:12px">${(o.created_at||'').replace('T',' ').slice(0,16)}</td>
      <td>${o.customer_name||'Walk-in'}</td>
      <td>${o.items.length} item(s)</td>
      <td class="fw-700 text-green">$${Number(o.total_amount).toFixed(2)}</td>
      <td><span class="badge badge-blue">${(o.payments[0]?.method||'—').toUpperCase()}</span></td>
      <td><span class="badge ${badges[o.statusLabel]||'badge-gray'}">${o.statusLabel}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="viewOrder('${o.invoice_number}')"><i class="fa fa-eye"></i></button>
          ${o.statusLabel==='Completed'?`<button class="btn btn-ghost btn-xs" onclick="toast('Receipt printed','success')"><i class="fa fa-print"></i></button>`:''}
        </div>
      </td>
    </tr>`).join('');
}

async function viewOrder(inv) {
  let o = _orderCache.find(x=>x.invoice_number===inv);
  if (!o) {
    // Not in the Orders History cache (e.g. opened from the Bookings list) — fetch fresh.
    const data = await SalesAPI.list({ search: inv, page_size: 1 });
    o = (data.results || data)[0];
  }
  if (!o) { toast('Order not found', 'error'); return; }
  document.getElementById('od-title').textContent = 'Order — ' + inv;
  document.getElementById('order-detail-body').innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">CUSTOMER</div><div style="font-weight:600">${o.customer_name||'Walk-in'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">DATE</div><div style="font-weight:600">${(o.created_at||'').replace('T',' ').slice(0,16)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">PAYMENT METHOD</div><div style="font-weight:600">${(o.payments[0]?.method||'—').toUpperCase()}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">STATUS</div><span class="badge badge-green">${_orderStatusLabel[o.status]||o.status}</span></div>
    </div>
    <table><thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
    <tbody>${o.items.map(i=>`<tr><td>${i.product_name}</td><td>$${Number(i.unit_price).toFixed(2)}</td><td>${i.quantity}</td><td>$${Number(i.line_total).toFixed(2)}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:16px;text-align:right">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">Subtotal: $${Number(o.subtotal).toFixed(2)}</div>
      ${Number(o.discount_amount)>0?`<div style="font-size:13px;color:var(--red);margin-bottom:4px">Discount: -$${Number(o.discount_amount).toFixed(2)}</div>`:''}
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Tax: +$${Number(o.tax_amount).toFixed(2)}</div>
      <div style="font-size:18px;font-weight:800">Total: $${Number(o.total_amount).toFixed(2)}</div>
    </div>`;
  openModal('order-detail-modal');
}

// ═══════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════
// ── CNIC helpers ─────────────────────────────────────
function formatCnicInput(el) {
  let raw = el.value.replace(/[^0-9]/g, '').slice(0, 13);
  let formatted = raw;
  if (raw.length > 5) formatted = raw.slice(0,5) + '-' + raw.slice(5);
  if (raw.length > 12) formatted = raw.slice(0,5) + '-' + raw.slice(5,12) + '-' + raw.slice(12);
  el.value = formatted;
  validateCnic(el.value);
}

function validateCnic(val) {
  const re = /^\d{5}-\d{7}-\d{1}$/;
  const errEl    = document.getElementById('cust-cnic-error');
  const statusEl = document.getElementById('cust-cnic-status');
  if (!val) {
    if (errEl) errEl.style.display = 'none';
    if (statusEl) statusEl.textContent = '';
    return true;
  }
  const valid = re.test(val);
  if (errEl)    errEl.style.display    = valid ? 'none' : '';
  if (statusEl) statusEl.textContent   = valid ? '✅' : '❌';
  return valid;
}

function isCnicDuplicate(cnic, excludeId) {
  if (!cnic) return false;
  return DB.customers.some(c => c.cnic === cnic && c.id !== excludeId);
}

let _customerCache = [];
let _custPage = 1;
const _custPageSize = 20;

async function renderCustomers(page) {
  const isNewQuery = page === undefined;
  _custPage = isNewQuery ? 1 : page;

  const q = (document.getElementById('cust-search')?.value||'').toLowerCase();
  const data = await CustomersAPI.list({
    search: q || undefined,
    ordering: 'name',        // A → Z by customer name
    page: _custPage,
    page_size: _custPageSize,
  });
  const filtered = data.results || data;
  _customerCache = filtered;
  const totalCount = data.count ?? filtered.length;
  const totalPages = data.total_pages ?? Math.max(1, Math.ceil(totalCount / _custPageSize));
  _custPage = data.current_page ?? _custPage;
  renderPaginationBar('customers-pagination', _custPage, totalPages, totalCount, _custPageSize, (p) => renderCustomers(p));
  document.getElementById('customers-table').innerHTML = filtered.map(c=>`
    <tr>
      <td><span class="badge badge-purple" style="font-family:var(--mono)">ACC-${String(c.id).padStart(4,'0')}</span></td>
      <td class="td-mono">CUST-${String(c.id).padStart(3,'0')}</td>
      <td class="fw-700">${c.name}</td>
      <td>${c.phone||'—'}</td>
      <td style="font-family:var(--mono);font-size:12px"><span style="color:var(--text-muted)">—</span></td>
      <td>${c.email||'—'}</td>
      <td class="fw-700 text-green">Rs.${Number(c.credit_limit).toFixed(2)}</td>
      <td class="${Number(c.outstanding_balance)>0?'text-red':'text-green'} fw-700">Rs.${Number(c.outstanding_balance).toFixed(2)}</td>
      <td><span class="badge badge-purple">⭐ ${c.loyalty_points}</span></td>
      <td style="font-size:12px">${(c.updated_at||'').split('T')[0]||'—'}</td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editCustomer(${c.id})"><i class="fa fa-edit"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deleteCustomer(${c.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function openCustomerModal() {
  document.getElementById('cust-modal-title').textContent = 'Add Customer';
  document.getElementById('cust-edit-id').value = '';
  ['cust-name','cust-phone','cust-email','cust-address','cust-cnic'].forEach(i => {
    const el = document.getElementById(i); if (el) el.value = '';
  });
  document.getElementById('cust-points').value = 0;
  document.getElementById('cust-prev-balance').value = 0;
  document.getElementById('cust-credit-limit').value = 0;
  const errEl = document.getElementById('cust-cnic-error');
  const statusEl = document.getElementById('cust-cnic-status');
  if (errEl) errEl.style.display = 'none';
  if (statusEl) statusEl.textContent = '';
  document.getElementById('cust-acc').value = 'ACC-' + String((_customerCache.length||0)+1).padStart(4,'0');
  openModal('customer-modal');
}

function editCustomer(id) {
  const c = _customerCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cust-modal-title').textContent = 'Edit Customer';
  document.getElementById('cust-edit-id').value    = c.id;
  document.getElementById('cust-name').value       = c.name;
  document.getElementById('cust-phone').value      = c.phone || '';
  document.getElementById('cust-email').value      = c.email || '';
  document.getElementById('cust-address').value    = c.address || '';
  document.getElementById('cust-points').value     = c.loyalty_points || 0;
  document.getElementById('cust-acc').value        = 'ACC-' + String(c.id).padStart(4,'0');
  document.getElementById('cust-prev-balance').value = c.outstanding_balance || 0;
  document.getElementById('cust-credit-limit').value = c.credit_limit || 0;
  const cnicEl = document.getElementById('cust-cnic');
  if (cnicEl) { cnicEl.value = ''; }
  openModal('customer-modal');
}

async function saveCustomer() {
  const name = document.getElementById('cust-name').value.trim();
  if (!name) { toast('Customer name is required!', 'error'); return; }

  const cnic    = (document.getElementById('cust-cnic')?.value || '').trim();
  const editId  = parseInt(document.getElementById('cust-edit-id').value);

  // CNIC validation kept as a client-side format check only — the backend
  // Customer model has no CNIC field yet, so it is not persisted.
  if (cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
    toast('Invalid CNIC format. Use: 35202-1234567-1', 'error');
    document.getElementById('cust-cnic')?.focus();
    return;
  }

  const payload = {
    name,
    phone: document.getElementById('cust-phone').value,
    email: document.getElementById('cust-email').value,
    address: document.getElementById('cust-address').value,
    loyalty_points: parseInt(document.getElementById('cust-points').value) || 0,
    outstanding_balance: parseFloat(document.getElementById('cust-prev-balance').value) || 0,
    credit_limit: parseFloat(document.getElementById('cust-credit-limit').value) || 0,
  };

  try {
    if (editId) {
      await CustomersAPI.update(editId, payload);
      toast('Customer updated!', 'success');
    } else {
      await CustomersAPI.create(payload);
      toast('Customer added!', 'success');
    }
    closeModal('customer-modal');
    renderCustomers();
    if (typeof updatePosCustomers === 'function') updatePosCustomers();
  } catch (err) {
    toast(err.message || 'Failed to save customer', 'error');
  }
}

async function deleteCustomer(id) {
  if (!confirm('Delete customer?')) return;
  try {
    await CustomersAPI.remove(id);
    renderCustomers();
    toast('Customer deleted','success');
  } catch (err) {
    toast(err.message || 'Failed to delete customer', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════
let _supplierCache = [];

async function renderSuppliers() {
  const q = (document.getElementById('sup-search')?.value||'').toLowerCase();
  const data = await SuppliersAPI.list({ search: q || undefined });
  const filtered = data.results || data;
  _supplierCache = filtered;
  document.getElementById('suppliers-table').innerHTML = filtered.map(s=>`
    <tr>
      <td class="td-mono">SUP-${String(s.id).padStart(3,'0')}</td>
      <td class="fw-700">${s.name}</td>
      <td>${s.phone||'—'}</td>
      <td>${s.email||'—'}</td>
      <td style="font-size:12px">${s.address||'—'}</td>
      <td class="${Number(s.outstanding_payable)>0?'text-red':'text-green'} fw-700">$${Number(s.outstanding_payable).toFixed(2)} ${Number(s.outstanding_payable)>0?'(owed)':''}</td>
      <td><span class="badge badge-green">${s.is_active?'Active':'Inactive'}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editSupplier(${s.id})"><i class="fa fa-edit"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deleteSupplier(${s.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function openSupplierModal() {
  document.getElementById('sup-modal-title').textContent='Add Supplier';
  document.getElementById('sup-edit-id').value='';
  ['sup-name','sup-phone','sup-email','sup-address'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('sup-balance').value=0;
  openModal('supplier-modal');
}

function editSupplier(id) {
  const s=_supplierCache.find(x=>x.id===id);
  if (!s) return;
  document.getElementById('sup-modal-title').textContent='Edit Supplier';
  document.getElementById('sup-edit-id').value=s.id;
  document.getElementById('sup-name').value=s.name;
  document.getElementById('sup-phone').value=s.phone||'';
  document.getElementById('sup-email').value=s.email||'';
  document.getElementById('sup-address').value=s.address||'';
  document.getElementById('sup-balance').value=s.outstanding_payable;
  openModal('supplier-modal');
}

async function saveSupplier() {
  const name=document.getElementById('sup-name').value.trim();
  if (!name) { toast('Name required!','error'); return; }
  const editId=parseInt(document.getElementById('sup-edit-id').value);
  const payload={
    name,
    phone: document.getElementById('sup-phone').value,
    email: document.getElementById('sup-email').value,
    address: document.getElementById('sup-address').value,
    outstanding_payable: parseFloat(document.getElementById('sup-balance').value)||0,
    is_active: true,
  };
  try {
    if (editId) {
      await SuppliersAPI.update(editId, payload);
      toast('Supplier updated!','success');
    } else {
      await SuppliersAPI.create(payload);
      toast('Supplier added!','success');
    }
    closeModal('supplier-modal');
    renderSuppliers();
  } catch (err) {
    toast(err.message || 'Failed to save supplier', 'error');
  }
}

async function deleteSupplier(id) {
  if (!confirm('Delete supplier?')) return;
  try {
    await SuppliersAPI.remove(id);
    renderSuppliers();
    toast('Supplier deleted','success');
  } catch (err) {
    toast(err.message || 'Failed to delete supplier', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// PURCHASES
// ═══════════════════════════════════════════════════════
let _purchaseCache = [];
let _purSupplierCache = [];
let _purProductCache = [];

async function renderPurchases() {
  const data = await PurchaseAPI.list({ page_size: 200 });
  _purchaseCache = data.results || data;
  document.getElementById('purchases-table').innerHTML = _purchaseCache.map(p=>`
    <tr>
      <td class="td-mono">${p.po_number}</td>
      <td style="font-size:12px">${(p.created_at||'').split('T')[0]}</td>
      <td>${p.supplier_name||'Unknown'}</td>
      <td>${p.items.length} item(s)</td>
      <td class="fw-700">$${Number(p.total_amount).toFixed(2)}</td>
      <td><span class="badge ${p.status==='received'?'badge-green':p.status==='partially_received'?'badge-yellow':'badge-blue'}">${p.status.replace(/_/g,' ')}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs"><i class="fa fa-eye"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

let purItems = [];
async function openPurchaseModal() {
  const [supData, prodData] = await Promise.all([
    SuppliersAPI.list({ page_size: 500 }),
    ProductsAPI.list({ page_size: 500 }),
  ]);
  _purSupplierCache = supData.results || supData;
  _purProductCache = prodData.results || prodData;
  document.getElementById('pur-supplier').innerHTML = _purSupplierCache.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('pur-date').value = new Date().toISOString().split('T')[0];
  purItems = [{productId:'',qty:1,price:0}];
  renderPurItems();
  openModal('purchase-modal');
}

function renderPurItems() {
  document.getElementById('pur-items-list').innerHTML = purItems.map((item,i)=>`
    <div class="form-row" style="align-items:flex-end;margin-bottom:10px">
      <div class="form-group-inline" style="margin-bottom:0">
        <label>Product</label>
        <select class="form-input" onchange="purItemChange(${i},'product',this.value)" style="padding:9px 12px">
          <option value="">Select Product</option>
          ${_purProductCache.map(p=>`<option value="${p.id}" ${item.productId==p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:90px">
        <label>Qty</label>
        <input class="form-input" type="number" value="${item.qty}" min="1" onchange="purItemChange(${i},'qty',this.value)" style="padding:9px 12px">
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:100px">
        <label>Price ($)</label>
        <input class="form-input" type="number" value="${item.price}" step="0.01" onchange="purItemChange(${i},'price',this.value)" style="padding:9px 12px">
      </div>
      <button class="btn btn-ghost btn-xs" onclick="removePurItem(${i})" style="color:var(--red);margin-bottom:2px"><i class="fa fa-times"></i></button>
    </div>`).join('');
  const total = purItems.reduce((a,i)=>a+i.qty*i.price,0);
  document.getElementById('pur-total').textContent = '$'+total.toFixed(2);
}

function purItemChange(i,field,val) {
  if (field==='product') {
    purItems[i].productId=parseInt(val)||'';
    const prod=_purProductCache.find(p=>p.id==val);
    if(prod) purItems[i].price=Number(prod.cost_price) || 0;
  } else if(field==='qty') purItems[i].qty=parseInt(val)||1;
  else purItems[i].price=parseFloat(val)||0;
  renderPurItems();
}
function addPurItem() { purItems.push({productId:'',qty:1,price:0}); renderPurItems(); }
function removePurItem(i) { purItems.splice(i,1); renderPurItems(); }

let _savingPurchase = false;

async function savePurchase() {
  if (_savingPurchase) return; // guards against double-click firing this twice
  const validItems = purItems.filter(i=>i.productId);
  if (!validItems.length) { toast('Add at least one product','error'); return; }
  const supplierId = parseInt(document.getElementById('pur-supplier').value);
  if (!supplierId) { toast('Select a supplier','error'); return; }

  // A $0 line item almost always means the product's cost price was never
  // set (or the price field wasn't edited) — block save with a clear message
  // instead of letting the backend reject a $0 "Paid" payment cryptically.
  const zeroPriceItems = validItems.filter(i => !i.price || i.price <= 0);
  if (zeroPriceItems.length) {
    toast('Set a price greater than $0 for every item before saving (check: ' +
      zeroPriceItems.map(i => _purProductCache.find(p=>p.id==i.productId)?.name || 'item').join(', ') + ')', 'error');
    return;
  }

  _savingPurchase = true;
  const saveBtn = document.querySelector('#purchase-modal .btn-accent, #purchase-modal [onclick="savePurchase()"]');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const warehouseId = await _ensureDefaultWarehouse();
    const items = validItems.map(i => ({
      product: i.productId, quantity_ordered: i.qty, unit_cost: i.price,
    }));

    // Create the PO
    const po = await PurchaseAPI.create({
      supplier: supplierId, warehouse: warehouseId, items,
      notes: document.getElementById('pur-notes').value,
    });

    // Receive everything immediately (this UI is a single-step "record a
    // completed purchase" form, so ordered == received in one action).
    await PurchaseAPI.receive(po.id, {
      items: po.items.map(it => ({ purchase_order_item: it.id, quantity: it.quantity_ordered })),
    });

    // Pay in full if the form says "Paid" — total_amount is guaranteed > 0
    // here since we already blocked $0-priced items above.
    const paymentStatus = document.getElementById('pur-payment').value;
    if (paymentStatus === 'Paid' && Number(po.total_amount) > 0) {
      await PurchaseAPI.pay(po.id, { amount: po.total_amount, method: 'bank_transfer' });
    }

    closeModal('purchase-modal');
    renderPurchases();
    if (typeof renderProducts === 'function') renderProducts();
    toast('Purchase order saved and stock received!','success');
  } catch (err) {
    toast(err.message || 'Failed to save purchase', 'error');
  } finally {
    _savingPurchase = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════
let _expenseCache = [];
let _expenseCategoryCache = [];

async function _findOrCreateExpenseCategory(name) {
  if (!_expenseCategoryCache.length) {
    const data = await ExpensesAPI.categories();
    _expenseCategoryCache = data.results || data;
  }
  const existing = _expenseCategoryCache.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await ExpensesAPI.createCategory({ name });
  _expenseCategoryCache.push(created);
  return created.id;
}

async function renderExpenses() {
  const data = await ExpensesAPI.list({ page_size: 500 });
  _expenseCache = data.results || data;
  document.getElementById('expenses-table').innerHTML = _expenseCache.map(e=>`
    <tr>
      <td>${e.expense_date}</td>
      <td><span class="badge badge-blue">${e.category_name}</span></td>
      <td>${e.description || e.title}</td>
      <td class="fw-700 text-red">$${Number(e.amount).toFixed(2)}</td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editExpense(${e.id})"><i class="fa fa-edit"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deleteExpense(${e.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');

  if (charts.expCat) charts.expCat.destroy();
  const catTotals = {};
  _expenseCache.forEach(e => catTotals[e.category_name] = (catTotals[e.category_name]||0)+Number(e.amount));
  const ec = document.getElementById('expenseChart');
  if (ec) charts.expCat = new Chart(ec, {
    type: 'doughnut',
    data: { labels: Object.keys(catTotals), datasets: [{ data: Object.values(catTotals), backgroundColor: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#ec4899'], borderWidth:0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:'#8892a4', font:{size:11} } } }, cutout:'60%' }
  });

  if (charts.expMonth) charts.expMonth.destroy();
  const emc = document.getElementById('expMonthChart');
  if (emc) {
    const monthTotals = {};
    _expenseCache.forEach(e => {
      const m = (e.expense_date||'').slice(0,7); // YYYY-MM
      monthTotals[m] = (monthTotals[m]||0) + Number(e.amount);
    });
    const labels = Object.keys(monthTotals).sort();
    charts.expMonth = new Chart(emc, {
      type: 'bar',
      data: { labels, datasets:[{ label:'Expenses ($)', data:labels.map(l=>monthTotals[l]), backgroundColor:'rgba(239,68,68,.5)', borderColor:'rgba(239,68,68,1)', borderWidth:2, borderRadius:6 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8892a4',font:{size:11}}}}, scales:{ x:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}}, y:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}} } }
    });
  }
}

function openExpenseModal() {
  document.getElementById('exp-modal-title').textContent='Add Expense';
  document.getElementById('exp-edit-id').value='';
  document.getElementById('exp-amount').value='';
  document.getElementById('exp-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('exp-desc').value='';
  document.getElementById('exp-ref').value='';
  openModal('expense-modal');
}

function editExpense(id) {
  const e=_expenseCache.find(x=>x.id===id);
  if (!e) return;
  document.getElementById('exp-modal-title').textContent='Edit Expense';
  document.getElementById('exp-edit-id').value=e.id;
  document.getElementById('exp-cat').value=e.category_name;
  document.getElementById('exp-amount').value=e.amount;
  document.getElementById('exp-date').value=e.expense_date;
  document.getElementById('exp-desc').value=e.description || '';
  document.getElementById('exp-ref').value='';
  openModal('expense-modal');
}

async function saveExpense() {
  const amount=parseFloat(document.getElementById('exp-amount').value);
  if(!amount) { toast('Amount required!','error'); return; }
  const editId=parseInt(document.getElementById('exp-edit-id').value);
  const categoryName = document.getElementById('exp-cat').value;
  const description = document.getElementById('exp-desc').value;
  const ref = document.getElementById('exp-ref').value;

  try {
    const categoryId = await _findOrCreateExpenseCategory(categoryName);
    const payload = {
      category: categoryId,
      title: (description || categoryName).slice(0,200),
      description: description + (ref ? ` (Ref: ${ref})` : ''),
      amount,
      expense_date: document.getElementById('exp-date').value,
    };
    if (editId) {
      await ExpensesAPI.update(editId, payload);
      toast('Expense updated!','success');
    } else {
      await ExpensesAPI.create(payload);
      toast('Expense added!','success');
    }
    closeModal('expense-modal');
    renderExpenses();
  } catch (err) {
    toast(err.message || 'Failed to save expense', 'error');
  }
}

async function deleteExpense(id) {
  if(!confirm('Delete expense?')) return;
  try {
    await ExpensesAPI.remove(id);
    renderExpenses();
    toast('Expense deleted','success');
  } catch (err) {
    toast(err.message || 'Failed to delete expense', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// ACCOUNTING
// ═══════════════════════════════════════════════════════
function renderAccounting() {
  const totalSales = DB.orders.filter(o=>o.status==='Completed').reduce((a,o)=>a+o.total,0) + 28500;
  const totalExpenses = DB.expenses.reduce((a,e)=>a+e.amount,0);
  const profit = totalSales - totalExpenses;
  const outstanding = DB.suppliers.reduce((a,s)=>a+Math.abs(Math.min(s.balance,0)),0);
  document.getElementById('acc-income').textContent = '$'+totalSales.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('acc-expenses').textContent = '$'+totalExpenses.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('acc-profit').textContent = '$'+profit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('acc-outstanding').textContent = '$'+outstanding.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');

  DB.ledger = DB.ledger || [];
  const sampleLedger = [
    { date:'2025-01-17 09:15', type:'Sale', ref:'INV-0042', desc:'Sale to Ahmed Hassan', debit:0, credit:4.86, balance:28504.86 },
    { date:'2025-01-17 08:50', type:'Sale', ref:'INV-0041', desc:'Sale to Walk-in', debit:0, credit:2.00, balance:28500.00 },
    { date:'2025-01-10 10:00', type:'Purchase', ref:'PO-0001', desc:'Purchase from Beverage Dist.', debit:50.00, credit:0, balance:28498.00 },
    { date:'2025-01-05 12:00', type:'Expense', ref:'EXP-002', desc:'Electricity Bill', debit:350.00, credit:0, balance:28548.00 },
    { date:'2025-01-01 09:00', type:'Expense', ref:'EXP-001', desc:'Monthly Rent', debit:2500.00, credit:0, balance:28898.00 },
  ];
  const allLedger = [...DB.ledger, ...sampleLedger];
  document.getElementById('ledger-table').innerHTML = allLedger.map(l=>`
    <tr>
      <td style="font-size:12px">${l.date}</td>
      <td><span class="badge ${l.type==='Sale'?'badge-green':l.type==='Expense'?'badge-red':'badge-blue'}">${l.type}</span></td>
      <td class="td-mono">${l.ref}</td>
      <td>${l.desc}</td>
      <td class="text-red">${l.debit>0?'$'+l.debit.toFixed(2):'—'}</td>
      <td class="text-green">${l.credit>0?'$'+l.credit.toFixed(2):'—'}</td>
      <td class="fw-700">$${l.balance.toFixed(2)}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════
let _reportColumnsCache = [];

function _reportDateParams() {
  const from = document.getElementById('rpt-from')?.value;
  const to = document.getElementById('rpt-to')?.value;
  const params = {};
  if (from) params.date_from = from;
  if (to) params.date_to = to;
  return params;
}

async function renderReports() {
  // Real 6-month revenue/profit trend from the backend's daily sales chart,
  // rolled up into monthly buckets for this line chart.
  if (charts.rptSales) charts.rptSales.destroy();
  const rc = document.getElementById('rptSalesChart');
  if (rc) {
    let series = [];
    try {
      const chartData = await DashboardAPI.salesChart(180);
      series = chartData.series || [];
    } catch (_) { /* manager+ only — leave empty for other roles */ }
    const monthlyTotals = {};
    series.forEach(s => {
      const month = (s.day || '').slice(0, 7);
      monthlyTotals[month] = (monthlyTotals[month] || 0) + Number(s.total);
    });
    const labels = Object.keys(monthlyTotals).sort();
    charts.rptSales = new Chart(rc, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Revenue ($)', data: labels.map(l => monthlyTotals[l]),
          borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.1)',
          borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#3b82f6', pointRadius: 4,
        }]
      },
      options: { responsive:true,maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8892a4',font:{size:11}}}}, scales:{ x:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}}, y:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}} } }
    });
  }

  // Real Profit & Loss summary
  try {
    const pl = await FinanceAPI.profitLoss(_reportDateParams());
    const netProfit = Number(pl.net_profit);
    document.getElementById('pl-summary').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="flex-between" style="padding:12px;background:var(--green-glow);border-radius:8px;border:1px solid rgba(16,185,129,.2)">
          <span style="font-size:13px;font-weight:600">💹 Total Income</span>
          <span style="font-size:16px;font-weight:800;color:var(--green)">$${Number(pl.income).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
        </div>
        <div class="flex-between" style="padding:12px;background:var(--red-glow);border-radius:8px;border:1px solid rgba(239,68,68,.2)">
          <span style="font-size:13px;font-weight:600">📉 Total Expenses</span>
          <span style="font-size:16px;font-weight:800;color:var(--red)">$${Number(pl.expenses).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
        </div>
        <div class="flex-between" style="padding:12px;background:var(--accent-glow);border-radius:8px;border:1px solid rgba(59,130,246,.2)">
          <span style="font-size:13px;font-weight:600">📊 Cost of Goods Sold</span>
          <span style="font-size:16px;font-weight:800;color:var(--accent)">$${Number(pl.cost_of_goods_sold).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
        </div>
        <div class="divider"></div>
        <div class="flex-between" style="padding:14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-light)">
          <span style="font-size:15px;font-weight:700">🏆 Net Profit</span>
          <span style="font-size:20px;font-weight:800;color:${netProfit>=0?'var(--green)':'var(--red)'}">$${Math.abs(netProfit).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
        </div>
      </div>`;
  } catch (_) {
    document.getElementById('pl-summary').innerHTML = '<div style="color:var(--text-muted);font-size:13px">Manager access required to view P&L</div>';
  }

  await generateReport();
}

let _currentReportSlug = 'sales';

async function generateReport() {
  const typeSelect = document.getElementById('rpt-type');
  const slug = typeSelect ? typeSelect.value : 'sales';
  _currentReportSlug = slug;
  const titleMap = {
    sales: 'Sales Report', inventory: 'Inventory Report', purchase: 'Purchase Report',
    expenses: 'Expense Report', profit: 'Profit & Loss Report', customers: 'Customer Report',
    suppliers: 'Supplier Report', tax: 'Tax Report',
  };
  document.getElementById('report-table-title').textContent = titleMap[slug] || 'Report';

  try {
    const data = await ReportsAPI.fetch(slug, _reportDateParams());
    const rows = data.results || [];
    // Derive columns from the first row's keys (backend already sends
    // human-friendly values as strings) — falls back to an empty table
    // with just a "No data" message if there are no rows yet.
    const columns = rows.length ? Object.keys(rows[0]) : [];
    _reportColumnsCache = columns;

    document.getElementById('report-table-head').innerHTML = columns
      .map(c => `<th>${c.replace(/_/g,' ').replace(/\b\w/g, ch => ch.toUpperCase())}</th>`).join('');

    document.getElementById('report-table').innerHTML = rows.length
      ? rows.map(row => `<tr>${columns.map(c => `<td>${row[c]}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length||1}" style="text-align:center;color:var(--text-muted);padding:20px">No data for the selected range</td></tr>`;
  } catch (err) {
    toast(err.message || 'Failed to generate report', 'error');
  }
}

async function exportCurrentReport(format) {
  try {
    await ReportsAPI.download(_currentReportSlug, format, _reportDateParams());
    toast(`${format.toUpperCase()} export downloaded`, 'success');
  } catch (err) {
    toast(err.message || 'Export failed', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════
let _userCache = [];
const _roleBadgeMap = { super_admin:'badge-purple', admin:'badge-purple', manager:'badge-blue',
  cashier:'badge-green', salesperson:'badge-green', inventory_manager:'badge-blue', customer:'badge-gray' };

async function renderUsers() {
  const data = await UsersAPI.list({ page_size: 500 });
  _userCache = data.results || data;
  document.getElementById('users-table').innerHTML = _userCache.map(u=>`
    <tr>
      <td class="td-mono">USR-${String(u.id).padStart(3,'0')}</td>
      <td class="fw-700">${u.full_name||u.email}</td>
      <td class="td-mono">${u.email}</td>
      <td><span class="badge ${_roleBadgeMap[u.role]||'badge-gray'}">${u.role.replace(/_/g,' ')}</span></td>
      <td>${u.email}</td>
      <td style="font-size:11px;color:var(--text-secondary);max-width:200px">${['super_admin','admin'].includes(u.role)?'<span class="badge badge-purple">All Modules</span>':'<span class="badge badge-blue" style="font-size:9px">Role-based</span>'}</td>
      <td style="font-size:12px">${u.last_login ? u.last_login.replace('T',' ').slice(0,16) : 'Never'}</td>
      <td><span class="badge ${u.is_active?'badge-green':'badge-red'}">${u.is_active?'Active':'Inactive'}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editUser(${u.id})"><i class="fa fa-edit"></i></button>
          ${u.id!==currentUser?.id?`<button class="btn btn-ghost btn-xs" onclick="deleteUser(${u.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>`:''}
        </div>
      </td>
    </tr>`).join('');

  // Activity log now comes from the audit-log API when needed elsewhere;
  // this panel is left showing local session events only.
  const logBody = document.getElementById('activity-log');
  if (logBody) logBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px">See Audit Logs (backend) for full activity history</td></tr>';
}

function togglePermissionsPanel() {
  // The backend uses fixed roles (no per-user custom permission sets), so the
  // granular checkbox panel is no longer applicable — always hidden now.
  const panel = document.getElementById('permissions-panel');
  if (panel) panel.style.display = 'none';
}

function openUserModal() {
  document.getElementById('user-modal-title').textContent='Add User';
  document.getElementById('user-edit-id').value='';
  ['usr-name','usr-username','usr-email','usr-pass'].forEach(i=>{
    const el = document.getElementById(i); if (el) el.value='';
  });
  document.getElementById('usr-role').value='cashier';
  togglePermissionsPanel();
  openModal('user-modal');
}

function editUser(id) {
  const u=_userCache.find(x=>x.id===id);
  if (!u) return;
  document.getElementById('user-modal-title').textContent='Edit User';
  document.getElementById('user-edit-id').value=u.id;
  document.getElementById('usr-name').value=u.full_name||'';
  const usernameEl = document.getElementById('usr-username');
  if (usernameEl) usernameEl.value=u.email;
  document.getElementById('usr-email').value=u.email;
  document.getElementById('usr-role').value=u.role;
  document.getElementById('usr-pass').value='';
  togglePermissionsPanel();
  openModal('user-modal');
}

async function saveUser() {
  const name=document.getElementById('usr-name').value.trim();
  const email=document.getElementById('usr-email').value.trim();
  if(!name||!email) { toast('Name and email required!','error'); return; }
  const editId=parseInt(document.getElementById('user-edit-id').value);
  const role=document.getElementById('usr-role').value;
  const pass=document.getElementById('usr-pass').value;
  const nameParts = name.split(' ');
  const payload = {
    first_name: nameParts[0] || name,
    last_name: nameParts.slice(1).join(' ') || '-',
    email, role, is_active: true,
  };
  if (pass) payload.password = pass;

  try {
    if (editId) {
      await UsersAPI.update(editId, payload);
      toast('User updated!','success');
    } else {
      if (!pass) { toast('Password required!','error'); return; }
      await UsersAPI.create(payload);
      toast('User created!','success');
    }
    closeModal('user-modal');
    renderUsers();
  } catch (err) {
    toast(err.message || 'Failed to save user', 'error');
  }
}

async function deleteUser(id) {
  if(!confirm('Deactivate this user?')) return;
  try {
    await UsersAPI.remove(id);
    renderUsers();
    toast('User deactivated','success');
  } catch (err) {
    toast(err.message || 'Failed to deactivate user', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target===el) closeModal(el.id); });
});

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
const _toastIcons = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle' };
const _toastMaxVisible = 4;
const _toastDefaultDuration = 4200;

function toast(msg, type='success', duration=_toastDefaultDuration) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // De-dupe: if the exact same message/type is already showing, just bump
  // its counter and restart the auto-dismiss timer instead of stacking a
  // second identical box (this is what used to spam 4 copies of the same
  // backend error onto the screen).
  const key = type + '::' + msg;
  const existing = container.querySelector(`.toast[data-key="${CSS.escape(key)}"]`);
  if (existing) {
    const countEl = existing.querySelector('.toast-count');
    const n = (parseInt(existing.dataset.count||'1', 10) + 1);
    existing.dataset.count = n;
    if (countEl) countEl.textContent = '×' + n;
    else existing.querySelector('.toast-msg').insertAdjacentHTML('beforeend', ` <span class="toast-count">×${n}</span>`);
    const bar = existing.querySelector('.toast-progress');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = `toastProgress ${duration}ms linear forwards`; }
    clearTimeout(existing._dismissTimer);
    existing._dismissTimer = setTimeout(() => _dismissToast(existing), duration);
    return;
  }

  // Cap how many can pile up on screen at once — oldest goes first.
  const visible = container.querySelectorAll('.toast');
  if (visible.length >= _toastMaxVisible) _dismissToast(visible[0]);

  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.dataset.key = key;
  t.dataset.count = '1';
  t.innerHTML = `
    <div class="toast-icon"><i class="fa ${_toastIcons[type]||_toastIcons.success}"></i></div>
    <div class="toast-body"><div class="toast-msg">${msg}</div></div>
    <button class="toast-close" onclick="_dismissToast(this.closest('.toast'))" aria-label="Dismiss"><i class="fa fa-times"></i></button>
    <div class="toast-progress" style="animation-duration:${duration}ms"></div>`;
  container.appendChild(t);
  t._dismissTimer = setTimeout(() => _dismissToast(t), duration);
}

function _dismissToast(el) {
  if (!el || el.classList.contains('toast-out')) return;
  clearTimeout(el._dismissTimer);
  el.classList.add('toast-out');
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 400); // safety net if animationend doesn't fire
}

// ═══════════════════════════════════════════════════════
// A4 REPORT PRINT
// ═══════════════════════════════════════════════════════
function printReportA4() {
  const rows = [];
  document.querySelectorAll('#report-table tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
    if (cells.length) rows.push(cells);
  });
  const today = new Date().toLocaleDateString();
  const html = `<div class="a4-doc">
    <div class="a4-header">
      <div>
        <div class="a4-logo-name">🏪 SmartRetail Store</div>
        <div style="font-size:11px;color:#555;margin-top:3px">123 Market Street, City</div>
      </div>
      <div class="a4-store-info">
        <strong style="font-size:14px">SALES REPORT</strong><br>
        Generated: ${today}<br>
        By: ${currentUser?.full_name || 'Admin'}
      </div>
    </div>
    <div class="a4-doc-title">Sales Report</div>
    <table>
      <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>Tax</th><th>Discount</th><th>Total</th><th>Payment</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <div class="a4-footer">
      <span>SmartRetail ERP — Sales Report</span>
      <span>Printed: ${today}</span>
    </div>
  </div>`;
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = html;
  printArea.style.display = 'block';
  window.print();
  setTimeout(() => { printArea.style.display = 'none'; }, 1000);
}

// ═══════════════════════════════════════════════════════
// ORDER BOOKING MODULE
// ═══════════════════════════════════════════════════════
function initBooking() {
  _editingBookingId = null;
  document.getElementById('booking-form-wrap').style.display = 'none';
  document.getElementById('booking-list-wrap').style.display = '';
  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('bk-date-filter').value)
    document.getElementById('bk-date-filter').value = today;
  renderBookingList();
}

async function newBookingForm(editId) {
  // Bookings map directly onto real Sale records now — Sales aren't editable
  // once created (matches real invoicing behavior), so "editing" a past
  // booking isn't supported. Use Sale Return from the Returns page instead
  // to correct a mistaken booking.
  if (editId) {
    toast('Editing a saved booking isn\'t supported — use Sale Return to correct it.', 'warning');
    return;
  }
  _editingBookingId = null;
  document.getElementById('booking-form-wrap').style.display = '';
  document.getElementById('booking-list-wrap').style.display = 'none';
  setTimeout(()=>document.getElementById('booking-form-wrap').scrollIntoView({behavior:'smooth'}),50);

  await _loadBookingLookups();

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('booking-form-title').textContent = '📝 New Order Booking';
  document.getElementById('bk-date').value = today;
  document.getElementById('bk-invoice').value = 'Assigned on save';
  document.getElementById('bk-customer').value = '';
  document.getElementById('bk-customer-search').value = '';
  document.getElementById('bk-payment').value = 'credit';
  document.getElementById('bk-notes').value = '';
  document.getElementById('bk-discount').value = 0;
  document.getElementById('bk-tax').value = 0;
  document.getElementById('bk-acc-search').value = '';
  document.getElementById('bk-acc-display').value = '';
  document.getElementById('bk-customer-info').style.display = 'none';
  _bookingItems = [{ productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1 }];
  renderBookingItemRows();
  calcBookingTotals();

  // No manual clicks needed to get started — land the cursor straight in
  // the customer search box.
  setTimeout(()=>{ document.getElementById('bk-customer-search')?.focus(); }, 60);
}

function closeBookingForm() {
  document.getElementById('booking-form-wrap').style.display = 'none';
  document.getElementById('booking-list-wrap').style.display = '';
  renderBookingList();
}

function searchCustomerByAcc(val) {
  const v = val.trim().toLowerCase();
  if (!v) return;
  const cust = _bkCustomerCache.find(c =>
    ('acc-'+String(c.id).padStart(4,'0')).toLowerCase()===v ||
    (c.name||'').toLowerCase().includes(v)
  );
  if (cust) {
    document.getElementById('bk-customer').value = cust.id;
    onBookingCustomerChange();
    toast('Customer found: '+cust.name,'success');
  }
}

function clearAccSearch() {
  document.getElementById('bk-acc-search').value='';
  document.getElementById('bk-customer').value='';
  document.getElementById('bk-customer-search').value='';
  document.getElementById('bk-acc-display').value='';
  document.getElementById('bk-customer-info').style.display='none';
  calcBookingTotals();
}

let _bkCustomerCache = [];
let _bkProductCache = [];
let _bkStockByProduct = {};

async function _loadBookingLookups() {
  const [custData, prodData, stockData] = await Promise.all([
    CustomersAPI.list({ page_size: 500 }),
    ProductsAPI.list({ page_size: 500 }),  // status filter removed — was silently hiding products whose status wasn't exactly 'active'
    InventoryAPI.stockItems({ page_size: 1000 }),
  ]);
  _bkCustomerCache = custData.results || custData;
  _bkProductCache = prodData.results || prodData;
  _bkStockByProduct = {};
  (stockData.results || stockData).forEach(si => {
    _bkStockByProduct[si.product] = (_bkStockByProduct[si.product] || 0) + si.quantity;
  });
}

function onBookingCustomerChange() {
  const id = parseInt(document.getElementById('bk-customer').value);
  const cust = _bkCustomerCache.find(c=>c.id===id);
  const searchEl = document.getElementById('bk-customer-search');
  if (!cust) {
    document.getElementById('bk-acc-display').value='';
    document.getElementById('bk-customer-info').style.display='none';
    if (searchEl) searchEl.value='';
    calcBookingTotals();
    return;
  }
  const acc = 'ACC-'+String(cust.id).padStart(4,'0');
  document.getElementById('bk-acc-display').value = acc;
  document.getElementById('bk-acc-search').value = acc;
  if (searchEl) searchEl.value = `${cust.name} (${acc})`;
  document.getElementById('bk-customer-info').style.display='';
  document.getElementById('bk-prev-balance').textContent = '$'+Number(cust.outstanding_balance).toFixed(2);
  document.getElementById('bk-total-purchases').textContent = '$'+Number(cust.credit_limit).toFixed(2);
  document.getElementById('bk-last-visit').textContent = (cust.updated_at||'').slice(0,10)||'—';
  calcBookingTotals();
}

// ── Customer search-as-you-type (Order Booking) ───────────────────
// Same UX as the product search box: type any part of the name or phone
// number and matching customers drop down below the field.
function _bkCustDropRows(list) {
  return list.map(c => {
    const acc = 'ACC-'+String(c.id).padStart(4,'0');
    const bal = Number(c.outstanding_balance)||0;
    const balColor = bal>0 ? 'var(--red)' : 'var(--green)';
    return `<div onmousedown="bkCustSelect(${c.id})" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
      <span style="font-size:18px;flex-shrink:0">👤</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">${acc}${c.phone ? ' · '+c.phone : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12px;font-weight:800;color:${balColor}">$${bal.toFixed(2)}</div>
        <div style="font-size:9px;color:var(--text-muted)">balance</div>
      </div>
    </div>`;
  }).join('');
}

function bkCustSearch(q) {
  const drop = document.getElementById('bk-cust-drop');
  if (!drop) return;
  const lc = (q||'').toLowerCase().trim();
  if (!lc) { drop.style.display='none'; return; }
  const rank = (c) => {
    const name = (c.name||'').toLowerCase();
    const phone = (c.phone||'').toLowerCase(), email = (c.email||'').toLowerCase();
    const acc = ('acc-'+String(c.id).padStart(4,'0'));
    if (name.startsWith(lc)) return 0;   // starts-with → top of the list
    if (name.includes(lc) || phone.includes(lc) || email.includes(lc) || acc.includes(lc)) return 1;
    return -1; // no match
  };
  const results = _bkCustomerCache
    .map(c => ({ c, r: rank(c) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
    .slice(0, 20)
    .map(x => x.c);
  if (!results.length) {
    drop.style.display='';
    drop.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);text-align:center"><i class="fa fa-search-minus"></i> No customer found</div>';
    return;
  }
  drop.style.display='';
  drop.innerHTML = _bkCustDropRows(results);
}

function bkCustSearchFocus() {
  const inp = document.getElementById('bk-customer-search');
  if (!inp) return;
  if (!inp.value.trim()) {
    const drop = document.getElementById('bk-cust-drop');
    if (!drop || !_bkCustomerCache.length) return;
    drop.style.display='';
    drop.innerHTML = _bkCustDropRows(_bkCustomerCache.slice(0, 20));
  } else {
    bkCustSearch(inp.value);
  }
}

function bkCustSelect(id) {
  document.getElementById('bk-customer').value = id;
  onBookingCustomerChange();
  bkCustDropClose();
  // Customer picked → send the user straight into product selection,
  // whichever row is still empty and waiting for a product.
  setTimeout(()=>{
    const emptyIdx = _bookingItems.findIndex(it => !it.productId);
    const idx = emptyIdx >= 0 ? emptyIdx : 0;
    document.getElementById('bk-prod-input-'+idx)?.focus();
  }, 60);
}

function bkCustDropClose() {
  const drop = document.getElementById('bk-cust-drop');
  if (drop) drop.style.display='none';
}

function addBookingItemRow() {
  _bookingItems.push({ productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1 });
  renderBookingItemRows();
}

function removeBookingItemRow(i) {
  _bookingItems.splice(i,1);
  if (!_bookingItems.length) _bookingItems.push({ productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1 });
  renderBookingItemRows();
  calcBookingTotals();
}

function renderBookingItemRows() {
  const tbody = document.getElementById('bk-items-tbody');
  if (!tbody) return;

  // Preserve focus + cursor position across the innerHTML rebuild below —
  // otherwise every keystroke in a Rate/Qty/Cartons field would knock focus
  // out of the input after a single character, since innerHTML destroys and
  // recreates every row's DOM nodes.
  const active = document.activeElement;
  let focusId = null, selStart = null, selEnd = null;
  if (active && tbody.contains(active) && active.id) {
    focusId = active.id;
    if (typeof active.selectionStart === 'number') {
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    }
  }

  const units = ['Pcs','Lbs','Kg','Carton','Box','Dozen','Litre'];
  tbody.innerHTML = _bookingItems.map((item,i)=>{
    const unit     = item.unit||'Pcs';
    const ppc      = item.ppc||1;
    let totalPcs = 0;
    if (unit==='Carton') {
      totalPcs = (item.cartons||0)*ppc + (item.qty||0);
    } else {
      totalPcs = (item.qty||0) + (item.cartons||0)*ppc;
    }
    const baseAmt   = totalPcs*(item.rate||0);
    const taxPct    = item.taxPct||0;
    const taxAmt    = baseAmt*taxPct/100;
    const lineTotal = baseAmt+taxAmt;
    const prodLabel = item.productId ? (item.icon||'\u{1F4E6}')+' '+item.name : '';
    return `<tr id="bk-row-${i}">
      <td style="padding:5px 8px;position:relative">
        <div style="position:relative">
          <input class="form-input bk-prod-search" id="bk-prod-input-${i}"
            placeholder="\u{1F50D} Search product by name or SKU..."
            value="${prodLabel.replace(/"/g,'&quot;')}"
            autocomplete="off"
            style="padding:7px 10px;font-size:12px;width:100%;min-width:180px;padding-right:${item.productId?'28px':'10px'}"
            oninput="bkProdSearch(${i},this.value)"
            onfocus="bkProdSearchFocus(${i})"
            onblur="setTimeout(()=>bkProdDropClose(${i}),180)">
          ${item.productId ? `<button onmousedown="bkProdClear(${i})" title="Change product"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:0;line-height:1">✕</button>` : ''}
        </div>

      </td>
      <td style="padding:5px 8px">
        <input class="form-input" type="number" value="${item.rate||0}" step="0.01" min="0"
          style="padding:7px 10px;font-size:12px;width:88px"
          onclick="this.select()" oninput="updateBookingItem(${i},'rate',this.value)">
      </td>
      <td style="padding:5px 8px">
        <input class="form-input bk-qty-input" id="bk-qty-${i}" type="number" value="${item.qty||0}" min="0"
          style="padding:7px 10px;font-size:12px;width:75px"
          onclick="this.select()" oninput="updateBookingItem(${i},'qty',this.value)">
      </td>
      <td style="padding:5px 8px">
        <select class="form-input" style="padding:5px 8px;font-size:12px;width:90px"
          onchange="updateBookingItemStr(${i},'unit',this.value)">
          ${units.map(u=>`<option value="${u}" ${unit===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </td>
      <td style="padding:5px 8px">
        <div style="display:flex;align-items:center;gap:4px">
          <input class="form-input" type="number" value="${item.cartons||0}" min="0"
            style="padding:7px 10px;font-size:12px;width:65px"
            onclick="this.select()" oninput="updateBookingItem(${i},'cartons',this.value)">
          <span style="font-size:9px;color:var(--text-muted);white-space:nowrap">x${ppc}</span>
        </div>
      </td>
      <td style="padding:5px 8px;text-align:center;font-weight:700;color:var(--cyan);font-size:13px">
        ${totalPcs}<span style="font-size:9px;color:var(--text-muted)"> ${unit==='Carton'?'pcs':unit}</span>
      </td>
      <td style="padding:5px 8px;text-align:center">
        ${taxPct>0
          ? `<span title="Auto tax from product" style="background:rgba(245,158,11,.18);color:var(--yellow);font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;font-family:var(--mono)">${taxPct}%</span>`
          : `<span style="color:var(--text-muted);font-size:10px;font-family:var(--mono)">--</span>`}
      </td>
      <td style="padding:5px 8px;text-align:right;font-weight:700;color:var(--green);font-size:13px;font-family:var(--mono)">Rs.${lineTotal.toFixed(2)}</td>
      <td style="padding:5px 8px;text-align:center">
        <button class="btn btn-ghost btn-xs" onclick="removeBookingItemRow(${i})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (selStart !== null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selEnd); } catch (_) { /* not a text-selectable input, ignore */ }
      }
    }
  }
}

// Product search autocomplete for booking rows
// ── Product search dropdown (Order Booking) ───────────────────────
// A single floating panel shared by every row, positioned with
// getBoundingClientRect and rendered fixed at the very top of the page.
// This sidesteps the table row stacking/overflow issues that made a
// per-row absolutely-positioned dropdown get clipped or buried behind
// the next row.
let _bkProdActiveRow = null;

function _bkProdFloatEl() {
  let el = document.getElementById('bk-prod-float-drop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bk-prod-float-drop';
    el.style.cssText = 'display:none;position:fixed;z-index:99999;'
      + 'background:var(--bg-card);border:1px solid var(--border);border-radius:8px;'
      + 'max-height:260px;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.55)';
    document.body.appendChild(el);
    // Keep it glued to the input while the page scrolls/resizes, and close
    // it if the row it belongs to has since scrolled out of view entirely.
    window.addEventListener('scroll', () => { if (_bkProdActiveRow !== null) _bkProdReposition(); }, true);
    window.addEventListener('resize', () => { if (_bkProdActiveRow !== null) _bkProdReposition(); });
  }
  return el;
}

function _bkProdReposition() {
  const i = _bkProdActiveRow;
  const inp = document.getElementById('bk-prod-input-'+i);
  const drop = document.getElementById('bk-prod-float-drop');
  if (!inp || !drop) return;
  const r = inp.getBoundingClientRect();
  drop.style.left = r.left + 'px';
  drop.style.top = (r.bottom + 4) + 'px';
  drop.style.width = r.width + 'px';
}

function _bkProdRenderRows(list) {
  return list.map(p => {
    const stock = _bkStockByProduct[p.id]||0;
    const oos = stock <= 0;
    const sc = oos?'var(--red)':stock<=(p.reorder_level||10)?'var(--yellow)':'var(--green)';
    return `<div onmousedown="bkProdSelect(${_bkProdActiveRow},${p.id})" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:${oos?'not-allowed':'pointer'};border-bottom:1px solid var(--border);${oos?'opacity:.55':''}" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
      <span style="font-size:18px;flex-shrink:0">📦</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">${p.sku||'—'}${p.barcode?' · '+p.barcode:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:800;color:${sc}">${oos?'—':stock}</div>
        <div style="font-size:9px;color:${oos?'var(--red)':'var(--text-muted)'}">${oos?'out of stock':'in stock'}</div>
      </div>
    </div>`;
  }).join('');
}

function bkProdSearch(i, q) {
  _bkProdActiveRow = i;
  const drop = _bkProdFloatEl();
  const lc = (q||'').toLowerCase().trim();
  if (!lc) { drop.style.display='none'; return; }
  const rank = (p) => {
    const name = (p.name||'').toLowerCase(), sku = (p.sku||'').toLowerCase(), bc = (p.barcode||'').toLowerCase();
    if (name.startsWith(lc) || sku.startsWith(lc)) return 0;   // starts-with → top of the list
    if (name.includes(lc) || sku.includes(lc) || bc.includes(lc)) return 1;
    return -1; // no match
  };
  const results = _bkProductCache
    .map(p => ({ p, r: rank(p) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
    .slice(0, 20)
    .map(x => x.p);
  _bkProdReposition();
  drop.style.display='';
  drop.innerHTML = results.length
    ? _bkProdRenderRows(results)
    : '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);text-align:center"><i class="fa fa-search-minus"></i> No product found</div>';
}

function bkProdSearchFocus(i) {
  const inp = document.getElementById('bk-prod-input-'+i);
  if (!inp || _bookingItems[i].productId) return;
  _bkProdActiveRow = i;
  if (!inp.value.trim()) {
    if (!_bkProductCache.length) return;
    const drop = _bkProdFloatEl();
    _bkProdReposition();
    drop.style.display='';
    drop.innerHTML = _bkProdRenderRows(_bkProductCache.slice(0, 20));
  } else {
    bkProdSearch(i, inp.value);
  }
}

function bkProdSelect(i, productId) {
  const prod = _bkProductCache.find(p=>p.id===productId);
  if (!prod) return;
  const stock = _bkStockByProduct[productId] || 0;
  if (stock <= 0) {
    toast(`${prod.name} is out of stock and can't be added to this order.`, 'error');
    bkProdDropClose();
    return;
  }
  _bookingItems[i].productId = prod.id;
  _bookingItems[i].name      = prod.name;
  _bookingItems[i].rate      = Number(prod.final_price)||0;
  _bookingItems[i].ppc       = 1;
  _bookingItems[i].icon      = '📦';
  _bookingItems[i].taxPct    = 0;
  _bookingItems[i].discount  = 0;
  bkProdDropClose();
  renderBookingItemRows();
  calcBookingTotals();
  // Auto-focus the qty field — no extra click needed
  setTimeout(()=>{
    const qtyEl = document.getElementById('bk-qty-'+i);
    if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
  }, 30);
}

function bkProdClear(i) {
  _bookingItems[i] = { productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1, taxPct:0 };
  renderBookingItemRows();
  calcBookingTotals();
  setTimeout(()=>{ const el=document.getElementById('bk-prod-input-'+i); if(el){el.focus();el.value='';} },30);
}

function bkProdDropClose() {
  const drop = document.getElementById('bk-prod-float-drop');
  if (drop) drop.style.display='none';
  _bkProdActiveRow = null;
}

function updateBookingItemStr(i, field, val) {
  _bookingItems[i][field] = val;
  renderBookingItemRows();
  calcBookingTotals();
}

function onBookingProductChange(i, productId) {
  const prod = DB.products.find(p=>p.id==productId);
  if (prod) {
    _bookingItems[i].productId = prod.id;
    _bookingItems[i].name = prod.name;
    _bookingItems[i].rate = prod.sellPrice||0;
    _bookingItems[i].ppc = prod.piecesPerCarton||1;
    _bookingItems[i].icon = prod.icon||'📦';
    _bookingItems[i].taxPct = prod.tax||0;   // ← auto-load product tax
    _bookingItems[i].discount = prod.discount||0;
  } else {
    _bookingItems[i] = { productId:'', name:'', rate:0, qty:_bookingItems[i].qty||0, cartons:0, ppc:1, taxPct:0 };
  }
  renderBookingItemRows();
  calcBookingTotals();
}

function updateBookingItem(i, field, val) {
  _bookingItems[i][field] = parseFloat(val)||0;
  const item = _bookingItems[i];

  // Defensive re-check: stock can shift between opening the form and typing
  // the quantity (another sale, another booking). Cap to what's actually
  // available rather than letting the order go through with more than we have.
  if (field === 'qty' && item.productId) {
    const stock = _bkStockByProduct[item.productId] || 0;
    if (stock <= 0) {
      item.qty = 0;
      toast('That product is out of stock — quantity can\'t be added.', 'error');
    } else if (item.qty > stock) {
      item.qty = stock;
      toast(`Only ${stock} in stock — quantity capped.`, 'warning');
    }
  }

  // Once a quantity is typed against a picked product on the LAST row,
  // automatically append a fresh empty row so the next product can be
  // entered right away — no need to click "Add Item" every time.
  const isLastRow = i === _bookingItems.length - 1;
  if (field === 'qty' && isLastRow && item.productId && item.qty > 0) {
    _bookingItems.push({ productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1, taxPct:0 });
  }

  renderBookingItemRows();
  calcBookingTotals();
}

function calcBookingTotals() {
  // ── Step 1: Base amount per item (pieces × rate) ──────
  const baseAmount = _bookingItems.reduce((sum, item) => {
    const tp = (item.qty||0) + (item.cartons||0)*(item.ppc||1);
    return sum + tp*(item.rate||0);
  }, 0);

  // ── Step 2: Auto-calculate product-level tax ───────────
  // Each item carries its own taxPct from the product; we compute
  // a weighted average tax amount across all items.
  const autoTaxAmt = _bookingItems.reduce((sum, item) => {
    const prod = _bkProductCache.find(p => p.id == item.productId);
    const taxPct = (prod?.tax_rate) || (item.taxPct) || 0;
    if (!taxPct) return sum;
    const tp = (item.qty||0) + (item.cartons||0)*(item.ppc||1);
    const itemBase = tp*(item.rate||0);
    return sum + itemBase*taxPct/100;
  }, 0);

  // ── Step 3: Discount on (base + tax) ──────────────────
  const discPct  = parseFloat(document.getElementById('bk-discount')?.value)||0;
  const discAmt  = (baseAmount + autoTaxAmt) * discPct / 100;

  // ── Step 4: Final total ───────────────────────────────
  const total    = baseAmount + autoTaxAmt - discAmt;

  const custId   = parseInt(document.getElementById('bk-customer')?.value)||0;
  const cust     = _bkCustomerCache.find(c => c.id === custId);
  const prevBal  = Number(cust?.outstanding_balance)||0;
  const netPayable = total + prevBal;

  // ── Update tax label to show effective rate ────────────
  const taxLabel = document.getElementById('bk-tax-pct-label');
  if (taxLabel) {
    const effectivePct = baseAmount > 0 ? (autoTaxAmt / baseAmount * 100) : 0;
    taxLabel.textContent = effectivePct > 0 ? `(${effectivePct.toFixed(1)}% avg)` : '(no tax on items)';
  }
  // Show/hide auto tax row
  const autoTaxRow = document.getElementById('bk-auto-tax-row');
  if (autoTaxRow) autoTaxRow.style.display = autoTaxAmt > 0 ? '' : 'none';

  const s   = v => 'Rs.' + v.toFixed(2);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('bk-subtotal',      s(baseAmount));
  set('bk-gst-val',       '+' + s(autoTaxAmt));
  set('bk-disc-val',      '-' + s(discAmt));
  set('bk-total',          s(total));
  set('bk-prev-bal-mini',  s(prevBal));
  set('bk-net-payable',    s(netPayable));
}

async function saveBooking(status) {
  const custId = parseInt(document.getElementById('bk-customer').value)||0;
  if (!custId) { toast('Please select a customer!','error'); return; }
  const validItems = _bookingItems.filter(i=>i.productId);
  if (!validItems.length) { toast('Add at least one product!','error'); return; }

  const discPct   = parseFloat(document.getElementById('bk-discount').value)||0;
  const bookDate  = document.getElementById('bk-date').value;
  const payMethod = document.getElementById('bk-payment').value;
  const notes     = document.getElementById('bk-notes').value;

  const subtotal = validItems.reduce((s,i)=>{
    const tp=(i.qty||0)+(i.cartons||0)*(i.ppc||1);
    return s+tp*(i.rate||0);
  },0);
  const discountAmount = subtotal*discPct/100;

  const items = validItems.map(i => {
    const prod = _bkProductCache.find(p=>p.id==i.productId);
    const tp = (i.qty||0)+(i.cartons||0)*(i.ppc||1);
    return { product: i.productId, quantity: tp, unit_price: i.rate, tax_percent: Number(prod?.tax_rate)||0 };
  });

  try {
    const warehouseId = await _ensureDefaultWarehouse();
    const sale = await SalesAPI.create({
      warehouse: warehouseId, customer: custId, items,
      discount_amount: discountAmount, is_credit_sale: payMethod === 'credit',
      notes: `Order Booking${notes ? ' — '+notes : ''} (date: ${bookDate})`,
    });
    if (payMethod !== 'credit') {
      await SalesAPI.pay(sale.id, { amount: sale.total_amount, method: payMethod === 'cash' ? 'cash' : 'other' });
    }
    toast(`Booking saved! Invoice: ${sale.invoice_number}`,'success');
    closeBookingForm();
  } catch (err) {
    toast(err.message || 'Failed to save booking', 'error');
  }
}

async function cancelBooking(id) {
  if (!confirm('Cancel this booking? Stock and customer balance will be restored via a full return.')) return;
  try {
    const sale = await SalesAPI.get(id);
    const items = sale.items
      .filter(i => (i.quantity - i.quantity_returned) > 0)
      .map(i => ({ sale_item: i.id, quantity: i.quantity - i.quantity_returned }));
    if (!items.length) { toast('Nothing left to cancel — already fully returned.', 'warning'); return; }
    await SalesAPI.processReturn(id, { items, reason: 'Booking cancelled' });
    renderBookingList();
    toast('Booking cancelled — stock and balance restored','warning');
  } catch (err) {
    toast(err.message || 'Failed to cancel booking', 'error');
  }
}

async function renderBookingList() {
  const q  = (document.getElementById('bk-search')?.value||'').toLowerCase();
  const nq = (document.getElementById('bk-name-search')?.value||'').toLowerCase().trim();
  const df = document.getElementById('bk-date-filter')?.value||'';

  // Order Bookings are real Sale records under the hood (see saveBooking) —
  // this list shows all sales, since every booking IS a sale.
  const data = await SalesAPI.list({ search: q || nq || undefined, ordering: '-created_at', page_size: 200 });
  let filtered = data.results || data;
  if (df) filtered = filtered.filter(b => (b.created_at||'').slice(0,10) === df);

  const statusMap = { completed:['badge-green','Confirmed'], returned:['badge-red','Cancelled'],
    partially_returned:['badge-yellow','Partial Return'], cancelled:['badge-red','Cancelled'], draft:['badge-yellow','Draft'] };

  document.getElementById('booking-table-body').innerHTML = filtered.length
    ? filtered.map(b=>{
        const [badgeClass, label] = statusMap[b.status] || ['badge-gray', b.status];
        return `
        <tr>
          <td class="td-mono" style="color:var(--cyan)">${b.invoice_number}</td>
          <td style="font-size:12px">${(b.created_at||'').slice(0,10)}</td>
          <td class="fw-700">${b.customer_name||'Walk-in'}</td>
          <td><span class="badge badge-purple" style="font-family:var(--mono);font-size:11px">${b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—'}</span></td>
          <td>${b.items.length} item(s)</td>
          <td class="fw-700 text-green">$${Number(b.total_amount).toFixed(2)}</td>
          <td class="text-red">$${Number(b.due_amount).toFixed(2)}</td>
          <td class="fw-700 text-yellow">$${Number(b.total_amount).toFixed(2)}</td>
          <td><span class="badge badge-blue">${b.payment_status}</span></td>
          <td><span class="badge ${badgeClass}">${label}</span></td>
          <td>
            <div class="flex-gap">
              <button class="btn btn-ghost btn-xs" onclick="viewOrder('${b.invoice_number}')" title="View"><i class="fa fa-eye"></i></button>
              ${!['returned','cancelled'].includes(b.status)?`<button class="btn btn-ghost btn-xs" onclick="cancelBooking(${b.id})" style="color:var(--red)" title="Cancel"><i class="fa fa-ban"></i></button>`:''}
            </div>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted)">
         <i class="fa fa-clipboard" style="font-size:32px;display:block;margin-bottom:10px"></i>No bookings found
       </td></tr>`;
}

// ═══════════════════════════════════════════════════════
// SALE SLIPS MODULE
// ═══════════════════════════════════════════════════════
function clearSaleSlipsFilters() {
  const ssDate = document.getElementById('ss-date');
  if (ssDate) ssDate.value = '';
  const ssStatus = document.getElementById('ss-status');
  if (ssStatus) ssStatus.value = '';
  const ssName = document.getElementById('ss-name');
  if (ssName) ssName.value = '';
  const ssArea = document.getElementById('ss-area');
  if (ssArea) ssArea.value = '';
  renderSaleSlips();
}

let _slipsCache = [];

async function renderSaleSlips() {
  const today = new Date().toISOString().split('T')[0];
  const ssDate = document.getElementById('ss-date');
  if (ssDate && !ssDate.value) ssDate.value = today;
  const dateFilter   = ssDate?.value||'';
  const nameFilter   = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();

  const data = await SalesAPI.list({ page_size: 200, ordering: '-created_at' });
  _slipsCache = data.results || data;

  let _slipsRaw = _slipsCache;
  if (dateFilter) _slipsRaw = _slipsRaw.filter(b => (b.created_at||'').slice(0,10) === dateFilter);
  if (nameFilter) _slipsRaw = _slipsRaw.filter(b => (b.customer_name||'').toLowerCase().includes(nameFilter));
  const slips = _slipsRaw;

  const countEl = document.getElementById('ss-count-label');
  if (countEl) countEl.textContent = `${slips.length} slip${slips.length!==1?'s':''}`;

  const badges = {completed:'badge-green',draft:'badge-yellow',returned:'badge-red',partially_returned:'badge-yellow',cancelled:'badge-red'};
  const labels = {completed:'Confirmed',draft:'Draft',returned:'Cancelled',partially_returned:'Partial Return',cancelled:'Cancelled'};

  const tbody = document.getElementById('saleslips-tbody');
  if (!tbody) return;
  tbody.innerHTML = slips.length
    ? slips.map(b=>`
        <tr>
          <td class="td-mono" style="color:var(--cyan)">${b.invoice_number}</td>
          <td style="font-size:12px">${(b.created_at||'').slice(0,10)}</td>
          <td class="fw-700">${b.customer_name||'Walk-in'}</td>
          <td><span class="badge badge-purple" style="font-family:var(--mono);font-size:11px">${b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—'}</span></td>
          <td>${b.items.length} item(s)</td>
          <td class="fw-700 text-green">$${Number(b.total_amount).toFixed(2)}</td>
          <td class="fw-700 text-yellow">$${Number(b.total_amount).toFixed(2)}</td>
          <td><span class="badge ${badges[b.status]||'badge-gray'}">${labels[b.status]||b.status}</span></td>
          <td>
            <div class="flex-gap">
              <button class="btn btn-ghost btn-xs" onclick="viewSlipDetail(${b.id})" title="View"><i class="fa fa-eye"></i></button>
              <button class="btn btn-accent btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print A4"><i class="fa fa-print"></i></button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
         <i class="fa fa-file-invoice" style="font-size:32px;display:block;margin-bottom:10px"></i>No sale slips for selected date
       </td></tr>`;
}

function viewSlipDetail(id) {
  const b = _slipsCache.find(x=>x.id===id);
  if (!b) return;
  document.getElementById('od-title').textContent = 'Sale Slip — '+b.invoice_number;
  document.getElementById('order-detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">CUSTOMER</div><div style="font-weight:600">${b.customer_name||'Walk-in'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">ACCOUNT NO</div><div style="font-weight:700;color:var(--purple);font-family:var(--mono)">${b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">DATE</div><div style="font-weight:600">${(b.created_at||'').slice(0,10)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">INVOICE</div><div style="font-weight:700;color:var(--cyan);font-family:var(--mono)">${b.invoice_number}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">PAYMENT</div><div style="font-weight:600">${(b.payments[0]?.method)||'—'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">STATUS</div><span class="badge ${b.status==='completed'?'badge-green':'badge-red'}">${b.status}</span></div>
    </div>
    <table>
      <thead><tr><th>Product</th><th>Rate</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>${b.items.map(it=>`<tr>
          <td>📦 ${it.product_name||'—'}</td>
          <td>$${Number(it.unit_price).toFixed(2)}</td>
          <td class="fw-700">${it.quantity}</td>
          <td class="fw-700 text-green">$${Number(it.line_total).toFixed(2)}</td>
        </tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:16px;text-align:right">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Subtotal: $${Number(b.subtotal).toFixed(2)}</div>
      ${Number(b.discount_amount)>0?`<div style="font-size:12px;color:var(--red);margin-bottom:4px">Discount: -$${Number(b.discount_amount).toFixed(2)}</div>`:''}
      ${Number(b.tax_amount)>0?`<div style="font-size:12px;color:var(--yellow);margin-bottom:4px">Tax: +$${Number(b.tax_amount).toFixed(2)}</div>`:''}
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">Bill Total: $${Number(b.total_amount).toFixed(2)}</div>
      <div style="font-size:18px;font-weight:800;color:var(--yellow)">Due: $${Number(b.due_amount).toFixed(2)}</div>
    </div>
    ${b.notes?`<div style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:6px;font-size:12px"><strong>Notes:</strong> ${b.notes}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-accent btn-sm" onclick="printSingleSlipA4(${b.id})"><i class="fa fa-print"></i> Print A4</button>
    </div>`;
  openModal('order-detail-modal');
}

// Adapts a real Sale object (from the backend) into the field shape this
// print template was originally written against, so the template body
// below didn't need a full rewrite.
function _adaptSaleForSlipPrint(sale) {
  return {
    id: sale.id,
    invoice: sale.invoice_number,
    date: (sale.created_at||'').slice(0,10),
    customerName: sale.customer_name || 'Walk-in',
    accountNo: sale.customer ? ('ACC-'+String(sale.customer).padStart(4,'0')) : '—',
    paymentMethod: (sale.payments[0]?.method) || '—',
    createdBy: '',
    items: (sale.items||[]).map(it => ({
      icon: '📦', name: it.product_name, qty: it.quantity, cartons: 0, ppc: 1,
      rate: Number(it.unit_price), taxPct: Number(it.tax_percent),
    })),
    discAmt: Number(sale.discount_amount),
    discountPct: 0,
    prevBal: 0,
    notes: sale.notes || '',
  };
}

// ── BUILD A4 HTML for a single booking ──────────────────
function buildSlipA4Html(rawSale) {
  const b = rawSale.invoice_number ? _adaptSaleForSlipPrint(rawSale) : rawSale;

  const s = (typeof _companySettingsCache !== 'undefined' && _companySettingsCache) || {};
  const storeName = s.company_name || 'SmartRetail Store';
  const storeAddress = s.address || '123 Market Street, City';
  const storePhone = s.phone || '';
  const distName = '';
  const distAddress = '';
  const distPhone = '';
  const ntn = s.tax_id || '';
  const logoDataUrl = s.logo || '';

  const logoBlock = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-width:85px;max-height:70px;object-fit:contain">`
    : `<span style="font-size:40px;line-height:1">🏪</span>`;

  return `<div class="a4-doc" style="page-break-before:always;margin:0;padding:14mm 15mm;box-sizing:border-box">

    <!-- ═══ MAIN HEADER ═══ -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #000;padding-bottom:6mm;margin-bottom:5mm">
      <!-- LEFT: Logo + Store Name + Dist Name + Address -->
      <div style="display:flex;align-items:flex-start;gap:12px;flex:1">
        <div style="width:88px;height:72px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1.5px solid #ddd;border-radius:6px;overflow:hidden;background:#f9f9f9;padding:4px">
          ${logoBlock}
        </div>
        <div style="flex:1">
          <div style="font-size:19px;font-weight:900;color:#000;letter-spacing:-0.3px;line-height:1.1;margin-bottom:2px">${storeName}</div>
          ${distName ? `<div style="font-size:12px;font-weight:700;color:#000;margin-bottom:3px">${distName}</div>` : ''}
          <div style="font-size:10px;color:#333;line-height:1.7">
            ${storeAddress ? `<div>${storeAddress}</div>` : ''}
            ${distAddress  ? `<div>${distAddress}</div>`  : ''}
          </div>
        </div>
      </div>
      <!-- RIGHT: Contact + NTN -->
      <div style="text-align:right;min-width:52mm">
        <div style="font-size:20px;font-weight:900;color:#000;letter-spacing:0.5px;text-transform:uppercase;line-height:1;margin-bottom:5px">ORDER BOOKING</div>
        <div style="font-size:10px;color:#000;line-height:1.9">
          ${storePhone  ? `<div><strong>${storePhone}</strong></div>`  : ''}
          ${distPhone   ? `<div><strong>${distPhone}</strong></div>`   : ''}
        </div>
        ${ntn ? `<div style="display:inline-block;background:#000;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;margin-top:4px;letter-spacing:0.08em">NTN: ${ntn}</div>` : ''}
      </div>
    </div>

    <!-- ═══ BILL TO + INVOICE DETAILS ═══ -->
    <div style="display:flex;gap:0;margin-bottom:5mm;border:1.5px solid #000;border-radius:5px;overflow:hidden">
      <!-- BILL TO -->
      <div style="flex:1.3;padding:4mm 5mm;border-right:1.5px solid #000">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#fff;background:#000;padding:3px 6px;margin:-4mm -5mm 3mm;display:block">BILL TO</div>
        <div style="font-size:14px;font-weight:900;color:#000;margin-bottom:3px">${b.customerName}</div>
        <div style="display:flex;gap:6px;margin-bottom:3px;font-size:11px;color:#000">
          <span style="min-width:82px;font-size:10px;color:#444">Account No:</span>
          <strong style="color:#000;font-family:monospace">${b.accountNo||'—'}</strong>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:3px;font-size:11px;color:#000">
          <span style="min-width:82px;font-size:10px;color:#444">Date:</span>
          <strong style="color:#000">${b.date}</strong>
        </div>
        <div style="display:flex;gap:6px;font-size:11px;color:#000">
          <span style="min-width:82px;font-size:10px;color:#444">Payment:</span>
          <strong style="color:#000">${b.paymentMethod||'—'}</strong>
        </div>
      </div>
      <!-- INVOICE INFO -->
      <div style="min-width:52mm;padding:4mm 5mm">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#fff;background:#000;padding:3px 6px;margin:-4mm -5mm 3mm;display:block;text-align:right">INVOICE DETAILS</div>
        <div style="font-size:17px;font-weight:900;color:#000;letter-spacing:0.5px;margin-bottom:4px;text-align:right">${b.invoice}</div>
        <div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:3px;font-size:11px;color:#000">
          <span style="font-size:10px;color:#444">Cashier:</span>
          <strong style="color:#000">${b.createdBy||currentUser?.full_name||'Admin'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:6px;font-size:11px;color:#000">
          <span style="font-size:10px;color:#444">Items:</span>
          <strong style="color:#000">${b.items.length} line(s)</strong>
        </div>
      </div>
    </div>

    <!-- ═══ ITEMS TABLE ═══ -->
    <div style="font-size:11px;font-weight:800;color:#000;text-transform:uppercase;letter-spacing:0.08em;border-left:4px solid #000;padding-left:6px;margin-bottom:3mm">Purchased Items</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <thead>
        <tr>
          <th style="padding:7px 6px;text-align:left;background:#000;color:#fff;font-size:10px;font-weight:700">#</th>
          <th style="padding:7px 6px;text-align:left;background:#000;color:#fff;font-size:10px;font-weight:700">PRODUCT NAME</th>
          <th style="padding:7px 6px;text-align:center;background:#000;color:#fff;font-size:10px;font-weight:700">PIECES</th>
          <th style="padding:7px 6px;text-align:right;background:#000;color:#fff;font-size:10px;font-weight:700">UNIT PRICE</th>
          <th style="padding:7px 6px;text-align:right;background:#000;color:#fff;font-size:10px;font-weight:700">BASE AMOUNT</th>
          <th style="padding:7px 6px;text-align:center;background:#000;color:#fff;font-size:10px;font-weight:700">TAX%</th>
          <th style="padding:7px 6px;text-align:right;background:#000;color:#fff;font-size:10px;font-weight:700">TAX AMT</th>
          <th style="padding:7px 6px;text-align:right;background:#000;color:#fff;font-size:10px;font-weight:700">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${b.items.map((it,i)=>{
          const tp=(it.qty||0)+(it.cartons||0)*(it.ppc||1);
          const itemTaxPct = it.taxPct || 0;
          const baseAmt = tp*(it.rate||0);
          const taxAmt  = baseAmt * itemTaxPct / 100;
          const totalAmt = baseAmt + taxAmt;
          const bg = i%2===1?'#f4f4f4':'#fff';
          return `<tr>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:11px;font-weight:700;color:#000;background:${bg}">${i+1}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:11px;font-weight:700;color:#000;background:${bg}">${it.icon||''} ${it.name||'—'}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:12px;font-weight:700;color:#000;text-align:center;background:${bg}">${tp}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:11px;font-weight:600;color:#000;text-align:right;background:${bg}">Rs. ${(it.rate||0).toFixed(2)}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:12px;font-weight:700;color:#000;text-align:right;background:${bg}">Rs. ${baseAmt.toFixed(2)}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:11px;text-align:center;background:${bg};color:${itemTaxPct>0?'#8b0000':'#999'}">${itemTaxPct>0?itemTaxPct+'%':'—'}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:12px;font-weight:700;color:${taxAmt>0?'#8b0000':'#999'};text-align:right;background:${bg}">${taxAmt>0?'Rs. '+taxAmt.toFixed(2):'—'}</td>
            <td style="padding:7px 6px;border-bottom:1px solid #ddd;font-size:12px;font-weight:800;color:#000;text-align:right;background:${bg}">Rs. ${totalAmt.toFixed(2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- ═══ TOTALS ═══ -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:5mm">
      <div style="width:90mm;border:1.5px solid #000;border-radius:5px;overflow:hidden;font-size:12px">
        ${(()=>{
          // Recalculate from items for print accuracy
          const subtotalBase = b.items.reduce((s,it)=>{ const tp=(it.qty||0)+(it.cartons||0)*(it.ppc||1); return s+tp*(it.rate||0); },0);
          const totalTaxAmt  = b.items.reduce((s,it)=>{ const tp=(it.qty||0)+(it.cartons||0)*(it.ppc||1); const taxPct=it.taxPct||0; return s+tp*(it.rate||0)*taxPct/100; },0);
          const hasTax       = totalTaxAmt > 0;
          const discAmt      = b.discAmt||0;
          const grandTotal   = subtotalBase + totalTaxAmt - discAmt;
          return `
        <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #ddd;color:#000"><span>Base Amount</span><span style="font-weight:600">Rs. ${subtotalBase.toFixed(2)}</span></div>
        ${hasTax?`<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #ddd;color:#8b0000"><span>Sale Tax/GST</span><span style="font-weight:600">+ Rs. ${totalTaxAmt.toFixed(2)}</span></div>`:''}
        ${discAmt>0?`<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #ddd;color:#16a34a"><span>Bill Discount (${b.discountPct||0}%)</span><span style="font-weight:600">- Rs. ${discAmt.toFixed(2)}</span></div>`:''}
        <div style="display:flex;justify-content:space-between;padding:8px 10px;background:#1a1a1a;color:#fff;font-size:14px;font-weight:900"><span>BILL TOTAL</span><span>Rs. ${grandTotal.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #ddd;color:#000;font-weight:600"><span>Previous Balance</span><span>Rs. ${(b.prevBal||0).toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 10px;background:#f59e0b;color:#000;font-size:16px;font-weight:900"><span>NET PAYABLE</span><span>Rs. ${(grandTotal+(b.prevBal||0)).toFixed(2)}</span></div>`;
        })()}
      </div>
    </div>

    ${b.notes?`<div style="margin-bottom:5mm;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:11px;color:#000"><strong>Notes:</strong> ${b.notes}</div>`:''}

    <!-- ═══ SIGNATURE LINES ═══ -->
    <div style="margin-top:10mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;font-size:11px">
      <div style="border-top:1.5px solid #000;padding-top:5px;text-align:center;color:#000">Prepared By</div>
      <div style="border-top:1.5px solid #000;padding-top:5px;text-align:center;color:#000">Checked By</div>
      <div style="border-top:1.5px solid #000;padding-top:5px;text-align:center;color:#000">Customer Signature</div>
    </div>

    <!-- ═══ FOOTER ═══ -->
    <div class="slip-footer" style="margin-top:6mm;display:flex;justify-content:space-between;font-size:10px;color:#555;border-top:1px solid #ccc;padding-top:4mm">
      <span>SmartRetail ERP — Order Booking System</span>
      <span>${b.invoice} · Printed: ${new Date().toLocaleString()}</span>
    </div>
  </div>`;
}

async function printSingleSlipA4(id) {
  let b = _slipsCache.find(x=>x.id===id);
  if (!b) b = await SalesAPI.get(id);
  if (!b) { toast('Booking not found','error'); return; }
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = buildSlipA4Html(b);
  printArea.style.display = 'block';
  setTimeout(() => {
    window.print();
    setTimeout(() => { printArea.style.display = 'none'; }, 1200);
  }, 250);
}

function printAllSlipsA4(mode) {
  const dateFilter   = document.getElementById('ss-date')?.value||'';
  const nameFilter   = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();

  const slips = _slipsCache.filter(b=>
    b.status!=='returned' && b.status!=='cancelled' &&
    (!dateFilter   || (b.created_at||'').slice(0,10)===dateFilter) &&
    (!nameFilter   || (b.customer_name||'').toLowerCase().includes(nameFilter))
  );

  if (!slips.length) { toast('No slips to print for selected filters','warning'); return; }

  let html='';

  if (mode==='summary') {
    const adapted = slips.map(_adaptSaleForSlipPrint);
    const totalBill = adapted.reduce((s,b)=>s+b.items.reduce((a,it)=>a+it.qty*it.rate,0),0);
    const totalNet  = slips.reduce((s,b)=>s+Number(b.total_amount),0);
    html = `<div class="a4-doc">
      <div class="a4-header">
        <div>
          <div class="a4-logo-name">🏪 SmartRetail Store</div>
          <div style="font-size:11px;color:#555;margin-top:3px">123 Market Street, City</div>
        </div>
        <div class="a4-store-info">
          <strong style="font-size:15px">DAILY ORDER SUMMARY</strong><br>
          Date: <strong>${dateFilter||'All Dates'}</strong><br>
          Printed: ${new Date().toLocaleString()}
        </div>
      </div>
      <div style="font-size:16px;font-weight:800;color:#000;margin-bottom:5mm">
        📋 Order Booking Summary — ${dateFilter||'All Dates'}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
        <thead>
          <tr>
            <th style="padding:7px 9px;text-align:left;background:#1a1a1a;color:#fff;font-size:11px">#</th>
            <th style="padding:7px 9px;text-align:left;background:#1a1a1a;color:#fff;font-size:11px">Invoice</th>
            <th style="padding:7px 9px;text-align:left;background:#1a1a1a;color:#fff;font-size:11px">Customer</th>
            <th style="padding:7px 9px;text-align:left;background:#1a1a1a;color:#fff;font-size:11px">Account</th>
            <th style="padding:7px 9px;text-align:center;background:#1a1a1a;color:#fff;font-size:11px">Items</th>
            <th style="padding:7px 9px;text-align:right;background:#1a1a1a;color:#fff;font-size:11px">Bill Amt</th>
            <th style="padding:7px 9px;text-align:right;background:#1a1a1a;color:#fff;font-size:11px">Prev Bal</th>
            <th style="padding:7px 9px;text-align:right;background:#1a1a1a;color:#fff;font-size:11px">Net Payable</th>
            <th style="padding:7px 9px;text-align:left;background:#1a1a1a;color:#fff;font-size:11px">Payment</th>
          </tr>
        </thead>
        <tbody style="font-size:11px">
          ${slips.map((b,i)=>`<tr style="background:${i%2?'#f9f9f9':'#fff'}">
            <td style="padding:6px 9px">${i+1}</td>
            <td style="padding:6px 9px;font-family:monospace">${b.invoice_number}</td>
            <td style="padding:6px 9px;font-weight:700">${b.customer_name||'Walk-in'}</td>
            <td style="padding:6px 9px;font-family:monospace;color:#5b21b6">${b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—'}</td>
            <td style="padding:6px 9px;text-align:center">${b.items.length}</td>
            <td style="padding:6px 9px;text-align:right">$${Number(b.total_amount).toFixed(2)}</td>
            <td style="padding:6px 9px;text-align:right;color:#dc2626">$${Number(b.due_amount).toFixed(2)}</td>
            <td style="padding:6px 9px;text-align:right;font-weight:700;color:#b45309">$${Number(b.total_amount).toFixed(2)}</td>
            <td style="padding:6px 9px">${(b.payments[0]?.method)||'—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#1a1a1a;color:#fff;font-weight:700;font-size:12px">
            <td colspan="5" style="padding:8px 9px">TOTALS — ${slips.length} order${slips.length!==1?'s':''}</td>
            <td style="padding:8px 9px;text-align:right">$${totalBill.toFixed(2)}</td>
            <td style="padding:8px 9px;text-align:right">—</td>
            <td style="padding:8px 9px;text-align:right">$${totalNet.toFixed(2)}</td>
            <td style="padding:8px 9px"></td>
          </tr>
        </tfoot>
      </table>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:4mm;margin-top:4mm">
        <span>SmartRetail ERP — Daily Order Summary</span>
        <span>Date: ${dateFilter||'All'} | Printed: ${new Date().toLocaleDateString()}</span>
      </div>
    </div>`;
  } else {
    html = slips.map(b=>buildSlipA4Html(b)).join('');
  }

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = html;
  printArea.style.display = 'block';
  // Allow browser to fully render all slip HTML before triggering print dialog
  setTimeout(() => {
    window.print();
    setTimeout(() => { printArea.style.display = 'none'; }, 1500);
  }, 350);
  toast(`Preparing ${slips.length} slip${slips.length!==1?'s':''}... Print dialog will open shortly.`, 'success');
}

// ── Sample booking data for demo ─────────────────────────
(function seedBookings(){
  const today = new Date().toISOString().split('T')[0];
  if (!DB.orderBookings.length) {
    DB.orderBookings.push({
      id: 1001, invoice:'BK-00001', date:today,
      customerId:1, customerName:'Ahmed Hassan', accountNo:'ACC-0001',
      items:[
        {productId:1,name:'Coca-Cola 330ml',icon:'🥤',rate:1.25,qty:12,cartons:1,ppc:24},
        {productId:2,name:'Lays Classic Chips',icon:'🍟',rate:2.00,qty:0,cartons:1,ppc:20},
      ],
      subtotal:57, discAmt:0, taxAmt:0, total:57, prevBal:500,
      netPayable:557, discountPct:0, taxPct:0,
      paymentMethod:'credit', notes:'Regular weekly order',
      status:'saved', createdAt: new Date().toLocaleString(),
    });
    DB.orderBookings.push({
      id: 1002, invoice:'BK-00002', date:today,
      customerId:3, customerName:'Muhammad Ali', accountNo:'ACC-0003',
      items:[
        {productId:5,name:'Dove Soap 100g',icon:'🧼',rate:1.50,qty:6,cartons:0,ppc:36},
        {productId:9,name:'Shampoo 400ml',icon:'🧴',rate:5.99,qty:0,cartons:1,ppc:12},
      ],
      subtotal:80.88, discAmt:0, taxAmt:0, total:80.88, prevBal:1200,
      netPayable:1280.88, discountPct:0, taxPct:0,
      paymentMethod:'credit', notes:'',
      status:'draft', createdAt: new Date().toLocaleString(),
    });
    bookingCounter = 3;
  }
})();

// ═══════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═══════════════════════════════════════════════════════
let _companySettingsCache = null;

async function renderSettings() {
  const s = await SettingsAPI.getCompany();
  _companySettingsCache = s;
  const setVal = (id, val) => { const el=document.getElementById(id); if(el) el.value = val||''; };
  setVal('set-storename', s.company_name);
  setVal('set-address', s.address);
  setVal('set-phone', s.phone);
  setVal('set-email', s.email);
  setVal('set-taxrate', s.default_tax_percent);
  setVal('set-receipt-footer', s.invoice_footer_note);
  setVal('set-ntn', s.tax_id||'');
  // Note: low-stock threshold, receipt header text, and distributor info are
  // frontend-only display fields — the backend's CompanySettings model has
  // no equivalent columns for these yet, so they aren't persisted.
  const cur = document.getElementById('set-currency');
  if (cur) { Array.from(cur.options).forEach(o=>{ o.selected = o.value===s.default_currency||o.text===s.default_currency; }); }
  // Logo preview
  if (s.logo) {
    const prev = document.getElementById('set-logo-preview');
    if (prev) prev.innerHTML = `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain">`;
  }
  if (typeof updatePreview === 'function') updatePreview();
}

async function saveSettings() {
  const g = id => document.getElementById(id)?.value||'';
  const payload = {
    company_name: g('set-storename'),
    address: g('set-address'),
    phone: g('set-phone'),
    email: g('set-email'),
    default_tax_percent: parseFloat(g('set-taxrate'))||0,
    default_currency: g('set-currency'),
    invoice_footer_note: g('set-receipt-footer'),
    tax_id: g('set-ntn'),
  };
  try {
    _companySettingsCache = await SettingsAPI.updateCompany(payload);
    if (typeof updatePreview === 'function') updatePreview();
    toast('Settings saved successfully!', 'success');
  } catch (err) {
    toast(err.message || 'Failed to save settings', 'error');
  }
}

async function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { toast('Logo too large. Max 500KB.', 'error'); return; }
  try {
    const updated = await SettingsAPI.updateCompanyLogo(file);
    _companySettingsCache = updated;
    const prev = document.getElementById('set-logo-preview');
    if (prev) prev.innerHTML = `<img src="${updated.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`;
    if (typeof updatePreview === 'function') updatePreview();
    toast('Logo uploaded!', 'success');
  } catch (err) {
    toast(err.message || 'Failed to upload logo', 'error');
  }
}

function updatePreview() {
  const g = id => document.getElementById(id)?.value||'';
  const el = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  const name = g('set-storename')||DB.sysSettings.storeName;
  const logoArea = document.getElementById('prev-logo-area');
  if (logoArea) {
    if (DB.sysSettings.logoDataUrl) {
      logoArea.innerHTML = `<img src="${DB.sysSettings.logoDataUrl}" style="height:40px;object-fit:contain"><div style="font-size:14px;font-weight:800">${name}</div>`;
    } else {
      logoArea.textContent = '🏪 ' + name;
    }
  }
  el('prev-address', g('set-address')||DB.sysSettings.address);
  el('prev-phone', g('set-phone')||DB.sysSettings.phone);
  el('prev-header', g('set-receipt-header')||DB.sysSettings.receiptHeader);
  const distName = g('set-dist-name')||DB.sysSettings.distributorName;
  const distPhone = g('set-dist-phone')||DB.sysSettings.distributorContact;
  const ntn = g('set-ntn')||DB.sysSettings.ntn||'';
  el('prev-dist-name', distName);
  el('prev-dist-phone', distPhone);
  el('prev-ntn', ntn ? 'NTN: '+ntn : '');
}

// Get store header HTML for invoices
function getInvoiceHeaderHtml(docTitle, refNo, refDate) {
  const real = _companySettingsCache;
  const s = real ? {
    storeName: real.company_name, address: real.address, phone: real.phone, email: real.email,
    logoDataUrl: real.logo, distributorName: '', distributorContact: '',
  } : DB.sysSettings;
  const logoHtml = s.logoDataUrl
    ? `<img src="${s.logoDataUrl}" style="height:50px;object-fit:contain;margin-bottom:4px">`
    : `<span style="font-size:24px">🏪</span>`;
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8mm;margin-bottom:6mm">
    <div>
      ${logoHtml}
      <div style="font-size:18px;font-weight:800;color:#000">${s.storeName}</div>
      <div style="font-size:11px;color:#555">${s.address}</div>
      <div style="font-size:11px;color:#555">Tel: ${s.phone} | ${s.email}</div>
      ${s.distributorName?`<div style="font-size:11px;color:#333;margin-top:3px;font-weight:600">Distribution: ${s.distributorName}</div>`:''}
      ${s.distributorContact?`<div style="font-size:10px;color:#555">${s.distributorContact}</div>`:''}
    </div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:800;color:#000">${docTitle}</div>
      <div style="font-size:12px;margin-top:4px">No: <strong>${refNo}</strong></div>
      <div style="font-size:11px;color:#555">Date: ${refDate}</div>
      ${s.ntn?`<div style="font-size:10px;color:#555;margin-top:3px">NTN: ${s.ntn}</div>`:''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════
// LEDGER ACCOUNTS
// ═══════════════════════════════════════════════════════
let _ledgerAccountCache = [];

async function renderLedger() {
  await filterLedgerAccounts();
  await renderAllAccountsSummary();
}

async function filterLedgerAccounts() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const q = (document.getElementById('ldg-search')?.value||'').toLowerCase();
  const sel = document.getElementById('ldg-account-select');
  if (!sel) return;
  const data = type==='customer' ? await CustomersAPI.list({ page_size: 500 }) : await SuppliersAPI.list({ page_size: 500 });
  _ledgerAccountCache = data.results || data;
  const filtered = _ledgerAccountCache.filter(x=>x.name.toLowerCase().includes(q));
  sel.innerHTML = '<option value="">— Select Account —</option>' +
    filtered.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
}

async function loadLedgerAccount() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const id = parseInt(document.getElementById('ldg-account-select')?.value)||0;
  if (!id) {
    document.getElementById('ldg-account-summary').style.display='none';
    document.getElementById('ldg-table-card').style.display='none';
    document.getElementById('ldg-all-accounts').style.display='';
    return;
  }
  const entity = _ledgerAccountCache.find(x=>x.id===id);
  if (!entity) return;

  const ledger = type==='customer' ? await CustomersAPI.ledger(id) : await SuppliersAPI.ledger(id);
  let entries = ledger.entries;

  const from = document.getElementById('ldg-from')?.value||'';
  const to   = document.getElementById('ldg-to')?.value||'';
  if (from) entries = entries.filter(e=>e.date.slice(0,10)>=from);
  if (to)   entries = entries.filter(e=>e.date.slice(0,10)<=to);

  const totalDebit = entries.reduce((s,e)=>s+Number(e.debit),0);
  const totalCredit = entries.reduce((s,e)=>s+Number(e.credit),0);

  document.getElementById('ldg-account-summary').style.display='';
  document.getElementById('ldg-table-card').style.display='';
  document.getElementById('ldg-all-accounts').style.display='none';
  document.getElementById('ldg-acc-name').textContent = entity.name;
  document.getElementById('ldg-acc-no').textContent = type==='customer'?'Customer':'Supplier';
  document.getElementById('ldg-total-debit').textContent  = '$'+totalDebit.toFixed(2);
  document.getElementById('ldg-total-credit').textContent = '$'+totalCredit.toFixed(2);
  const net = totalDebit - totalCredit;
  document.getElementById('ldg-net-balance').textContent = '$'+Math.abs(net).toFixed(2);
  document.getElementById('ldg-net-balance').className = 'stat-value '+(net>0?'text-red':'text-green');
  document.getElementById('ldg-table-title').textContent = `Ledger: ${entity.name}`;

  document.getElementById('ldg-tbody').innerHTML = entries.length
    ? entries.map(r=>`
        <tr>
          <td style="font-size:12px">${r.date.slice(0,10)}</td>
          <td>${r.description}</td>
          <td class="td-mono" style="font-size:11px">${r.reference||'—'}</td>
          <td class="text-red fw-700">${Number(r.debit)>0?'$'+Number(r.debit).toFixed(2):'—'}</td>
          <td class="text-green fw-700">${Number(r.credit)>0?'$'+Number(r.credit).toFixed(2):'—'}</td>
          <td class="fw-700 ${Number(r.balance)>0?'text-red':'text-green'}">$${Math.abs(Number(r.balance)).toFixed(2)} ${Number(r.balance)>0?'Dr':'Cr'}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No transactions found</td></tr>`;
}

async function renderAllAccountsSummary() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const items = _ledgerAccountCache.length ? _ledgerAccountCache
    : (type==='customer' ? (await CustomersAPI.list({page_size:500})).results : (await SuppliersAPI.list({page_size:500})).results);
  document.getElementById('ldg-all-title').textContent = type==='customer' ? 'All Customer Accounts' : 'All Supplier Accounts';
  document.getElementById('ldg-all-tbody').innerHTML = items.map(x=>{
    const balance = type==='customer' ? Number(x.outstanding_balance) : Number(x.outstanding_payable);
    return `<tr>
      <td><span class="badge badge-purple" style="font-family:var(--mono)">ACC-${String(x.id).padStart(4,'0')}</span></td>
      <td class="fw-700">${x.name}</td>
      <td>${x.phone||'—'}</td>
      <td class="text-red fw-700">$${balance>0?balance.toFixed(2):'0.00'}</td>
      <td class="text-green fw-700">—</td>
      <td class="fw-700 ${balance>0?'text-red':'text-green'}">$${Math.abs(balance).toFixed(2)} ${balance>0?'Dr':'Cr'}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('ldg-account-select').value=${x.id};loadLedgerAccount()"><i class="fa fa-eye"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// Manual ledger entries aren't supported — the ledger is 100% computed from
// real Sale/Payment/PurchaseOrder records (see apps.customers/suppliers
// services.py on the backend), so there's nothing to "add" here directly.
function openLedgerEntryModal() {
  toast('Ledger entries are generated automatically from real sales, payments, and purchases — there\'s nothing to add manually.', 'warning');
}
function openLedgerEntryModalFor(id) { openLedgerEntryModal(); }
function saveLedgerEntry() { openLedgerEntryModal(); }

async function printLedgerA4() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const id = parseInt(document.getElementById('ldg-account-select')?.value)||0;
  if (!id) { toast('Please select an account first','warning'); return; }
  const entity = _ledgerAccountCache.find(x=>x.id===id);
  if (!entity) return;
  const ledger = type==='customer' ? await CustomersAPI.ledger(id) : await SuppliersAPI.ledger(id);
  let totalD=0, totalC=0;
  const rows = ledger.entries.map(e=>{
    totalD+=Number(e.debit); totalC+=Number(e.credit);
    const bal = Number(e.balance);
    return `<tr>
      <td>${e.date.slice(0,10)}</td><td>${e.description}</td><td style="font-family:monospace">${e.reference||'—'}</td>
      <td style="text-align:right;color:#dc2626">${Number(e.debit)>0?'$'+Number(e.debit).toFixed(2):'—'}</td>
      <td style="text-align:right;color:#16a34a">${Number(e.credit)>0?'$'+Number(e.credit).toFixed(2):'—'}</td>
      <td style="text-align:right;font-weight:700;color:${bal>0?'#dc2626':'#16a34a'}">$${Math.abs(bal).toFixed(2)} ${bal>0?'Dr':'Cr'}</td>
    </tr>`;
  }).join('');
  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('ACCOUNT STATEMENT', entity.accountNo||String(id), new Date().toLocaleDateString())}
    <div style="margin-bottom:5mm;font-size:12px">
      <strong>Account:</strong> ${entity.name} &nbsp;|&nbsp;
      <strong>Type:</strong> ${type==='customer'?'Customer':'Supplier'} &nbsp;|&nbsp;
      <strong>Phone:</strong> ${entity.phone||'—'}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <thead><tr>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:left">Date</th>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:left">Description</th>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:left">Reference</th>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:right">Debit</th>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:right">Credit</th>
        <th style="padding:7px 8px;background:#1a1a1a;color:#fff;font-size:11px;text-align:right">Balance</th>
      </tr></thead>
      <tbody style="font-size:11px">${rows}</tbody>
      <tfoot>
        <tr style="background:#f3f4f6;font-weight:700;font-size:12px">
          <td colspan="3" style="padding:7px 8px">TOTALS</td>
          <td style="padding:7px 8px;text-align:right;color:#dc2626">$${totalD.toFixed(2)}</td>
          <td style="padding:7px 8px;text-align:right;color:#16a34a">$${totalC.toFixed(2)}</td>
          <td style="padding:7px 8px;text-align:right;color:${(totalD-totalC)>0?'#dc2626':'#16a34a'}">$${Math.abs(totalD-totalC).toFixed(2)} ${(totalD-totalC)>0?'Dr':'Cr'}</td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:11px">
      <div style="border-top:1px solid #000;padding-top:5px;text-align:center;color:#555">Authorized Signature</div>
      <div style="border-top:1px solid #000;padding-top:5px;text-align:center;color:#555">Customer Signature</div>
    </div>
    <div style="margin-top:6mm;display:flex;justify-content:space-between;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:3mm">
      <span>SmartRetail ERP — Account Statement</span>
      <span>Printed: ${new Date().toLocaleString()}</span>
    </div>
  </div>`;
  const pa = document.getElementById('print-area');
  pa.innerHTML = html; pa.style.display='block';
  window.print();
  setTimeout(()=>{ pa.style.display='none'; },1200);
}

// ═══════════════════════════════════════════════════════
// BALANCE SHEET
// ═══════════════════════════════════════════════════════
async function renderBalanceSheet() {
  const [pl, cf, custData, supData] = await Promise.all([
    FinanceAPI.profitLoss(), FinanceAPI.cashFlow(),
    CustomersAPI.list({ page_size: 500 }), SuppliersAPI.list({ page_size: 500 }),
  ]);
  const salesIncome = Number(pl.income);
  const totalExpenses = Number(pl.expenses);
  const purchaseCost = Number(pl.cost_of_goods_sold);
  const grossProfit = Number(pl.gross_profit);
  const netProfit = Number(pl.net_profit);

  const custReceivables = (custData.results||custData)
    .filter(c=>Number(c.outstanding_balance)>0)
    .map(c=>({ name:c.name, acc:'ACC-'+String(c.id).padStart(4,'0'), bal:Number(c.outstanding_balance) }));
  const totalReceivable = custReceivables.reduce((s,x)=>s+x.bal,0);

  const supPayables = (supData.results||supData)
    .filter(s=>Number(s.outstanding_payable)>0)
    .map(s=>({ name:s.name, bal:Number(s.outstanding_payable) }));
  const totalPayable = supPayables.reduce((s,x)=>s+x.bal,0);

  const fmt = v=>'$'+v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('bs-kpi-grid').innerHTML = [
    { label:'Total Revenue', val:fmt(salesIncome), color:'green', icon:'fa-arrow-up' },
    { label:'Total Expenses', val:fmt(totalExpenses+purchaseCost), color:'red', icon:'fa-arrow-down' },
    { label:'Gross Profit', val:fmt(grossProfit), color:'cyan', icon:'fa-chart-line' },
    { label:'Net Profit / Loss', val:fmt(netProfit), color: netProfit>=0?'green':'red', icon:'fa-balance-scale' },
  ].map(k=>`
    <div class="stat-card ${k.color}">
      <div class="stat-header"><div class="stat-icon ${k.color}"><i class="fa ${k.icon}"></i></div></div>
      <div class="stat-value">${k.val}</div>
      <div class="stat-label">${k.label}</div>
    </div>`).join('');

  document.getElementById('bs-income-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="flex-between" style="padding:10px;background:var(--bg-secondary);border-radius:8px">
        <span style="font-size:13px">Sales Revenue</span>
        <span class="fw-700 text-green">$${salesIncome.toFixed(2)}</span>
      </div>
      <div class="flex-between" style="padding:10px;background:var(--green-glow);border:1px solid rgba(16,185,129,.2);border-radius:8px">
        <span style="font-size:14px;font-weight:700">Total Revenue</span>
        <span style="font-size:16px;font-weight:800;color:var(--green)">$${salesIncome.toFixed(2)}</span>
      </div>
    </div>`;

  document.getElementById('bs-expense-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="flex-between" style="padding:9px 12px;background:var(--bg-secondary);border-radius:8px">
        <span style="font-size:13px">Operating Expenses</span>
        <span class="fw-700 text-red">$${totalExpenses.toFixed(2)}</span>
      </div>
      <div class="flex-between" style="padding:9px 12px;background:var(--bg-secondary);border-radius:8px">
        <span style="font-size:13px">Cost of Goods Sold</span>
        <span class="fw-700 text-red">$${purchaseCost.toFixed(2)}</span>
      </div>
      <div class="flex-between" style="padding:10px;background:var(--red-glow);border:1px solid rgba(239,68,68,.2);border-radius:8px">
        <span style="font-size:14px;font-weight:700">Total Expenses</span>
        <span style="font-size:16px;font-weight:800;color:var(--red)">$${(totalExpenses+purchaseCost).toFixed(2)}</span>
      </div>
    </div>`;

  document.getElementById('bs-receivables').innerHTML = `<table>
    <thead><tr><th>Customer</th><th>Account</th><th>Balance Due</th></tr></thead>
    <tbody>
      ${custReceivables.map(x=>`<tr><td class="fw-700">${x.name}</td><td class="td-mono">${x.acc}</td><td class="fw-700 text-red">$${x.bal.toFixed(2)}</td></tr>`).join('')}
      <tr style="background:var(--bg-secondary)"><td colspan="2" class="fw-700">Total Receivable</td><td class="fw-700 text-red" style="font-size:14px">$${totalReceivable.toFixed(2)}</td></tr>
    </tbody></table>`;

  document.getElementById('bs-payables').innerHTML = `<table>
    <thead><tr><th>Supplier</th><th>Balance Owed</th></tr></thead>
    <tbody>
      ${supPayables.map(x=>`<tr><td class="fw-700">${x.name}</td><td class="fw-700 text-yellow">$${x.bal.toFixed(2)}</td></tr>`).join('')}
      <tr style="background:var(--bg-secondary)"><td class="fw-700">Total Payable</td><td class="fw-700 text-yellow" style="font-size:14px">$${totalPayable.toFixed(2)}</td></tr>
    </tbody></table>`;

  const cashBalance = Number(cf.net_cash_flow);
  document.getElementById('bs-pnl-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Profit & Loss</div>
        ${[
          ['Sales Revenue', salesIncome, 'text-green'],
          ['Cost of Goods', -purchaseCost, 'text-red'],
          ['Gross Profit', grossProfit, grossProfit>=0?'text-green':'text-red'],
          ['Operating Expenses', -totalExpenses, 'text-red'],
          ['Net Profit / Loss', netProfit, netProfit>=0?'text-green':'text-red'],
        ].map(([l,v,c])=>`
          <div class="flex-between" style="padding:10px 14px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px">
            <span style="font-size:13px">${l}</span>
            <span class="fw-700 ${c}" style="font-size:14px">$${Math.abs(v).toFixed(2)}</span>
          </div>`).join('')}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Cash Position (Real)</div>
        ${[
          ['Cash In', Number(cf.cash_in), 'text-green'],
          ['Receivable (Credit)', totalReceivable, 'text-accent'],
          ['Payable (Owed)', -totalPayable, 'text-yellow'],
          ['Cash Out', -Number(cf.cash_out), 'text-red'],
          ['Net Cash Flow', cashBalance, cashBalance>=0?'text-green':'text-red'],
        ].map(([l,v,c])=>`
          <div class="flex-between" style="padding:10px 14px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px">
            <span style="font-size:13px">${l}</span>
            <span class="fw-700 ${c}" style="font-size:14px">$${Math.abs(v).toFixed(2)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

async function printBalanceSheetA4() {
  const [pl, custData, supData, expData] = await Promise.all([
    FinanceAPI.profitLoss(), CustomersAPI.list({ page_size: 500 }),
    SuppliersAPI.list({ page_size: 500 }), ExpensesAPI.summary(),
  ]);
  const salesIncome = Number(pl.income);
  const totalExpenses = Number(pl.expenses);
  const purchaseCost = Number(pl.cost_of_goods_sold);
  const netProfit = Number(pl.net_profit);
  const today = new Date().toLocaleDateString();

  const custReceivables = (custData.results||custData)
    .filter(c=>Number(c.outstanding_balance)>0)
    .map(c=>({ name:c.name, acc:'ACC-'+String(c.id).padStart(4,'0'), bal:Number(c.outstanding_balance) }));
  const supPayables = (supData.results||supData)
    .filter(s=>Number(s.outstanding_payable)>0)
    .map(s=>({ name:s.name, bal:Number(s.outstanding_payable) }));

  const expByCategory = {};
  (expData.by_category||[]).forEach(e=>{ expByCategory[e.category__name||'Other'] = Number(e.total); });

  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('BALANCE SHEET', 'BS-'+Date.now().toString().slice(-6), today)}
    <div style="font-size:16px;font-weight:800;color:#000;margin-bottom:5mm">Financial Position — ${today}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-bottom:6mm">
      <div>
        <div style="font-weight:700;font-size:12px;color:#777;text-transform:uppercase;margin-bottom:3mm;border-bottom:1px solid #ddd;padding-bottom:2mm">INCOME</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr><td style="padding:4px 0">Total Sales Revenue</td><td style="text-align:right;font-weight:700;color:#16a34a">$${salesIncome.toFixed(2)}</td></tr>
        </table>
        <div style="font-weight:700;font-size:12px;color:#777;text-transform:uppercase;margin:4mm 0 3mm;border-bottom:1px solid #ddd;padding-bottom:2mm">EXPENSES</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          ${Object.entries(expByCategory).map(([k,v])=>`<tr><td style="padding:3px 0">${k}</td><td style="text-align:right;color:#dc2626">$${v.toFixed(2)}</td></tr>`).join('')}
          <tr><td style="padding:3px 0">Purchase/COGS</td><td style="text-align:right;color:#dc2626">$${purchaseCost.toFixed(2)}</td></tr>
          <tr style="font-weight:700;border-top:1px solid #000"><td style="padding:5px 0">Total Expenses</td><td style="text-align:right;color:#dc2626">$${(totalExpenses+purchaseCost).toFixed(2)}</td></tr>
        </table>
        <div style="margin-top:4mm;padding:6px 10px;background:${netProfit>=0?'#f0fdf4':'#fef2f2'};border-radius:5px;display:flex;justify-content:space-between;font-weight:800;font-size:13px">
          <span>Net ${netProfit>=0?'Profit':'Loss'}</span>
          <span style="color:${netProfit>=0?'#16a34a':'#dc2626'}">$${Math.abs(netProfit).toFixed(2)}</span>
        </div>
      </div>
      <div>
        <div style="font-weight:700;font-size:12px;color:#777;text-transform:uppercase;margin-bottom:3mm;border-bottom:1px solid #ddd;padding-bottom:2mm">CUSTOMER RECEIVABLES</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr><th style="text-align:left;padding:3px 0;color:#555">Customer</th><th style="text-align:right;padding:3px 0;color:#555">Balance</th></tr></thead>
          <tbody>${custReceivables.map(x=>`<tr><td style="padding:3px 0">${x.name}</td><td style="text-align:right;color:#dc2626">$${x.bal.toFixed(2)}</td></tr>`).join('')}</tbody>
          <tr style="font-weight:700;border-top:1px solid #000"><td>Total</td><td style="text-align:right;color:#dc2626">$${custReceivables.reduce((s,x)=>s+x.bal,0).toFixed(2)}</td></tr>
        </table>
        <div style="font-weight:700;font-size:12px;color:#777;text-transform:uppercase;margin:4mm 0 3mm;border-bottom:1px solid #ddd;padding-bottom:2mm">SUPPLIER PAYABLES</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr><th style="text-align:left;padding:3px 0;color:#555">Supplier</th><th style="text-align:right;padding:3px 0;color:#555">Owed</th></tr></thead>
          <tbody>${supPayables.map(x=>`<tr><td style="padding:3px 0">${x.name}</td><td style="text-align:right;color:#b45309">$${x.bal.toFixed(2)}</td></tr>`).join('')}</tbody>
          <tr style="font-weight:700;border-top:1px solid #000"><td>Total</td><td style="text-align:right;color:#b45309">$${supPayables.reduce((s,x)=>s+x.bal,0).toFixed(2)}</td></tr>
        </table>
      </div>
    </div>
    <div style="margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:11px">
      <div style="border-top:1px solid #000;padding-top:5px;text-align:center;color:#555">Prepared By</div>
      <div style="border-top:1px solid #000;padding-top:5px;text-align:center;color:#555">Authorized By</div>
    </div>
    <div style="margin-top:6mm;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:3mm">
      SmartRetail ERP — Balance Sheet | Printed: ${new Date().toLocaleString()}
    </div>
  </div>`;
  const pa = document.getElementById('print-area');
  pa.innerHTML = html; pa.style.display='block';
  window.print();
  setTimeout(()=>{ pa.style.display='none'; },1200);
}

// ═══════════════════════════════════════════════════════
// STOCK REPORT
// ═══════════════════════════════════════════════════════
// ── STOCK REPORT MODE ────────────────────────────────────
let _srMode = 'all';

function setSRMode(mode) {
  _srMode = mode;
  const allView    = document.getElementById('sr-all-view');
  const singleView = document.getElementById('sr-single-view');
  const allFilters = document.getElementById('sr-all-filters');
  const singleFilters = document.getElementById('sr-single-filters');
  const btnAll    = document.getElementById('sr-mode-all');
  const btnSingle = document.getElementById('sr-mode-single');

  if (mode === 'all') {
    allView.style.display = '';
    singleView.style.display = 'none';
    allFilters.style.display = 'flex';
    singleFilters.style.display = 'none';
    btnAll.className = 'btn btn-accent btn-sm';
    btnSingle.className = 'btn btn-ghost btn-sm';
    renderStockReport();
  } else {
    allView.style.display = 'none';
    singleView.style.display = '';
    allFilters.style.display = 'none';
    singleFilters.style.display = 'flex';
    btnAll.className = 'btn btn-ghost btn-sm';
    btnSingle.className = 'btn btn-accent btn-sm';
    populateSRProductDropdown();
  }
}

async function populateSRProductDropdown() {
  const sel = document.getElementById('sr-product-select');
  if (!sel) return;
  if (!_invProductCache.length) await _loadInventoryData();
  const q = (document.getElementById('sr-product-search')?.value || '').toLowerCase();
  const filtered = _invProductCache.filter(p =>
    !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q)
  );
  sel.innerHTML = '<option value="">— Choose a product —</option>' +
    filtered.map(p => `<option value="${p.id}">📦 ${p.name} (${p.sku})</option>`).join('');
}

function filterSRProducts() {
  populateSRProductDropdown();
  // auto-select if only one result
  const sel = document.getElementById('sr-product-select');
  if (sel && sel.options.length === 2) {
    sel.selectedIndex = 1;
    renderSingleProductReport();
  }
}

async function renderSingleProductReport() {
  const sel = document.getElementById('sr-product-select');
  const prodId = parseInt(sel?.value);
  const placeholder = document.getElementById('sr-single-placeholder');
  const content = document.getElementById('sr-single-content');

  if (!prodId) {
    placeholder.style.display = '';
    content.style.display = 'none';
    return;
  }

  if (!_invProductCache.length) await _loadInventoryData();
  const p = _invProductCache.find(x => x.id === prodId);
  if (!p) return;

  placeholder.style.display = 'none';
  content.style.display = '';

  const remaining = (_invStockByProduct[prodId]||{}).quantity || 0;
  const minStock = p.reorder_level || 10;
  const value   = remaining * Number(p.final_price||p.selling_price||0);
  const statusColor = remaining === 0 ? 'var(--red)' : remaining <= minStock ? 'var(--yellow)' : 'var(--green)';

  document.getElementById('sr-prod-icon').textContent  = '📦';
  document.getElementById('sr-prod-name').textContent  = p.name;
  document.getElementById('sr-prod-sku').textContent   = p.sku;
  document.getElementById('sr-prod-brand').textContent = p.brand_name || '—';
  document.getElementById('sr-prod-cat').textContent   = p.category_name || '—';
  document.getElementById('sr-prod-ppc').textContent   = 'N/A';

  const stockEl = document.getElementById('sr-prod-stock');
  stockEl.textContent = remaining + ' pcs';
  stockEl.style.color = statusColor;
  document.getElementById('sr-prod-cartons').textContent = '—';
  document.getElementById('sr-prod-loose').textContent   = remaining + ' pcs';
  document.getElementById('sr-prod-value').textContent   = 'Rs. ' + value.toFixed(0);

  // Real sales history: fetch all sales, filter items by this product
  const salesData = await SalesAPI.list({ page_size: 500 });
  const salesRows = [];
  (salesData.results || salesData).filter(s => s.status !== 'cancelled').forEach(s => {
    (s.items||[]).filter(it => it.product === prodId).forEach(it => {
      salesRows.push({
        date: (s.created_at||'').slice(0,10), invoice: s.invoice_number, customer: s.customer_name||'Walk-in',
        qty: it.quantity, ctns: 0, lpcs: it.quantity, rate: Number(it.unit_price), amt: Number(it.line_total),
      });
    });
  });
  salesRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalSold = salesRows.reduce((s, r) => s + r.qty, 0);
  const totalRev  = salesRows.reduce((s, r) => s + r.amt, 0);

  document.getElementById('sr-prod-history-label').textContent = salesRows.length + ' transaction(s) found';
  document.getElementById('sr-prod-history-tbody').innerHTML = salesRows.length
    ? salesRows.map((r) => `<tr>
        <td>${r.date || '—'}</td>
        <td class="td-mono">${r.invoice || '—'}</td>
        <td style="font-weight:600">${r.customer}</td>
        <td class="fw-700 text-accent">${r.qty} pcs</td>
        <td>—</td>
        <td>—</td>
        <td>Rs. ${(r.rate || 0).toFixed(2)}</td>
        <td class="fw-700 text-green">Rs. ${r.amt.toFixed(2)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No sales records found for this product</td></tr>';

  document.getElementById('sr-prod-stats').innerHTML = [
    { label: 'Total Sold (All Time)', val: totalSold + ' pcs', color: 'blue',   icon: 'fa-shopping-cart' },
    { label: 'Total Revenue',          val: 'Rs. ' + totalRev.toFixed(0),  color: 'green',  icon: 'fa-rupee-sign' },
    { label: 'Buy Price',              val: 'Rs. ' + Number(p.cost_price||0).toFixed(2), color: 'yellow', icon: 'fa-tag' },
    { label: 'Sell Price',             val: 'Rs. ' + Number(p.selling_price||0).toFixed(2), color: 'purple', icon: 'fa-dollar-sign' },
  ].map(k => `
    <div class="stat-card ${k.color}">
      <div class="stat-header"><div class="stat-icon ${k.color}"><i class="fa ${k.icon}"></i></div></div>
      <div class="stat-value" style="font-size:20px">${k.val}</div>
      <div class="stat-label">${k.label}</div>
    </div>`).join('');

  // Real stock movement log (inventory ledger, filtered to this product)
  const txnData = await InventoryAPI.transactions({ product: prodId, page_size: 50 });
  const movements = (txnData.results || txnData);
  const positiveTypes = ['stock_in','adjustment_increase','transfer_in','purchase','sale_return'];
  document.getElementById('sr-prod-movement-tbody').innerHTML = movements.length
    ? movements.map(h => {
        const signedQty = positiveTypes.includes(h.transaction_type) ? h.quantity : -h.quantity;
        const typeLabel = h.transaction_type.replace(/_/g,' ');
        const typeColor = signedQty < 0 ? 'var(--red)' : 'var(--green)';
        return `<tr>
          <td style="font-size:11px">${(h.created_at||'').slice(0,10)}</td>
          <td><span class="badge ${signedQty<0?'badge-red':'badge-green'}">${typeLabel}</span></td>
          <td style="font-weight:700;color:${typeColor}">${signedQty > 0 ? '+' : ''}${signedQty}</td>
          <td>${h.balance_after - signedQty}</td>
          <td style="font-weight:700">${h.balance_after}</td>
          <td class="td-mono" style="font-size:11px">${h.reference || '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No movement records found</td></tr>';
}

async function renderStockReport() {
  const today = new Date().toISOString().split('T')[0];
  const srDate = document.getElementById('sr-date');
  if (srDate && !srDate.value) srDate.value = today;
  const reportDate = srDate?.value || today;
  const catFilter   = document.getElementById('sr-cat')?.value || '';
  const stockFilter = document.getElementById('sr-stockfilter')?.value || '';

  if (_srMode === 'single') { renderSingleProductReport(); return; }

  await _loadInventoryData(); // reuses the Inventory page's product+stock cache

  const catSel = document.getElementById('sr-cat');
  if (catSel && catSel.options.length <= 1) {
    const catData = await CategoriesAPI.list();
    (catData.results || catData).forEach(c => {
      const o = document.createElement('option');
      o.value = c.name; o.text = c.name;
      catSel.appendChild(o);
    });
  }
  document.getElementById('sr-date-label').textContent = 'Report Date: ' + reportDate;

  // Sold-today from real sales on that date
  const soldMap = {};
  const salesData = await SalesAPI.list({ page_size: 500 });
  (salesData.results || salesData)
    .filter(s => (s.created_at||'').slice(0,10) === reportDate && s.status !== 'cancelled')
    .forEach(s => (s.items||[]).forEach(it => { soldMap[it.product] = (soldMap[it.product]||0) + it.quantity; }));

  let prods = _invProductCache.map(p => {
    const st = _invStockByProduct[p.id] || { quantity: 0 };
    return { ...p, stock: st.quantity };
  });
  if (catFilter)              prods = prods.filter(p => p.category_name === catFilter);
  if (stockFilter === 'low')  prods = prods.filter(p => p.stock > 0 && p.stock <= (p.reorder_level||10));
  if (stockFilter === 'out')  prods = prods.filter(p => p.stock === 0);
  if (stockFilter === 'ok')   prods = prods.filter(p => p.stock > (p.reorder_level||10));

  const totalProds = prods.length;
  const inStock    = prods.filter(p => p.stock > (p.reorder_level||10)).length;
  const lowStock   = prods.filter(p => p.stock > 0 && p.stock <= (p.reorder_level||10)).length;
  const outStock   = prods.filter(p => p.stock === 0).length;

  document.getElementById('sr-stats-grid').innerHTML = [
    { label: 'Total Products', val: totalProds, color: 'blue',   icon: 'fa-boxes' },
    { label: 'In Stock',       val: inStock,    color: 'green',  icon: 'fa-check-circle' },
    { label: 'Low Stock',      val: lowStock,   color: 'yellow', icon: 'fa-exclamation-circle' },
    { label: 'Out of Stock',   val: outStock,   color: 'red',    icon: 'fa-times-circle' },
  ].map(k => `
    <div class="stat-card ${k.color}">
      <div class="stat-header"><div class="stat-icon ${k.color}"><i class="fa ${k.icon}"></i></div></div>
      <div class="stat-value">${k.val}</div>
      <div class="stat-label">${k.label}</div>
    </div>`).join('');

  document.getElementById('sr-tbody').innerHTML = prods.map(p => {
    const minStock = p.reorder_level || 10;
    const soldToday    = soldMap[p.id] || 0;
    const openingStock = p.stock + soldToday;
    const remaining    = p.stock;
    const val = remaining * Number(p.final_price||p.selling_price||0);
    const statusColor = remaining === 0 ? 'red' : remaining <= minStock ? 'yellow' : 'green';
    const statusText  = remaining === 0 ? 'Out of Stock' : remaining <= minStock ? 'Low Stock' : 'In Stock';
    return `<tr>
      <td>
        <div class="flex-gap">
          <span style="font-size:18px">📦</span>
          <div>
            <div style="font-weight:600">${p.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${p.brand_name || ''}</div>
          </div>
        </div>
      </td>
      <td class="td-mono">${p.sku}</td>
      <td><span class="badge badge-blue">${p.category_name}</span></td>
      <td>${openingStock}</td>
      <td class="text-red fw-700">${soldToday > 0 ? soldToday : '—'}</td>
      <td class="fw-700" style="color:${remaining===0?'var(--red)':remaining<=minStock?'var(--yellow)':'var(--green)'}">${remaining}</td>
      <td>—</td>
      <td>${remaining}</td>
      <td class="text-accent">Rs. ${val.toFixed(2)}</td>
      <td><span class="badge badge-${statusColor}">${statusText}</span></td>
    </tr>`;
  }).join('');
}

function printStockReportA4() {
  const today = new Date().toISOString().split('T')[0];
  const reportDate = document.getElementById('sr-date')?.value || today;

  if (_srMode === 'single') {
    // Print single product report
    const sel = document.getElementById('sr-product-select');
    const prodId = parseInt(sel?.value);
    if (!prodId) { toast('Please select a product first', 'warning'); return; }
    printSingleProductA4(prodId, reportDate);
    return;
  }

  // Print ALL products report — reuses the cache renderStockReport() just loaded
  const soldMap = {};
  const prods = _invProductCache.map(p => ({ ...p, stock: (_invStockByProduct[p.id]||{}).quantity || 0 }));
  const totalValue = prods.reduce((s, p) => s + Number(p.final_price||p.selling_price||0) * p.stock, 0);
  const rows = prods.map((p, i) => {
    const minStock = p.reorder_level || 10;
    const sold = soldMap[p.id] || 0;
    const opening = p.stock + sold;
    const val = p.stock * Number(p.final_price||p.selling_price||0);
    const st  = p.stock === 0 ? 'Out' : p.stock <= minStock ? 'Low' : 'OK';
    return `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
      <td style="padding:6px 8px">${i+1}</td>
      <td style="padding:6px 8px">📦 <strong>${p.name}</strong></td>
      <td style="padding:6px 8px;font-family:monospace">${p.sku}</td>
      <td style="padding:6px 8px">${p.category_name}</td>
      <td style="padding:6px 8px;text-align:center">${opening}</td>
      <td style="padding:6px 8px;text-align:center;color:#dc2626;font-weight:700">${sold > 0 ? sold : '—'}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:800;color:${p.stock===0?'#dc2626':p.stock<=minStock?'#b45309':'#16a34a'}">${p.stock}</td>
      <td style="padding:6px 8px;text-align:center">—</td>
      <td style="padding:6px 8px;text-align:center">${p.stock}</td>
      <td style="padding:6px 8px;text-align:right">Rs. ${val.toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;color:${p.stock===0?'#dc2626':p.stock<=minStock?'#b45309':'#16a34a'}">${st}</td>
    </tr>`;
  }).join('');

  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('STOCK REPORT', 'SR-'+reportDate, reportDate)}
    <div style="padding:5mm 0 3mm"><strong>Overall Stock Report — ${reportDate}</strong> &nbsp;·&nbsp; ${prods.length} products &nbsp;·&nbsp; Total Value: Rs. ${totalValue.toFixed(2)}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm;font-size:10px">
      <thead>
        <tr>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff">#</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:left">Product</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff">SKU</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff">Category</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Opening</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Sold</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Remaining</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Cartons</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Loose</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:right">Value</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#1a1a1a;color:#fff;font-weight:700;font-size:11px">
          <td colspan="9" style="padding:7px 8px">TOTALS — ${prods.length} products</td>
          <td style="padding:7px 8px;text-align:right">Rs. ${totalValue.toFixed(2)}</td>
          <td style="padding:7px 8px"></td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:6mm;display:flex;justify-content:space-between;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:3mm">
      <span>SmartRetail ERP — Overall Stock Report</span>
      <span>Date: ${reportDate} | Total Value: Rs. ${totalValue.toFixed(2)}</span>
      <span>Printed: ${new Date().toLocaleString()}</span>
    </div>
  </div>`;
  const pa = document.getElementById('print-area');
  pa.innerHTML = html; pa.style.display = 'block';
  window.print();
  setTimeout(() => { pa.style.display = 'none'; }, 1200);
}

async function printSingleProductA4(prodId, reportDate) {
  if (!_invProductCache.length) await _loadInventoryData();
  const p = _invProductCache.find(x => x.id === prodId);
  if (!p) return;
  const remaining = (_invStockByProduct[prodId]||{}).quantity || 0;
  const minStock = p.reorder_level || 10;
  const value     = remaining * Number(p.final_price||p.selling_price||0);
  const statusText = remaining === 0 ? 'OUT OF STOCK' : remaining <= minStock ? 'LOW STOCK' : 'IN STOCK';
  const statusColor = remaining === 0 ? '#dc2626' : remaining <= minStock ? '#b45309' : '#16a34a';

  // Gather real sales for this product
  const salesData = await SalesAPI.list({ page_size: 500 });
  const salesRows = [];
  (salesData.results || salesData).filter(s => s.status !== 'cancelled').forEach(s => {
    (s.items||[]).filter(it => it.product === prodId).forEach(it => {
      salesRows.push({
        date: (s.created_at||'').slice(0,10), invoice: s.invoice_number, customer: s.customer_name||'Walk-in',
        qty: it.quantity, ctns: 0, lpcs: it.quantity, rate: Number(it.unit_price), amt: Number(it.line_total),
      });
    });
  });
  salesRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalSold = salesRows.reduce((s, r) => s + r.qty, 0);
  const totalRev  = salesRows.reduce((s, r) => s + r.amt, 0);

  // Real movement log
  const txnData = await InventoryAPI.transactions({ product: prodId, page_size: 50 });
  const positiveTypes = ['stock_in','adjustment_increase','transfer_in','purchase','sale_return'];
  const movements = (txnData.results || txnData).map(h => {
    const signedQty = positiveTypes.includes(h.transaction_type) ? h.quantity : -h.quantity;
    return { date: (h.created_at||'').slice(0,10), type: h.transaction_type.replace(/_/g,' '),
      qty: signedQty, before: h.balance_after - signedQty, after: h.balance_after, ref: h.reference };
  });
  const ppc = 1, cartons = 0, loose = remaining;

  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('STOCK REPORT', 'SR-PROD-'+reportDate, reportDate)}
    <div style="padding:4mm 0 3mm">
      <strong style="font-size:14px">Per Product Report — 📦 ${p.name}</strong>
      <span style="margin-left:10px;font-family:monospace;font-size:11px;color:#555">${p.sku}</span>
      <span style="margin-left:10px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${statusColor};color:#fff">${statusText}</span>
    </div>

    <!-- Product summary box -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:5mm">
      ${[
        { label:'Current Stock', val: remaining+' pcs', color:'#16a34a' },
        { label:'Cartons',       val: ppc>1?cartons:'—', color:'#0284c7' },
        { label:'Loose Pcs',     val: ppc>1?loose+' pcs':remaining+' pcs', color:'#b45309' },
        { label:'Stock Value',   val:'Rs. '+value.toFixed(2), color:'#7c3aed' },
      ].map(k=>`<div style="border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:900;color:${k.color}">${k.val}</div>
        <div style="font-size:10px;color:#777;margin-top:2px">${k.label}</div>
      </div>`).join('')}
    </div>

    <!-- Product info -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:5mm;font-size:11px">
      <div style="border:1px solid #ddd;border-radius:5px;padding:10px">
        <div style="font-weight:700;font-size:10px;color:#777;margin-bottom:5px;text-transform:uppercase">Product Details</div>
        <div>Brand: <strong>${p.brand_name||'—'}</strong></div>
        <div>Category: <strong>${p.category_name||'—'}</strong></div>
        <div>Pcs/Carton: <strong>N/A</strong></div>
        <div>Min Stock: <strong>${minStock} pcs</strong></div>
      </div>
      <div style="border:1px solid #ddd;border-radius:5px;padding:10px">
        <div style="font-weight:700;font-size:10px;color:#777;margin-bottom:5px;text-transform:uppercase">Pricing & Sales</div>
        <div>Buy Price: <strong>Rs. ${Number(p.cost_price||0).toFixed(2)}</strong></div>
        <div>Sell Price: <strong>Rs. ${Number(p.selling_price||0).toFixed(2)}</strong></div>
        <div>Total Sold: <strong style="color:#dc2626">${totalSold} pcs</strong></div>
        <div>Total Revenue: <strong style="color:#16a34a">Rs. ${totalRev.toFixed(2)}</strong></div>
      </div>
    </div>

    <!-- Sales History -->
    <div style="font-weight:800;font-size:12px;margin-bottom:3mm;color:#000">Sales History (${salesRows.length} transactions)</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm;font-size:10px">
      <thead>
        <tr>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:left">Date</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:left">Invoice</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:left">Customer</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Qty</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Cartons</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Loose</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:right">Rate</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${salesRows.length ? salesRows.map((r,i)=>`<tr style="background:${i%2?'#f9f9f9':'#fff'}">
          <td style="padding:5px 7px">${r.date||'—'}</td>
          <td style="padding:5px 7px;font-family:monospace">${r.invoice||'—'}</td>
          <td style="padding:5px 7px;font-weight:600">${r.customer}</td>
          <td style="padding:5px 7px;text-align:center;font-weight:700">${r.qty} pcs</td>
          <td style="padding:5px 7px;text-align:center">${r.ctns>0?r.ctns+' ctn':'—'}</td>
          <td style="padding:5px 7px;text-align:center">${r.lpcs>0?r.lpcs+' pcs':'—'}</td>
          <td style="padding:5px 7px;text-align:right">Rs. ${(r.rate||0).toFixed(2)}</td>
          <td style="padding:5px 7px;text-align:right;font-weight:700">Rs. ${r.amt.toFixed(2)}</td>
        </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:16px;color:#999">No sales records found</td></tr>'}
      </tbody>
      ${salesRows.length?`<tfoot><tr style="background:#1a1a1a;color:#fff;font-weight:700;font-size:11px">
        <td colspan="3" style="padding:6px 7px">TOTAL</td>
        <td style="padding:6px 7px;text-align:center">${totalSold} pcs</td>
        <td colspan="2"></td>
        <td style="padding:6px 7px;text-align:right">—</td>
        <td style="padding:6px 7px;text-align:right">Rs. ${totalRev.toFixed(2)}</td>
      </tr></tfoot>`:''}
    </table>

    <!-- Stock Movement -->
    <div style="font-weight:800;font-size:12px;margin-bottom:3mm;color:#000">Stock Movement Log (${movements.length} entries)</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead>
        <tr>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:left">Date/Time</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff">Type</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Qty Change</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">Before</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff;text-align:center">After</th>
          <th style="padding:6px 7px;background:#1a1a1a;color:#fff">Reference</th>
        </tr>
      </thead>
      <tbody>
        ${movements.length ? movements.map((h,i)=>`<tr style="background:${i%2?'#f9f9f9':'#fff'}">
          <td style="padding:5px 7px;font-size:9px">${h.date||'—'}</td>
          <td style="padding:5px 7px;font-weight:700;color:${h.type==='Sale'?'#dc2626':h.type==='Purchase'?'#16a34a':'#b45309'}">${h.type||'—'}</td>
          <td style="padding:5px 7px;text-align:center;font-weight:700;color:${(h.qty||0)<0?'#dc2626':'#16a34a'}">${(h.qty||0)>0?'+':''}${h.qty||0}</td>
          <td style="padding:5px 7px;text-align:center">${h.before??'—'}</td>
          <td style="padding:5px 7px;text-align:center;font-weight:700">${h.after??'—'}</td>
          <td style="padding:5px 7px;font-family:monospace;font-size:9px">${h.ref||'—'}</td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:16px;color:#999">No movement records found</td></tr>'}
      </tbody>
    </table>

    <div style="margin-top:6mm;display:flex;justify-content:space-between;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:3mm">
      <span>SmartRetail ERP — Per Product Stock Report</span>
      <span>${p.name} | ${p.sku} | ${reportDate}</span>
      <span>Printed: ${new Date().toLocaleString()}</span>
    </div>
  </div>`;
  const pa = document.getElementById('print-area');
  pa.innerHTML = html; pa.style.display = 'block';
  window.print();
  setTimeout(() => { pa.style.display = 'none'; }, 1200);
}

// ═══════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (!currentUser) return;
  if (e.ctrlKey && e.key === 'p') { e.preventDefault(); navigate('pos'); }
  if (e.ctrlKey && e.key === 'd') { e.preventDefault(); navigate('dashboard'); }
  if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); document.getElementById('notif-panel').classList.add('hidden'); }
});

// Set default dates for forms
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const fromEl = document.getElementById('rpt-from');
  const toEl = document.getElementById('rpt-to');
  if (fromEl) fromEl.value = '2025-01-01';
  if (toEl) toEl.value = today;
  if (document.getElementById('exp-date')) document.getElementById('exp-date').value = today;
  // Set default tax from system settings
  const bkTax = document.getElementById('bk-tax');
  if (bkTax) bkTax.value = DB.sysSettings.taxRate||0;
});
// ── HELPER: print A4 content
function printA4(contentId) {
  const el = document.getElementById(contentId);
  if (!el) { toast('Nothing to print','error'); return; }
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = el.innerHTML;
  printArea.style.display = 'block';
  window.print();
  setTimeout(() => { printArea.style.display = 'none'; }, 1000);
}

// ── A4 INVOICE PRINT (override receipt print button)
function printA4Invoice(order) {
  const storeSettings = {
    name: document.querySelector('[value="SmartRetail Store"]')?.value || 'SmartRetail Store',
    address: document.querySelector('[value="123 Market Street, City"]')?.value || '123 Market Street, City',
    phone: document.querySelector('[value="+1 555-000-1234"]')?.value || '+1 555-000-1234',
    taxRate: 8
  };
  const cashReceived = parseFloat(document.getElementById('cash-received')?.value) || order.total;
  const change = Math.max(0, cashReceived - order.total);

  const html = `<div class="a4-doc">
    <div class="a4-header">
      <div>
        <div class="a4-logo-name">🏪 ${storeSettings.name}</div>
        <div style="font-size:11px;color:#555;margin-top:4px">${storeSettings.address}</div>
        <div style="font-size:11px;color:#555">Tel: ${storeSettings.phone}</div>
      </div>
      <div class="a4-store-info">
        <strong style="font-size:14px">INVOICE</strong><br>
        #${order.invoice}<br>
        ${order.date}<br>
        Cashier: ${currentUser?.full_name || 'Admin'}
      </div>
    </div>
    <div class="a4-doc-title">Sales Invoice</div>
    <div class="a4-meta">
      <div class="a4-meta-row"><span class="a4-meta-label">Customer:</span><span class="a4-meta-val">${(document.getElementById('bill-customer-name')?.value?.trim()) || order.customer}</span></div>
      ${(document.getElementById('bill-customer-contact')?.value?.trim()) ? `<div class="a4-meta-row"><span class="a4-meta-label">Contact:</span><span class="a4-meta-val">${document.getElementById('bill-customer-contact').value.trim()}</span></div>` : ''}
      <div class="a4-meta-row"><span class="a4-meta-label">Invoice No:</span><span class="a4-meta-val">${order.invoice}</span></div>
      <div class="a4-meta-row"><span class="a4-meta-label">Date:</span><span class="a4-meta-val">${order.date}</span></div>
      <div class="a4-meta-row"><span class="a4-meta-label">Payment:</span><span class="a4-meta-val">${order.paymentMethod?.toUpperCase()}</span></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Unit Price</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>
        ${order.items.map((it,i)=>`<tr><td>${i+1}</td><td>${it.name}</td><td>$${it.price.toFixed(2)}</td><td>${it.qty}</td><td><strong>$${(it.price*it.qty).toFixed(2)}</strong></td></tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end">
      <div class="a4-totals">
        <div class="a4-total-row"><span>Subtotal</span><span>$${(order.subtotal||order.total).toFixed(2)}</span></div>
        ${(order.discountAmt||0)>0?`<div class="a4-total-row" style="color:#dc2626"><span>Discount</span><span>-$${order.discountAmt.toFixed(2)}</span></div>`:''}
        <div class="a4-total-row" style="color:#b45309"><span>Tax</span><span>+$${(order.taxAmt||0).toFixed(2)}</span></div>
        <div class="a4-grand-row"><span>TOTAL</span><span>$${order.total.toFixed(2)}</span></div>
        ${order.paymentMethod==='cash'?`<div class="a4-total-row" style="color:#555"><span>Cash Received</span><span>$${cashReceived.toFixed(2)}</span></div><div class="a4-total-row" style="color:#16a34a"><span>Change</span><span>$${change.toFixed(2)}</span></div>`:''}
      </div>
    </div>
    <div class="a4-footer">
      <span>Thank you for your business!</span>
      <span>All sales are final • Visit us again!</span>
      <span>${order.invoice}</span>
    </div>
  </div>`;

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = html;
  printArea.style.display = 'block';
  window.print();
  setTimeout(() => { printArea.style.display = 'none'; }, 1000);
}

// ── WAREHOUSE ORDER SUMMARY ──────────────────────────────
function openOrderSummary() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.substring(0,8)+'01';
  document.getElementById('ws-from').value = firstOfMonth;
  document.getElementById('ws-to').value = today;
  document.getElementById('warehouse-summary-result').innerHTML = '';
  openModal('order-summary-modal');
  generateWarehouseSummary();
}

function generateWarehouseSummary() {
  const from = document.getElementById('ws-from').value;
  const to = document.getElementById('ws-to').value;

  // Aggregate all items sold in the date range
  const allOrders = [...DB.orders, ...[
    { invoice:'INV-0040', date:'2025-01-17 09:15', customer:'Ahmed Hassan', items:[{id:1,name:'Coca-Cola 330ml',qty:6,price:1.25},{id:2,name:'Lays Chips',qty:10,price:2.00}], total:27.50, status:'Completed' },
    { invoice:'INV-0039', date:'2025-01-16 08:50', customer:'Walk-in', items:[{id:3,name:'Whole Milk 1L',qty:4,price:1.80},{id:5,name:'Dove Soap 100g',qty:12,price:1.50}], total:25.20, status:'Completed' },
    { invoice:'INV-0038', date:'2025-01-15 14:00', customer:'Muhammad Ali', items:[{id:1,name:'Coca-Cola 330ml',qty:24,price:1.25},{id:9,name:'Shampoo 400ml',qty:3,price:5.99}], total:47.97, status:'Completed' },
  ]];

  const filtered = allOrders.filter(o => {
    if (o.status !== 'Completed') return false;
    const oDate = (o.date||'').split(' ')[0].split(',')[0];
    return (!from || oDate >= from) && (!to || oDate <= to);
  });

  // Aggregate by product
  const productMap = {};
  filtered.forEach(order => {
    (order.items||[]).forEach(item => {
      const prod = DB.products.find(p => p.id === item.id || p.name === item.name);
      const key = item.name;
      if (!productMap[key]) {
        productMap[key] = {
          name: item.name,
          totalQty: 0,
          piecesPerCarton: prod?.piecesPerCarton || 1,
          icon: prod?.icon || '📦',
          category: prod?.category || '—',
          currentStock: prod?.stock ?? '—',
        };
      }
      productMap[key].totalQty += item.qty;
    });
  });

  const rows = Object.values(productMap);
  if (!rows.length) {
    document.getElementById('warehouse-summary-result').innerHTML =
      `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa fa-box-open" style="font-size:40px;margin-bottom:12px"></i><div>No completed orders in this date range</div></div>`;
    return;
  }

  const totalOrders = filtered.length;
  const totalItems = rows.reduce((a,r) => a+r.totalQty, 0);

  // Build print-ready HTML
  const printHtml = `<div class="a4-doc" id="order-summary-print" style="color:#000;background:#fff">
    <div class="a4-header">
      <div>
        <div class="a4-logo-name">🏪 SmartRetail Store</div>
        <div style="font-size:11px;color:#555;margin-top:3px">123 Market Street, City</div>
      </div>
      <div class="a4-store-info">
        <strong style="font-size:14px">WAREHOUSE DISPATCH</strong><br>
        Period: ${from} to ${to}<br>
        Generated: ${new Date().toLocaleString()}
      </div>
    </div>
    <div class="a4-doc-title">📦 Order Dispatch Summary</div>
    <div class="a4-meta" style="margin-bottom:5mm">
      <div class="a4-meta-row"><span class="a4-meta-label">Total Orders:</span><span class="a4-meta-val">${totalOrders}</span></div>
      <div class="a4-meta-row"><span class="a4-meta-label">Total Items:</span><span class="a4-meta-val">${totalItems} pcs</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Product</th>
          <th>Category</th>
          <th>Total Qty (pcs)</th>
          <th>Cartons Out</th>
          <th>Loose Pieces</th>
          <th>Remaining Stock</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i) => {
          const ppc = r.piecesPerCarton > 1 ? r.piecesPerCarton : 1;
          const cartons = Math.floor(r.totalQty / ppc);
          const loose = r.totalQty % ppc;
          return `<tr>
            <td>${i+1}</td>
            <td><strong>${r.icon} ${r.name}</strong></td>
            <td>${r.category}</td>
            <td><strong>${r.totalQty}</strong></td>
            <td class="carton-cell">${ppc>1?`<span class="ctn">${cartons} ctn</span>`:'—'}</td>
            <td class="carton-cell">${ppc>1?`<span class="loose">${loose} pcs</span>`:`<span class="ctn">${r.totalQty}</span>`}</td>
            <td style="color:${r.currentStock==='—'?'#555':r.currentStock<=5?'#dc2626':'#16a34a'}"><strong>${r.currentStock}</strong> pcs</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="a4-footer">
      <span>SmartRetail ERP — Warehouse Dispatch Report</span>
      <span>Period: ${from} → ${to}</span>
      <span>Printed: ${new Date().toLocaleDateString()}</span>
    </div>
  </div>`;

  // Show in dark-mode table for screen
  document.getElementById('warehouse-summary-result').innerHTML = `
    <div style="margin-bottom:12px;display:flex;gap:12px">
      <div class="stat-card blue" style="flex:1;padding:14px">
        <div class="stat-value" style="font-size:22px">${totalOrders}</div>
        <div class="stat-label">Orders in Period</div>
      </div>
      <div class="stat-card green" style="flex:1;padding:14px">
        <div class="stat-value" style="font-size:22px">${totalItems}</div>
        <div class="stat-label">Total Pieces Out</div>
      </div>
      <div class="stat-card purple" style="flex:1;padding:14px">
        <div class="stat-value" style="font-size:22px">${rows.length}</div>
        <div class="stat-label">Products Dispatched</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Category</th><th>Total Qty</th><th>📦 Cartons Out</th><th>Loose Pieces</th><th>Current Stock</th></tr></thead>
        <tbody>
          ${rows.map((r,i) => {
            const ppc = r.piecesPerCarton > 1 ? r.piecesPerCarton : 1;
            const cartons = Math.floor(r.totalQty / ppc);
            const loose = r.totalQty % ppc;
            return `<tr>
              <td>${i+1}</td>
              <td><div class="flex-gap"><span style="font-size:18px">${r.icon}</span><strong>${r.name}</strong></div></td>
              <td><span class="badge badge-blue">${r.category}</span></td>
              <td class="fw-700">${r.totalQty} pcs</td>
              <td>${ppc>1?`<span class="badge badge-cyan">📦 ${cartons} Carton${cartons!==1?'s':''}</span>`:'—'}</td>
              <td>${ppc>1?`<span class="badge badge-yellow">${loose} pcs loose</span>`:`<span class="badge badge-blue">${r.totalQty} pcs</span>`}</td>
              <td class="${r.currentStock<=5?'text-red':r.currentStock==='—'?'':'text-green'} fw-700">${r.currentStock} pcs</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:none" id="order-summary-print">${printHtml}</div>`;
}

// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// SUPPLY ROUTES MODULE
// ═══════════════════════════════════════════════════════
DB.routes = DB.routes || [
  { id:1, name:'North Zone A', area:'Model Town, Johar Town', person:'Saleem Khan', days:['Monday','Wednesday','Friday'], suppliers:[1,2], status:'Active', notes:'Morning slot preferred' },
  { id:2, name:'South Zone B', area:'DHA, Cantt', person:'Tariq Mehmood', days:['Tuesday','Thursday'], suppliers:[3,4], status:'Active', notes:'' },
  { id:3, name:'East Zone C', area:'Gulberg, Garden Town', person:'Asif Raza', days:['Monday','Saturday'], suppliers:[2,5], status:'Active', notes:'' },
];
let _routeWeekOffset = 0;
const DAYS_OF_WEEK = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const ROUTE_PALETTE = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#f97316','#ec4899'];

function getWeekDates(offset) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return DAYS_OF_WEEK.map((d, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
}

let _routeCache = [];

async function renderSupplyRoutes() {
  const data = await RoutesAPI.list({ page_size: 500 });
  _routeCache = data.results || data;
  // Stats
  const routes = _routeCache;
  const todayName = DAYS_OF_WEEK[(new Date().getDay() + 6) % 7]; // Mon=0
  const uniqueReps = [...new Set(routes.map(r => r.person).filter(Boolean))];
  document.getElementById('sr-stat-total').textContent  = routes.length;
  document.getElementById('sr-stat-active').textContent = routes.filter(r => r.status === 'Active').length;
  document.getElementById('sr-stat-today').textContent  = routes.filter(r => r.days.includes(todayName) && r.status === 'Active').length;
  document.getElementById('sr-stat-reps').textContent   = uniqueReps.length;

  renderCalendarGrid();
  renderRouteCards();
}

function renderCalendarGrid() {
  const dates  = getWeekDates(_routeWeekOffset);
  const routes = _routeCache.filter(r => r.status !== 'Inactive' || true);
  const start  = dates[0], end = dates[6];

  document.getElementById('sr-week-label').textContent =
    start.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' – ' +
    end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

  // Build HTML
  const dayColW = 'calc((100% - 140px) / 7)';
  let html = `<div style="display:flex;border-bottom:1px solid var(--border)">
    <div style="width:140px;flex-shrink:0;padding:12px 16px;background:var(--bg-secondary);font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center">Route</div>`;

  dates.forEach((dt, i) => {
    const isToday = dt.toDateString() === new Date().toDateString();
    html += `<div style="flex:1;padding:10px 6px;text-align:center;background:${isToday?'var(--accent-glow)':'var(--bg-secondary)'};border-left:1px solid var(--border)${isToday?';border-top:2px solid var(--accent)':''}">
      <div style="font-size:10px;font-weight:700;color:${isToday?'var(--accent)':'var(--text-muted)'};text-transform:uppercase;letter-spacing:.05em">${DAYS_OF_WEEK[i].slice(0,3)}</div>
      <div style="font-size:18px;font-weight:800;color:${isToday?'var(--accent)':'var(--text-primary)'};line-height:1.2">${dt.getDate()}</div>
      <div style="font-size:10px;color:var(--text-muted)">${dt.toLocaleDateString('en-GB',{month:'short'})}</div>
    </div>`;
  });
  html += '</div>';

  if (!routes.length) {
    html += `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
      <i class="fa fa-route" style="font-size:32px;display:block;margin-bottom:10px"></i>No routes yet. Click "New Route" to add one.
    </div>`;
  } else {
    routes.forEach((r, ri) => {
      const color = ROUTE_PALETTE[ri % ROUTE_PALETTE.length];
      html += `<div style="display:flex;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
        <div style="width:140px;flex-shrink:0;padding:10px 16px;display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-primary);line-height:1.2">${r.name}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${r.person||'—'}</div>
          </div>
        </div>`;
      DAYS_OF_WEEK.forEach((day, di) => {
        const active = r.days.includes(day);
        const isToday = dates[di].toDateString() === new Date().toDateString();
        html += `<div style="flex:1;padding:8px 4px;display:flex;align-items:center;justify-content:center;border-left:1px solid var(--border);background:${isToday&&active?'rgba(59,130,246,.06)':''}">
          ${active
            ? `<div style="background:${color}22;border:1px solid ${color}55;border-radius:6px;padding:4px 8px;text-align:center;width:90%">
                <i class="fa fa-check" style="color:${color};font-size:10px;display:block;margin-bottom:1px"></i>
                <span style="font-size:9px;font-weight:700;color:${color}">Visit</span>
               </div>`
            : `<div style="width:20px;height:2px;background:var(--border);border-radius:2px;margin:0 auto"></div>`
          }
        </div>`;
      });
      html += '</div>';
    });
  }

  document.getElementById('sr-calendar-grid').innerHTML = html;
}

function shiftRouteWeek(dir) {
  if (dir === 0) { _routeWeekOffset = 0; }
  else { _routeWeekOffset += dir; }
  renderCalendarGrid();
  // Update week label
  const dates = getWeekDates(_routeWeekOffset);
  document.getElementById('sr-week-label').textContent =
    dates[0].toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' – ' +
    dates[6].toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}

function renderRouteCards() {
  const q   = (document.getElementById('sr-search')?.value||'').toLowerCase();
  const sf  = document.getElementById('sr-status-filter')?.value||'';
  const routes = _routeCache.filter(r =>
    (!sf || r.status === sf) &&
    (!q  || r.name.toLowerCase().includes(q) || (r.area||'').toLowerCase().includes(q) || (r.person||'').toLowerCase().includes(q))
  );

  const container = document.getElementById('sr-route-cards');
  if (!routes.length) {
    container.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-muted)">
      <i class="fa fa-search" style="font-size:28px;display:block;margin-bottom:10px"></i>No routes match your filter.
    </div>`;
    return;
  }

  container.innerHTML = routes.map((r, ri) => {
    const color = ROUTE_PALETTE[ri % ROUTE_PALETTE.length];
    const suppNames = r.supplier_names||[];
    const todayName = DAYS_OF_WEEK[(new Date().getDay() + 6) % 7];
    const isActiveToday = r.days.includes(todayName) && r.status === 'Active';
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden;transition:all .2s;cursor:default"
        onmouseover="this.style.borderColor='${color}';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.3)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.transform='';this.style.boxShadow=''">
      <!-- color bar -->
      <div style="height:4px;background:linear-gradient(90deg,${color},${color}88)"></div>
      <div style="padding:16px 18px">
        <!-- header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
              <i class="fa fa-route" style="color:${color}"></i>
            </div>
            <div>
              <div style="font-size:14px;font-weight:800;color:var(--text-primary)">${r.name}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:1px"><i class="fa fa-map-pin" style="margin-right:3px"></i>${r.area||'No area set'}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:${r.status==='Active'?'var(--green-glow)':'var(--red-glow)'};color:${r.status==='Active'?'var(--green)':'var(--red)'}">● ${r.status}</span>
            ${isActiveToday ? `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--yellow-glow);color:var(--yellow)">TODAY</span>` : ''}
          </div>
        </div>

        <!-- rep -->
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;margin-bottom:12px">
          <div style="width:28px;height:28px;border-radius:50%;background:${color}33;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:${color}">${(r.person||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${r.person||'Unassigned'}</div>
            <div style="font-size:10px;color:var(--text-muted)">Field Representative</div>
          </div>
        </div>

        <!-- days -->
        <div style="display:flex;gap:4px;margin-bottom:12px">
          ${DAYS_OF_WEEK.map(d => {
            const on = r.days.includes(d);
            return `<div style="flex:1;text-align:center;padding:4px 2px;border-radius:5px;background:${on?color+'22':'var(--bg-secondary)'};border:1px solid ${on?color+'55':'var(--border)'};font-size:9px;font-weight:700;color:${on?color:'var(--text-muted)'}">
              ${d.slice(0,2)}
            </div>`;
          }).join('')}
        </div>

        <!-- suppliers -->
        ${suppNames.length ? `<div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Suppliers</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${suppNames.map(s=>`<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary)">${s}</span>`).join('')}
          </div>
        </div>` : ''}

        ${r.notes ? `<div style="font-size:11px;color:var(--text-muted);padding:6px 10px;background:var(--bg-secondary);border-radius:6px;border-left:2px solid ${color};margin-bottom:12px">
          <i class="fa fa-sticky-note" style="margin-right:4px"></i>${r.notes}
        </div>` : ''}

        <!-- actions -->
        <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center" onclick="editRoute(${r.id})">
            <i class="fa fa-edit"></i> Edit
          </button>
          <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center;color:var(--red)" onclick="deleteRoute(${r.id})">
            <i class="fa fa-trash"></i> Delete
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Alias so old calls still work
function renderRoutesTable() { renderRouteCards(); }

async function openRouteModal() {
  document.getElementById('route-modal-title').textContent = 'Add New Route';
  document.getElementById('route-edit-id').value = '';
  ['rt-name','rt-area','rt-person','rt-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('rt-status').value = 'Active';
  // Reset day toggles
  document.querySelectorAll('.rt-day-toggle').forEach(el => el.classList.remove('active'));
  _initDayToggles([]);
  await _initSupplierToggles([]);
  openModal('route-modal');
}

async function editRoute(id) {
  const r = _routeCache.find(x => x.id === id);
  if (!r) return;
  document.getElementById('route-modal-title').textContent = 'Edit Route';
  document.getElementById('route-edit-id').value = r.id;
  document.getElementById('rt-name').value  = r.name;
  document.getElementById('rt-area').value  = r.area||'';
  document.getElementById('rt-person').value = r.person||'';
  document.getElementById('rt-notes').value = r.notes||'';
  document.getElementById('rt-status').value = r.status||'Active';
  _initDayToggles(r.days||[]);
  await _initSupplierToggles(r.suppliers||[]);
  openModal('route-modal');
}

function _initDayToggles(activeDays) {
  document.querySelectorAll('.rt-day-toggle').forEach(el => {
    const day = el.getAttribute('data-day');
    const isOn = activeDays.includes(day);
    el.style.cssText = `
      display:flex;align-items:center;justify-content:center;
      padding:10px 4px;border-radius:8px;cursor:pointer;
      font-size:11px;font-weight:700;text-align:center;
      border:1.5px solid ${isOn?'var(--accent)':'var(--border)'};
      background:${isOn?'var(--accent-glow)':'var(--bg-secondary)'};
      color:${isOn?'var(--accent)':'var(--text-muted)'};
      transition:all .15s;
    `;
    el._active = isOn;
    el.onclick = function() {
      this._active = !this._active;
      this.style.borderColor  = this._active ? 'var(--accent)' : 'var(--border)';
      this.style.background   = this._active ? 'var(--accent-glow)' : 'var(--bg-secondary)';
      this.style.color        = this._active ? 'var(--accent)' : 'var(--text-muted)';
    };
  });
}

async function _initSupplierToggles(activeIds) {
  const supData = await SuppliersAPI.list({ page_size: 500 });
  const suppliers = supData.results || supData;
  document.getElementById('rt-supplier-list').innerHTML = suppliers.map(s => {
    const isOn = activeIds.includes(s.id);
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;
        border:1.5px solid ${isOn?'var(--green)':'var(--border)'};
        background:${isOn?'var(--green-glow)':'var(--bg-secondary)'};
        font-size:12px;color:${isOn?'var(--green)':'var(--text-secondary)'};transition:all .15s"
      onclick="this.classList.toggle('rt-sup-on');this.style.borderColor=this.classList.contains('rt-sup-on')?'var(--green)':'var(--border)';this.style.background=this.classList.contains('rt-sup-on')?'var(--green-glow)':'var(--bg-secondary)';this.style.color=this.classList.contains('rt-sup-on')?'var(--green)':'var(--text-secondary)'">
      <input type="checkbox" class="rt-sup-cb" value="${s.id}" ${isOn?'checked':''} style="display:none">
      <i class="fa fa-building" style="font-size:11px"></i> ${s.name}
    </label>`;
  }).join('');
}

async function saveRoute() {
  const name = document.getElementById('rt-name').value.trim();
  if (!name) { toast('Route name is required!','error'); return; }
  const days = Array.from(document.querySelectorAll('.rt-day-toggle')).filter(el => el._active).map(el => el.getAttribute('data-day'));
  const suppliers = Array.from(document.querySelectorAll('.rt-sup-cb:checked')).map(c => parseInt(c.value));
  const payload = {
    name,
    area:    document.getElementById('rt-area').value.trim(),
    person:  document.getElementById('rt-person').value.trim(),
    notes:   document.getElementById('rt-notes').value.trim(),
    status:  document.getElementById('rt-status').value,
    days, suppliers
  };
  const editId = parseInt(document.getElementById('route-edit-id').value);
  try {
    if (editId) {
      await RoutesAPI.update(editId, payload);
      toast('Route updated!', 'success');
    } else {
      await RoutesAPI.create(payload);
      toast('Route created!', 'success');
    }
    closeModal('route-modal');
    renderSupplyRoutes();
  } catch (err) {
    toast(err.message || 'Failed to save route', 'error');
  }
}

async function deleteRoute(id) {
  if (!confirm('Delete this route?')) return;
  try {
    await RoutesAPI.remove(id);
    renderSupplyRoutes();
    toast('Route deleted', 'success');
  } catch (err) {
    toast(err.message || 'Failed to delete route', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// ORDER SUMMARY MODULE
// ═══════════════════════════════════════════════════════
let _osBookingsCache = [];

async function renderOrderSummary() {
  const fromVal    = document.getElementById('os-date-from')?.value;
  const toVal      = document.getElementById('os-date-to')?.value;
  const q          = (document.getElementById('os-search')?.value||'').toLowerCase();
  const usernameFilter = document.getElementById('os-username-filter')?.value || '';

  const salesData = await SalesAPI.list({ page_size: 500 });
  _osBookingsCache = (salesData.results || salesData).filter(s => s.status !== 'cancelled');

  // Populate username (served_by) dropdown
  const usDd = document.getElementById('os-username-filter');
  if (usDd) {
    const uniqueUsers = [...new Set(_osBookingsCache.map(b => b.served_by_name).filter(Boolean))].sort();
    const current = usDd.value;
    usDd.innerHTML = '<option value="">All Users</option>' +
      uniqueUsers.map(u => `<option value="${u}" ${u===current?'selected':''}>${u}</option>`).join('');
    if (current) usDd.value = current;
  }

  const bookings = _osBookingsCache.filter(b => {
    const bDate = (b.created_at||'').slice(0,10);
    if (fromVal && bDate < fromVal) return false;
    if (toVal   && bDate > toVal)   return false;
    if (usernameFilter && (b.served_by_name||'') !== usernameFilter) return false;
    return true;
  });

  const finOrders   = bookings.length;
  const finAmount   = bookings.reduce((s,b) => s+Number(b.total_amount), 0);
  const finTax      = bookings.reduce((s,b) => s+Number(b.tax_amount), 0);
  const finDiscount = bookings.reduce((s,b) => s+Number(b.discount_amount), 0);
  const finReceived = bookings.reduce((s,b) => s+Number(b.paid_amount), 0);
  const finPending  = Math.max(0, finAmount - finReceived);

  const f = v => 'Rs.' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('os-fin-orders',   finOrders.toLocaleString());
  setEl('os-fin-amount',   f(finAmount));
  setEl('os-fin-tax',      f(finTax));
  setEl('os-fin-discount', f(finDiscount));
  setEl('os-fin-pending',  f(finPending));
  setEl('os-fin-received', f(finReceived));

  const usBadge = document.getElementById('os-username-badge');
  if (usBadge) {
    usBadge.style.display = usernameFilter ? '' : 'none';
    if (usernameFilter) {
      usBadge.innerHTML = `<i class="fa fa-user-tag"></i> Showing orders by: <strong>${usernameFilter}</strong> <button onclick="document.getElementById('os-username-filter').value='';renderOrderSummary()" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:6px;font-size:12px">✕ Clear</button>`;
    }
  }

  // Aggregate per product from real sale items
  const productMap = {};
  bookings.forEach(bk => {
    (bk.items||[]).forEach(it => {
      const key = it.product;
      if (!productMap[key]) {
        productMap[key] = {
          name: it.product_name, icon: '📦', sku: it.product_sku || '—',
          piecesPerCarton: 1, buyPrice: Number(it.unit_price),
          totalPieces: 0, orderCount: 0,
        };
      }
      productMap[key].totalPieces += it.quantity;
      productMap[key].orderCount++;
    });
  });

  let rows = Object.values(productMap).filter(r =>
    !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
  );

  // KPI values
  const totalOrders  = bookings.length;
  const totalPieces  = rows.reduce((a,r) => a + r.totalPieces, 0);
  const totalCartons = rows.reduce((a,r) => a + Math.floor(r.totalPieces / Math.max(r.piecesPerCarton,1)), 0);
  const totalCost    = rows.reduce((a,r) => a + r.totalPieces * r.buyPrice, 0);

  document.getElementById('os-total-orders').textContent  = totalOrders.toLocaleString();
  document.getElementById('os-total-pieces').textContent  = totalPieces.toLocaleString();
  document.getElementById('os-total-cartons').textContent = totalCartons.toLocaleString();
  document.getElementById('os-total-cost').textContent    = 'Rs.' + totalCost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

  const tbody = document.getElementById('os-table-body');
  const empty = document.getElementById('os-empty');
  const table = document.getElementById('os-main-table');

  if (!rows.length) {
    tbody.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = '';
    if (!bookings.length && !_osBookingsCache.length) {
      document.getElementById('os-empty-msg').innerHTML =
        'Save confirmed bookings in the <strong>Order Booking</strong> module — they will appear here with full carton &amp; piece counts.';
    } else {
      document.getElementById('os-empty-msg').textContent = 'No matching orders found for the selected filters.';
    }
  } else {
    empty.style.display = 'none';
    table.style.display = '';
    rows.sort((a,b) => b.totalPieces - a.totalPieces);
    tbody.innerHTML = rows.map((r, i) => {
      const ppc     = Math.max(r.piecesPerCarton, 1);
      const cartons = Math.floor(r.totalPieces / ppc);
      const loose   = r.totalPieces % ppc;
      const cost    = r.totalPieces * r.buyPrice;
      const costPct = totalCost > 0 ? (cost / totalCost * 100) : 0;
      return `<tr style="${i % 2 === 0 ? '' : 'background:rgba(255,255,255,.02)'}">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">${r.icon}</span>
            <div>
              <div style="font-weight:700;font-size:13px">${r.name}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:1px">
                <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
                  <div style="height:3px;border-radius:2px;width:${Math.max(costPct,2)}px;max-width:80px;background:linear-gradient(90deg,var(--accent),var(--green));display:inline-block"></div>
                  <span>${costPct.toFixed(0)}% of cost</span>
                </div>
              </div>
            </div>
          </div>
        </td>
        <td class="td-mono" style="font-size:11px">${r.sku}</td>
        <td style="text-align:center">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--purple-glow);color:var(--purple);font-size:11px;font-weight:700">${r.orderCount}</span>
        </td>
        <td style="text-align:center">
          <strong style="color:var(--green);font-size:14px">${r.totalPieces.toLocaleString()}</strong>
        </td>
        <td style="text-align:center;color:var(--text-muted)">${ppc}</td>
        <td style="text-align:center">
          <span style="background:var(--accent-glow);color:var(--accent);font-weight:700;padding:3px 10px;border-radius:6px;font-size:13px">${cartons}</span>
        </td>
        <td style="text-align:center">
          ${loose > 0
            ? `<span style="background:var(--yellow-glow);color:var(--yellow);font-weight:700;padding:3px 8px;border-radius:6px;font-size:12px">${loose}</span>`
            : `<span style="color:var(--text-muted);font-size:12px">—</span>`}
        </td>
        <td style="text-align:right;color:var(--text-secondary)">Rs.${r.buyPrice.toFixed(2)}</td>
        <td style="text-align:right">
          <strong style="color:var(--green)">Rs.${cost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</strong>
        </td>
      </tr>`;
    }).join('') +
    `<tr style="background:var(--bg-secondary);border-top:2px solid var(--border)">
      <td colspan="3" style="font-weight:800;font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">TOTALS</td>
      <td style="text-align:center;font-weight:800;color:var(--green)">${totalPieces.toLocaleString()}</td>
      <td></td>
      <td style="text-align:center;font-weight:800;color:var(--accent)">${totalCartons.toLocaleString()}</td>
      <td></td>
      <td></td>
      <td style="text-align:right;font-weight:800;color:var(--green)">Rs.${totalCost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</td>
    </tr>`;
  }
}

function clearOsFilter() {
  document.getElementById('os-date-from').value = '';
  document.getElementById('os-date-to').value   = '';
  document.getElementById('os-search').value    = '';
  const usDd = document.getElementById('os-username-filter');
  if (usDd) usDd.value = '';
  renderOrderSummary();
}

function exportOrderSummaryCsv() {
  const usernameFilter = document.getElementById('os-username-filter')?.value || '';
  const fromVal = document.getElementById('os-date-from')?.value || '';
  const toVal   = document.getElementById('os-date-to')?.value   || '';

  const bookings = _osBookingsCache.filter(b => {
    const d = (b.created_at||'').slice(0,10);
    if (fromVal && d < fromVal) return false;
    if (toVal   && d > toVal)   return false;
    if (usernameFilter && (b.served_by_name||'') !== usernameFilter) return false;
    return true;
  });

  const headers = ['Invoice','Date','Customer','Account','Username','Subtotal','Tax','Discount','Total','Paid','Status'];
  const dataRows = bookings.map(b => [
    b.invoice_number, (b.created_at||'').slice(0,10), b.customer_name||'Walk-in', b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'', b.served_by_name||'',
    Number(b.subtotal).toFixed(2), Number(b.tax_amount).toFixed(2), Number(b.discount_amount).toFixed(2),
    Number(b.total_amount).toFixed(2), Number(b.paid_amount).toFixed(2), b.status
  ]);
  const csv = [headers, ...dataRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `order-summary${usernameFilter?'-'+usernameFilter:''}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('Order summary exported!', 'success');
}

function printOrderSummary() {
  const usernameFilter = document.getElementById('os-username-filter')?.value || '';
  const rows = [];
  document.querySelectorAll('#os-table-body tr:not(:last-child)').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
    if (cells.length) rows.push(cells);
  });
  const today = new Date().toLocaleDateString();
  const finOrders   = document.getElementById('os-fin-orders')?.textContent   || '—';
  const finAmount   = document.getElementById('os-fin-amount')?.textContent   || '—';
  const finTax      = document.getElementById('os-fin-tax')?.textContent      || '—';
  const finDiscount = document.getElementById('os-fin-discount')?.textContent || '—';
  const finPending  = document.getElementById('os-fin-pending')?.textContent  || '—';
  const finReceived = document.getElementById('os-fin-received')?.textContent || '—';
  const html = `<div class="a4-doc">
    <div class="a4-header">
      <div><div class="a4-logo-name">🏪 SmartRetail Store</div><div style="font-size:11px;color:#555;margin-top:3px">Warehouse Dispatch Summary${usernameFilter?' — User: '+usernameFilter:''}</div></div>
      <div class="a4-store-info"><strong>ORDER SUMMARY</strong><br>Generated: ${today}<br>By: ${currentUser?.full_name||'Admin'}</div>
    </div>
    <div class="a4-doc-title">Order Summary — Cartons &amp; Pieces Dispatched</div>
    <!-- Financial summary strip -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;font-size:11px">
      <div style="padding:8px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px"><div style="color:#555;margin-bottom:2px">Total Orders</div><strong>${finOrders}</strong></div>
      <div style="padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px"><div style="color:#555;margin-bottom:2px">Total Amount</div><strong>${finAmount}</strong></div>
      <div style="padding:8px 10px;background:#fefce8;border:1px solid #fde68a;border-radius:6px"><div style="color:#555;margin-bottom:2px">Tax</div><strong>${finTax}</strong></div>
      <div style="padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px"><div style="color:#555;margin-bottom:2px">Discount</div><strong>${finDiscount}</strong></div>
      <div style="padding:8px 10px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px"><div style="color:#555;margin-bottom:2px">Pending Balance</div><strong>${finPending}</strong></div>
      <div style="padding:8px 10px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px"><div style="color:#555;margin-bottom:2px">Received</div><strong>${finReceived}</strong></div>
    </div>
    <table>
      <thead><tr><th>Product</th><th>SKU</th><th>Orders</th><th>Total Pcs</th><th>Pcs/Ctn</th><th>Cartons</th><th>Loose</th><th>Unit Cost</th><th>Total Cost</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:14px;padding:10px 14px;border:1.5px solid #ddd;border-radius:6px;display:flex;flex-wrap:wrap;gap:20px;font-size:12px;background:#f9fafb">
      <span>📦 Cartons: <strong>${document.getElementById('os-total-cartons').textContent}</strong></span>
      <span>🧩 Pieces: <strong>${document.getElementById('os-total-pieces').textContent}</strong></span>
      <span>💰 Warehouse Cost: <strong>${document.getElementById('os-total-cost').textContent}</strong></span>
    </div>
    <div class="a4-footer"><span>SmartRetail ERP — Order Summary</span><span>Printed: ${today}</span></div>
  </div>`;
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = html;
  printArea.style.display = 'block';
  window.print();
  setTimeout(() => { printArea.style.display = 'none'; }, 1000);
}

// Set default date range on load + apply saved OS visibility
document.addEventListener('DOMContentLoaded', () => {
  const fromEl = document.getElementById('os-date-from');
  const toEl   = document.getElementById('os-date-to');
  if (fromEl && !fromEl.value) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    fromEl.value = d.toISOString().split('T')[0];
  }
  if (toEl && !toEl.value) toEl.value = new Date().toISOString().split('T')[0];
  // Apply saved show/hide for fin KPI cards
  applyOsFinKpiVisibility();
});
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('smartretail_theme', isLight ? 'light' : 'dark');
  // Update charts for new theme
  setTimeout(() => {
    try { renderDashboardCharts(); } catch(e) {}
  }, 50);
}

function initTheme() {
  const saved = localStorage.getItem('smartretail_theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
  }
}

// ── SIDEBAR TOGGLE (Mobile) ───────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen  = sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('open', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
  document.body.classList.toggle('sidebar-open', isOpen);
}

function closeSidebarMobile() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('sidebar-open');
}

// Auto-close sidebar on nav item click for mobile
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 991) closeSidebarMobile();
    });
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebarMobile();
  });
  // Swipe-left to close sidebar
  let _touchStartX = 0;
  document.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = _touchStartX - e.changedTouches[0].clientX;
    if (dx > 60 && document.querySelector('.sidebar')?.classList.contains('mobile-open')) {
      closeSidebarMobile();
    }
  }, { passive: true });
});


let _pendingProductImport = [];
let _pendingCustomerImport = [];

function triggerProductImport() { document.getElementById('product-import-file').click(); }
function triggerCustomerImport() { document.getElementById('customer-import-file').click(); }

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).filter(l=>l.trim()).map(line => {
    const vals = [];
    let cur = ''; let inQ = false;
    for (let i=0; i<line.length; i++) {
      if (line[i]==='"') { inQ=!inQ; continue; }
      if (line[i]===',' && !inQ) { vals.push(cur.trim()); cur=''; continue; }
      cur += line[i];
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h,i) => { obj[h] = vals[i]||''; });
    return obj;
  });
}

function handleProductImport(input) {
  const file = input.files[0];
  if (!file) return;
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const reader = new FileReader();
  reader.onload = e => {
    let rows = [];
    if (file.name.endsWith('.csv')) {
      rows = parseCSV(e.target.result);
    } else if (isExcel) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        rows = jsonData.map(r => {
          const lower = {};
          Object.keys(r).forEach(k => { lower[k.trim().toLowerCase()] = String(r[k]); });
          return lower;
        });
      } catch(err) {
        toast('Failed to read Excel file. Please check the file and try again.', 'error');
        input.value=''; return;
      }
    } else {
      toast('Unsupported file type. Please upload .csv, .xlsx or .xls', 'warning');
      input.value=''; return;
    }
    _pendingProductImport = rows.map(r => ({
      name: r.name || r['product name'] || r['productname'] || '',
      sku: r.sku || r['sku code'] || '',
      category: r.category || '',
      brand: r.brand || '',
      buyPrice: parseFloat(r.buyprice || r['buy price'] || r.cost || 0),
      sellPrice: parseFloat(r.sellprice || r['sell price'] || r.price || 0),
      stock: parseInt(r.stock || r.quantity || r.qty || 0),
      minStock: parseInt(r.minstock || r['min stock'] || 10),
      barcode: r.barcode || '',
      piecesPerCarton: parseInt(r.piecespercarton || r['pieces per carton'] || r.ppc || 1),
      cartonQty: parseInt(r.cartonqty || r['carton qty'] || 0),
      icon: r.icon || '📦',
      expiry: r.expiry || r['expiry date'] || '',
    })).filter(r => r.name && r.sku);

    // Build preview table
    const valid = _pendingProductImport;
    const previewHTML = `<table>
      <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Buy</th><th>Sell</th><th>Stock</th><th>Pcs/Ctn</th><th>Status</th></tr></thead>
      <tbody>${valid.map(r => {
        const existing = DB.products.find(p => p.sku === r.sku);
        return `<tr>
          <td>${r.icon} ${r.name}</td>
          <td class="td-mono">${r.sku}</td>
          <td>${r.category}</td>
          <td>$${r.buyPrice.toFixed(2)}</td>
          <td>$${r.sellPrice.toFixed(2)}</td>
          <td>${r.stock}</td>
          <td>${r.piecesPerCarton > 1 ? r.piecesPerCarton : '—'}</td>
          <td><span class="badge ${existing?'badge-yellow':'badge-green'}">${existing?'Update':'New'}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    document.getElementById('product-import-preview').innerHTML = previewHTML;
    const newCount = valid.filter(r => !DB.products.find(p => p.sku === r.sku)).length;
    const updateCount = valid.length - newCount;
    document.getElementById('product-import-stats').innerHTML =
      `<span class="badge badge-green" style="margin-right:6px">✅ ${newCount} New</span><span class="badge badge-yellow">${updateCount} Updates</span><span style="font-size:11px;color:var(--text-muted);margin-left:8px">${rows.length - valid.length} rows skipped (missing name/sku)</span>`;
    openModal('product-import-modal');
    input.value = '';
  };
  if (isExcel) { reader.readAsArrayBuffer(file); } else { reader.readAsText(file); }
}

function confirmProductImport() {
  let added = 0, updated = 0;
  _pendingProductImport.forEach(r => {
    const existing = DB.products.find(p => p.sku === r.sku);
    if (existing) { Object.assign(existing, r); updated++; }
    else { r.id = Math.max(...DB.products.map(p=>p.id),0)+1; DB.products.push(r); added++; }
  });
  closeModal('product-import-modal');
  renderProducts();
  toast(`Import done: ${added} added, ${updated} updated`, 'success');
  _pendingProductImport = [];
}

function handleCustomerImport(input) {
  const file = input.files[0];
  if (!file) return;
  const isExcelC = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const reader = new FileReader();
  reader.onload = e => {
    let rows = [];
    if (file.name.endsWith('.csv')) {
      rows = parseCSV(e.target.result);
    } else if (isExcelC) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        rows = jsonData.map(r => {
          const lower = {};
          Object.keys(r).forEach(k => { lower[k.trim().toLowerCase()] = String(r[k]); });
          return lower;
        });
      } catch(err) {
        toast('Failed to read Excel file. Please check the file and try again.', 'error');
        input.value=''; return;
      }
    } else {
      toast('Unsupported file type. Please upload .csv, .xlsx or .xls', 'warning');
      input.value=''; return;
    }
    _pendingCustomerImport = rows.map(r => ({
      name: r.name || r['full name'] || r['customer name'] || r['shopkeeper name'] || '',
      phone: r.phone || r['mobile'] || r['contact'] || '',
      email: r.email || '',
      address: r.address || '',
      loyaltyPoints: parseInt(r.loyaltypoints || r['loyalty points'] || r.points || 0),
    })).filter(r => r.name);

    const valid = _pendingCustomerImport;
    const previewHTML = `<table>
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Points</th><th>Status</th></tr></thead>
      <tbody>${valid.map(r => {
        const existing = DB.customers.find(c => c.phone && c.phone === r.phone);
        return `<tr>
          <td class="fw-700">${r.name}</td>
          <td>${r.phone}</td>
          <td>${r.email||'—'}</td>
          <td style="font-size:11px">${r.address||'—'}</td>
          <td>${r.loyaltyPoints}</td>
          <td><span class="badge ${existing?'badge-yellow':'badge-green'}">${existing?'Update':'New'}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    document.getElementById('customer-import-preview').innerHTML = previewHTML;
    const newCount = valid.filter(r => !DB.customers.find(c => c.phone && c.phone === r.phone)).length;
    const updateCount = valid.length - newCount;
    document.getElementById('customer-import-stats').innerHTML =
      `<span class="badge badge-green" style="margin-right:6px">✅ ${newCount} New</span><span class="badge badge-yellow">${updateCount} Updates</span>`;
    openModal('customer-import-modal');
    input.value = '';
  };
  if (isExcelC) { reader.readAsArrayBuffer(file); } else { reader.readAsText(file); }
}

function confirmCustomerImport() {
  let added = 0, updated = 0;
  _pendingCustomerImport.forEach(r => {
    const existing = DB.customers.find(c => c.phone && c.phone === r.phone);
    if (existing) { Object.assign(existing, r); updated++; }
    else { DB.customers.push({ id: Math.max(...DB.customers.map(c=>c.id),0)+1, totalPurchases:0, lastVisit: new Date().toISOString().split('T')[0], ...r }); added++; }
  });
  closeModal('customer-import-modal');
  renderCustomers();
  updatePosCustomers();
  toast(`Import done: ${added} added, ${updated} updated`, 'success');
  _pendingCustomerImport = [];
}

// ═══════════════════════════════════════════════════════
// V2: SALE SLIP SETTINGS + TAX DISPLAY + COLLECTION BY USERNAME
// ═══════════════════════════════════════════════════════

// ── Sale Slip Settings ─────────────────────────────────
const SS_SETTINGS_KEY = 'smartretail_ss_settings_v2';
let ssSettings = (() => {
  try { return JSON.parse(localStorage.getItem(SS_SETTINGS_KEY)); } catch(e) { return null; }
})() || {
  showTax: true, showDiscount: true, showCartonPrice: true,
  showSubtotal: true, showCustomerDetails: true, showProfit: false,
  showCompanyLogo: true, showFooterNotes: true, showBookedBy: true,
  showPaymentMethod: true
};

function saveSsSettings() {
  document.querySelectorAll('.ss-setting-check').forEach(cb => {
    ssSettings[cb.dataset.key] = cb.checked;
  });
  localStorage.setItem(SS_SETTINGS_KEY, JSON.stringify(ssSettings));
  closeModal('ss-settings-modal');
  toast('Sale Slip settings saved!', 'success');
}

// Universal toggle row builder (used by SS Settings modal)
function makeSettingToggle(key, label, icon, val) {
  return `<label style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:var(--bg-secondary);border-radius:8px;cursor:pointer;border:1px solid var(--border);transition:border-color .15s;gap:8px"
    onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
      <div style="width:30px;height:30px;flex-shrink:0;border-radius:6px;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:12px"><i class="fa ${icon}"></i></div>
      <span style="font-size:13px;font-weight:600">${label}</span>
    </div>
    <div style="position:relative;width:42px;height:24px;flex-shrink:0" onclick="event.preventDefault();ssToggle('${key}',this)">
      <div class="ss-toggle-bg" style="position:absolute;inset:0;border-radius:12px;background:${val?'var(--accent)':'var(--border)'};transition:background .2s;cursor:pointer"></div>
      <div class="ss-toggle-dot" style="position:absolute;top:2px;left:${val?'20px':'2px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none"></div>
      <input type="checkbox" class="ss-setting-check" data-key="${key}" ${val?'checked':''} style="opacity:0;width:0;height:0;position:absolute;pointer-events:none">
    </div>
  </label>`;
}

// Live toggle for SS Settings modal
function ssToggle(key, container) {
  const cb  = container.querySelector('.ss-setting-check');
  const bg  = container.querySelector('.ss-toggle-bg');
  const dot = container.querySelector('.ss-toggle-dot');
  if (!cb) return;
  cb.checked = !cb.checked;
  if (bg)  bg.style.background = cb.checked ? 'var(--accent)' : 'var(--border)';
  if (dot) dot.style.left      = cb.checked ? '20px' : '2px';
}

// ── SALES SLIP SEARCH with username/invoice/area filter ──
window.renderSaleSlips = async function() {
  const dateFilter     = document.getElementById('ss-date')?.value||'';
  const nameFilter     = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();
  const invoiceFilter  = (document.getElementById('ss-invoice')?.value||'').toLowerCase().trim();
  const usernameFilter = (document.getElementById('ss-username')?.value||'').toLowerCase().trim();

  const data = await SalesAPI.list({ page_size: 200, ordering: '-created_at' });
  _slipsCache = data.results || data;

  const slips = _slipsCache.filter(b =>
    b.status !== 'cancelled' &&
    (!dateFilter     || (b.created_at||'').slice(0,10) === dateFilter) &&
    (!nameFilter     || (b.customer_name||'').toLowerCase().includes(nameFilter)) &&
    (!invoiceFilter  || (b.invoice_number||'').toLowerCase().includes(invoiceFilter)) &&
    (!usernameFilter || (b.served_by_name||'').toLowerCase().includes(usernameFilter))
  );

  const tbody = document.getElementById('saleslips-tbody');
  const label = document.getElementById('ss-count-label');
  if (!tbody) return;
  if (label) label.textContent = slips.length + ' slip' + (slips.length!==1?'s':'');

  if (!slips.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa fa-file-invoice" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3"></i>No sale slips found</td></tr>`;
    return;
  }

  tbody.innerHTML = slips.map(b => {
    const statusClass = b.status === 'completed' ? 'badge-green' : ['returned','partially_returned'].includes(b.status) ? 'badge-red' : 'badge-yellow';
    const hasTax  = Number(b.tax_amount) > 0;
    const hasDisc = Number(b.discount_amount) > 0;
    return `<tr>
      <td class="td-mono" style="font-weight:700">${b.invoice_number}</td>
      <td style="font-size:12px">${(b.created_at||'').slice(0,10)}</td>
      <td style="font-weight:600">${b.customer_name||'Walk-in'}
        ${b.served_by_name ? `<div style="font-size:10px;color:var(--text-muted)"><i class="fa fa-user-tag"></i> ${b.served_by_name}</div>` : ''}
      </td>
      <td class="td-mono">${b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—'}</td>
      <td style="text-align:center">${b.items?.length||0}</td>
      <td class="fw-700 td-mono">Rs.${Number(b.subtotal).toFixed(2)}
        ${hasTax ? `<div style="font-size:10px;color:var(--yellow)">+Rs.${Number(b.tax_amount).toFixed(2)} tax</div>` : ''}
        ${hasDisc ? `<div style="font-size:10px;color:var(--green)">-Rs.${Number(b.discount_amount).toFixed(2)} disc</div>` : ''}
      </td>
      <td class="fw-700 td-mono" style="color:var(--yellow)">Rs.${Number(b.total_amount).toFixed(2)}</td>
      <td><span class="badge ${statusClass}">${b.status.replace(/_/g,' ')}</span></td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-ghost btn-xs" onclick="viewSlipDetail(${b.id})" title="View Details"><i class="fa fa-eye"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print"><i class="fa fa-print"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
};

window.clearSaleSlipsFilters = function() {
  ['ss-date','ss-status','ss-name','ss-area','ss-invoice','ss-username'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderSaleSlips();
};

// Fixed: previously overrode viewSlipDetail with a call to a non-existent
// viewOrderDetail() function (dead code from the original template — would
// have thrown ReferenceError on click). The real viewSlipDetail defined
// earlier (using _slipsCache) is left as the only definition.
window.downloadSlipInvoice = async function(id) {
  let b = _slipsCache.find(x => x.id === id);
  if (!b) b = await SalesAPI.get(id);
  if (!b) { toast('Booking not found','error'); return; }
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ' + b.invoice_number + '</title></head><body style="margin:0;padding:20px;font-family:sans-serif">' + buildSlipA4Html(b) + '</body></html>';
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'Invoice-' + b.invoice_number + '.html'; a.click();
  URL.revokeObjectURL(a.href);
  toast('Invoice downloaded!', 'success');
};

// ── Order Summary Settings (extended with fin-KPI toggles) ──
const OS_SETTINGS_KEY = 'smartretail_os_settings';
let osSettings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(OS_SETTINGS_KEY));
    // Merge with defaults so new keys are always present
    return Object.assign({
      showOrders: true, showPieces: true, showCartonPrice: true,
      showTax: true, showDiscount: true, showQty: true,
      showSubtotal: true, showProfitMargin: false, showSku: true,
      // Financial KPI strip toggles
      finShowOrders: true, finShowAmount: true, finShowTax: true,
      finShowDiscount: true, finShowPending: true, finShowReceived: true,
    }, saved || {});
  } catch(e) { return null; }
})() || {
  showOrders: true, showPieces: true, showCartonPrice: true,
  showTax: true, showDiscount: true, showQty: true,
  showSubtotal: true, showProfitMargin: false, showSku: true,
  finShowOrders: true, finShowAmount: true, finShowTax: true,
  finShowDiscount: true, finShowPending: true, finShowReceived: true,
};

function saveOsSettings() {
  document.querySelectorAll('.os-setting-check').forEach(cb => {
    osSettings[cb.dataset.key] = cb.checked;
  });
  localStorage.setItem(OS_SETTINGS_KEY, JSON.stringify(osSettings));
  closeModal('os-settings-modal');
  applyOsFinKpiVisibility();
  renderOrderSummary();
  toast('Order Summary settings saved!', 'success');
}

// Live toggle handler — flips the dot and background instantly
function osToggle(key, container) {
  const cb  = container.querySelector('.os-setting-check');
  const bg  = container.querySelector('.os-toggle-bg');
  const dot = container.querySelector('.os-toggle-dot');
  if (!cb) return;
  cb.checked = !cb.checked;
  if (bg)  bg.style.background = cb.checked ? 'var(--accent)' : 'var(--border)';
  if (dot) dot.style.left      = cb.checked ? '20px' : '2px';
}

// Apply fin-KPI card visibility based on settings
function applyOsFinKpiVisibility() {
  const map = {
    finShowOrders:   'os-fin-card-orders',
    finShowAmount:   'os-fin-card-amount',
    finShowTax:      'os-fin-card-tax',
    finShowDiscount: 'os-fin-card-discount',
    finShowPending:  'os-fin-card-pending',
    finShowReceived: 'os-fin-card-received',
  };
  Object.entries(map).forEach(([key, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.style.display = osSettings[key] === false ? 'none' : '';
  });
}

// ── Product pricing auto-calculator ───────────────────
function calcProdPricing() {
  const buy    = parseFloat(document.getElementById('prod-buy')?.value) || 0;
  const sell   = parseFloat(document.getElementById('prod-sell')?.value) || 0;
  const discPct = parseFloat(document.getElementById('prod-discount')?.value) || 0;
  const taxPct  = parseFloat(document.getElementById('prod-tax')?.value) || 0;
  const summary = document.getElementById('prod-pricing-summary');
  if (!summary) return;
  if (sell > 0 || buy > 0) {
    summary.style.display = '';
    const discAmt   = sell * discPct / 100;
    const finalSell = sell - discAmt;
    const taxIncl   = finalSell * (1 + taxPct / 100);
    const profit    = finalSell - buy;
    const margin    = buy > 0 ? (profit / buy * 100) : 0;
    document.getElementById('prod-calc-disc').textContent   = 'Rs.' + discAmt.toFixed(2);
    document.getElementById('prod-calc-final').textContent  = 'Rs.' + finalSell.toFixed(2);
    document.getElementById('prod-calc-tax').textContent    = 'Rs.' + taxIncl.toFixed(2);
    document.getElementById('prod-calc-margin').textContent = margin.toFixed(1) + '%';
    document.getElementById('prod-calc-profit').textContent = 'Rs.' + profit.toFixed(2);
    document.getElementById('prod-calc-margin').style.color = margin < 0 ? 'var(--red)' : margin < 10 ? 'var(--yellow)' : 'var(--green)';
    document.getElementById('prod-calc-profit').style.color = profit < 0 ? 'var(--red)' : 'var(--accent)';
  } else {
    summary.style.display = 'none';
  }
}

// NOTE: This used to re-override openProductModal/editProduct/saveProduct
// with a version that read/wrote the fake DB.products array on top of the
// real API calls (and called the real async saveProduct() without awaiting
// it, racing the DB.products write against the actual save). The real
// implementations above already handle discount_percent/tax_rate directly
// against the backend, so this whole patch was redundant AND buggy — removed.

// ── CUSTOMER COLLECTION — full v2 with username filter ─
if (!DB.collectionPayments) DB.collectionPayments = [];
if (!DB.saleReturns)      DB.saleReturns = [];
if (!DB.purchaseReturns)  DB.purchaseReturns = [];

let _colCustomerCache = [];
let _colSalesCache = [];

function _custBookings(custId) {
  return _colSalesCache.filter(b => b.customer === custId);
}

function getCustomerBalance(custId) {
  const bookings = _custBookings(custId);
  const totalOrders = bookings.reduce((s, b) => s + Number(b.total_amount), 0);
  const payments    = bookings.reduce((s, b) => s + Number(b.paid_amount), 0);
  return { totalOrders, payments, balance: totalOrders - payments };
}

function getTodayOrders(custId) {
  const today = new Date().toISOString().split('T')[0];
  return _custBookings(custId).filter(b => (b.created_at||'').slice(0,10) === today).reduce((s, b) => s + Number(b.total_amount), 0);
}

function getLastPaymentDate(custId) {
  const allPayments = [];
  _custBookings(custId).forEach(b => (b.payments||[]).forEach(p => allPayments.push(p)));
  if (!allPayments.length) return '—';
  return allPayments.sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''))[0].created_at.slice(0,10);
}

// Build username summary: all sales served by a username, grouped by customer
function getUsernameCollectionRows(username) {
  const lc = username.toLowerCase();
  const bookings = _colSalesCache.filter(b => (b.served_by_name||'').toLowerCase().includes(lc));
  const byCustomer = {};
  bookings.forEach(b => {
    const key = b.customer || b.customer_name;
    if (!byCustomer[key]) byCustomer[key] = { customerName: b.customer_name||'Walk-in', accountNo: b.customer?('ACC-'+String(b.customer).padStart(4,'0')):'—', username: b.served_by_name||username, invoices: [], totalBill: 0, discAmt: 0, taxAmt: 0, received: 0 };
    byCustomer[key].invoices.push(b.invoice_number);
    byCustomer[key].totalBill += Number(b.total_amount);
    byCustomer[key].discAmt  += Number(b.discount_amount);
    byCustomer[key].taxAmt   += Number(b.tax_amount);
    byCustomer[key].received += Number(b.paid_amount);
  });
  return Object.values(byCustomer).map(r => ({
    ...r,
    invoiceCount: r.invoices.length,
    pending: Math.max(0, r.totalBill - r.received),
    totalCollection: r.totalBill
  }));
}

async function renderCollection() {
  const [custData, salesData] = await Promise.all([
    CustomersAPI.list({ page_size: 500 }), SalesAPI.list({ page_size: 500 }),
  ]);
  _colCustomerCache = (custData.results || custData).map(c => ({ ...c, name: c.name, phone: c.phone, accountNo: 'ACC-'+String(c.id).padStart(4,'0') }));
  _colSalesCache = (salesData.results || salesData).filter(b => b.status !== 'cancelled');

  const q           = (document.getElementById('col-search')?.value||'').toLowerCase();
  const dateFrom    = document.getElementById('col-date-from')?.value||'';
  const dateTo      = document.getElementById('col-date-to')?.value||'';
  const balFilter   = document.getElementById('col-balance-filter')?.value||'';
  const usernameQ   = (document.getElementById('col-username-filter')?.value||'').toLowerCase().trim();
  const viewMode    = document.getElementById('col-view-mode')?.value || 'customer';
  const tbody = document.getElementById('collection-tbody');
  const label = document.getElementById('col-count-label');
  if (!tbody) return;

  const today         = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now()-30*24*60*60*1000).toISOString().split('T')[0];

  // ── Username view: group by username ──
  if (viewMode === 'username' && usernameQ) {
    const rows = getUsernameCollectionRows(usernameQ);
    if (label) label.textContent = rows.length + ' record(s) for "' + usernameQ + '"';

    // Update KPIs
    const kpiTotal = rows.reduce((s,r) => s+r.totalCollection, 0);
    const kpiPending = rows.reduce((s,r) => s+r.pending, 0);
    if (document.getElementById('col-total-customers')) document.getElementById('col-total-customers').textContent = rows.length;
    if (document.getElementById('col-total-pending')) document.getElementById('col-total-pending').textContent = 'Rs.' + kpiPending.toFixed(0);
    if (document.getElementById('col-total-received')) document.getElementById('col-total-received').textContent = 'Rs.' + (kpiTotal - kpiPending).toFixed(0);

    // Render username-view table
    const colHead = document.getElementById('col-thead');
    if (colHead) colHead.innerHTML = `<tr>
      <th>Customer</th><th>Account</th><th>Username</th>
      <th>Invoices</th><th>Total Bill</th><th>Tax</th><th>Disc.</th>
      <th>Received</th><th>Pending</th><th>Actions</th></tr>`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa fa-user-tag" style="font-size:32px;display:block;margin-bottom:10px;opacity:.3"></i>No records for this username</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
      <td style="font-weight:700">${r.customerName}</td>
      <td class="td-mono">${r.accountNo}</td>
      <td><span style="background:var(--accent-glow);color:var(--accent);font-size:11px;padding:2px 8px;border-radius:4px;font-family:var(--mono)">${r.username}</span></td>
      <td style="text-align:center;font-weight:700">${r.invoiceCount}</td>
      <td class="fw-700 td-mono">Rs.${r.totalBill.toFixed(2)}</td>
      <td class="td-mono" style="color:var(--yellow)">${r.taxAmt>0?'Rs.'+r.taxAmt.toFixed(2):'—'}</td>
      <td class="td-mono" style="color:var(--green)">${r.discAmt>0?'Rs.'+r.discAmt.toFixed(2):'—'}</td>
      <td class="fw-700 td-mono text-green">Rs.${(r.received||0).toFixed(2)}</td>
      <td class="fw-700 td-mono" style="color:${r.pending>0?'var(--red)':'var(--green)'}">Rs.${r.pending.toFixed(2)}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="printUsernameCollection('${r.username}')"><i class="fa fa-print"></i></button></td>
    </tr>`).join('');
    return;
  }

  // ── Default customer view ──
  const colHead = document.getElementById('col-thead');
  if (colHead) colHead.innerHTML = `<tr>
    <th>Customer</th><th>Account No.</th><th>Prev. Balance</th>
    <th>Today's Orders</th><th>Total Pending</th><th>Received</th>
    <th>Remaining</th><th>Last Payment</th><th>Actions</th></tr>`;

  let rows = _colCustomerCache.map(c => {
    const bal = getCustomerBalance(c.id);
    const todayOrders = getTodayOrders(c.id);
    const lastPay     = getLastPaymentDate(c.id);
    const totalPending = bal.totalOrders - bal.payments;
    return { ...c, ...bal, todayOrders, lastPay, totalPending };
  });

  rows = rows.filter(r => {
    if (q && !(r.name||'').toLowerCase().includes(q) && !(r.phone||'').toLowerCase().includes(q) && !(r.accountNo||'').toLowerCase().includes(q)) return false;
    if (usernameQ) {
      const hasBk = _custBookings(r.id).some(b => (b.served_by_name||'').toLowerCase().includes(usernameQ));
      if (!hasBk) return false;
    }
    if (balFilter === 'pending' && r.totalPending <= 0) return false;
    if (balFilter === 'clear'   && r.totalPending > 0) return false;
    if (balFilter === 'overdue' && (r.lastPay > thirtyDaysAgo || r.totalPending <= 0)) return false;
    return true;
  });

  const totalPending  = rows.reduce((s,r) => s+Math.max(0, r.totalPending), 0);
  const totalReceived = _colSalesCache.reduce((s,b) => s + (b.payments||[]).filter(p=>(p.created_at||'').slice(0,10)===today).reduce((a,p)=>a+Number(p.amount),0), 0);
  const overdueCount  = rows.filter(r => r.totalPending>0 && r.lastPay<thirtyDaysAgo).length;

  if (document.getElementById('col-total-customers')) document.getElementById('col-total-customers').textContent = rows.length;
  if (document.getElementById('col-total-pending'))   document.getElementById('col-total-pending').textContent   = 'Rs.'+totalPending.toFixed(0);
  if (document.getElementById('col-total-received'))  document.getElementById('col-total-received').textContent  = 'Rs.'+totalReceived.toFixed(2);
  if (document.getElementById('col-overdue-count'))   document.getElementById('col-overdue-count').textContent   = overdueCount;
  if (label) label.textContent = rows.length + ' account' + (rows.length!==1?'s':'');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa fa-hand-holding-usd" style="font-size:32px;display:block;margin-bottom:10px;opacity:.3"></i>No customers found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const remaining  = Math.max(0, r.totalPending);
    const statusClass = remaining<=0 ? 'badge-green' : r.lastPay<thirtyDaysAgo ? 'badge-red' : 'badge-yellow';
    const statusText  = remaining<=0 ? 'Cleared' : r.lastPay<thirtyDaysAgo ? 'Overdue' : 'Pending';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--cyan));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${(r.name||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:700">${r.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${r.phone||'—'}</div>
          </div>
        </div>
      </td>
      <td class="td-mono">${r.accountNo||'—'}</td>
      <td class="fw-700 td-mono text-red">Rs.${(r.totalOrders-r.todayOrders).toFixed(2)}</td>
      <td class="fw-700 td-mono text-accent">Rs.${r.todayOrders.toFixed(2)}</td>
      <td><span class="badge ${statusClass}">${statusText}</span> <span class="fw-700 td-mono">Rs.${r.totalOrders.toFixed(2)}</span></td>
      <td class="fw-700 td-mono text-green">Rs.${r.payments.toFixed(2)}</td>
      <td class="fw-700 td-mono" style="color:${remaining<=0?'var(--green)':'var(--red)'}">Rs.${remaining.toFixed(2)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${r.lastPay}</td>
      <td>
        <button class="btn btn-green btn-xs" onclick="openCollectionPayment(${r.id})"><i class="fa fa-plus"></i> Pay</button>
      </td>
    </tr>`;
  }).join('');
}

function openCollectionPayment(custId) {
  const c = _colCustomerCache.find(x => x.id===custId); if (!c) return;
  const bal = getCustomerBalance(custId);
  const remaining = Math.max(0, bal.totalOrders-bal.payments);
  document.getElementById('col-pay-cust-id').value       = custId;
  document.getElementById('col-pay-cust-name').value     = c.name;
  document.getElementById('col-pay-outstanding').value   = 'Rs.'+remaining.toFixed(2);
  document.getElementById('col-pay-amount').value        = '';
  document.getElementById('col-pay-date').value          = new Date().toISOString().split('T')[0];
  document.getElementById('col-pay-notes').value         = '';
  document.getElementById('col-pay-remaining').textContent = 'Rs.'+remaining.toFixed(2);
  openModal('col-payment-modal');
}

function calcColRemaining() {
  const outStr = document.getElementById('col-pay-outstanding')?.value||'Rs.0';
  const outstanding = parseFloat(outStr.replace('Rs.','')) || 0;
  const paying = parseFloat(document.getElementById('col-pay-amount')?.value) || 0;
  const rem = Math.max(0, outstanding-paying);
  document.getElementById('col-pay-remaining').textContent = 'Rs.'+rem.toFixed(2);
  document.getElementById('col-pay-remaining').style.color = rem===0 ? 'var(--green)' : 'var(--yellow)';
}

async function saveCollectionPayment() {
  const custId = parseInt(document.getElementById('col-pay-cust-id').value);
  let amount = parseFloat(document.getElementById('col-pay-amount').value);
  if (!amount || amount<=0) { toast('Enter a valid payment amount!','error'); return; }
  const method = document.getElementById('col-pay-method').value;
  const c = _colCustomerCache.find(x => x.id===custId);

  // A "collection payment" is applied across this customer's unpaid sales,
  // oldest first, via the real SalesAPI.pay() endpoint (there's no separate
  // customer-level payment record on the backend — payments always belong
  // to a specific invoice, matching real accounting).
  const unpaidSales = _custBookings(custId)
    .filter(b => Number(b.due_amount) > 0)
    .sort((a,b) => (a.created_at||'').localeCompare(b.created_at||''));

  if (!unpaidSales.length) { toast('This customer has no unpaid invoices.', 'warning'); return; }

  try {
    for (const sale of unpaidSales) {
      if (amount <= 0) break;
      const due = Number(sale.due_amount);
      const payNow = Math.min(due, amount);
      await SalesAPI.pay(sale.id, { amount: payNow, method });
      amount -= payNow;
    }
    closeModal('col-payment-modal');
    renderCollection();
    toast(`Payment recorded for ${c?.name}!`,'success');
  } catch (err) {
    toast(err.message || 'Failed to record payment', 'error');
  }
}

function clearCollectionFilters() {
  ['col-search','col-date-from','col-date-to','col-username-filter'].forEach(id => {
    const el=document.getElementById(id); if(el) el.value='';
  });
  const bf=document.getElementById('col-balance-filter'); if(bf) bf.value='';
  const vm=document.getElementById('col-view-mode'); if(vm) vm.value='customer';
  renderCollection();
}

// A focused, field-ready sheet for order bookers: just the customers who
// actually owe money, the exact amount to collect, and a signature line —
// deliberately simpler than the full Collection Ledger so there's no
// ambiguity about what to collect or from whom.
function printTodaysCollectionSheet() {
  const todayLabel = new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const now = new Date().toLocaleString('en-PK');

  const rows = _colCustomerCache.map(c => {
    const bal = getCustomerBalance(c.id);
    const todayOrders = getTodayOrders(c.id);
    const totalDue = Math.max(0, bal.totalOrders - bal.payments);
    return {
      name: c.name,
      phone: c.phone || '—',
      acct: c.accountNo || '—',
      todayBill: todayOrders,
      totalDue,
    };
  }).filter(r => r.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue);

  if (!rows.length) {
    toast('No pending balances to collect today.', 'success');
    return;
  }

  const grandTotal = rows.reduce((s, r) => s + r.totalDue, 0);
  const grandTodayBill = rows.reduce((s, r) => s + r.todayBill, 0);

  const html = `<div class="a4-doc" style="font-family:Arial,sans-serif;color:#000">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:10px;margin-bottom:14px">
      <div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-.5px">🏪 SmartRetail ERP</div>
        <div style="font-size:14px;font-weight:700;color:#333;margin-top:2px">Today's Collection Sheet</div>
        <div style="font-size:11px;color:#666;margin-top:2px">Date: ${todayLabel}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#555">Order Booker: ______________________</div>
        <div style="font-size:11px;color:#555;margin-top:4px">Accounts to visit: <strong>${rows.length}</strong></div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#1a1a1a;color:#fff">
          <th style="padding:8px 10px;text-align:left">#</th>
          <th style="padding:8px 10px;text-align:left">Customer</th>
          <th style="padding:8px 10px;text-align:left">Phone</th>
          <th style="padding:8px 10px;text-align:left">Account</th>
          <th style="padding:8px 10px;text-align:right">Today's Bill</th>
          <th style="padding:8px 10px;text-align:right">Total to Collect</th>
          <th style="padding:8px 10px;text-align:center">Collected (Rs.)</th>
          <th style="padding:8px 10px;text-align:center">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
        <tr style="background:${i % 2 ? '#f8f8f8' : '#fff'};border-bottom:1px solid #e5e7eb">
          <td style="padding:8px 10px;color:#666">${i + 1}</td>
          <td style="padding:8px 10px;font-weight:700">${r.name}</td>
          <td style="padding:8px 10px">${r.phone}</td>
          <td style="padding:8px 10px;font-family:monospace;font-size:10.5px">${r.acct}</td>
          <td style="padding:8px 10px;text-align:right">${r.todayBill > 0 ? 'Rs.' + r.todayBill.toFixed(2) : '—'}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:900;color:#dc2626">Rs.${r.totalDue.toFixed(2)}</td>
          <td style="padding:8px 10px;border:1px solid #ccc;height:28px"></td>
          <td style="padding:8px 10px;border:1px solid #ccc;height:28px"></td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#1a1a1a;color:#fff">
          <td colspan="4" style="padding:11px 10px;font-size:13px;font-weight:900">TOTAL TO COLLECT TODAY</td>
          <td style="padding:11px 10px;text-align:right;font-size:11px;color:#94a3b8">Today's bills: Rs.${grandTodayBill.toFixed(2)}</td>
          <td style="padding:11px 10px;text-align:right;font-size:18px;font-weight:900;color:#f87171">Rs.${grandTotal.toFixed(2)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:14px;font-size:10.5px;color:#555;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;background:#fefce8">
      ⚠ Collect exactly the amount shown in <strong>"Total to Collect"</strong> — this already includes any previous balance plus today's bill.
      Record the payment in the app immediately after collecting to avoid mismatch with office records.
    </div>

    <div style="margin-top:10px;font-size:10px;color:#888;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between">
      <span>SmartRetail ERP — Today's Collection Sheet</span>
      <span>Printed: ${now} by ${currentUser?.full_name || 'Admin'}</span>
    </div>
  </div>`;

  const pa = document.getElementById('print-area');
  pa.innerHTML = html;
  pa.style.display = 'block';
  window.print();
  setTimeout(() => { pa.style.display = 'none'; }, 1400);
}

function printCollectionReport() {
  const rows = [];
  _colCustomerCache.forEach(c => {
    const bal = getCustomerBalance(c.id);
    const lastPay = getLastPaymentDate(c.id);
    rows.push({
      name:        c.name,
      phone:       c.phone || '—',
      acct:        c.accountNo || '—',
      totalOrders: bal.totalOrders,
      payments:    bal.payments,
      balance:     Math.max(0, bal.totalOrders - bal.payments),
      lastPay,
    });
  });

  // Sort: outstanding first, then cleared
  rows.sort((a, b) => b.balance - a.balance);

  // Grand totals
  const grandTotalOrders   = rows.reduce((s, r) => s + r.totalOrders,  0);
  const grandTotalReceived = rows.reduce((s, r) => s + r.payments,     0);
  const grandTotalPending  = rows.reduce((s, r) => s + r.balance,      0);
  const pendingCount       = rows.filter(r => r.balance > 0).length;
  const clearedCount       = rows.filter(r => r.balance <= 0).length;
  const today = new Date().toLocaleDateString('en-PK');
  const now   = new Date().toLocaleString('en-PK');

  const html = `<div class="a4-doc" style="font-family:Arial,sans-serif;color:#000">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:10px;margin-bottom:14px">
      <div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-.5px">🏪 SmartRetail ERP</div>
        <div style="font-size:14px;font-weight:700;color:#333;margin-top:2px">Customer Collection Report</div>
        <div style="font-size:11px;color:#666;margin-top:2px">Date: ${today} &nbsp;|&nbsp; Printed: ${now}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#555">Printed by: <strong>${currentUser?.full_name||'Admin'}</strong></div>
        <div style="font-size:11px;color:#555;margin-top:2px">Total Accounts: <strong>${rows.length}</strong></div>
      </div>
    </div>

    <!-- Summary Banner -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div style="padding:10px 12px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:7px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;margin-bottom:3px">Total Billed</div>
        <div style="font-size:18px;font-weight:900;color:#0369a1">Rs.${grandTotalOrders.toFixed(2)}</div>
      </div>
      <div style="padding:10px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:7px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:3px">Total Received</div>
        <div style="font-size:18px;font-weight:900;color:#15803d">Rs.${grandTotalReceived.toFixed(2)}</div>
      </div>
      <div style="padding:10px 12px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:7px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:3px">Total Pending</div>
        <div style="font-size:18px;font-weight:900;color:#dc2626">Rs.${grandTotalPending.toFixed(2)}</div>
      </div>
      <div style="padding:10px 12px;background:#fefce8;border:1.5px solid #fde047;border-radius:7px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#a16207;text-transform:uppercase;margin-bottom:3px">Pending / Cleared</div>
        <div style="font-size:15px;font-weight:900;color:#a16207">${pendingCount} / ${clearedCount}</div>
      </div>
    </div>

    <!-- Customer Table -->
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead>
        <tr style="background:#1a1a1a;color:#fff">
          <th style="padding:8px 10px;text-align:left">#</th>
          <th style="padding:8px 10px;text-align:left">Customer</th>
          <th style="padding:8px 10px;text-align:left">Phone</th>
          <th style="padding:8px 10px;text-align:left">Account</th>
          <th style="padding:8px 10px;text-align:right">Total Billed</th>
          <th style="padding:8px 10px;text-align:right">Received</th>
          <th style="padding:8px 10px;text-align:right">Balance Due</th>
          <th style="padding:8px 10px;text-align:center">Status</th>
          <th style="padding:8px 10px;text-align:center">Last Payment</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
        <tr style="background:${i%2?'#f8f8f8':'#fff'};border-bottom:1px solid #e5e7eb">
          <td style="padding:7px 10px;color:#666">${i+1}</td>
          <td style="padding:7px 10px;font-weight:700">${r.name}</td>
          <td style="padding:7px 10px">${r.phone}</td>
          <td style="padding:7px 10px;font-family:monospace;font-size:10.5px">${r.acct}</td>
          <td style="padding:7px 10px;text-align:right">Rs.${r.totalOrders.toFixed(2)}</td>
          <td style="padding:7px 10px;text-align:right;color:#15803d;font-weight:700">Rs.${r.payments.toFixed(2)}</td>
          <td style="padding:7px 10px;text-align:right;font-weight:800;color:${r.balance>0?'#dc2626':'#15803d'}">Rs.${r.balance.toFixed(2)}</td>
          <td style="padding:7px 10px;text-align:center">
            <span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${r.balance<=0?'#dcfce7':'#fee2e2'};color:${r.balance<=0?'#15803d':'#dc2626'}">
              ${r.balance<=0?'✅ Cleared':'⚠ Pending'}
            </span>
          </td>
          <td style="padding:7px 10px;text-align:center;font-size:10.5px;color:#555">${r.lastPay}</td>
        </tr>`).join('')}
      </tbody>

      <!-- ═══ GRAND TOTALS FOOTER ═══ -->
      <tfoot>
        <tr style="background:#f1f5f9;border-top:2px solid #94a3b8">
          <td colspan="4" style="padding:9px 10px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em">Sub-Totals</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;color:#1e40af">Rs.${grandTotalOrders.toFixed(2)}</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;color:#15803d">Rs.${grandTotalReceived.toFixed(2)}</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;color:#dc2626">Rs.${grandTotalPending.toFixed(2)}</td>
          <td colspan="2"></td>
        </tr>
        <tr style="background:#1a1a1a;color:#fff">
          <td colspan="4" style="padding:11px 10px;font-size:13px;font-weight:900;letter-spacing:.03em">
            💰 TOTAL TO RECEIVE (Pending Collection)
          </td>
          <td colspan="2" style="padding:11px 10px;text-align:right;font-size:11px;color:#94a3b8">
            Received: Rs.${grandTotalReceived.toFixed(2)}
          </td>
          <td style="padding:11px 10px;text-align:right;font-size:18px;font-weight:900;color:#f87171">
            Rs.${grandTotalPending.toFixed(2)}
          </td>
          <td colspan="2" style="padding:11px 10px;text-align:center;font-size:11px;color:#94a3b8">
            ${pendingCount} account${pendingCount!==1?'s':''} pending
          </td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:12px;font-size:10px;color:#888;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between">
      <span>SmartRetail ERP — Customer Collection Report</span>
      <span>Printed: ${now} by ${currentUser?.full_name||'Admin'}</span>
    </div>
  </div>`;

  const pa = document.getElementById('print-area');
  pa.innerHTML = html;
  pa.style.display = 'block';
  window.print();
  setTimeout(() => { pa.style.display = 'none'; }, 1400);
}

function printUsernameCollection(username) {
  const rows = getUsernameCollectionRows(username);
  const grandTotal = rows.reduce((s,r)=>s+r.totalCollection,0);
  const grandPending = rows.reduce((s,r)=>s+r.pending,0);
  const html = `<div class="a4-doc">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
      <div><div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div>
      <div style="font-size:13px;font-weight:700;color:#555">Collection Sheet — Username: ${username}</div>
      <div style="font-size:11px;color:#888">${new Date().toLocaleDateString()}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>${['Customer','Account','Invoices','Total Bill','Tax','Disc.','Received','Pending'].map(h=>`<th style="padding:8px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
        <td style="padding:7px 8px;font-weight:700">${r.customerName}</td>
        <td style="padding:7px 8px;font-family:monospace">${r.accountNo}</td>
        <td style="padding:7px 8px;text-align:center">${r.invoiceCount}</td>
        <td style="padding:7px 8px;font-weight:700">Rs.${r.totalBill.toFixed(2)}</td>
        <td style="padding:7px 8px;color:#d97706">${r.taxAmt>0?'Rs.'+r.taxAmt.toFixed(2):'—'}</td>
        <td style="padding:7px 8px;color:#16a34a">${r.discAmt>0?'Rs.'+r.discAmt.toFixed(2):'—'}</td>
        <td style="padding:7px 8px;color:#16a34a;font-weight:700">Rs.${(r.received||0).toFixed(2)}</td>
        <td style="padding:7px 8px;color:${r.pending>0?'#dc2626':'#16a34a'};font-weight:800">Rs.${r.pending.toFixed(2)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#1a1a1a;color:#fff">
        <td colspan="3" style="padding:8px;font-weight:700">TOTALS</td>
        <td style="padding:8px;font-weight:900">Rs.${grandTotal.toFixed(2)}</td>
        <td colspan="2" style="padding:8px"></td>
        <td style="padding:8px;font-weight:900">Rs.${(grandTotal-grandPending).toFixed(2)}</td>
        <td style="padding:8px;font-weight:900;color:#ef4444">Rs.${grandPending.toFixed(2)}</td>
      </tr></tfoot>
    </table>
  </div>`;
  const pa=document.getElementById('print-area');
  pa.innerHTML=html; pa.style.display='block';
  window.print();
  setTimeout(()=>{ pa.style.display='none'; },1200);
}

function exportCollectionReport() {
  const rows=DB.customers.map(c=>{
    const bal=getCustomerBalance(c.id);
    return [c.name,c.phone||'',c.accountNo||'',bal.totalOrders.toFixed(2),bal.payments.toFixed(2),Math.max(0,bal.totalOrders-bal.payments).toFixed(2),getLastPaymentDate(c.id)];
  });
  const headers=['Customer','Phone','Account No','Total Orders','Payments Received','Balance Due','Last Payment'];
  const csv=[headers,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='collection-report-'+new Date().toISOString().split('T')[0]+'.csv';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Collection report exported!','success');
}

// ── Patch navigate() to handle collection page ────────
const _origNavigateV2 = window.navigate;
window.navigate = function(page) {
  if (_origNavigateV2) _origNavigateV2(page);
  if (page === 'collection') {
    const today = new Date().toISOString().split('T')[0];
    const dfEl = document.getElementById('col-date-from');
    const dtEl = document.getElementById('col-date-to');
    if (dfEl && !dfEl.value) dfEl.value = new Date(Date.now()-7*24*60*60*1000).toISOString().split('T')[0];
    if (dtEl && !dtEl.value) dtEl.value = today;
    renderCollection();
  }
};

// ── Inject all modals + collection page DOM ───────────
document.addEventListener('DOMContentLoaded', function() {

  // 1. Sale Slip Settings Modal
  const ssModal = document.createElement('div');
  ssModal.innerHTML = `
  <div class="modal-overlay" id="ss-settings-modal">
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--purple-glow);display:flex;align-items:center;justify-content:center;color:var(--purple)"><i class="fa fa-sliders-h"></i></div>
          <div>
            <div class="modal-title">Sale Slip Settings</div>
            <div style="font-size:11px;color:var(--text-muted)">Customize what prints on sale slips & displays in the list</div>
          </div>
        </div>
        <button class="modal-close" onclick="closeModal('ss-settings-modal')">✕</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${[
            ['showCustomerDetails','Customer Details','fa-user'],
            ['showTax','Sale Tax / GST','fa-percent'],
            ['showDiscount','Discount Amount','fa-tag'],
            ['showSubtotal','Subtotal Breakdown','fa-calculator'],
            ['showCartonPrice','Carton Price','fa-boxes'],
            ['showProfit','Profit Info','fa-chart-line'],
            ['showCompanyLogo','Company Logo / Header','fa-store'],
            ['showFooterNotes','Footer Notes','fa-sticky-note'],
            ['showBookedBy','Booked By (Username)','fa-user-tag'],
            ['showPaymentMethod','Payment Method','fa-credit-card'],
          ].map(([key, label, icon]) => makeSettingToggle(key, label, icon, ssSettings[key])).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('ss-settings-modal')">Cancel</button>
        <button class="btn btn-accent" onclick="saveSsSettings()"><i class="fa fa-save"></i> Save Settings</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ssModal.firstElementChild);

  // 2. Order Summary Settings Modal — fully rebuilt with working toggles
  const osModal = document.createElement('div');

  function _osToggleRow(key, label, icon) {
    const on = osSettings[key] !== false;
    return `<label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;cursor:pointer;border:1px solid var(--border);gap:8px"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
        <div style="width:28px;height:28px;flex-shrink:0;border-radius:6px;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:11px"><i class="fa ${icon}"></i></div>
        <span style="font-size:13px;font-weight:600">${label}</span>
      </div>
      <div style="position:relative;width:42px;height:24px;flex-shrink:0" onclick="event.preventDefault();osToggle('${key}',this)">
        <div class="os-toggle-bg" style="position:absolute;inset:0;border-radius:12px;background:${on?'var(--accent)':'var(--border)'};transition:background .2s;cursor:pointer"></div>
        <div class="os-toggle-dot" style="position:absolute;top:2px;left:${on?'20px':'2px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none"></div>
        <input type="checkbox" class="os-setting-check" data-key="${key}" ${on?'checked':''} style="opacity:0;width:0;height:0;position:absolute;pointer-events:none">
      </div>
    </label>`;
  }

  osModal.innerHTML = `
  <div class="modal-overlay" id="os-settings-modal">
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;color:var(--accent)"><i class="fa fa-sliders-h"></i></div>
          <div>
            <div class="modal-title">Order Summary Settings</div>
            <div style="font-size:11px;color:var(--text-muted)">Toggle which panels and columns are visible</div>
          </div>
        </div>
        <button class="modal-close" onclick="closeModal('os-settings-modal')">✕</button>
      </div>
      <div class="modal-body" style="max-height:72vh;overflow-y:auto">

        <!-- Section A: Financial KPI Cards -->
        <div style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i class="fa fa-chart-bar"></i> Financial Summary Cards (top strip)
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px">
          ${_osToggleRow('finShowOrders',   'Total Orders Card',   'fa-receipt')}
          ${_osToggleRow('finShowAmount',   'Total Amount Card',   'fa-dollar-sign')}
          ${_osToggleRow('finShowTax',      'Tax Card',            'fa-percent')}
          ${_osToggleRow('finShowDiscount', 'Discount Card',       'fa-tag')}
          ${_osToggleRow('finShowPending',  'Pending Balance Card','fa-clock')}
          ${_osToggleRow('finShowReceived', 'Received Card',       'fa-check-circle')}
        </div>

        <!-- Section B: Dispatch Table Columns -->
        <div style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i class="fa fa-table"></i> Dispatch Table Columns
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${_osToggleRow('showOrders',     'Orders Count Column',  'fa-receipt')}
          ${_osToggleRow('showPieces',     'Total Pieces Column',  'fa-cube')}
          ${_osToggleRow('showQty',        'Quantity Column',      'fa-hashtag')}
          ${_osToggleRow('showCartonPrice','Carton Price',         'fa-boxes')}
          ${_osToggleRow('showSubtotal',   'Subtotal Column',      'fa-dollar-sign')}
          ${_osToggleRow('showDiscount',   'Discount Column',      'fa-tag')}
          ${_osToggleRow('showTax',        'Tax / GST Column',     'fa-percent')}
          ${_osToggleRow('showProfitMargin','Profit Margin',       'fa-chart-line')}
          ${_osToggleRow('showSku',        'SKU Column',           'fa-barcode')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('os-settings-modal')">Cancel</button>
        <button class="btn btn-accent" onclick="saveOsSettings()"><i class="fa fa-save"></i> Save Settings</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(osModal.firstElementChild);

  // 3. Record Payment Modal
  const payModal = document.createElement('div');
  payModal.innerHTML = `
  <div class="modal-overlay" id="col-payment-modal">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-title">💳 Record Payment</div>
        <button class="modal-close" onclick="closeModal('col-payment-modal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="col-pay-cust-id">
        <div class="form-group-inline"><label>Customer</label><input class="form-input" id="col-pay-cust-name" readonly style="background:var(--bg-secondary)"></div>
        <div class="form-row">
          <div class="form-group-inline"><label>Outstanding Balance</label><input class="form-input" id="col-pay-outstanding" readonly style="background:var(--bg-secondary);color:var(--red);font-weight:700;font-family:var(--mono)"></div>
          <div class="form-group-inline"><label>Payment Amount *</label><input class="form-input" type="number" id="col-pay-amount" placeholder="0.00" step="0.01" min="0" oninput="calcColRemaining()"></div>
        </div>
        <div class="form-row">
          <div class="form-group-inline"><label>Payment Date</label><input class="form-input" type="date" id="col-pay-date"></div>
          <div class="form-group-inline"><label>Method</label>
            <select class="form-input" id="col-pay-method"><option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Online</option></select>
          </div>
        </div>
        <div class="form-group-inline"><label>Notes</label><input class="form-input" id="col-pay-notes" placeholder="Optional notes..."></div>
        <div style="background:var(--green-glow);border:1px solid rgba(16,185,129,.2);border-radius:8px;padding:10px;display:flex;justify-content:space-between;font-weight:700">
          <span>Remaining After Payment:</span>
          <span id="col-pay-remaining" style="color:var(--green);font-size:16px;font-family:var(--mono)">Rs.0.00</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('col-payment-modal')">Cancel</button>
        <button class="btn btn-green" onclick="saveCollectionPayment()"><i class="fa fa-check"></i> Record Payment</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(payModal.firstElementChild);

  // 4. Customer Collection Page
  const contentDiv = document.querySelector('.content');
  if (!contentDiv) return;
  const existingCol = document.getElementById('page-collection');
  if (existingCol) existingCol.remove(); // remove stale version if re-init
  const colPage = document.createElement('div');
  colPage.className = 'page'; colPage.id = 'page-collection';
  colPage.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Customer Collection</h2>
        <p>Track payments, balances, and collection activity by customer or username</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-ghost btn-sm" onclick="exportCollectionReport()"><i class="fa fa-file-csv"></i> Export CSV</button>
        <button class="btn btn-warning btn-sm" onclick="printTodaysCollectionSheet()"><i class="fa fa-hand-holding-usd"></i> Today's Collection Sheet</button>
        <button class="btn btn-accent btn-sm" onclick="printCollectionReport()"><i class="fa fa-print"></i> Print Report</button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card blue"><div class="stat-header"><div class="stat-icon blue"><i class="fa fa-users"></i></div></div><div class="stat-value" id="col-total-customers">0</div><div class="stat-label">Total Accounts</div></div>
      <div class="stat-card red"><div class="stat-header"><div class="stat-icon red"><i class="fa fa-exclamation-circle"></i></div></div><div class="stat-value" id="col-total-pending">Rs.0</div><div class="stat-label">Total Pending</div></div>
      <div class="stat-card green"><div class="stat-header"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value" id="col-total-received">Rs.0</div><div class="stat-label">Received Today</div></div>
      <div class="stat-card yellow"><div class="stat-header"><div class="stat-icon yellow"><i class="fa fa-clock"></i></div></div><div class="stat-value" id="col-overdue-count">0</div><div class="stat-label">Overdue Accounts</div></div>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:14px 20px">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group-inline" style="margin-bottom:0;flex:1;min-width:160px">
            <label>Search Customer</label>
            <div class="search-bar"><i class="fa fa-search"></i>
              <input type="text" id="col-search" placeholder="Name, phone, account..." oninput="renderCollection()" style="font-size:13px">
            </div>
          </div>
          <div class="form-group-inline" style="margin-bottom:0;min-width:180px">
            <label><i class="fa fa-user-tag" style="color:var(--accent)"></i> Filter by Username</label>
            <div class="search-bar"><i class="fa fa-user-tag"></i>
              <input type="text" id="col-username-filter" placeholder="e.g. admin, salesman1..." oninput="renderCollection()" style="font-size:13px">
            </div>
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>View Mode</label>
            <select class="form-input" id="col-view-mode" onchange="renderCollection()" style="padding:9px 12px;width:160px">
              <option value="customer">By Customer</option>
              <option value="username">By Username</option>
            </select>
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Date From</label>
            <input class="form-input" type="date" id="col-date-from" style="padding:9px 12px" onchange="renderCollection()">
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Date To</label>
            <input class="form-input" type="date" id="col-date-to" style="padding:9px 12px" onchange="renderCollection()">
          </div>
          <div class="form-group-inline" style="margin-bottom:0">
            <label>Balance Filter</label>
            <select class="form-input" id="col-balance-filter" onchange="renderCollection()" style="padding:9px 12px;width:150px">
              <option value="">All</option>
              <option value="pending">Has Pending</option>
              <option value="clear">Cleared</option>
              <option value="overdue">Overdue (&gt;30d)</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="clearCollectionFilters()"><i class="fa fa-times"></i> Clear</button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Collection Ledger</div>
        <div style="font-size:12px;color:var(--text-secondary)" id="col-count-label">— accounts</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead id="col-thead">
            <tr><th>Customer</th><th>Account No.</th><th>Prev. Balance</th><th>Today's Orders</th><th>Total Pending</th><th>Received</th><th>Remaining</th><th>Last Payment</th><th>Actions</th></tr>
          </thead>
          <tbody id="collection-tbody"></tbody>
        </table>
      </div>
    </div>`;
  contentDiv.appendChild(colPage);

  // 5. Inject enhanced CSS
  const style = document.createElement('style');
  style.textContent = `
    /* ── Smooth page transitions ── */
    .page.active { animation: pageSlideIn .28s cubic-bezier(.4,0,.2,1); }
    @keyframes pageSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
    /* ── Nav hover ── */
    .nav-item { transition: all .18s cubic-bezier(.4,0,.2,1); }
    .nav-item:hover { transform: translateX(2px); }
    .nav-item i { transition: transform .18s; }
    .nav-item:hover i, .nav-item.active i { transform: scale(1.15); }
    /* ── Stat card hover ── */
    .stat-card { transition: all .2s cubic-bezier(.4,0,.2,1); }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,.45); }
    /* ── Button effects ── */
    .btn { transition: all .15s cubic-bezier(.4,0,.2,1); }
    .btn-accent:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(59,130,246,.35); }
    .btn-green:hover  { transform:translateY(-1px); box-shadow:0 4px 16px rgba(16,185,129,.35); }
    .btn-ghost:hover  { transform:translateY(-1px); }
    /* ── Table row hover ── */
    tr:hover td { background: var(--bg-card-hover) !important; transition: background .12s; }
    /* ── Modal spring entrance ── */
    .modal { animation: modalIn .25s cubic-bezier(.34,1.56,.64,1); }
    @keyframes modalIn { from { opacity:0; transform:scale(.94) translateY(8px); } to { opacity:1; transform:none; } }
    /* ── Search bar focus glow ── */
    .search-bar:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }
    /* ── Auto-tax row highlight in booking ── */
    #bk-auto-tax-row { transition: opacity .2s; }
    /* ── Booking items tax badge ── */
    #bk-items-tbody span[title="Auto tax from product"] { animation: taxBadgePop .3s cubic-bezier(.34,1.56,.64,1); }
    @keyframes taxBadgePop { from { transform:scale(0); } to { transform:scale(1); } }
    /* ── Product pricing summary gradient border ── */
    #prod-pricing-summary { background: linear-gradient(var(--bg-secondary),var(--bg-secondary)) padding-box, linear-gradient(135deg,var(--accent),var(--purple)) border-box; border:1px solid transparent; }
    /* ── Collection page accent ── */
    #page-collection .stat-card.blue  { border-left:3px solid var(--accent); }
    #page-collection .stat-card.green { border-left:3px solid var(--green); }
    #page-collection .stat-card.red   { border-left:3px solid var(--red); }
    #page-collection .stat-card.yellow{ border-left:3px solid var(--yellow); }
    /* ── Sale slip action buttons ── */
    #saleslips-tbody .btn-xs { border-radius:6px; transition:all .15s; }
    #saleslips-tbody .btn-xs:hover { transform:scale(1.08); }
    /* ── Adj type tiles ── */
    .adj-type-tile { user-select:none; }
    .adj-type-tile:hover { transform:scale(1.03) !important; }
    /* ── OS Financial KPI strip responsive ── */
    @media (max-width:1199px) {
      #os-financial-kpis { grid-template-columns: repeat(3,1fr); }
    }
    @media (max-width:767px) {
      #os-financial-kpis { grid-template-columns: repeat(2,1fr); }
      .os-fin-card { padding:10px 12px !important; }
      .os-fin-card > div:last-child { font-size:17px !important; }
    }
    @media (max-width:480px) {
      #os-financial-kpis { grid-template-columns: 1fr; }
    }
    /* ── Stock adjust search drop ── */
    #adj-search-drop::-webkit-scrollbar { width:4px; }
    #adj-search-drop::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
    /* ── CNIC input monospace highlight ── */
    #cust-cnic:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow); }
    #cust-cnic.cnic-valid   { border-color:var(--green)!important; }
    #cust-cnic.cnic-invalid { border-color:var(--red)!important; }
    /* ── Customer table CNIC column ── */
    #customers-table td:nth-child(5) { font-family:var(--mono); font-size:11px; letter-spacing:.03em; }
    /* ── OS username filter dropdown ── */
    #os-username-filter option { background:var(--bg-card); color:var(--text-primary); }
    /* ── Adj product card animation ── */
    #adj-product-card { animation:slideDown .2s cubic-bezier(.4,0,.2,1); }
    @keyframes slideDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
    /* ── OS fin card hover ── */
    .os-fin-card { transition:transform .15s,box-shadow .15s; }
    .os-fin-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.3); }
    /* ── Responsive customer modal ── */
    @media (max-width:600px) {
      #customer-modal .form-row { flex-direction:column; }
      #adj-product-card > div:last-child { grid-template-columns:1fr 1fr; }
    }
      #page-collection .table-wrap { overflow-x:auto; }
      #page-collection .stat-grid  { grid-template-columns:repeat(2,1fr); }
      .page-header { flex-direction:column; align-items:flex-start; gap:10px; }
      .page-header-actions { flex-wrap:wrap; }
    }
    @media (max-width:480px) {
      #page-collection .stat-grid { grid-template-columns:1fr; }
      .modal { width:calc(100vw - 24px); max-width:100% !important; }
    }
  `;
  document.head.appendChild(style);
});
// NOTE: Two legacy IIFE patches that used to re-override renderSaleSlips/
// viewSlipDetail/downloadSlipInvoice with stale DB.orderBookings-based logic
// were removed here — the real implementations above (using _slipsCache /
// SalesAPI) are now the only definitions, so they're no longer clobbered.
window.clearSaleSlipsFilters = function() {
  ['ss-date','ss-status','ss-name','ss-area','ss-invoice','ss-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderSaleSlips();
};

// ═══════════════════════════════════════════════════════
// SALE RETURN MODULE
// ═══════════════════════════════════════════════════════
let _srCurrentBooking = null;

let _srInvoiceCache = [];

async function renderSaleReturn() {
  await searchSaleReturnInvoice();
  await renderSaleReturnHistory();
}

async function searchSaleReturnInvoice() {
  const invQ   = (document.getElementById('sr-invoice-search')?.value||'').trim();
  const custQ  = (document.getElementById('sr-cust-search')?.value||'').trim();
  const fromD  = document.getElementById('sr-date-from')?.value||'';
  const toD    = document.getElementById('sr-date-to')?.value||'';
  const tbody  = document.getElementById('sr-invoice-tbody');
  const label  = document.getElementById('sr-results-count');
  if (!tbody) return;

  if (!invQ && !custQ && !fromD && !toD) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa fa-search" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      Enter an invoice number, customer name, or select a date range to find invoices
    </td></tr>`;
    if (label) label.textContent = 'Enter filters to search';
    return;
  }

  const params = {};
  if (invQ) params.search = invQ;
  else if (custQ) params.search = custQ;
  const data = await SalesAPI.list(params);
  let results = data.results || data;
  if (fromD) results = results.filter(s => (s.created_at||'') >= fromD);
  if (toD) results = results.filter(s => (s.created_at||'') <= toD + 'T23:59:59');
  results = results.slice(0, 50);
  _srInvoiceCache = results;

  if (label) label.textContent = results.length + ' invoice' + (results.length!==1?'s':'') + ' found';

  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-muted)">
      <i class="fa fa-file-invoice" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      No invoices match your search
    </td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(b => {
    const alreadyReturned = ['returned','partially_returned'].includes(b.status);
    const statusClass = b.status==='completed'?'badge-green':b.status==='cancelled'?'badge-red':'badge-yellow';
    return `<tr>
      <td class="td-mono" style="font-weight:700">${b.invoice_number}</td>
      <td style="font-size:12px">${(b.created_at||'').slice(0,10)}</td>
      <td style="font-weight:600">${b.customer_name||'Walk-in'}</td>
      <td class="td-mono" style="font-size:11px">—</td>
      <td style="text-align:center">${b.items?.length||0}</td>
      <td class="td-mono fw-700">Rs.${Number(b.total_amount).toFixed(2)}</td>
      <td class="td-mono" style="color:var(--yellow)">${Number(b.tax_amount)>0?'Rs.'+Number(b.tax_amount).toFixed(2):'—'}</td>
      <td class="td-mono" style="color:var(--green)">${Number(b.discount_amount)>0?'Rs.'+Number(b.discount_amount).toFixed(2):'—'}</td>
      <td><span class="badge ${statusClass}">${b.status.replace(/_/g,' ')}</span>
          ${alreadyReturned?'<span class="badge badge-red" style="margin-left:4px">Returned</span>':''}</td>
      <td>
        <button class="btn btn-sm" style="background:var(--red);color:#fff;font-size:11px"
          onclick="openSaleReturnModal(${b.id})">
          <i class="fa fa-undo-alt"></i> Return
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function openSaleReturnModal(saleId) {
  const b = await SalesAPI.get(saleId);
  _srCurrentBooking = b;

  document.getElementById('sr-modal-invoice-label').textContent = 'Invoice: ' + b.invoice_number + ' — ' + (b.customer_name||'Walk-in');
  document.getElementById('sr-inv-no').textContent    = b.invoice_number;
  document.getElementById('sr-inv-cust').textContent  = b.customer_name||'Walk-in';
  document.getElementById('sr-inv-date').textContent  = (b.created_at||'').replace('T',' ').slice(0,16);
  document.getElementById('sr-inv-total').textContent = 'Rs.' + Number(b.total_amount).toFixed(2);
  document.getElementById('sr-reason').value          = 'Defective Product';
  document.getElementById('sr-notes').value           = '';
  document.getElementById('sr-refund-total').textContent     = 'Rs.0.00';
  document.getElementById('sr-return-items-count').textContent = '0 items selected';

  // Build item rows — quantity_pending = quantity - quantity_returned (already-returned items are excluded)
  const tbody = document.getElementById('sr-items-tbody');
  tbody.innerHTML = (b.items||[]).map((it,i) => {
    const pending = it.quantity - (it.quantity_returned||0);
    const unitPrice = Number(it.unit_price);
    return `<tr>
      <td style="padding:6px 10px;text-align:center">
        <input type="checkbox" class="sr-item-check" data-idx="${i}" data-sale-item-id="${it.id}" onchange="srCalcRefund()" ${pending<=0?'disabled':''}>
      </td>
      <td style="padding:6px 10px;font-weight:600">📦 ${it.product_name}${pending<=0?' <span class="badge badge-red" style="font-size:9px">Fully Returned</span>':''}</td>
      <td style="padding:6px 10px;text-align:center;color:var(--cyan);font-weight:700">${pending}</td>
      <td style="padding:6px 10px">
        <input type="number" class="form-input sr-return-qty" data-idx="${i}" data-max="${pending}" data-price="${unitPrice}"
          value="0" min="0" max="${pending}" style="width:70px;padding:5px 8px;font-size:12px" ${pending<=0?'disabled':''}
          oninput="srValidateQty(this);srCalcRefund()">
      </td>
      <td style="padding:6px 10px;text-align:right;color:var(--text-secondary);font-family:var(--mono)">Rs.${unitPrice.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:var(--red);font-family:var(--mono)" id="sr-item-refund-${i}">Rs.0.00</td>
    </tr>`;
  }).join('');

  openModal('sr-process-modal');
}

function srToggleAll(checked) {
  document.querySelectorAll('.sr-item-check').forEach(cb => {
    cb.checked = checked;
    const i = cb.dataset.idx;
    const qtyEl = document.querySelector(`.sr-return-qty[data-idx="${i}"]`);
    if (qtyEl) qtyEl.value = checked ? qtyEl.dataset.max : 0;
  });
  srCalcRefund();
}

function srValidateQty(el) {
  const max = parseInt(el.dataset.max)||0;
  let val = parseInt(el.value)||0;
  if (val < 0) val = 0;
  if (val > max) val = max;
  el.value = val;
  // Auto-check the checkbox if qty > 0
  const i = el.dataset.idx;
  const cb = document.querySelector(`.sr-item-check[data-idx="${i}"]`);
  if (cb) cb.checked = val > 0;
}

function srCalcRefund() {
  let totalRefund = 0;
  let itemsSelected = 0;
  document.querySelectorAll('.sr-return-qty').forEach(el => {
    const i = el.dataset.idx;
    const qty = parseInt(el.value)||0;
    const price = parseFloat(el.dataset.price)||0;
    const refund = qty * price;
    const refundEl = document.getElementById('sr-item-refund-'+i);
    if (refundEl) refundEl.textContent = 'Rs.' + refund.toFixed(2);
    if (qty > 0) { totalRefund += refund; itemsSelected++; }
  });
  document.getElementById('sr-refund-total').textContent = 'Rs.' + totalRefund.toFixed(2);
  document.getElementById('sr-return-items-count').textContent = itemsSelected + ' item' + (itemsSelected!==1?'s':'') + ' selected';
}

let _srHistoryCache = [];

async function saveSaleReturn() {
  if (!_srCurrentBooking) return;
  const returnItems = [];
  document.querySelectorAll('.sr-return-qty').forEach((el) => {
    const qty = parseInt(el.value)||0;
    if (qty > 0) {
      const saleItemId = parseInt(el.closest('tr').querySelector('.sr-item-check').dataset.saleItemId);
      returnItems.push({ sale_item: saleItemId, quantity: qty });
    }
  });
  if (!returnItems.length) { toast('Select at least one item to return!','error'); return; }
  const reason = document.getElementById('sr-reason').value;
  const notes  = document.getElementById('sr-notes').value;

  try {
    const saleReturn = await SalesAPI.processReturn(_srCurrentBooking.id, {
      items: returnItems, reason: notes ? `${reason} — ${notes}` : reason,
    });
    // The return is saved as of this point — everything below is just
    // refreshing what's on screen. A glitch in either refresh call must
    // never again be allowed to look like the return itself didn't save.
    closeModal('sr-process-modal');
    toast(`Return processed — Refund: Rs.${Number(saleReturn.refund_amount).toFixed(2)}`, 'success');
    try { await renderSaleReturnHistory(); } catch (e) { console.error('Failed to refresh return history list', e); }
    try { await searchSaleReturnInvoice(); } catch (e) { console.error('Failed to refresh invoice search results', e); }
  } catch (err) {
    toast(err.message || 'Failed to process return', 'error');
  }
}

async function renderSaleReturnHistory() {
  const tbody = document.getElementById('sr-history-tbody');
  const label = document.getElementById('sr-history-count');
  if (!tbody) return;
  const data = await SalesAPI.returnHistory({ ordering: '-created_at' });
  const returns = data.results || data;
  _srHistoryCache = returns;
  if (label) label.textContent = returns.length + ' return' + (returns.length!==1?'s':'');
  if (!returns.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">No returns processed yet</td></tr>`;
    return;
  }
  tbody.innerHTML = returns.map(r => `<tr>
    <td class="td-mono" style="font-weight:700;color:var(--red)">SR-${String(r.id).padStart(4,'0')}</td>
    <td style="font-size:12px">${(r.created_at||'').slice(0,10)}</td>
    <td class="td-mono">${r.sale}</td>
    <td style="font-weight:600">—</td>
    <td style="text-align:center">${r.items.length} item(s)</td>
    <td class="td-mono fw-700" style="color:var(--red)">Rs.${Number(r.refund_amount).toFixed(2)}</td>
    <td style="font-size:11px">${r.reason||'—'}</td>
    <td style="font-size:11px;color:var(--text-muted)">${r.processed_by||'—'}</td>
  </tr>`).join('');
}

function clearSrFilters() {
  ['sr-invoice-search','sr-cust-search','sr-date-from','sr-date-to'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  searchSaleReturnInvoice();
}

function printSaleReturnReport() {
  const returns = _srHistoryCache||[];
  const totalVal = returns.reduce((s,r)=>s+Number(r.refund_amount),0);
  const html = `<div class="a4-doc"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div><div style="font-size:12px;color:#555">Sale Return Report — ${new Date().toLocaleDateString()}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${['Return ID','Date','Invoice','Items','Refund','Reason'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${returns.map((r,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700;color:#dc2626">SR-${String(r.id).padStart(4,'0')}</td>
      <td style="padding:6px 8px">${(r.created_at||'').slice(0,10)}</td>
      <td style="padding:6px 8px;font-family:monospace">${r.sale}</td>
      <td style="padding:6px 8px">${r.items.length}</td>
      <td style="padding:6px 8px;font-weight:800;color:#dc2626">Rs.${Number(r.refund_amount).toFixed(2)}</td>
      <td style="padding:6px 8px">${r.reason||''}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="4" style="padding:8px;font-weight:700">TOTAL REFUNDS</td><td colspan="2" style="padding:8px;font-weight:900;font-size:14px">Rs.${totalVal.toFixed(2)}</td></tr></tfoot>
  </table></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}

async function exportSaleReturns() {
  await ReportsAPI.download('sales', 'csv', {}); // full sales report export covers returned invoices too
  toast('Exported!','success');
}

// ═══════════════════════════════════════════════════════
// PURCHASE RETURN MODULE
// ═══════════════════════════════════════════════════════

let _prSelectedPo = null;

async function openPurchaseReturnModal(poId) {
  const supSel = document.getElementById('pr-supplier');
  if (supSel) {
    const supData = await SuppliersAPI.list({ page_size: 500 });
    const suppliers = supData.results || supData;
    supSel.innerHTML = '<option value="">— Select Supplier —</option>' +
      suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  document.getElementById('pr-date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('pr-notes').value  = '';
  document.getElementById('pr-po-select').innerHTML = '<option value="">— Select PO —</option>';
  _prSelectedPo = null;
  document.getElementById('pr-items-list').innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">Select a supplier, then a purchase order, to see its received items.</div>';

  if (poId) {
    const po = await PurchaseAPI.get(poId);
    if (supSel) supSel.value = po.supplier;
    await prLoadPurchases();
    document.getElementById('pr-po-select').value = poId;
    await prLoadPoItems();
  }
  openModal('pr-modal');
}

async function prLoadPurchases() {
  const supId = parseInt(document.getElementById('pr-supplier').value)||0;
  const poSel = document.getElementById('pr-po-select');
  const data = await PurchaseAPI.list(supId ? { supplier: supId } : {});
  const pos = (data.results || data).filter(p => ['received','partially_received'].includes(p.status));
  poSel.innerHTML = '<option value="">— Select PO —</option>' +
    pos.map(p=>`<option value="${p.id}">${p.po_number} — ${(p.created_at||'').slice(0,10)} (Rs.${Number(p.total_amount).toFixed(2)})</option>`).join('');
}

async function prLoadPoItems() {
  const poId = parseInt(document.getElementById('pr-po-select').value)||0;
  const el = document.getElementById('pr-items-list');
  if (!poId) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">Select a PO to see its received items.</div>'; return; }
  const po = await PurchaseAPI.get(poId);
  _prSelectedPo = po;

  const receivedItems = po.items.filter(i => i.quantity_received > 0);
  if (!receivedItems.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px">This PO has no received quantity yet — nothing to return.</div>';
    return;
  }
  el.innerHTML = receivedItems.map((item) => `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <input type="checkbox" class="pr-item-check" data-po-item-id="${item.id}" onchange="prCalcTotal()">
      <div style="flex:2;min-width:160px;font-weight:600">📦 ${item.product_name}
        <div style="font-size:10px;color:var(--text-muted)">Received: ${item.quantity_received} @ Rs.${Number(item.unit_cost).toFixed(2)}</div>
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:90px">
        <label>Return Qty</label>
        <input class="form-input pr-return-qty" type="number" value="0" min="0" max="${item.quantity_received}"
          data-po-item-id="${item.id}" data-price="${item.unit_cost}" style="padding:9px 12px"
          oninput="prCalcTotal()">
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:100px">
        <label>Line Total</label>
        <div class="pr-line-total" data-po-item-id="${item.id}" style="padding:9px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;font-weight:700;font-family:var(--mono);font-size:12px;color:var(--yellow)">Rs.0.00</div>
      </div>
    </div>`).join('');
  prCalcTotal();
}

function prCalcTotal() {
  let total = 0;
  document.querySelectorAll('.pr-return-qty').forEach(el => {
    const qty = parseInt(el.value)||0;
    const price = parseFloat(el.dataset.price)||0;
    const lineTotal = qty * price;
    const totalEl = document.querySelector(`.pr-line-total[data-po-item-id="${el.dataset.poItemId}"]`);
    if (totalEl) totalEl.textContent = 'Rs.'+lineTotal.toFixed(2);
    total += lineTotal;
  });
  const tv = document.getElementById('pr-total-val');
  if (tv) tv.textContent = 'Rs.'+total.toFixed(2);
}

async function savePurchaseReturn() {
  if (!_prSelectedPo) { toast('Please select a purchase order!','error'); return; }
  const returnItems = [];
  document.querySelectorAll('.pr-return-qty').forEach(el => {
    const qty = parseInt(el.value)||0;
    if (qty > 0) returnItems.push({ purchase_order_item: parseInt(el.dataset.poItemId), quantity: qty });
  });
  if (!returnItems.length) { toast('Enter a return quantity for at least one item!','error'); return; }
  const reason = document.getElementById('pr-reason').value;
  const notes  = document.getElementById('pr-notes').value;

  try {
    const result = await PurchaseAPI.processReturn(_prSelectedPo.id, {
      items: returnItems, reason: notes ? `${reason} — ${notes}` : reason,
    });
    // The return is saved as of this point — the list refresh below is just
    // updating what's on screen, and must never mask a successful save.
    closeModal('pr-modal');
    toast(`Purchase Return saved — Rs.${Number(result.refund_amount).toFixed(2)} credited from ${result.supplier_name}`, 'success');
    try { await renderPurchaseReturns(); } catch (e) { console.error('Failed to refresh purchase return list', e); }
  } catch (err) {
    toast(err.message || 'Failed to process return', 'error');
  }
}

let _prHistoryCache = [];

async function renderPurchaseReturns() {
  const q      = (document.getElementById('pr-search')?.value||'').toLowerCase();
  const fromD  = document.getElementById('pr-date-from')?.value||'';
  const toD    = document.getElementById('pr-date-to')?.value||'';
  const tbody  = document.getElementById('pr-tbody');
  const label  = document.getElementById('pr-count-label');
  if (!tbody) return;

  const data = await PurchaseAPI.returnHistory({ ordering: '-created_at' });
  const allRet = data.results || data;
  _prHistoryCache = allRet;

  let rows = allRet.filter(r=>{
    const dateOnly = (r.created_at||'').slice(0,10);
    if (fromD && dateOnly < fromD) return false;
    if (toD   && dateOnly > toD)   return false;
    if (q && !(r.po_number||'').toLowerCase().includes(q) &&
             !(r.supplier_name||'').toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('pr-total-returns').textContent = allRet.length;
  document.getElementById('pr-total-items').textContent   = allRet.reduce((s,r)=>s+r.items.reduce((a,i)=>a+i.quantity,0),0);
  document.getElementById('pr-total-value').textContent   = 'Rs.'+(allRet.reduce((s,r)=>s+Number(r.refund_amount),0)).toFixed(0);
  document.getElementById('pr-suppliers-count').textContent = new Set(allRet.map(r=>r.supplier_name)).size;

  if (label) label.textContent = rows.length + ' record' + (rows.length!==1?'s':'');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa fa-truck-loading" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      No purchase returns recorded yet
    </td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`<tr>
    <td class="td-mono fw-700" style="color:var(--yellow)">PR-${String(r.id).padStart(4,'0')}</td>
    <td style="font-size:12px">${(r.created_at||'').slice(0,10)}</td>
    <td class="td-mono">${r.po_number}</td>
    <td style="font-weight:600">${r.supplier_name}</td>
    <td style="font-size:11px">${r.items.length} item(s)</td>
    <td style="text-align:center;font-weight:700">${r.items.reduce((s,i)=>s+i.quantity,0)}</td>
    <td class="td-mono fw-700" style="color:var(--yellow)">Rs.${Number(r.refund_amount).toFixed(2)}</td>
    <td style="font-size:11px">${r.reason||'—'}</td>
    <td><span class="badge badge-yellow">${r.status}</span></td>
    <td>
      <button class="btn btn-ghost btn-xs" onclick="printPurchaseReturnSlip(${r.id})" title="Print"><i class="fa fa-print"></i></button>
    </td>
  </tr>`).join('');
}

function clearPrFilters() {
  ['pr-search','pr-date-from','pr-date-to'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  renderPurchaseReturns();
}

function printPurchaseReturnSlip(id) {
  const r = (_prHistoryCache||[]).find(x=>x.id===id);
  if (!r) return;
  const dateStr = (r.created_at||'').slice(0,10);
  const html=`<div class="a4-doc"><div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div>
    <div style="font-size:14px;font-weight:700">Purchase Return — PR-${String(r.id).padStart(4,'0')}</div>
    <div style="font-size:11px;color:#555">Date: ${dateStr} | Supplier: ${r.supplier_name} | PO: ${r.po_number}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
    <thead><tr>${['Item','Qty','Refund'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${r.items.map((it,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700">Item #${it.purchase_order_item}</td>
      <td style="padding:6px 8px;text-align:center">${it.quantity}</td>
      <td style="padding:6px 8px;font-weight:800">Rs.${Number(it.refund_amount).toFixed(2)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="2" style="padding:8px;font-weight:700">TOTAL RETURN VALUE</td><td style="padding:8px;font-weight:900;font-size:14px">Rs.${Number(r.refund_amount).toFixed(2)}</td></tr></tfoot>
  </table>
  <div style="font-size:12px;color:#555">Reason: ${r.reason||'—'}</div>
  <div style="font-size:11px;color:#888;margin-top:8px">Processed on ${dateStr}</div></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}

function printPurchaseReturnReport() {
  const rows = _prHistoryCache||[];
  const total = rows.reduce((s,r)=>s+Number(r.refund_amount),0);
  const html=`<div class="a4-doc"><div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div>
    <div style="font-size:12px;color:#555">Purchase Return Report — ${new Date().toLocaleDateString()}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${['Return ID','Date','PO Ref','Supplier','Items','Total','Reason'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700;color:#d97706">PR-${String(r.id).padStart(4,'0')}</td>
      <td style="padding:6px 8px">${(r.created_at||'').slice(0,10)}</td>
      <td style="padding:6px 8px;font-family:monospace">${r.po_number}</td>
      <td style="padding:6px 8px;font-weight:700">${r.supplier_name}</td>
      <td style="padding:6px 8px">${r.items.length}</td>
      <td style="padding:6px 8px;font-weight:800;color:#d97706">Rs.${Number(r.refund_amount).toFixed(2)}</td>
      <td style="padding:6px 8px">${r.reason||''}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="5" style="padding:8px;font-weight:700">TOTAL</td><td colspan="2" style="padding:8px;font-weight:900;font-size:14px">Rs.${total.toFixed(2)}</td></tr></tfoot>
  </table></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}