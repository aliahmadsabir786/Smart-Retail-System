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
function renderDashboard() {
  const totalRevenue = DB.orders.filter(o=>o.status==='Completed').reduce((a,o)=>a+o.total,0);
  const todayRevenue = totalRevenue + 4285;
  document.getElementById('d-revenue').textContent = '$' + todayRevenue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('d-orders').textContent = DB.orders.length + 127;
  document.getElementById('d-customers').textContent = DB.customers.length + 840;
  const lowStock = DB.products.filter(p => p.stock <= p.minStock).length;
  document.getElementById('d-lowstock').textContent = lowStock;

  // Recent transactions
  const tbody = document.getElementById('recent-tx');
  const recent = [...DB.orders].reverse().slice(0,6);
  const sampleTx = [
    { inv: 'INV-0042', cust: 'Ahmed Hassan', items: 5, amt: 45.50, method: 'Cash', status: 'Completed' },
    { inv: 'INV-0041', cust: 'Walk-in', items: 2, amt: 12.00, method: 'Card', status: 'Completed' },
    { inv: 'INV-0040', cust: 'Sarah Williams', items: 8, amt: 89.25, method: 'Digital', status: 'Completed' },
    { inv: 'INV-0039', cust: 'Walk-in', items: 1, amt: 3.50, method: 'Cash', status: 'Completed' },
    { inv: 'INV-0038', cust: 'Muhammad Ali', items: 12, amt: 156.80, method: 'Card', status: 'Completed' },
  ];
  const allTx = [...recent.map(o => ({
    inv: o.invoice, cust: o.customer || 'Walk-in', items: o.items.length, amt: o.total,
    method: o.paymentMethod, status: o.status
  })), ...sampleTx].slice(0,6);
  tbody.innerHTML = allTx.map(t => `
    <tr>
      <td class="td-mono">${t.inv}</td>
      <td>${t.cust}</td>
      <td>${t.items}</td>
      <td class="fw-700 text-green">$${t.amt.toFixed(2)}</td>
      <td><span class="badge badge-blue">${t.method}</span></td>
      <td><span class="badge badge-green">${t.status}</span></td>
    </tr>`).join('');

  // Top products
  const tp = document.getElementById('top-products-list');
  const topProds = [
    { name: 'Coca-Cola 330ml', sold: 245, rev: 306.25, pct: 100 },
    { name: 'Lays Classic Chips', sold: 189, rev: 378.00, pct: 77 },
    { name: 'White Bread Loaf', sold: 156, rev: 390.00, pct: 64 },
    { name: 'Dove Soap 100g', sold: 134, rev: 201.00, pct: 55 },
    { name: 'Orange Juice 1L', sold: 98, rev: 313.60, pct: 40 },
  ];
  tp.innerHTML = topProds.map(p => `
    <div style="margin-bottom:14px">
      <div class="flex-between" style="margin-bottom:5px">
        <span style="font-size:13px;font-weight:600">${p.name}</span>
        <span style="font-size:12px;color:var(--text-secondary)">${p.sold} units · $${p.rev}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${p.pct}%;background:var(--accent)"></div>
      </div>
    </div>`).join('');

  // Low stock table
  const lstBody = document.getElementById('low-stock-table');
  const lowStockItems = DB.products.filter(p => p.stock <= p.minStock);
  lstBody.innerHTML = lowStockItems.map(p => {
    const statusColor = p.stock === 0 ? 'red' : p.stock <= p.minStock/2 ? 'red' : 'yellow';
    const statusText = p.stock === 0 ? 'Out of Stock' : 'Low Stock';
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:20px">${p.icon||'📦'}</span><strong>${p.name}</strong></div></td>
      <td class="td-mono">${p.sku}</td>
      <td>${p.category}</td>
      <td><strong class="text-${statusColor}">${p.stock}</strong></td>
      <td>${p.minStock}</td>
      <td><span class="badge badge-${statusColor}">${statusText}</span></td>
      <td><button class="btn btn-accent btn-xs" onclick="openStockModal(${p.id})">Restock</button></td>
    </tr>`;
  }).join('');

  renderCharts();
}

function renderCharts() {
  // Sales chart
  if (charts.sales) charts.sales.destroy();
  const sc = document.getElementById('salesChart');
  if (sc) {
    charts.sales = new Chart(sc, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Revenue ($)',
          data: [3200, 4100, 2800, 5200, 4800, 6100, 4285],
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: 'rgba(59,130,246,1)',
          borderWidth: 2, borderRadius: 6,
        },{
          label: 'Orders',
          data: [98, 120, 85, 155, 142, 188, 127],
          backgroundColor: 'rgba(16,185,129,0.5)',
          borderColor: 'rgba(16,185,129,1)',
          borderWidth: 2, borderRadius: 6,
          yAxisID: 'y1',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: '#1e2535' }, ticks: { color: '#8892a4' } },
          y: { grid: { color: '#1e2535' }, ticks: { color: '#8892a4' } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#8892a4' } },
        }
      }
    });
  }

  // Category donut
  if (charts.cat) charts.cat.destroy();
  const cc = document.getElementById('categoryChart');
  if (cc) {
    charts.cat = new Chart(cc, {
      type: 'doughnut',
      data: {
        labels: ['Beverages','Snacks','Dairy','Bakery','Personal Care','Other'],
        datasets: [{ data: [32,24,18,14,8,4], backgroundColor: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444'], borderWidth: 0, hoverOffset: 6 }]
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

function populatePosCategories() {
  const sel = document.getElementById('pos-category');
  sel.innerHTML = '<option value="">All Categories</option>' + DB.categories.map(c => `<option>${c}</option>`).join('');
}

function filterPosProducts() { renderPosProducts(); }

function renderPosProducts() {
  const q = (document.getElementById('pos-search').value || '').toLowerCase();
  const cat = document.getElementById('pos-category').value;
  const grid = document.getElementById('pos-product-grid');
  const prods = DB.products.filter(p =>
    (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)) &&
    (!cat || p.category === cat)
  );
  grid.innerHTML = prods.map(p => `
    <div class="pos-product-card" onclick="addToCart(${p.id})" ${p.stock===0?'style="opacity:.4;cursor:not-allowed"':''}>
      <div class="pos-prod-icon">${p.icon||'📦'}</div>
      <div class="pos-prod-name">${p.name}</div>
      <div class="pos-prod-price">$${p.sellPrice.toFixed(2)}</div>
      <div class="pos-prod-stock ${p.stock<=p.minStock?'text-red':''}">${p.stock>0?'In stock: '+p.stock:'Out of stock'}</div>
    </div>`).join('');
}

function addToCart(pid) {
  const prod = DB.products.find(p => p.id === pid);
  if (!prod || prod.stock === 0) { toast('Product out of stock!', 'error'); return; }
  const existing = cart.find(c => c.id === pid);
  if (existing) {
    if (existing.qty >= prod.stock) { toast('Insufficient stock!', 'warning'); return; }
    existing.qty++;
  } else {
    cart.push({ id: pid, name: prod.name, price: prod.sellPrice, qty: 1, icon: prod.icon||'📦' });
  }
  updateCartUI();
}

function removeFromCart(pid) {
  cart = cart.filter(c => c.id !== pid);
  updateCartUI();
}

function changeQty(pid, delta) {
  const item = cart.find(c => c.id === pid);
  const prod = DB.products.find(p => p.id === pid);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { cart = cart.filter(c => c.id !== pid); }
  else if (item.qty > prod.stock) { item.qty = prod.stock; toast('Max stock reached','warning'); }
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

function updatePosCustomers() {
  const sel = document.getElementById('pos-customer');
  if (!sel) return;
  sel.innerHTML = '<option value="">Walk-in Customer</option>' + DB.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function processPayment() {
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

  const custId = document.getElementById('pos-customer').value;
  const custName = custId ? DB.customers.find(c=>c.id==custId)?.name : 'Walk-in';
  const invoice = 'INV-' + String(invoiceCounter).padStart(4,'0');
  invoiceCounter++;

  // Deduct stock
  cart.forEach(item => {
    const prod = DB.products.find(p=>p.id===item.id);
    if (prod) {
      const before = prod.stock;
      prod.stock = Math.max(0, prod.stock - item.qty);
      DB.stockHistory.unshift({ date: new Date().toLocaleString(), product: prod.name, type: 'Sale', qty: -item.qty, before, after: prod.stock, ref: invoice });
    }
  });

  // Update customer
  if (custId) {
    const cust = DB.customers.find(c=>c.id==custId);
    if (cust) { cust.totalPurchases += total; cust.loyaltyPoints += Math.floor(total); cust.lastVisit = new Date().toISOString().split('T')[0]; }
  }

  const order = {
    id: DB.orders.length + 1,
    invoice,
    date: new Date().toLocaleString(),
    customer: custName,
    customerId: custId||null,
    items: cart.map(i=>({...i})),
    subtotal, discountAmt, taxAmt, total,
    paymentMethod: selectedPayment,
    status: 'Completed',
  };
  DB.orders.push(order);
  DB.activityLog.unshift({ time: new Date().toLocaleTimeString(), user: currentUser.username, action: 'Sale', details: `${invoice} - $${total.toFixed(2)}`, ip: '192.168.1.1' });

  // Add to ledger
  DB.ledger = DB.ledger || [];
  const runBal = (DB.ledger[0]?.balance || 0) + total;
  DB.ledger.unshift({ date: new Date().toLocaleString(), type: 'Sale', ref: invoice, desc: `Sale to ${custName}`, debit: 0, credit: total, balance: runBal });

  _lastOrder = order;
  showReceipt(order);
  cart = [];
  document.getElementById('cart-discount').value = 0;
  document.getElementById('cart-tax').value = 8;
  document.getElementById('cash-received').value = '';
  document.getElementById('pos-invoice').textContent = 'INV-' + String(invoiceCounter).padStart(4,'0');
  updateCartUI();
  toast(`Payment processed! Invoice ${invoice}`, 'success');
}

function showReceipt(order) {
  const cashReceived = parseFloat(document.getElementById('cash-received').value)||order.total;
  const change = Math.max(0, cashReceived - order.total);
  document.getElementById('receipt-body').innerHTML = `
    <div class="receipt-preview">
      <div class="rcp-center" style="font-size:16px;font-weight:700">🏪 SmartRetail Store</div>
      <div class="rcp-center" style="font-size:11px">123 Market Street, City</div>
      <div class="rcp-center" style="font-size:11px">Tel: +1 555-000-1234</div>
      <div class="rcp-line"></div>
      <div class="rcp-row"><span>Invoice:</span><span>${order.invoice}</span></div>
      <div class="rcp-row"><span>Date:</span><span>${order.date}</span></div>
      <div class="rcp-row"><span>Customer:</span><span>${(document.getElementById('bill-customer-name')?.value?.trim()) || order.customer}</span></div>
      ${(document.getElementById('bill-customer-contact')?.value?.trim()) ? `<div class="rcp-row"><span>Contact:</span><span>${document.getElementById('bill-customer-contact').value.trim()}</span></div>` : ''}
      <div class="rcp-row"><span>Cashier:</span><span>${currentUser.name}</span></div>
      <div class="rcp-line"></div>
      <div style="font-weight:700;margin-bottom:4px">ITEMS</div>
      ${order.items.map(i=>`<div class="rcp-row"><span>${i.name} x${i.qty}</span><span>$${(i.price*i.qty).toFixed(2)}</span></div>`).join('')}
      <div class="rcp-line"></div>
      <div class="rcp-row"><span>Subtotal:</span><span>$${order.subtotal.toFixed(2)}</span></div>
      ${order.discountAmt>0?`<div class="rcp-row"><span>Discount:</span><span>-$${order.discountAmt.toFixed(2)}</span></div>`:''}
      <div class="rcp-row"><span>Tax:</span><span>+$${order.taxAmt.toFixed(2)}</span></div>
      <div class="rcp-line"></div>
      <div class="rcp-row" style="font-size:14px;font-weight:700"><span>TOTAL:</span><span>$${order.total.toFixed(2)}</span></div>
      <div class="rcp-row"><span>Payment:</span><span>${order.paymentMethod.toUpperCase()}</span></div>
      ${order.paymentMethod==='cash'?`<div class="rcp-row"><span>Cash Received:</span><span>$${cashReceived.toFixed(2)}</span></div><div class="rcp-row"><span>Change:</span><span>$${change.toFixed(2)}</span></div>`:''}
      <div class="rcp-line"></div>
      <div class="rcp-center" style="font-size:11px">Thank you for shopping at SmartRetail!</div>
      <div class="rcp-center" style="font-size:10px;margin-top:4px">All sales are final. Visit us again!</div>
      <div class="rcp-center" style="font-size:10px;margin-top:4px">|||||||||||||||||||||||||||</div>
      <div class="rcp-center" style="font-family:var(--mono);font-size:10px">${order.invoice}</div>
    </div>`;
  openModal('receipt-modal');
  // Pre-fill customer name from order; clear contact for fresh entry
  const billName = document.getElementById('bill-customer-name');
  const billContact = document.getElementById('bill-customer-contact');
  if (billName && !billName.value) billName.value = (order.customer && order.customer !== 'Walk-in Customer') ? order.customer : '';
  if (billContact) billContact.value = '';
}

// ═══════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════
// ── Local caches so we don't refetch categories/brands/warehouses on every render ──
let _catCache = [];
let _brandCache = [];
let _defaultWarehouseId = null;

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
  if (!name) return null;
  const existing = _brandCache.find(b => b.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const created = await BrandsAPI.create({ name });
  _brandCache.push(created);
  return created.id;
}

async function renderProducts() {
  await populateCategorySelects();
  const q = (document.getElementById('prod-search')?.value||'').toLowerCase();
  const catId = document.getElementById('prod-cat-filter')?.value||'';
  const tbody = document.getElementById('products-table');
  const params = { search: q || undefined, category: catId || undefined };
  const data = await ProductsAPI.list(params);
  const prods = data.results || data;
  tbody.innerHTML = prods.map(p => {
    const status = p.status !== 'active' ? ['badge-yellow', p.status]
      : ['badge-green', 'Active'];
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:20px">📦</span><div><div style="font-weight:600">${p.name}</div><div style="font-size:11px;color:var(--text-muted)">${p.brand_name||''}</div></div></div></td>
      <td class="td-mono">${p.sku}</td>
      <td><span class="badge badge-blue">${p.category_name||''}</span></td>
      <td class="fw-700 text-green">$${Number(p.selling_price).toFixed(2)}</td>
      <td class="fw-700 text-green">$${Number(p.final_price).toFixed(2)}</td>
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
  const catData = await CategoriesAPI.list();
  _catCache = catData.results || catData;
  ['prod-cat','prod-cat-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasVal = el.value;
    const isFilter = id.includes('filter');
    el.innerHTML = (isFilter ? '<option value="">All Categories</option>' : '<option value="">Select Category</option>') +
      _catCache.map(c => `<option value="${c.id}" ${String(c.id)===wasVal?'selected':''}>${c.name}</option>`).join('');
  });
  const brandData = await BrandsAPI.list();
  _brandCache = brandData.results || brandData;
  const ps = document.getElementById('prod-supplier');
  if (ps) {
    const supData = await SuppliersAPI.list();
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

function addCategory() {
  const val = document.getElementById('new-cat-name').value.trim();
  if (!val) return;
  if (!DB.categories.includes(val)) DB.categories.push(val);
  document.getElementById('new-cat-name').value='';
  renderCatList();
  toast('Category added!','success');
}
function renderCatList() {
  document.getElementById('cat-list').innerHTML = DB.categories.map(c=>`
    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px">${c}</span>
      <button class="btn btn-ghost btn-xs" onclick="deleteCategory('${c}')" style="color:var(--red)"><i class="fa fa-trash"></i></button>
    </div>`).join('');
}
function deleteCategory(name) {
  DB.categories = DB.categories.filter(c=>c!==name);
  renderCatList();
}
document.getElementById('cat-modal').addEventListener('click', e => { if(e.target===document.getElementById('cat-modal')) return; renderCatList(); });

// ═══════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════
function renderInventory() {
  const q = (document.getElementById('inv-search')?.value||'').toLowerCase();
  const inStock = DB.products.filter(p=>p.stock>p.minStock).length;
  const lowStock = DB.products.filter(p=>p.stock>0&&p.stock<=p.minStock).length;
  const outStock = DB.products.filter(p=>p.stock===0).length;
  document.getElementById('inv-total').textContent = DB.products.length;
  document.getElementById('inv-instock').textContent = inStock;
  document.getElementById('inv-low').textContent = lowStock;
  document.getElementById('inv-out').textContent = outStock;

  const tbody = document.getElementById('inventory-table');
  const prods = DB.products.filter(p => p.name.toLowerCase().includes(q));
  tbody.innerHTML = prods.map(p => {
    const pct = Math.min(100, (p.stock / (p.minStock*2)) * 100);
    const color = p.stock===0 ? 'var(--red)' : p.stock<=p.minStock ? 'var(--yellow)' : 'var(--green)';
    const statusBadge = p.stock===0 ? 'badge-red' : p.stock<=p.minStock ? 'badge-yellow' : 'badge-green';
    const statusText = p.stock===0 ? 'Out of Stock' : p.stock<=p.minStock ? 'Low Stock' : 'In Stock';
    return `<tr>
      <td><div class="flex-gap"><span style="font-size:18px">${p.icon||'📦'}</span><strong>${p.name}</strong></div></td>
      <td>${p.category}</td>
      <td class="fw-700" style="color:${color}">${p.stock}</td>
      <td>${p.minStock}</td>
      <td>${p.minStock*1.5|0}</td>
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
  const allHist = [
    ...DB.stockHistory,
    { date: '2025-01-17 08:30', product: 'Coca-Cola 330ml', type: 'Sale', qty: -3, before: 8, after: 5, ref: 'INV-0041' },
    { date: '2025-01-16 10:00', product: 'Whole Milk 1L', type: 'Purchase', qty: 30, before: 0, after: 30, ref: 'PO-002' },
    { date: '2025-01-15 14:20', product: 'Lays Classic Chips', type: 'Sale', qty: -10, before: 55, after: 45, ref: 'INV-0039' },
  ];
  hist.innerHTML = allHist.slice(0,10).map(h => {
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
  const results = DB.products.filter(p =>
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
    const stockColor = p.stock <= 0 ? 'var(--red)' : p.stock <= (p.minStock||10) ? 'var(--yellow)' : 'var(--green)';
    return `<div onclick="selectAdjProductById(${p.id})"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s"
      onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
      <span style="font-size:20px;flex-shrink:0">${p.icon||'📦'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">${p.sku||'—'} ${p.barcode?'• '+p.barcode:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:800;color:${stockColor}">${p.stock}</div>
        <div style="font-size:9px;color:var(--text-muted)">in stock</div>
      </div>
    </div>`;
  }).join('');
}

function selectAdjProductById(pid) {
  const p = DB.products.find(x => x.id === pid);
  if (!p) return;
  _adjSelectedPid = pid;
  document.getElementById('adj-product').value = pid;
  document.getElementById('adj-search').value  = p.name;
  document.getElementById('adj-search-drop').style.display = 'none';
  // Show product card
  document.getElementById('adj-product-card').style.display = '';
  document.getElementById('adj-prod-icon').textContent = p.icon||'📦';
  document.getElementById('adj-prod-name').textContent = p.name;
  document.getElementById('adj-prod-sku').textContent  = (p.sku||'—') + (p.barcode?' | '+p.barcode:'');
  document.getElementById('adj-current-stock').textContent = p.stock;
  document.getElementById('adj-new-stock').textContent = p.stock;
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
  const p = DB.products.find(x => x.id === pid);
  if (!p) return;
  const type = document.getElementById('adj-type').value;
  const qty  = parseInt(document.getElementById('adj-qty').value) || 0;
  const increases = ['increase', 'returned'];
  const decreases = ['decrease', 'damaged'];
  let delta = 0, newStock = p.stock;
  if (increases.includes(type)) { delta = qty; newStock = p.stock + qty; }
  else if (decreases.includes(type)) { delta = -qty; newStock = Math.max(0, p.stock - qty); }
  const colors = { increase:'var(--green)', returned:'var(--cyan)', decrease:'var(--red)', damaged:'var(--yellow)' };
  const deltaEl = document.getElementById('adj-delta-display');
  if (deltaEl) {
    deltaEl.textContent = (delta >= 0 ? '+' : '') + delta;
    deltaEl.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const newEl = document.getElementById('adj-new-stock');
  if (newEl) {
    newEl.textContent = newStock;
    newEl.style.color = newStock <= 0 ? 'var(--red)' : newStock <= (p.minStock||10) ? 'var(--yellow)' : 'var(--green)';
  }
  const lowWarn  = document.getElementById('adj-low-warn');
  const negWarn  = document.getElementById('adj-negative-warn');
  if (lowWarn) lowWarn.style.display  = (newStock > 0 && newStock <= (p.minStock||10)) ? '' : 'none';
  if (negWarn) negWarn.style.display  = (decreases.includes(type) && qty > p.stock) ? '' : 'none';
}

function openStockModal(pid) {
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

function saveStockAdj() {
  const pid  = parseInt(document.getElementById('adj-product').value);
  const type = document.getElementById('adj-type').value;
  const qty  = parseInt(document.getElementById('adj-qty').value) || 0;
  const prod = DB.products.find(p => p.id === pid);
  if (!prod) { toast('Select a product first!', 'error'); return; }
  if (qty <= 0) { toast('Enter a valid quantity!', 'error'); return; }

  const before = prod.stock;
  const increases = ['increase', 'returned'];
  const decreases = ['decrease', 'damaged'];
  if (increases.includes(type)) {
    prod.stock += qty;
  } else if (decreases.includes(type)) {
    prod.stock = Math.max(0, prod.stock - qty);
  }
  const after = prod.stock;
  const reason = document.getElementById('adj-reason').value;
  const notes  = document.getElementById('adj-notes').value;
  const typeLabels = { increase:'Stock In', decrease:'Stock Out', damaged:'Damaged', returned:'Returned' };

  DB.stockHistory.unshift({
    date: new Date().toLocaleString(),
    product: prod.name,
    type: typeLabels[type] || 'Manual',
    adjType: type,
    qty: after - before,
    before, after,
    reason, notes,
    ref: 'ADJ-' + Date.now(),
    by: currentUser?.username || 'admin'
  });

  closeModal('stock-modal');
  renderInventory();
  renderProducts();
  const delta = after - before;
  toast(`Stock ${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} — ${prod.name} now has ${after} units`, delta >= 0 ? 'success' : 'warning');
}

// ── Stock adjust search — close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#adj-search') && !e.target.closest('#adj-search-drop')) {
    const drop = document.getElementById('adj-search-drop');
    if (drop) drop.style.display = 'none';
  }
});
function renderOrders() {
  const q = (document.getElementById('ord-search')?.value||'').toLowerCase();
  const sf = document.getElementById('ord-status-filter')?.value||'';
  const sampleOrders = [
    { id:100, invoice:'INV-0040', date:'2025-01-17 09:15', customer:'Ahmed Hassan', items:[{name:'Coca-Cola',qty:2,price:1.25}], total:2.50, paymentMethod:'Cash', status:'Completed' },
    { id:101, invoice:'INV-0039', date:'2025-01-17 08:50', customer:'Walk-in', items:[{name:'Lays Chips',qty:1,price:2.00}], total:2.00, paymentMethod:'Card', status:'Completed' },
    { id:102, invoice:'INV-0038', date:'2025-01-16 15:30', customer:'Sarah Williams', items:[{name:'Milk 1L',qty:3,price:1.80}], total:5.40, paymentMethod:'Digital', status:'Completed' },
    { id:103, invoice:'INV-0037', date:'2025-01-16 11:00', customer:'Walk-in', items:[{name:'Bread',qty:1,price:2.50}], total:2.50, paymentMethod:'Cash', status:'Pending' },
    { id:104, invoice:'INV-0036', date:'2025-01-15 16:45', customer:'Muhammad Ali', items:[{name:'Dove Soap',qty:2,price:1.50}], total:3.00, paymentMethod:'Card', status:'Cancelled' },
  ];
  const allOrders = [...DB.orders.map(o=>({...o})).reverse(), ...sampleOrders].filter((o,i,a)=>a.findIndex(x=>x.invoice===o.invoice)===i);
  const filtered = allOrders.filter(o =>
    (o.invoice.toLowerCase().includes(q)||o.customer.toLowerCase().includes(q)) &&
    (!sf || o.status===sf)
  );

  document.getElementById('ord-completed').textContent = allOrders.filter(o=>o.status==='Completed').length;
  document.getElementById('ord-pending').textContent = allOrders.filter(o=>o.status==='Pending').length;
  document.getElementById('ord-cancelled').textContent = allOrders.filter(o=>o.status==='Cancelled').length;
  document.getElementById('ord-refunded').textContent = allOrders.filter(o=>o.status==='Refunded').length;

  const badges = { Completed:'badge-green', Pending:'badge-yellow', Cancelled:'badge-red', Refunded:'badge-purple' };
  document.getElementById('orders-table').innerHTML = filtered.map(o=>`
    <tr>
      <td class="td-mono">${o.invoice}</td>
      <td style="font-size:12px">${o.date}</td>
      <td>${o.customer}</td>
      <td>${o.items.length} item(s)</td>
      <td class="fw-700 text-green">$${o.total.toFixed(2)}</td>
      <td><span class="badge badge-blue">${o.paymentMethod}</span></td>
      <td><span class="badge ${badges[o.status]||'badge-gray'}">${o.status}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="viewOrder('${o.invoice}')"><i class="fa fa-eye"></i></button>
          ${o.status==='Completed'?`<button class="btn btn-ghost btn-xs" onclick="toast('Receipt printed','success')"><i class="fa fa-print"></i></button>`:''}
        </div>
      </td>
    </tr>`).join('');
}

function viewOrder(inv) {
  const allOrders = [...DB.orders, ...[
    { invoice:'INV-0040', date:'2025-01-17 09:15', customer:'Ahmed Hassan', items:[{name:'Coca-Cola 330ml',qty:2,price:1.25},{name:'Lays Chips',qty:1,price:2.00}], subtotal:4.50, discountAmt:0, taxAmt:0.36, total:4.86, paymentMethod:'Cash', status:'Completed' },
  ]];
  const o = allOrders.find(x=>x.invoice===inv);
  if (!o) return;
  document.getElementById('od-title').textContent = 'Order — ' + inv;
  document.getElementById('order-detail-body').innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">CUSTOMER</div><div style="font-weight:600">${o.customer}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">DATE</div><div style="font-weight:600">${o.date}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">PAYMENT METHOD</div><div style="font-weight:600">${o.paymentMethod}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">STATUS</div><span class="badge badge-green">${o.status}</span></div>
    </div>
    <table><thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
    <tbody>${o.items.map(i=>`<tr><td>${i.name}</td><td>$${i.price.toFixed(2)}</td><td>${i.qty}</td><td>$${(i.price*i.qty).toFixed(2)}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:16px;text-align:right">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">Subtotal: $${(o.subtotal||o.total).toFixed(2)}</div>
      ${(o.discountAmt||0)>0?`<div style="font-size:13px;color:var(--red);margin-bottom:4px">Discount: -$${o.discountAmt.toFixed(2)}</div>`:''}
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Tax: +$${(o.taxAmt||0).toFixed(2)}</div>
      <div style="font-size:18px;font-weight:800">Total: $${o.total.toFixed(2)}</div>
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

function renderCustomers() {
  const q = (document.getElementById('cust-search')?.value||'').toLowerCase();
  const filtered = DB.customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.phone.includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.accountNo||'').toLowerCase().includes(q) ||
    (c.cnic||'').includes(q)
  );
  document.getElementById('customers-table').innerHTML = filtered.map(c=>`
    <tr>
      <td><span class="badge badge-purple" style="font-family:var(--mono)">${c.accountNo||'—'}</span></td>
      <td class="td-mono">CUST-${String(c.id).padStart(3,'0')}</td>
      <td class="fw-700">${c.name}</td>
      <td>${c.phone}</td>
      <td style="font-family:var(--mono);font-size:12px">${c.cnic||'<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.email||'—'}</td>
      <td class="fw-700 text-green">Rs.${c.totalPurchases.toFixed(2)}</td>
      <td class="${(c.prevBalance||0)>0?'text-red':'text-green'} fw-700">Rs.${(c.prevBalance||0).toFixed(2)}</td>
      <td><span class="badge badge-purple">⭐ ${c.loyaltyPoints}</span></td>
      <td style="font-size:12px">${c.lastVisit}</td>
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
  const errEl = document.getElementById('cust-cnic-error');
  const statusEl = document.getElementById('cust-cnic-status');
  if (errEl) errEl.style.display = 'none';
  if (statusEl) statusEl.textContent = '';
  const nextId = Math.max(...DB.customers.map(c=>c.id), 0) + 1;
  document.getElementById('cust-acc').value = 'ACC-' + String(nextId).padStart(4,'0');
  openModal('customer-modal');
}

function editCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cust-modal-title').textContent = 'Edit Customer';
  document.getElementById('cust-edit-id').value    = c.id;
  document.getElementById('cust-name').value       = c.name;
  document.getElementById('cust-phone').value      = c.phone;
  document.getElementById('cust-email').value      = c.email || '';
  document.getElementById('cust-address').value    = c.address || '';
  document.getElementById('cust-points').value     = c.loyaltyPoints || 0;
  document.getElementById('cust-acc').value        = c.accountNo || 'ACC-' + String(c.id).padStart(4,'0');
  document.getElementById('cust-prev-balance').value = c.prevBalance || 0;
  const cnicEl = document.getElementById('cust-cnic');
  if (cnicEl) { cnicEl.value = c.cnic || ''; validateCnic(cnicEl.value); }
  openModal('customer-modal');
}

function saveCustomer() {
  const name = document.getElementById('cust-name').value.trim();
  if (!name) { toast('Customer name is required!', 'error'); return; }

  const cnic    = (document.getElementById('cust-cnic')?.value || '').trim();
  const editId  = parseInt(document.getElementById('cust-edit-id').value);

  // CNIC validation: if provided, must match format
  if (cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
    toast('Invalid CNIC format. Use: 35202-1234567-1', 'error');
    document.getElementById('cust-cnic')?.focus();
    return;
  }
  // Duplicate CNIC check
  if (cnic && isCnicDuplicate(cnic, editId || -1)) {
    toast('This CNIC is already registered to another customer!', 'error');
    return;
  }

  const newId = editId || Math.max(...DB.customers.map(c=>c.id), 0) + 1;
  const data = {
    name,
    phone: document.getElementById('cust-phone').value,
    email: document.getElementById('cust-email').value,
    address: document.getElementById('cust-address').value,
    loyaltyPoints: parseInt(document.getElementById('cust-points').value) || 0,
    prevBalance:   parseFloat(document.getElementById('cust-prev-balance').value) || 0,
    accountNo: document.getElementById('cust-acc').value || 'ACC-' + String(newId).padStart(4,'0'),
    cnic: cnic || null,
  };
  if (editId) {
    Object.assign(DB.customers.find(c => c.id === editId), data);
    toast('Customer updated!', 'success');
  } else {
    DB.customers.push({ id: newId, totalPurchases: 0, lastVisit: new Date().toISOString().split('T')[0], ...data });
    toast('Customer added!', 'success');
  }
  closeModal('customer-modal');
  renderCustomers();
  updatePosCustomers();
}

function deleteCustomer(id) {
  if (!confirm('Delete customer?')) return;
  DB.customers=DB.customers.filter(c=>c.id!==id);
  renderCustomers();
  toast('Customer deleted','success');
}

// ═══════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════
function renderSuppliers() {
  const q = (document.getElementById('sup-search')?.value||'').toLowerCase();
  const filtered = DB.suppliers.filter(s=>s.name.toLowerCase().includes(q)||(s.email||'').toLowerCase().includes(q));
  document.getElementById('suppliers-table').innerHTML = filtered.map(s=>`
    <tr>
      <td class="td-mono">SUP-${String(s.id).padStart(3,'0')}</td>
      <td class="fw-700">${s.name}</td>
      <td>${s.phone}</td>
      <td>${s.email}</td>
      <td style="font-size:12px">${s.address}</td>
      <td class="${s.balance<0?'text-red':'text-green'} fw-700">$${Math.abs(s.balance).toFixed(2)} ${s.balance<0?'(owed)':s.balance>0?'(credit)':''}</td>
      <td><span class="badge badge-green">${s.status}</span></td>
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
  const s=DB.suppliers.find(x=>x.id===id);
  document.getElementById('sup-modal-title').textContent='Edit Supplier';
  document.getElementById('sup-edit-id').value=s.id;
  document.getElementById('sup-name').value=s.name;
  document.getElementById('sup-phone').value=s.phone;
  document.getElementById('sup-email').value=s.email;
  document.getElementById('sup-address').value=s.address;
  document.getElementById('sup-balance').value=s.balance;
  openModal('supplier-modal');
}

function saveSupplier() {
  const name=document.getElementById('sup-name').value.trim();
  if (!name) { toast('Name required!','error'); return; }
  const editId=parseInt(document.getElementById('sup-edit-id').value);
  const data={name,phone:document.getElementById('sup-phone').value,email:document.getElementById('sup-email').value,address:document.getElementById('sup-address').value,balance:parseFloat(document.getElementById('sup-balance').value)||0,status:'Active'};
  if (editId) { Object.assign(DB.suppliers.find(s=>s.id===editId),data); toast('Supplier updated!','success'); }
  else { DB.suppliers.push({id:Math.max(...DB.suppliers.map(s=>s.id),0)+1,...data}); toast('Supplier added!','success'); }
  closeModal('supplier-modal');
  renderSuppliers();
}

function deleteSupplier(id) {
  if (!confirm('Delete supplier?')) return;
  DB.suppliers=DB.suppliers.filter(s=>s.id!==id);
  renderSuppliers();
  toast('Supplier deleted','success');
}

// ═══════════════════════════════════════════════════════
// PURCHASES
// ═══════════════════════════════════════════════════════
function renderPurchases() {
  document.getElementById('purchases-table').innerHTML = DB.purchases.map(p=>`
    <tr>
      <td class="td-mono">PO-${String(p.id).padStart(4,'0')}</td>
      <td style="font-size:12px">${p.date}</td>
      <td>${DB.suppliers.find(s=>s.id===p.supplier)?.name||'Unknown'}</td>
      <td>${p.items.length} item(s)</td>
      <td class="fw-700">$${p.total.toFixed(2)}</td>
      <td><span class="badge ${p.payment==='Paid'?'badge-green':p.payment==='Pending'?'badge-yellow':'badge-blue'}">${p.payment}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs"><i class="fa fa-eye"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deletePurchase(${p.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

let purItems = [];
function openPurchaseModal() {
  document.getElementById('pur-supplier').innerHTML = DB.suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
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
          ${DB.products.map(p=>`<option value="${p.id}" ${item.productId==p.id?'selected':''}>${p.name}</option>`).join('')}
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
    const prod=DB.products.find(p=>p.id==val);
    if(prod) purItems[i].price=prod.buyPrice;
  } else if(field==='qty') purItems[i].qty=parseInt(val)||1;
  else purItems[i].price=parseFloat(val)||0;
  renderPurItems();
}
function addPurItem() { purItems.push({productId:'',qty:1,price:0}); renderPurItems(); }
function removePurItem(i) { purItems.splice(i,1); renderPurItems(); }

function savePurchase() {
  if(!purItems.length||!purItems[0].productId) { toast('Add at least one product','error'); return; }
  const total=purItems.reduce((a,i)=>a+i.qty*i.price,0);
  const pur={
    id:Math.max(...DB.purchases.map(p=>p.id),0)+1,
    date:document.getElementById('pur-date').value,
    supplier:parseInt(document.getElementById('pur-supplier').value),
    items:purItems.map(i=>({productId:i.productId,name:DB.products.find(p=>p.id==i.productId)?.name||'',qty:i.qty,price:i.price})),
    total, payment:document.getElementById('pur-payment').value,
    notes:document.getElementById('pur-notes').value,
  };
  // Update stock
  purItems.forEach(item=>{
    const prod=DB.products.find(p=>p.id==item.productId);
    if(prod){
      const before=prod.stock;
      prod.stock+=item.qty;
      DB.stockHistory.unshift({date:new Date().toLocaleString(),product:prod.name,type:'Purchase',qty:item.qty,before,after:prod.stock,ref:'PO-'+String(pur.id).padStart(4,'0')});
    }
  });
  DB.purchases.push(pur);
  closeModal('purchase-modal');
  renderPurchases();
  toast('Purchase order saved!','success');
}

function deletePurchase(id) {
  if(!confirm('Delete purchase?')) return;
  DB.purchases=DB.purchases.filter(p=>p.id!==id);
  renderPurchases();
  toast('Purchase deleted','success');
}

// ═══════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════
function renderExpenses() {
  document.getElementById('expenses-table').innerHTML = DB.expenses.map(e=>`
    <tr>
      <td>${e.date}</td>
      <td><span class="badge badge-blue">${e.category}</span></td>
      <td>${e.description}</td>
      <td class="fw-700 text-red">$${e.amount.toFixed(2)}</td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editExpense(${e.id})"><i class="fa fa-edit"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="deleteExpense(${e.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');

  if (charts.expCat) charts.expCat.destroy();
  const catTotals = {};
  DB.expenses.forEach(e => catTotals[e.category] = (catTotals[e.category]||0)+e.amount);
  const ec = document.getElementById('expenseChart');
  if (ec) charts.expCat = new Chart(ec, {
    type: 'doughnut',
    data: { labels: Object.keys(catTotals), datasets: [{ data: Object.values(catTotals), backgroundColor: ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#ec4899'], borderWidth:0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:'#8892a4', font:{size:11} } } }, cutout:'60%' }
  });

  if (charts.expMonth) charts.expMonth.destroy();
  const emc = document.getElementById('expMonthChart');
  if (emc) charts.expMonth = new Chart(emc, {
    type: 'bar',
    data: { labels:['Sep','Oct','Nov','Dec','Jan'], datasets:[{ label:'Expenses ($)', data:[9800,10200,11500,12000,11530], backgroundColor:'rgba(239,68,68,.5)', borderColor:'rgba(239,68,68,1)', borderWidth:2, borderRadius:6 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8892a4',font:{size:11}}}}, scales:{ x:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}}, y:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}} } }
  });
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
  const e=DB.expenses.find(x=>x.id===id);
  document.getElementById('exp-modal-title').textContent='Edit Expense';
  document.getElementById('exp-edit-id').value=e.id;
  document.getElementById('exp-cat').value=e.category;
  document.getElementById('exp-amount').value=e.amount;
  document.getElementById('exp-date').value=e.date;
  document.getElementById('exp-desc').value=e.description;
  document.getElementById('exp-ref').value=e.ref||'';
  openModal('expense-modal');
}

function saveExpense() {
  const amount=parseFloat(document.getElementById('exp-amount').value);
  if(!amount) { toast('Amount required!','error'); return; }
  const editId=parseInt(document.getElementById('exp-edit-id').value);
  const data={category:document.getElementById('exp-cat').value,amount,date:document.getElementById('exp-date').value,description:document.getElementById('exp-desc').value,ref:document.getElementById('exp-ref').value||'EXP-'+Date.now()};
  if(editId) { Object.assign(DB.expenses.find(e=>e.id===editId),data); toast('Expense updated!','success'); }
  else { DB.expenses.push({id:Math.max(...DB.expenses.map(e=>e.id),0)+1,...data}); toast('Expense added!','success'); }
  closeModal('expense-modal');
  renderExpenses();
}

function deleteExpense(id) {
  if(!confirm('Delete expense?')) return;
  DB.expenses=DB.expenses.filter(e=>e.id!==id);
  renderExpenses();
  toast('Expense deleted','success');
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
function renderReports() {
  if (charts.rptSales) charts.rptSales.destroy();
  const rc = document.getElementById('rptSalesChart');
  if (rc) charts.rptSales = new Chart(rc, {
    type: 'line',
    data: {
      labels: ['Aug','Sep','Oct','Nov','Dec','Jan'],
      datasets: [{
        label: 'Revenue ($)', data: [22000,25000,21000,28000,32000,29000],
        borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#3b82f6', pointRadius: 4,
      },{
        label: 'Profit ($)', data: [8000,9500,7500,11000,13000,10500],
        borderColor: 'rgba(16,185,129,1)', backgroundColor: 'rgba(16,185,129,0.05)',
        borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#10b981', pointRadius: 4,
      }]
    },
    options: { responsive:true,maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8892a4',font:{size:11}}}}, scales:{ x:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}}, y:{grid:{color:'#1e2535'},ticks:{color:'#8892a4'}} } }
  });

  const totalSales = 28500 + DB.orders.filter(o=>o.status==='Completed').reduce((a,o)=>a+o.total,0);
  const totalExpenses = DB.expenses.reduce((a,e)=>a+e.amount,0) + DB.purchases.reduce((a,p)=>a+p.total,0);
  const grossProfit = totalSales - DB.products.reduce((a,p)=>a+p.buyPrice*p.stock,0) - 8200;
  const netProfit = totalSales - totalExpenses;
  document.getElementById('pl-summary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="flex-between" style="padding:12px;background:var(--green-glow);border-radius:8px;border:1px solid rgba(16,185,129,.2)">
        <span style="font-size:13px;font-weight:600">💹 Total Revenue</span>
        <span style="font-size:16px;font-weight:800;color:var(--green)">$${totalSales.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
      </div>
      <div class="flex-between" style="padding:12px;background:var(--red-glow);border-radius:8px;border:1px solid rgba(239,68,68,.2)">
        <span style="font-size:13px;font-weight:600">📉 Total Expenses</span>
        <span style="font-size:16px;font-weight:800;color:var(--red)">$${totalExpenses.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
      </div>
      <div class="flex-between" style="padding:12px;background:var(--accent-glow);border-radius:8px;border:1px solid rgba(59,130,246,.2)">
        <span style="font-size:13px;font-weight:600">📊 Cost of Goods</span>
        <span style="font-size:16px;font-weight:800;color:var(--accent)">$8,200</span>
      </div>
      <div class="divider"></div>
      <div class="flex-between" style="padding:14px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-light)">
        <span style="font-size:15px;font-weight:700">🏆 Net Profit</span>
        <span style="font-size:20px;font-weight:800;color:${netProfit>0?'var(--green)':'var(--red)'}">$${Math.abs(netProfit).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</span>
      </div>
    </div>`;

  const sampleSales = [
    { date:'2025-01-17', inv:'INV-0042', cust:'Ahmed Hassan', items:2, sub:4.50, tax:0.36, disc:0, total:4.86, pay:'Cash' },
    { date:'2025-01-17', inv:'INV-0041', cust:'Walk-in', items:1, sub:2.00, tax:0.16, disc:0, total:2.16, pay:'Card' },
    { date:'2025-01-16', inv:'INV-0040', cust:'Sarah Williams', items:5, sub:45.50, tax:3.64, disc:2.00, total:47.14, pay:'Digital' },
    { date:'2025-01-15', inv:'INV-0039', cust:'Muhammad Ali', items:3, sub:12.75, tax:1.02, disc:0, total:13.77, pay:'Cash' },
  ];
  document.getElementById('report-table').innerHTML = [...DB.orders.map(o=>({date:o.date.split(',')[0]||o.date,inv:o.invoice,cust:o.customer,items:o.items.length,sub:o.subtotal||o.total,tax:o.taxAmt||0,disc:o.discountAmt||0,total:o.total,pay:o.paymentMethod})), ...sampleSales].slice(0,10).map(s=>`
    <tr>
      <td style="font-size:12px">${s.date}</td>
      <td class="td-mono">${s.inv}</td>
      <td>${s.cust}</td>
      <td>${s.items}</td>
      <td>$${s.sub.toFixed(2)}</td>
      <td class="text-yellow">+$${s.tax.toFixed(2)}</td>
      <td class="text-red">-$${s.disc.toFixed(2)}</td>
      <td class="fw-700 text-green">$${s.total.toFixed(2)}</td>
      <td><span class="badge badge-blue">${s.pay}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════
function renderUsers() {
  const roleBadges = { Admin:'badge-purple', 'Sub-Admin':'badge-blue' };
  document.getElementById('users-table').innerHTML = DB.users.map(u=>`
    <tr>
      <td class="td-mono">USR-${String(u.id).padStart(3,'0')}</td>
      <td class="fw-700">${u.name}</td>
      <td class="td-mono">${u.username}</td>
      <td><span class="badge ${roleBadges[u.role]||'badge-gray'}">${u.role}</span></td>
      <td>${u.email}</td>
      <td style="font-size:11px;color:var(--text-secondary);max-width:200px">${u.role==='Admin'?'<span class="badge badge-purple">All Modules</span>':u.permissions?u.permissions.map(p=>`<span class="badge badge-blue" style="margin:1px;font-size:9px">${p}</span>`).join(''):'—'}</td>
      <td style="font-size:12px">${u.lastLogin}</td>
      <td><span class="badge badge-green">${u.status}</span></td>
      <td>
        <div class="flex-gap">
          <button class="btn btn-ghost btn-xs" onclick="editUser(${u.id})"><i class="fa fa-edit"></i></button>
          ${u.id!==currentUser?.id?`<button class="btn btn-ghost btn-xs" onclick="deleteUser(${u.id})" style="color:var(--red)"><i class="fa fa-trash"></i></button>`:''}
        </div>
      </td>
    </tr>`).join('');

  document.getElementById('activity-log').innerHTML = DB.activityLog.slice(0,10).map(a=>`
    <tr>
      <td class="td-mono" style="font-size:11px">${a.time}</td>
      <td class="fw-700">${a.user}</td>
      <td><span class="badge badge-blue">${a.action}</span></td>
      <td style="font-size:12px">${a.details}</td>
      <td class="td-mono" style="font-size:11px">${a.ip}</td>
    </tr>`).join('');
}

function togglePermissionsPanel() {
  const role = document.getElementById('usr-role').value;
  document.getElementById('permissions-panel').style.display = role === 'Sub-Admin' ? '' : 'none';
}

function openUserModal() {
  document.getElementById('user-modal-title').textContent='Add User';
  document.getElementById('user-edit-id').value='';
  ['usr-name','usr-username','usr-email','usr-pass'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('usr-role').value='Sub-Admin';
  document.querySelectorAll('.perm-check').forEach(c=>c.checked=false);
  togglePermissionsPanel();
  openModal('user-modal');
}

function editUser(id) {
  const u=DB.users.find(x=>x.id===id);
  document.getElementById('user-modal-title').textContent='Edit User';
  document.getElementById('user-edit-id').value=u.id;
  document.getElementById('usr-name').value=u.name;
  document.getElementById('usr-username').value=u.username;
  document.getElementById('usr-email').value=u.email;
  document.getElementById('usr-role').value=u.role;
  document.getElementById('usr-pass').value='';
  // Set permissions
  document.querySelectorAll('.perm-check').forEach(c=>{
    c.checked = (u.permissions||[]).includes(c.value);
  });
  togglePermissionsPanel();
  openModal('user-modal');
}

function saveUser() {
  const name=document.getElementById('usr-name').value.trim();
  const username=document.getElementById('usr-username').value.trim();
  if(!name||!username) { toast('Name and username required!','error'); return; }
  const editId=parseInt(document.getElementById('user-edit-id').value);
  const role=document.getElementById('usr-role').value;
  const perms = role==='Admin'
    ? ['dashboard','pos','booking','saleslips','orders','products','inventory','purchases','customers','suppliers','expenses','accounting','reports','users','settings']
    : Array.from(document.querySelectorAll('.perm-check:checked')).map(c=>c.value);
  const data={name,username,email:document.getElementById('usr-email').value,role,permissions:perms,status:'Active',lastLogin:'Never'};
  const pass=document.getElementById('usr-pass').value;
  if(pass) data.password=pass;
  if(editId) { Object.assign(DB.users.find(u=>u.id===editId),data); toast('User updated!','success'); }
  else { if(!pass) { toast('Password required!','error'); return; } DB.users.push({id:Math.max(...DB.users.map(u=>u.id),0)+1,...data}); toast('User created!','success'); }
  closeModal('user-modal');
  renderUsers();
}

function deleteUser(id) {
  if(!confirm('Delete user?')) return;
  DB.users=DB.users.filter(u=>u.id!==id);
  renderUsers();
  toast('User deleted','success');
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
function toast(msg, type='success') {
  const icons = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i class="fa ${icons[type]||icons.success}"></i><div class="toast-msg">${msg}</div>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
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
        By: ${currentUser?.name || 'Admin'}
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

function newBookingForm(editId) {
  _editingBookingId = editId || null;
  document.getElementById('booking-form-wrap').style.display = '';
  document.getElementById('booking-list-wrap').style.display = 'none';
  setTimeout(()=>document.getElementById('booking-form-wrap').scrollIntoView({behavior:'smooth'}),50);

  // Populate customer dropdown
  const sel = document.getElementById('bk-customer');
  sel.innerHTML = '<option value="">— Select Customer —</option>' +
    DB.customers.map(c=>`<option value="${c.id}">${c.name} (${c.accountNo||'ACC-'+String(c.id).padStart(4,'0')})</option>`).join('');

  const today = new Date().toISOString().split('T')[0];

  if (editId) {
    document.getElementById('booking-form-title').textContent = '✏️ Edit Order Booking';
    const bk = DB.orderBookings.find(b=>b.id===editId);
    if (!bk) return;
    document.getElementById('bk-date').value = bk.date;
    document.getElementById('bk-invoice').value = bk.invoice;
    document.getElementById('bk-customer').value = bk.customerId;
    document.getElementById('bk-payment').value = bk.paymentMethod||'credit';
    document.getElementById('bk-notes').value = bk.notes||'';
    document.getElementById('bk-discount').value = bk.discountPct||0;
    document.getElementById('bk-tax').value = bk.taxPct||0;
    // Legacy toggle elements are now hidden inputs — no action needed
    document.getElementById('bk-acc-search').value = '';
    _bookingItems = bk.items.map(i=>({...i}));
    onBookingCustomerChange();
  } else {
    document.getElementById('booking-form-title').textContent = '📝 New Order Booking';
    document.getElementById('bk-date').value = today;
    document.getElementById('bk-invoice').value = 'BK-'+String(bookingCounter).padStart(5,'0');
    document.getElementById('bk-customer').value = '';
    document.getElementById('bk-payment').value = 'credit';
    document.getElementById('bk-notes').value = '';
    document.getElementById('bk-discount').value = 0;
    document.getElementById('bk-tax').value = DB.sysSettings.taxRate||0;
    // Legacy toggle elements now hidden — no toggle state to reset
    document.getElementById('bk-acc-search').value = '';
    document.getElementById('bk-acc-display').value = '';
    document.getElementById('bk-customer-info').style.display = 'none';
    _bookingItems = [{ productId:'', name:'', rate:0, qty:0, cartons:0, ppc:1 }];
  }
  renderBookingItemRows();
  calcBookingTotals();
}

function closeBookingForm() {
  document.getElementById('booking-form-wrap').style.display = 'none';
  document.getElementById('booking-list-wrap').style.display = '';
  renderBookingList();
}

function searchCustomerByAcc(val) {
  const v = val.trim().toLowerCase();
  if (!v) return;
  const cust = DB.customers.find(c=>
    (c.accountNo||'').toLowerCase()===v || c.name.toLowerCase().includes(v)
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
  document.getElementById('bk-acc-display').value='';
  document.getElementById('bk-customer-info').style.display='none';
  calcBookingTotals();
}

function onBookingCustomerChange() {
  const id = parseInt(document.getElementById('bk-customer').value);
  const cust = DB.customers.find(c=>c.id===id);
  if (!cust) {
    document.getElementById('bk-acc-display').value='';
    document.getElementById('bk-customer-info').style.display='none';
    calcBookingTotals();
    return;
  }
  const acc = cust.accountNo||'ACC-'+String(cust.id).padStart(4,'0');
  document.getElementById('bk-acc-display').value = acc;
  document.getElementById('bk-acc-search').value = acc;
  document.getElementById('bk-customer-info').style.display='';
  document.getElementById('bk-prev-balance').textContent = '$'+((cust.prevBalance||0).toFixed(2));
  document.getElementById('bk-total-purchases').textContent = '$'+((cust.totalPurchases||0).toFixed(2));
  document.getElementById('bk-last-visit').textContent = cust.lastVisit||'—';
  calcBookingTotals();
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
          <div id="bk-prod-drop-${i}"
            style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:500;
                   background:var(--bg-card);border:1px solid var(--border);border-radius:8px;
                   max-height:220px;overflow-y:auto;box-shadow:0 8px 28px rgba(0,0,0,.5)">
          </div>
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
}

// Product search autocomplete for booking rows
function bkProdSearch(i, q) {
  const drop = document.getElementById('bk-prod-drop-'+i);
  if (!drop) return;
  const lc = (q||'').toLowerCase().trim();
  if (!lc) { drop.style.display='none'; return; }
  const results = DB.products.filter(p=>
    (p.name||'').toLowerCase().includes(lc) ||
    (p.sku||'').toLowerCase().includes(lc) ||
    (p.barcode||'').toLowerCase().includes(lc)
  ).slice(0,12);
  if (!results.length) {
    drop.style.display='';
    drop.innerHTML='<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);text-align:center"><i class="fa fa-search-minus"></i> No product found</div>';
    return;
  }
  drop.style.display='';
  drop.innerHTML = results.map(p=>{
    const sc = p.stock<=0?'var(--red)':p.stock<=(p.minStock||10)?'var(--yellow)':'var(--green)';
    return '<div onmousedown="bkProdSelect('+i+','+p.id+')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseover="this.style.background=\'var(--bg-secondary)\'" onmouseout="this.style.background=\'\'">'
      +'<span style="font-size:18px;flex-shrink:0">'+(p.icon||'📦')+'</span>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.name+'</div>'
        +'<div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">'+(p.sku||'—')+(p.barcode?' · '+p.barcode:'')+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0">'
        +'<div style="font-size:13px;font-weight:800;color:'+sc+'">'+p.stock+'</div>'
        +'<div style="font-size:9px;color:var(--text-muted)">in stock</div>'
      +'</div>'
    +'</div>';
  }).join('');
}

function bkProdSearchFocus(i) {
  const inp = document.getElementById('bk-prod-input-'+i);
  // Show all products if field empty and no product selected yet
  if (inp && !_bookingItems[i].productId) {
    if (!inp.value.trim()) {
      const drop = document.getElementById('bk-prod-drop-'+i);
      if (drop) {
        const top12 = DB.products.slice(0,12);
        if (!top12.length) return;
        drop.style.display='';
        drop.innerHTML = top12.map(p=>{
          const sc=p.stock<=0?'var(--red)':p.stock<=(p.minStock||10)?'var(--yellow)':'var(--green)';
          return '<div onmousedown="bkProdSelect('+i+','+p.id+')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseover="this.style.background=\'var(--bg-secondary)\'" onmouseout="this.style.background=\'\'">'
            +'<span style="font-size:18px;flex-shrink:0">'+(p.icon||'📦')+'</span>'
            +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px">'+p.name+'</div>'
            +'<div style="font-size:10px;color:var(--text-muted);font-family:var(--mono)">'+(p.sku||'—')+'</div></div>'
            +'<div style="text-align:right"><div style="font-size:13px;font-weight:800;color:'+sc+'">'+p.stock+'</div>'
            +'<div style="font-size:9px;color:var(--text-muted)">in stock</div></div></div>';
        }).join('');
      }
    } else {
      bkProdSearch(i, inp.value);
    }
  }
}

function bkProdSelect(i, productId) {
  const prod = DB.products.find(p=>p.id===productId);
  if (!prod) return;
  _bookingItems[i].productId = prod.id;
  _bookingItems[i].name      = prod.name;
  _bookingItems[i].rate      = prod.sellPrice||0;
  _bookingItems[i].ppc       = prod.piecesPerCarton||1;
  _bookingItems[i].icon      = prod.icon||'📦';
  _bookingItems[i].taxPct    = prod.tax||0;
  _bookingItems[i].discount  = prod.discount||0;
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

function bkProdDropClose(i) {
  const drop = document.getElementById('bk-prod-drop-'+i);
  if (drop) drop.style.display='none';
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
    const prod = DB.products.find(p => p.id == item.productId);
    const taxPct = (prod?.tax) || (item.taxPct) || 0;
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
  const cust     = DB.customers.find(c => c.id === custId);
  const prevBal  = cust?.prevBalance||0;
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

function saveBooking(status) {
  const custId = parseInt(document.getElementById('bk-customer').value)||0;
  if (!custId) { toast('Please select a customer!','error'); return; }
  const validItems = _bookingItems.filter(i=>i.productId);
  if (!validItems.length) { toast('Add at least one product!','error'); return; }

  const cust     = DB.customers.find(c=>c.id===custId);
  const discPct  = parseFloat(document.getElementById('bk-discount').value)||0;

  // ── Calculation Flow: Base → Tax → Discount → Total ───
  // Step 1: Base amount
  const subtotal = validItems.reduce((s,i)=>{
    const tp=(i.qty||0)+(i.cartons||0)*(i.ppc||1);
    return s+tp*(i.rate||0);
  },0);

  // Step 2: Auto tax from product config (per-item, weighted sum)
  const taxAmt = validItems.reduce((s,i)=>{
    const prod = DB.products.find(p=>p.id==i.productId);
    const taxPct = (prod?.tax)||(i.taxPct)||0;
    if (!taxPct) return s;
    const tp=(i.qty||0)+(i.cartons||0)*(i.ppc||1);
    return s+tp*(i.rate||0)*taxPct/100;
  },0);

  // Step 3: Discount applied on (subtotal + tax)
  const discAmt  = (subtotal+taxAmt)*discPct/100;

  // Step 4: Final total
  const total    = subtotal+taxAmt-discAmt;
  const prevBal  = cust?.prevBalance||0;
  const netPayable = total+prevBal;
  const invoice  = document.getElementById('bk-invoice').value;
  const bookDate = document.getElementById('bk-date').value;
  const payMethod = document.getElementById('bk-payment').value;
  const notes    = document.getElementById('bk-notes').value;

  // Attach taxPct snapshot to each item for print fidelity
  const itemsWithTax = validItems.map(i=>{
    const prod = DB.products.find(p=>p.id==i.productId);
    return { ...i, taxPct: (prod?.tax)||(i.taxPct)||0 };
  });

  // Legacy flags preserved for print compatibility (always false = no old-style toggle)
  const gstOn    = false;
  const advTaxOn = false;
  const gstAmt   = taxAmt; // mapped for print templates

  const payload = {
    invoice, date: bookDate,
    customerId: custId,
    customerName: cust?.name||'Unknown',
    accountNo: cust?.accountNo||'ACC-'+String(custId).padStart(4,'0'),
    customerArea: cust?.address||'',
    items: itemsWithTax,
    subtotal, discAmt, taxAmt, total, prevBal, netPayable,
    discountPct: discPct, taxPct: 0,
    gstOn, gstAmt, advTaxOn, advTaxAmt: 0,
    paymentMethod: payMethod,
    notes, status,
    createdBy: currentUser?.username||'',
    createdByName: currentUser?.name||'',
  };

  if (_editingBookingId) {
    const bk = DB.orderBookings.find(b=>b.id===_editingBookingId);
    const wasTotal = bk.total;
    const wasCredit = bk.paymentMethod==='credit' && bk.status!=='cancelled';
    Object.assign(bk, payload);
    bk.updatedAt = new Date().toLocaleString();
    // Adjust customer balance
    if (cust && wasCredit) {
      cust.prevBalance = Math.max(0,(cust.prevBalance||0)-wasTotal+total);
    }
    toast('Booking updated!','success');
  } else {
    const id = Date.now();
    DB.orderBookings.push({ id, createdAt: new Date().toLocaleString(), ...payload });
    bookingCounter++;
    // Update customer balance for credit orders
    if (payMethod==='credit' && cust) {
      cust.prevBalance = (cust.prevBalance||0)+total;
      cust.totalPurchases = (cust.totalPurchases||0)+total;
      cust.lastVisit = bookDate;
    }
    toast(`Booking saved! Invoice: ${invoice}`,'success');
  }

  // Stock deduction for confirmed bookings
  if (status==='saved') {
    validItems.forEach(item=>{
      const prod = DB.products.find(p=>p.id==item.productId);
      if (prod) {
        const totalPcs = (item.qty||0)+(item.cartons||0)*(item.ppc||1);
        const before = prod.stock;
        prod.stock = Math.max(0, prod.stock-totalPcs);
        DB.stockHistory = DB.stockHistory||[];
        DB.stockHistory.unshift({date:new Date().toLocaleString(),product:prod.name,type:'Order Booking',qty:-totalPcs,before,after:prod.stock,ref:invoice});
      }
    });
  }

  closeBookingForm();
}

function cancelBooking(id) {
  if (!confirm('Cancel this booking? Stock will be restored.')) return;
  const bk = DB.orderBookings.find(b=>b.id===id);
  if (!bk) return;
  bk.status = 'cancelled';
  // Restore balance & stock
  if (bk.paymentMethod==='credit') {
    const cust = DB.customers.find(c=>c.id===bk.customerId);
    if (cust) cust.prevBalance = Math.max(0,(cust.prevBalance||0)-bk.total);
  }
  // Restore stock
  bk.items.forEach(item=>{
    const prod = DB.products.find(p=>p.id==item.productId);
    if (prod) {
      const tp=(item.qty||0)+(item.cartons||0)*(item.ppc||1);
      prod.stock += tp;
    }
  });
  renderBookingList();
  toast('Booking cancelled — stock restored','warning');
}

function renderBookingList() {
  const q  = (document.getElementById('bk-search')?.value||'').toLowerCase();
  const nq = (document.getElementById('bk-name-search')?.value||'').toLowerCase().trim();
  const sf = document.getElementById('bk-status-filter')?.value||'';
  const df = document.getElementById('bk-date-filter')?.value||'';

  const filtered = [...DB.orderBookings].reverse().filter(b=>
    (!q  || b.invoice.toLowerCase().includes(q)||b.customerName.toLowerCase().includes(q)||(b.accountNo||'').toLowerCase().includes(q)) &&
    (!nq || b.customerName.toLowerCase().includes(nq)) &&
    (!sf || b.status===sf) &&
    (!df || b.date===df)
  );

  const badges = {saved:'badge-green',draft:'badge-yellow',cancelled:'badge-red'};
  const labels = {saved:'Confirmed',draft:'Draft',cancelled:'Cancelled'};

  document.getElementById('booking-table-body').innerHTML = filtered.length
    ? filtered.map(b=>`
        <tr>
          <td class="td-mono" style="color:var(--cyan)">${b.invoice}</td>
          <td style="font-size:12px">${b.date}</td>
          <td class="fw-700">${b.customerName}</td>
          <td><span class="badge badge-purple" style="font-family:var(--mono);font-size:11px">${b.accountNo||'—'}</span></td>
          <td>${b.items.length} item(s)</td>
          <td class="fw-700 text-green">$${b.total.toFixed(2)}</td>
          <td class="text-red">$${b.prevBal.toFixed(2)}</td>
          <td class="fw-700 text-yellow">$${b.netPayable.toFixed(2)}</td>
          <td><span class="badge badge-blue">${b.paymentMethod||'—'}</span></td>
          <td><span class="badge ${badges[b.status]||'badge-gray'}">${labels[b.status]||b.status}</span></td>
          <td>
            <div class="flex-gap">
              ${b.status!=='cancelled'?`<button class="btn btn-ghost btn-xs" onclick="newBookingForm(${b.id})" title="Edit"><i class="fa fa-edit"></i></button>`:''}
              <button class="btn btn-ghost btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print A4"><i class="fa fa-print"></i></button>
              ${b.status!=='cancelled'?`<button class="btn btn-ghost btn-xs" onclick="cancelBooking(${b.id})" style="color:var(--red)" title="Cancel"><i class="fa fa-ban"></i></button>`:''}
            </div>
          </td>
        </tr>`).join('')
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

function renderSaleSlips() {
  const today = new Date().toISOString().split('T')[0];
  const ssDate = document.getElementById('ss-date');
  if (ssDate && !ssDate.value) ssDate.value = today;
  const dateFilter   = ssDate?.value||'';
  const statusFilter = document.getElementById('ss-status')?.value||'';
  const nameFilter   = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();
  const areaFilter   = (document.getElementById('ss-area')?.value||'').toLowerCase().trim();

  const slips = [...DB.orderBookings].reverse().filter(b=>
    (!dateFilter   || b.date===dateFilter) &&
    (!statusFilter || b.status===statusFilter) &&
    (!nameFilter   || b.customerName.toLowerCase().includes(nameFilter) || (b.accountNo||'').toLowerCase().includes(nameFilter)) &&
    (!areaFilter   || (b.customerArea||'').toLowerCase().includes(areaFilter))
  );

  const countEl = document.getElementById('ss-count-label');
  if (countEl) countEl.textContent = `${slips.length} slip${slips.length!==1?'s':''}`;

  const badges = {saved:'badge-green',draft:'badge-yellow',cancelled:'badge-red'};
  const labels = {saved:'Confirmed',draft:'Draft',cancelled:'Cancelled'};

  const tbody = document.getElementById('saleslips-tbody');
  if (!tbody) return;
  tbody.innerHTML = slips.length
    ? slips.map(b=>`
        <tr>
          <td class="td-mono" style="color:var(--cyan)">${b.invoice}</td>
          <td style="font-size:12px">${b.date}</td>
          <td class="fw-700">${b.customerName}</td>
          <td><span class="badge badge-purple" style="font-family:var(--mono);font-size:11px">${b.accountNo||'—'}</span></td>
          <td>${b.items.length} item(s)</td>
          <td class="fw-700 text-green">$${b.total.toFixed(2)}</td>
          <td class="fw-700 text-yellow">$${b.netPayable.toFixed(2)}</td>
          <td><span class="badge ${badges[b.status]||'badge-gray'}">${labels[b.status]||b.status}</span></td>
          <td>
            <div class="flex-gap">
              <button class="btn btn-ghost btn-xs" onclick="viewSlipDetail(${b.id})" title="View"><i class="fa fa-eye"></i></button>
              <button class="btn btn-accent btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print A4"><i class="fa fa-print"></i></button>
              ${b.status!=='cancelled'?`<button class="btn btn-ghost btn-xs" onclick="navigate('booking');setTimeout(()=>newBookingForm(${b.id}),150)" title="Edit"><i class="fa fa-edit"></i></button>`:''}
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">
         <i class="fa fa-file-invoice" style="font-size:32px;display:block;margin-bottom:10px"></i>No sale slips for selected date
       </td></tr>`;
}

function viewSlipDetail(id) {
  const b = DB.orderBookings.find(x=>x.id===id);
  if (!b) return;
  document.getElementById('od-title').textContent = 'Sale Slip — '+b.invoice;
  document.getElementById('order-detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">CUSTOMER</div><div style="font-weight:600">${b.customerName}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">ACCOUNT NO</div><div style="font-weight:700;color:var(--purple);font-family:var(--mono)">${b.accountNo||'—'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">DATE</div><div style="font-weight:600">${b.date}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">INVOICE</div><div style="font-weight:700;color:var(--cyan);font-family:var(--mono)">${b.invoice}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">PAYMENT</div><div style="font-weight:600">${b.paymentMethod||'—'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">STATUS</div><span class="badge ${b.status==='saved'?'badge-green':b.status==='draft'?'badge-yellow':'badge-red'}">${b.status}</span></div>
    </div>
    <table>
      <thead><tr><th>Product</th><th>Rate</th><th>Loose Pcs</th><th>Cartons</th><th>Total Pcs</th><th>Amount</th></tr></thead>
      <tbody>${b.items.map(it=>{
        const tp=(it.qty||0)+(it.cartons||0)*(it.ppc||1);
        return `<tr>
          <td>${it.icon||'📦'} ${it.name||'—'}</td>
          <td>$${(it.rate||0).toFixed(2)}</td>
          <td>${it.qty||0}</td>
          <td>${it.cartons||0} ctn ${(it.ppc||1)>1?`(×${it.ppc} pcs)`:''}</td>
          <td class="fw-700">${tp}</td>
          <td class="fw-700 text-green">$${(tp*(it.rate||0)).toFixed(2)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div style="margin-top:16px;text-align:right">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Subtotal: $${b.subtotal.toFixed(2)}</div>
      ${b.discAmt>0?`<div style="font-size:12px;color:var(--red);margin-bottom:4px">Discount: -$${b.discAmt.toFixed(2)}</div>`:''}
      ${b.taxAmt>0?`<div style="font-size:12px;color:var(--yellow);margin-bottom:4px">Tax: +$${b.taxAmt.toFixed(2)}</div>`:''}
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">Bill Total: $${b.total.toFixed(2)}</div>
      <div style="font-size:13px;color:var(--red);margin-bottom:4px">Previous Balance: $${b.prevBal.toFixed(2)}</div>
      <div style="font-size:18px;font-weight:800;color:var(--yellow)">Net Payable: $${b.netPayable.toFixed(2)}</div>
    </div>
    ${b.notes?`<div style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:6px;font-size:12px"><strong>Notes:</strong> ${b.notes}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn btn-accent btn-sm" onclick="printSingleSlipA4(${b.id})"><i class="fa fa-print"></i> Print A4</button>
    </div>`;
  openModal('order-detail-modal');
}

// ── BUILD A4 HTML for a single booking ──────────────────
function buildSlipA4Html(b) {
  // rows built inline below

  const s = DB.sysSettings || {};
  const storeName = s.storeName || 'SmartRetail Store';
  const storeAddress = s.address || '123 Market Street, City';
  const storePhone = s.phone || '';
  const distName = s.distributorName || '';
  const distAddress = s.distributorAddress || '';
  const distPhone = s.distributorContact || '';
  const ntn = s.ntn || '';
  const logoDataUrl = s.logoDataUrl || '';

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
          <strong style="color:#000">${b.createdBy||currentUser?.name||'Admin'}</strong>
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

function printSingleSlipA4(id) {
  const b = DB.orderBookings.find(x=>x.id===id);
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
  const statusFilter = document.getElementById('ss-status')?.value||'';
  const nameFilter   = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();
  const areaFilter   = (document.getElementById('ss-area')?.value||'').toLowerCase().trim();

  const slips = [...DB.orderBookings].reverse().filter(b=>
    b.status!=='cancelled' &&
    (!dateFilter   || b.date===dateFilter) &&
    (!statusFilter || b.status===statusFilter) &&
    (!nameFilter   || b.customerName.toLowerCase().includes(nameFilter) || (b.accountNo||'').toLowerCase().includes(nameFilter)) &&
    (!areaFilter   || (b.customerArea||'').toLowerCase().includes(areaFilter))
  );

  if (!slips.length) { toast('No slips to print for selected filters','warning'); return; }

  let html='';

  if (mode==='summary') {
    const totalBill = slips.reduce((s,b)=>s+b.total,0);
    const totalNet  = slips.reduce((s,b)=>s+b.netPayable,0);
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
            <td style="padding:6px 9px;font-family:monospace">${b.invoice}</td>
            <td style="padding:6px 9px;font-weight:700">${b.customerName}</td>
            <td style="padding:6px 9px;font-family:monospace;color:#5b21b6">${b.accountNo||'—'}</td>
            <td style="padding:6px 9px;text-align:center">${b.items.length}</td>
            <td style="padding:6px 9px;text-align:right">$${b.total.toFixed(2)}</td>
            <td style="padding:6px 9px;text-align:right;color:#dc2626">$${b.prevBal.toFixed(2)}</td>
            <td style="padding:6px 9px;text-align:right;font-weight:700;color:#b45309">$${b.netPayable.toFixed(2)}</td>
            <td style="padding:6px 9px">${b.paymentMethod||'—'}</td>
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
function renderSettings() {
  const s = DB.sysSettings;
  const setVal = (id, val) => { const el=document.getElementById(id); if(el) el.value = val||''; };
  setVal('set-storename', s.storeName);
  setVal('set-address', s.address);
  setVal('set-phone', s.phone);
  setVal('set-email', s.email);
  setVal('set-taxrate', s.taxRate);
  setVal('set-lowstock', s.lowStockThreshold);
  setVal('set-receipt-header', s.receiptHeader);
  setVal('set-receipt-footer', s.receiptFooter);
  setVal('set-dist-name', s.distributorName);
  setVal('set-dist-phone', s.distributorContact);
  setVal('set-dist-address', s.distributorAddress||'');
  setVal('set-dist-email', s.distributorEmail||'');
  setVal('set-ntn', s.ntn||'');
  const cur = document.getElementById('set-currency');
  if (cur) { Array.from(cur.options).forEach(o=>{ o.selected = o.value===s.currency||o.text===s.currency; }); }
  const tax = document.getElementById('set-show-tax');
  if (tax) tax.value = s.showTaxOnReceipt ? 'yes' : 'no';
  // Logo preview
  if (s.logoDataUrl) {
    const prev = document.getElementById('set-logo-preview');
    if (prev) prev.innerHTML = `<img src="${s.logoDataUrl}" style="width:100%;height:100%;object-fit:contain">`;
  }
  updatePreview();
}

function saveSettings() {
  const g = id => document.getElementById(id)?.value||'';
  DB.sysSettings.storeName = g('set-storename');
  DB.sysSettings.address = g('set-address');
  DB.sysSettings.phone = g('set-phone');
  DB.sysSettings.email = g('set-email');
  DB.sysSettings.taxRate = parseFloat(g('set-taxrate'))||0;
  DB.sysSettings.lowStockThreshold = parseInt(g('set-lowstock'))||10;
  DB.sysSettings.currency = g('set-currency');
  DB.sysSettings.receiptHeader = g('set-receipt-header');
  DB.sysSettings.receiptFooter = g('set-receipt-footer');
  DB.sysSettings.showTaxOnReceipt = document.getElementById('set-show-tax')?.value === 'yes';
  DB.sysSettings.distributorName = g('set-dist-name');
  DB.sysSettings.distributorContact = g('set-dist-phone');
  DB.sysSettings.distributorAddress = g('set-dist-address');
  DB.sysSettings.distributorEmail = g('set-dist-email');
  DB.sysSettings.ntn = g('set-ntn');
  updatePreview();
  toast('Settings saved successfully!', 'success');
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { toast('Logo too large. Max 500KB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    DB.sysSettings.logoDataUrl = e.target.result;
    const prev = document.getElementById('set-logo-preview');
    if (prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`;
    updatePreview();
    toast('Logo uploaded!', 'success');
  };
  reader.readAsDataURL(file);
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
  const s = DB.sysSettings;
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
function renderLedger() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  filterLedgerAccounts();
  renderAllAccountsSummary(type);
}

function filterLedgerAccounts() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const q = (document.getElementById('ldg-search')?.value||'').toLowerCase();
  const items = type==='customer' ? DB.customers : DB.suppliers;
  const sel = document.getElementById('ldg-account-select');
  if (!sel) return;
  const filtered = items.filter(x=>x.name.toLowerCase().includes(q)||(x.accountNo||'').toLowerCase().includes(q));
  sel.innerHTML = '<option value="">— Select Account —</option>' +
    filtered.map(x=>`<option value="${x.id}">${x.name}${x.accountNo?' ('+x.accountNo+')':''}</option>`).join('');
}

function loadLedgerAccount() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const id = parseInt(document.getElementById('ldg-account-select')?.value)||0;
  if (!id) {
    document.getElementById('ldg-account-summary').style.display='none';
    document.getElementById('ldg-table-card').style.display='none';
    document.getElementById('ldg-all-accounts').style.display='';
    return;
  }
  const entity = type==='customer'
    ? DB.customers.find(c=>c.id===id)
    : DB.suppliers.find(s=>s.id===id);
  if (!entity) return;

  // Get ledger entries
  const ledgerKey = type==='customer' ? 'customerLedger' : 'supplierLedger';
  DB[ledgerKey][id] = DB[ledgerKey][id] || [];

  // Add entries from orderBookings for customers
  if (type==='customer') {
    const bookingEntries = DB.orderBookings
      .filter(b=>b.customerId===id && b.status==='saved')
      .map(b=>({ date:b.date, desc:`Invoice ${b.invoice}`, debit:b.total, credit:0, ref:b.invoice, _auto:true }));
    // Merge without duplicating
    const existingRefs = new Set(DB[ledgerKey][id].map(e=>e.ref));
    bookingEntries.forEach(e=>{ if(!existingRefs.has(e.ref)) DB[ledgerKey][id].push(e); });
  }

  let entries = [...DB[ledgerKey][id]].sort((a,b)=>a.date.localeCompare(b.date));

  // Date filter
  const from = document.getElementById('ldg-from')?.value||'';
  const to   = document.getElementById('ldg-to')?.value||'';
  if (from) entries = entries.filter(e=>e.date>=from);
  if (to)   entries = entries.filter(e=>e.date<=to);

  // Running balance
  let bal = 0;
  let totalDebit = 0, totalCredit = 0;
  const rows = entries.map(e=>{
    bal += (e.debit||0) - (e.credit||0);
    totalDebit += (e.debit||0);
    totalCredit += (e.credit||0);
    return { ...e, runBal: bal };
  });

  // Show summary
  document.getElementById('ldg-account-summary').style.display='';
  document.getElementById('ldg-table-card').style.display='';
  document.getElementById('ldg-all-accounts').style.display='none';
  document.getElementById('ldg-acc-name').textContent = entity.name;
  document.getElementById('ldg-acc-no').textContent = entity.accountNo||'Supplier';
  document.getElementById('ldg-total-debit').textContent  = '$'+totalDebit.toFixed(2);
  document.getElementById('ldg-total-credit').textContent = '$'+totalCredit.toFixed(2);
  const net = totalDebit - totalCredit;
  document.getElementById('ldg-net-balance').textContent = '$'+Math.abs(net).toFixed(2);
  document.getElementById('ldg-net-balance').className = 'stat-value '+(net>0?'text-red':'text-green');
  document.getElementById('ldg-table-title').textContent = `Ledger: ${entity.name}`;

  document.getElementById('ldg-tbody').innerHTML = rows.length
    ? rows.map(r=>`
        <tr>
          <td style="font-size:12px">${r.date}</td>
          <td>${r.desc}</td>
          <td class="td-mono" style="font-size:11px">${r.ref||'—'}</td>
          <td class="text-red fw-700">${r.debit>0?'$'+r.debit.toFixed(2):'—'}</td>
          <td class="text-green fw-700">${r.credit>0?'$'+r.credit.toFixed(2):'—'}</td>
          <td class="fw-700 ${r.runBal>0?'text-red':'text-green'}">$${Math.abs(r.runBal).toFixed(2)} ${r.runBal>0?'Dr':'Cr'}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No transactions found</td></tr>`;
}

function renderAllAccountsSummary(type) {
  const items = type==='customer' ? DB.customers : DB.suppliers;
  const ledgerKey = type==='customer' ? 'customerLedger' : 'supplierLedger';
  document.getElementById('ldg-all-title').textContent = type==='customer' ? 'All Customer Accounts' : 'All Supplier Accounts';
  document.getElementById('ldg-all-tbody').innerHTML = items.map(x=>{
    const entries = DB[ledgerKey][x.id]||[];
    const totalD = entries.reduce((s,e)=>s+(e.debit||0),0);
    const totalC = entries.reduce((s,e)=>s+(e.credit||0),0);
    const net = totalD - totalC;
    return `<tr>
      <td><span class="badge badge-purple" style="font-family:var(--mono)">${x.accountNo||'—'}</span></td>
      <td class="fw-700">${x.name}</td>
      <td>${x.phone||'—'}</td>
      <td class="text-red fw-700">$${totalD.toFixed(2)}</td>
      <td class="text-green fw-700">$${totalC.toFixed(2)}</td>
      <td class="fw-700 ${net>0?'text-red':'text-green'}">$${Math.abs(net).toFixed(2)} ${net>0?'Dr':'Cr'}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('ldg-account-select').value=${x.id};loadLedgerAccount()"><i class="fa fa-eye"></i></button>
        <button class="btn btn-ghost btn-xs" onclick="openLedgerEntryModalFor(${x.id})"><i class="fa fa-plus"></i></button>
      </td>
    </tr>`;
  }).join('');
}

let _ledgerTargetId = null;
function openLedgerEntryModal() {
  const id = parseInt(document.getElementById('ldg-account-select')?.value)||0;
  if (!id) { toast('Please select an account first','warning'); return; }
  _ledgerTargetId = id;
  document.getElementById('le-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('le-ref').value = '';
  document.getElementById('le-desc').value = '';
  document.getElementById('le-debit').value = 0;
  document.getElementById('le-credit').value = 0;
  openModal('ledger-entry-modal');
}

function openLedgerEntryModalFor(id) {
  document.getElementById('ldg-account-select').value = id;
  openLedgerEntryModal();
}

function saveLedgerEntry() {
  const id = _ledgerTargetId;
  if (!id) { toast('No account selected','error'); return; }
  const type = document.getElementById('ldg-type')?.value||'customer';
  const ledgerKey = type==='customer' ? 'customerLedger' : 'supplierLedger';
  DB[ledgerKey][id] = DB[ledgerKey][id]||[];
  const entry = {
    date: document.getElementById('le-date').value,
    desc: document.getElementById('le-desc').value.trim(),
    ref:  document.getElementById('le-ref').value.trim()||'MAN-'+Date.now(),
    debit: parseFloat(document.getElementById('le-debit').value)||0,
    credit: parseFloat(document.getElementById('le-credit').value)||0,
  };
  if (!entry.desc) { toast('Description is required','error'); return; }
  DB[ledgerKey][id].push(entry);
  closeModal('ledger-entry-modal');
  loadLedgerAccount();
  toast('Entry added!','success');
}

function printLedgerA4() {
  const type = document.getElementById('ldg-type')?.value||'customer';
  const id = parseInt(document.getElementById('ldg-account-select')?.value)||0;
  if (!id) { toast('Please select an account first','warning'); return; }
  const entity = type==='customer'
    ? DB.customers.find(c=>c.id===id)
    : DB.suppliers.find(s=>s.id===id);
  if (!entity) return;
  const ledgerKey = type==='customer' ? 'customerLedger' : 'supplierLedger';
  const entries = [...(DB[ledgerKey][id]||[])].sort((a,b)=>a.date.localeCompare(b.date));
  let bal=0, totalD=0, totalC=0;
  const rows = entries.map(e=>{
    bal+=(e.debit||0)-(e.credit||0); totalD+=(e.debit||0); totalC+=(e.credit||0);
    return `<tr>
      <td>${e.date}</td><td>${e.desc}</td><td style="font-family:monospace">${e.ref||'—'}</td>
      <td style="text-align:right;color:#dc2626">${e.debit>0?'$'+e.debit.toFixed(2):'—'}</td>
      <td style="text-align:right;color:#16a34a">${e.credit>0?'$'+e.credit.toFixed(2):'—'}</td>
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
function renderBalanceSheet() {
  // Income
  const salesIncome = DB.orders.filter(o=>o.status==='Completed').reduce((s,o)=>s+o.total,0)
    + DB.orderBookings.filter(b=>b.status==='saved').reduce((s,b)=>s+b.total,0)
    + 28500; // seed
  const totalExpenses = DB.expenses.reduce((s,e)=>s+e.amount,0);
  const purchaseCost = DB.purchases.reduce((s,p)=>s+p.total,0);
  const cogs = DB.products.reduce((s,p)=>s+(p.buyPrice||0)*(p.stock||0),0);
  const grossProfit = salesIncome - purchaseCost;
  const netProfit = salesIncome - totalExpenses - purchaseCost;

  // Customer receivables
  const custReceivables = DB.customers.map(c=>{
    const entries = DB.customerLedger?.[c.id]||[];
    const bal = entries.reduce((s,e)=>s+(e.debit||0)-(e.credit||0),0);
    return { name:c.name, acc:c.accountNo, bal };
  }).filter(x=>x.bal>0);
  const totalReceivable = custReceivables.reduce((s,x)=>s+x.bal,0);

  // Supplier payables
  const supPayables = DB.suppliers.map(s=>{
    const entries = DB.supplierLedger?.[s.id]||[];
    const bal = entries.reduce((a,e)=>a+(e.debit||0)-(e.credit||0),0);
    return { name:s.name, bal };
  }).filter(x=>x.bal>0);
  const totalPayable = supPayables.reduce((s,x)=>s+x.bal,0);

  // KPIs
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

  // Income breakdown
  document.getElementById('bs-income-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${[
        ['Sales (Orders)', salesIncome-28500],
        ['Seed/Opening Revenue', 28500],
      ].map(([l,v])=>`
        <div class="flex-between" style="padding:10px;background:var(--bg-secondary);border-radius:8px">
          <span style="font-size:13px">${l}</span>
          <span class="fw-700 text-green">$${v.toFixed(2)}</span>
        </div>`).join('')}
      <div class="flex-between" style="padding:10px;background:var(--green-glow);border:1px solid rgba(16,185,129,.2);border-radius:8px">
        <span style="font-size:14px;font-weight:700">Total Revenue</span>
        <span style="font-size:16px;font-weight:800;color:var(--green)">$${salesIncome.toFixed(2)}</span>
      </div>
    </div>`;

  // Expense breakdown
  const expByCategory = {};
  DB.expenses.forEach(e=>{ expByCategory[e.category]=(expByCategory[e.category]||0)+e.amount; });
  expByCategory['Purchases/COGS'] = purchaseCost;
  document.getElementById('bs-expense-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${Object.entries(expByCategory).map(([k,v])=>`
        <div class="flex-between" style="padding:9px 12px;background:var(--bg-secondary);border-radius:8px">
          <span style="font-size:13px">${k}</span>
          <span class="fw-700 text-red">$${v.toFixed(2)}</span>
        </div>`).join('')}
      <div class="flex-between" style="padding:10px;background:var(--red-glow);border:1px solid rgba(239,68,68,.2);border-radius:8px">
        <span style="font-size:14px;font-weight:700">Total Expenses</span>
        <span style="font-size:16px;font-weight:800;color:var(--red)">$${(totalExpenses+purchaseCost).toFixed(2)}</span>
      </div>
    </div>`;

  // Receivables
  document.getElementById('bs-receivables').innerHTML = `<table>
    <thead><tr><th>Customer</th><th>Account</th><th>Balance Due</th></tr></thead>
    <tbody>
      ${custReceivables.map(x=>`<tr><td class="fw-700">${x.name}</td><td class="td-mono">${x.acc||'—'}</td><td class="fw-700 text-red">$${x.bal.toFixed(2)}</td></tr>`).join('')}
      <tr style="background:var(--bg-secondary)"><td colspan="2" class="fw-700">Total Receivable</td><td class="fw-700 text-red" style="font-size:14px">$${totalReceivable.toFixed(2)}</td></tr>
    </tbody></table>`;

  // Payables
  document.getElementById('bs-payables').innerHTML = `<table>
    <thead><tr><th>Supplier</th><th>Balance Owed</th></tr></thead>
    <tbody>
      ${supPayables.map(x=>`<tr><td class="fw-700">${x.name}</td><td class="fw-700 text-yellow">$${x.bal.toFixed(2)}</td></tr>`).join('')}
      <tr style="background:var(--bg-secondary)"><td class="fw-700">Total Payable</td><td class="fw-700 text-yellow" style="font-size:14px">$${totalPayable.toFixed(2)}</td></tr>
    </tbody></table>`;

  // P&L
  const cashBalance = salesIncome - totalExpenses - purchaseCost + totalReceivable - totalPayable;
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
        <div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Cash Position</div>
        ${[
          ['Cash From Sales', salesIncome, 'text-green'],
          ['Receivable (Credit)', totalReceivable, 'text-accent'],
          ['Payable (Owed)', -totalPayable, 'text-yellow'],
          ['Expenses Paid', -totalExpenses-purchaseCost, 'text-red'],
          ['Net Cash Position', cashBalance, cashBalance>=0?'text-green':'text-red'],
        ].map(([l,v,c])=>`
          <div class="flex-between" style="padding:10px 14px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px">
            <span style="font-size:13px">${l}</span>
            <span class="fw-700 ${c}" style="font-size:14px">$${Math.abs(v).toFixed(2)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function printBalanceSheetA4() {
  const salesIncome = DB.orders.filter(o=>o.status==='Completed').reduce((s,o)=>s+o.total,0)
    + DB.orderBookings.filter(b=>b.status==='saved').reduce((s,b)=>s+b.total,0) + 28500;
  const totalExpenses = DB.expenses.reduce((s,e)=>s+e.amount,0);
  const purchaseCost = DB.purchases.reduce((s,p)=>s+p.total,0);
  const netProfit = salesIncome - totalExpenses - purchaseCost;
  const today = new Date().toLocaleDateString();

  const custReceivables = DB.customers.map(c=>{
    const bal = (DB.customerLedger?.[c.id]||[]).reduce((s,e)=>s+(e.debit||0)-(e.credit||0),0);
    return { name:c.name, acc:c.accountNo, bal };
  }).filter(x=>x.bal>0);
  const supPayables = DB.suppliers.map(s=>{
    const bal = (DB.supplierLedger?.[s.id]||[]).reduce((a,e)=>a+(e.debit||0)-(e.credit||0),0);
    return { name:s.name, bal };
  }).filter(x=>x.bal>0);

  const expByCategory = {};
  DB.expenses.forEach(e=>{ expByCategory[e.category]=(expByCategory[e.category]||0)+e.amount; });

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

function populateSRProductDropdown() {
  const sel = document.getElementById('sr-product-select');
  if (!sel) return;
  const q = (document.getElementById('sr-product-search')?.value || '').toLowerCase();
  const filtered = DB.products.filter(p =>
    !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q)
  );
  sel.innerHTML = '<option value="">— Choose a product —</option>' +
    filtered.map(p => `<option value="${p.id}">${p.icon||'📦'} ${p.name} (${p.sku})</option>`).join('');
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

function renderSingleProductReport() {
  const sel = document.getElementById('sr-product-select');
  const prodId = parseInt(sel?.value);
  const placeholder = document.getElementById('sr-single-placeholder');
  const content = document.getElementById('sr-single-content');

  if (!prodId) {
    placeholder.style.display = '';
    content.style.display = 'none';
    return;
  }

  const p = DB.products.find(x => x.id === prodId);
  if (!p) return;

  placeholder.style.display = 'none';
  content.style.display = '';

  const today = new Date().toISOString().split('T')[0];
  const reportDate = document.getElementById('sr-date')?.value || today;
  const ppc = p.piecesPerCarton || 1;
  const remaining = p.stock || 0;
  const cartons = ppc > 1 ? Math.floor(remaining / ppc) : 0;
  const loose   = ppc > 1 ? remaining % ppc : remaining;
  const value   = remaining * (p.sellPrice || 0);
  const statusColor = remaining === 0 ? 'var(--red)' : remaining <= p.minStock ? 'var(--yellow)' : 'var(--green)';

  // Product header
  document.getElementById('sr-prod-icon').textContent  = p.icon || '📦';
  document.getElementById('sr-prod-name').textContent  = p.name;
  document.getElementById('sr-prod-sku').textContent   = p.sku;
  document.getElementById('sr-prod-brand').textContent = p.brand || '—';
  document.getElementById('sr-prod-cat').textContent   = p.category || '—';
  document.getElementById('sr-prod-ppc').textContent   = ppc > 1 ? ppc + ' pcs' : 'N/A';

  const stockEl = document.getElementById('sr-prod-stock');
  stockEl.textContent = remaining + ' pcs';
  stockEl.style.color = statusColor;
  document.getElementById('sr-prod-cartons').textContent = ppc > 1 ? cartons : '—';
  document.getElementById('sr-prod-loose').textContent   = ppc > 1 ? loose + ' pcs' : remaining + ' pcs';
  document.getElementById('sr-prod-value').textContent   = 'Rs. ' + value.toFixed(0);

  // Build sales history from orderBookings
  const salesRows = [];
  DB.orderBookings.filter(b => b.status === 'saved').forEach(b => {
    b.items.forEach(it => {
      if (it.productId === prodId || it.name === p.name) {
        const tppc = it.ppc || 1;
        const qty = (it.qty || 0) + (it.cartons || 0) * tppc;
        const ctns = tppc > 1 ? (it.cartons || 0) : 0;
        const lpcs = it.qty || 0;
        const amt  = qty * (it.rate || p.sellPrice || 0);
        salesRows.push({ date: b.date, invoice: b.invoice, customer: b.customerName, qty, ctns, lpcs, rate: it.rate || p.sellPrice || 0, amt });
      }
    });
  });
  // Also check POS orders
  DB.orders.forEach(o => {
    (o.items || []).forEach(it => {
      if (it.id === prodId || it.name === p.name) {
        const oDate = (o.date || '').split(',')[0].split(' ')[0] || o.date || '';
        const amt = (it.qty || 0) * (it.price || p.sellPrice || 0);
        salesRows.push({ date: oDate, invoice: o.invoice, customer: o.customer || 'Walk-in', qty: it.qty || 0, ctns: 0, lpcs: it.qty || 0, rate: it.price || p.sellPrice || 0, amt });
      }
    });
  });

  // Sort by date desc
  salesRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalSold = salesRows.reduce((s, r) => s + r.qty, 0);
  const totalRev  = salesRows.reduce((s, r) => s + r.amt, 0);

  document.getElementById('sr-prod-history-label').textContent = salesRows.length + ' transaction(s) found';

  document.getElementById('sr-prod-history-tbody').innerHTML = salesRows.length
    ? salesRows.map((r, i) => `<tr>
        <td>${r.date || '—'}</td>
        <td class="td-mono">${r.invoice || '—'}</td>
        <td style="font-weight:600">${r.customer}</td>
        <td class="fw-700 text-accent">${r.qty} pcs</td>
        <td>${r.ctns > 0 ? '<span class="badge badge-cyan">📦 ' + r.ctns + '</span>' : '—'}</td>
        <td>${r.lpcs > 0 ? '<span class="badge badge-yellow">' + r.lpcs + ' pcs</span>' : '—'}</td>
        <td>Rs. ${(r.rate || 0).toFixed(2)}</td>
        <td class="fw-700 text-green">Rs. ${r.amt.toFixed(2)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No sales records found for this product</td></tr>';

  // Stats
  const openingStock = remaining + totalSold;
  document.getElementById('sr-prod-stats').innerHTML = [
    { label: 'Total Sold (All Time)', val: totalSold + ' pcs', color: 'blue',   icon: 'fa-shopping-cart' },
    { label: 'Total Revenue',          val: 'Rs. ' + totalRev.toFixed(0),  color: 'green',  icon: 'fa-rupee-sign' },
    { label: 'Buy Price',              val: 'Rs. ' + (p.buyPrice || 0).toFixed(2), color: 'yellow', icon: 'fa-tag' },
    { label: 'Sell Price',             val: 'Rs. ' + (p.sellPrice || 0).toFixed(2), color: 'purple', icon: 'fa-dollar-sign' },
  ].map(k => `
    <div class="stat-card ${k.color}">
      <div class="stat-header"><div class="stat-icon ${k.color}"><i class="fa ${k.icon}"></i></div></div>
      <div class="stat-value" style="font-size:20px">${k.val}</div>
      <div class="stat-label">${k.label}</div>
    </div>`).join('');

  // Stock movement log
  const movements = (DB.stockHistory || []).filter(h => h.product === p.name);
  movements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  document.getElementById('sr-prod-movement-tbody').innerHTML = movements.length
    ? movements.map(h => {
        const isNeg = (h.qty || 0) < 0;
        const typeColor = h.type === 'Sale' ? 'var(--red)' : h.type === 'Purchase' ? 'var(--green)' : 'var(--yellow)';
        return `<tr>
          <td style="font-size:11px">${h.date || '—'}</td>
          <td><span class="badge ${h.type==='Sale'?'badge-red':h.type==='Purchase'?'badge-green':'badge-yellow'}">${h.type || '—'}</span></td>
          <td style="font-weight:700;color:${typeColor}">${(h.qty || 0) > 0 ? '+' : ''}${h.qty || 0}</td>
          <td>${h.before ?? '—'}</td>
          <td style="font-weight:700">${h.after ?? '—'}</td>
          <td class="td-mono" style="font-size:11px">${h.ref || '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No movement records found</td></tr>';
}

function renderStockReport() {
  const today = new Date().toISOString().split('T')[0];
  const srDate = document.getElementById('sr-date');
  if (srDate && !srDate.value) srDate.value = today;
  const reportDate = srDate?.value || today;
  const catFilter   = document.getElementById('sr-cat')?.value || '';
  const stockFilter = document.getElementById('sr-stockfilter')?.value || '';

  // If in single mode, re-render single report
  if (_srMode === 'single') {
    renderSingleProductReport();
    return;
  }

  // Populate categories dropdown
  const catSel = document.getElementById('sr-cat');
  if (catSel && catSel.options.length <= 1) {
    DB.categories.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.text = c;
      catSel.appendChild(o);
    });
  }

  document.getElementById('sr-date-label').textContent = 'Report Date: ' + reportDate;

  // Calculate sold today
  const soldMap = {};
  DB.orderBookings.filter(b => b.date === reportDate && b.status === 'saved').forEach(b => {
    b.items.forEach(it => {
      const ppc = it.ppc || 1;
      const tp  = (it.qty || 0) + (it.cartons || 0) * ppc;
      soldMap[it.productId] = (soldMap[it.productId] || 0) + tp;
    });
  });
  DB.orders.filter(o => {
    const d = (o.date || '').split(',')[0].split(' ')[0] || o.date || '';
    return d === reportDate && o.status === 'Completed';
  }).forEach(o => {
    (o.items || []).forEach(it => { soldMap[it.id] = (soldMap[it.id] || 0) + (it.qty || 0); });
  });

  let prods = DB.products;
  if (catFilter)              prods = prods.filter(p => p.category === catFilter);
  if (stockFilter === 'low')  prods = prods.filter(p => p.stock > 0 && p.stock <= p.minStock);
  if (stockFilter === 'out')  prods = prods.filter(p => p.stock === 0);
  if (stockFilter === 'ok')   prods = prods.filter(p => p.stock > p.minStock);

  const totalProds = prods.length;
  const inStock    = prods.filter(p => p.stock > p.minStock).length;
  const lowStock   = prods.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
  const outStock   = prods.filter(p => p.stock === 0).length;
  const totalValue = prods.reduce((s, p) => s + (p.sellPrice || 0) * (p.stock || 0), 0);

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
    const ppc = p.piecesPerCarton || 1;
    const soldToday    = soldMap[p.id] || 0;
    const openingStock = p.stock + soldToday;
    const remaining    = p.stock;
    const cartons = ppc > 1 ? Math.floor(remaining / ppc) : 0;
    const loose   = ppc > 1 ? remaining % ppc : remaining;
    const val = remaining * (p.sellPrice || 0);
    const statusColor = remaining === 0 ? 'red' : remaining <= p.minStock ? 'yellow' : 'green';
    const statusText  = remaining === 0 ? 'Out of Stock' : remaining <= p.minStock ? 'Low Stock' : 'In Stock';
    return `<tr>
      <td>
        <div class="flex-gap">
          <span style="font-size:18px">${p.icon || '📦'}</span>
          <div>
            <div style="font-weight:600">${p.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${p.brand || ''}</div>
          </div>
        </div>
      </td>
      <td class="td-mono">${p.sku}</td>
      <td><span class="badge badge-blue">${p.category}</span></td>
      <td>${openingStock}</td>
      <td class="text-red fw-700">${soldToday > 0 ? soldToday : '—'}</td>
      <td class="fw-700" style="color:${remaining===0?'var(--red)':remaining<=p.minStock?'var(--yellow)':'var(--green)'}">${remaining}</td>
      <td>${ppc > 1 ? `<span class="badge badge-cyan">📦 ${cartons}</span>` : '—'}</td>
      <td>${ppc > 1 ? `<span class="badge badge-yellow">${loose}</span>` : remaining}</td>
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

  // Print ALL products report
  const soldMap = {};
  DB.orderBookings.filter(b => b.date === reportDate && b.status === 'saved').forEach(b => {
    b.items.forEach(it => { const tp = (it.qty || 0) + (it.cartons || 0) * (it.ppc || 1); soldMap[it.productId] = (soldMap[it.productId] || 0) + tp; });
  });
  const totalValue = DB.products.reduce((s, p) => s + (p.sellPrice || 0) * (p.stock || 0), 0);
  const rows = DB.products.map((p, i) => {
    const ppc = p.piecesPerCarton || 1;
    const sold = soldMap[p.id] || 0;
    const opening = p.stock + sold;
    const cartons = ppc > 1 ? Math.floor(p.stock / ppc) : 0;
    const loose   = ppc > 1 ? p.stock % ppc : p.stock;
    const val = p.stock * (p.sellPrice || 0);
    const st  = p.stock === 0 ? 'Out' : p.stock <= p.minStock ? 'Low' : 'OK';
    return `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
      <td style="padding:6px 8px">${i+1}</td>
      <td style="padding:6px 8px">${p.icon||''} <strong>${p.name}</strong></td>
      <td style="padding:6px 8px;font-family:monospace">${p.sku}</td>
      <td style="padding:6px 8px">${p.category}</td>
      <td style="padding:6px 8px;text-align:center">${opening}</td>
      <td style="padding:6px 8px;text-align:center;color:#dc2626;font-weight:700">${sold > 0 ? sold : '—'}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:800;color:${p.stock===0?'#dc2626':p.stock<=p.minStock?'#b45309':'#16a34a'}">${p.stock}</td>
      <td style="padding:6px 8px;text-align:center">${ppc > 1 ? cartons + ' ctn' : '—'}</td>
      <td style="padding:6px 8px;text-align:center">${ppc > 1 ? loose + ' pcs' : p.stock}</td>
      <td style="padding:6px 8px;text-align:right">Rs. ${val.toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;color:${p.stock===0?'#dc2626':p.stock<=p.minStock?'#b45309':'#16a34a'}">${st}</td>
    </tr>`;
  }).join('');

  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('STOCK REPORT', 'SR-'+reportDate, reportDate)}
    <div style="padding:5mm 0 3mm"><strong>Overall Stock Report — ${reportDate}</strong> &nbsp;·&nbsp; ${DB.products.length} products &nbsp;·&nbsp; Total Value: Rs. ${totalValue.toFixed(2)}</div>
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
          <td colspan="9" style="padding:7px 8px">TOTALS — ${DB.products.length} products</td>
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

function printSingleProductA4(prodId, reportDate) {
  const p = DB.products.find(x => x.id === prodId);
  if (!p) return;
  const ppc = p.piecesPerCarton || 1;
  const remaining = p.stock || 0;
  const cartons   = ppc > 1 ? Math.floor(remaining / ppc) : 0;
  const loose     = ppc > 1 ? remaining % ppc : remaining;
  const value     = remaining * (p.sellPrice || 0);
  const statusText = remaining === 0 ? 'OUT OF STOCK' : remaining <= p.minStock ? 'LOW STOCK' : 'IN STOCK';
  const statusColor = remaining === 0 ? '#dc2626' : remaining <= p.minStock ? '#b45309' : '#16a34a';

  // Gather sales
  const salesRows = [];
  DB.orderBookings.filter(b => b.status === 'saved').forEach(b => {
    b.items.forEach(it => {
      if (it.productId === prodId || it.name === p.name) {
        const tppc = it.ppc || 1;
        const qty  = (it.qty || 0) + (it.cartons || 0) * tppc;
        const ctns = tppc > 1 ? (it.cartons || 0) : 0;
        const lpcs = it.qty || 0;
        const amt  = qty * (it.rate || p.sellPrice || 0);
        salesRows.push({ date: b.date, invoice: b.invoice, customer: b.customerName, qty, ctns, lpcs, rate: it.rate || p.sellPrice || 0, amt });
      }
    });
  });
  DB.orders.forEach(o => {
    (o.items || []).forEach(it => {
      if (it.id === prodId || it.name === p.name) {
        const oDate = (o.date || '').split(',')[0].split(' ')[0] || o.date || '';
        salesRows.push({ date: oDate, invoice: o.invoice, customer: o.customer || 'Walk-in', qty: it.qty || 0, ctns: 0, lpcs: it.qty || 0, rate: it.price || p.sellPrice || 0, amt: (it.qty||0)*(it.price||p.sellPrice||0) });
      }
    });
  });
  salesRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalSold = salesRows.reduce((s, r) => s + r.qty, 0);
  const totalRev  = salesRows.reduce((s, r) => s + r.amt, 0);

  // Movement log
  const movements = (DB.stockHistory || []).filter(h => h.product === p.name);
  movements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const html = `<div class="a4-doc">
    ${getInvoiceHeaderHtml('STOCK REPORT', 'SR-PROD-'+reportDate, reportDate)}
    <div style="padding:4mm 0 3mm">
      <strong style="font-size:14px">Per Product Report — ${p.icon||'📦'} ${p.name}</strong>
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
        <div>Brand: <strong>${p.brand||'—'}</strong></div>
        <div>Category: <strong>${p.category||'—'}</strong></div>
        <div>Pcs/Carton: <strong>${ppc>1?ppc+' pcs':'N/A'}</strong></div>
        <div>Min Stock: <strong>${p.minStock||0} pcs</strong></div>
      </div>
      <div style="border:1px solid #ddd;border-radius:5px;padding:10px">
        <div style="font-weight:700;font-size:10px;color:#777;margin-bottom:5px;text-transform:uppercase">Pricing & Sales</div>
        <div>Buy Price: <strong>Rs. ${(p.buyPrice||0).toFixed(2)}</strong></div>
        <div>Sell Price: <strong>Rs. ${(p.sellPrice||0).toFixed(2)}</strong></div>
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
        Cashier: ${currentUser?.name || 'Admin'}
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

function renderSupplyRoutes() {
  // Stats
  const routes = DB.routes || [];
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
  const routes = (DB.routes || []).filter(r => r.status !== 'Inactive' || true);
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
  const routes = (DB.routes||[]).filter(r =>
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
    const suppNames = (r.suppliers||[]).map(sid => DB.suppliers.find(s=>s.id===sid)?.name||'').filter(Boolean);
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

function openRouteModal() {
  document.getElementById('route-modal-title').textContent = 'Add New Route';
  document.getElementById('route-edit-id').value = '';
  ['rt-name','rt-area','rt-person','rt-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('rt-status').value = 'Active';
  // Reset day toggles
  document.querySelectorAll('.rt-day-toggle').forEach(el => el.classList.remove('active'));
  _initDayToggles([]);
  _initSupplierToggles([]);
  openModal('route-modal');
}

function editRoute(id) {
  const r = DB.routes.find(x => x.id === id);
  if (!r) return;
  document.getElementById('route-modal-title').textContent = 'Edit Route';
  document.getElementById('route-edit-id').value = r.id;
  document.getElementById('rt-name').value  = r.name;
  document.getElementById('rt-area').value  = r.area||'';
  document.getElementById('rt-person').value = r.person||'';
  document.getElementById('rt-notes').value = r.notes||'';
  document.getElementById('rt-status').value = r.status||'Active';
  _initDayToggles(r.days||[]);
  _initSupplierToggles(r.suppliers||[]);
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

function _initSupplierToggles(activeIds) {
  document.getElementById('rt-supplier-list').innerHTML = DB.suppliers.map(s => {
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

function saveRoute() {
  const name = document.getElementById('rt-name').value.trim();
  if (!name) { toast('Route name is required!','error'); return; }
  const days = Array.from(document.querySelectorAll('.rt-day-toggle')).filter(el => el._active).map(el => el.getAttribute('data-day'));
  const suppliers = Array.from(document.querySelectorAll('.rt-sup-cb:checked')).map(c => parseInt(c.value));
  const data = {
    name,
    area:    document.getElementById('rt-area').value.trim(),
    person:  document.getElementById('rt-person').value.trim(),
    notes:   document.getElementById('rt-notes').value.trim(),
    status:  document.getElementById('rt-status').value,
    days, suppliers
  };
  const editId = parseInt(document.getElementById('route-edit-id').value);
  if (editId) {
    Object.assign(DB.routes.find(r => r.id === editId), data);
    toast('Route updated!', 'success');
  } else {
    data.id = Math.max(0, ...(DB.routes||[]).map(r=>r.id)) + 1;
    (DB.routes = DB.routes||[]).push(data);
    toast('Route created!', 'success');
  }
  closeModal('route-modal');
  renderSupplyRoutes();
}

function deleteRoute(id) {
  if (!confirm('Delete this route?')) return;
  DB.routes = DB.routes.filter(r => r.id !== id);
  renderSupplyRoutes();
  toast('Route deleted', 'success');
}

// ═══════════════════════════════════════════════════════
// ORDER SUMMARY MODULE
// ═══════════════════════════════════════════════════════
function renderOrderSummary() {
  const fromVal    = document.getElementById('os-date-from')?.value;
  const toVal      = document.getElementById('os-date-to')?.value;
  const q          = (document.getElementById('os-search')?.value||'').toLowerCase();
  const usernameFilter = document.getElementById('os-username-filter')?.value || '';

  // Populate username dropdown (idempotent)
  const usDd = document.getElementById('os-username-filter');
  if (usDd) {
    const uniqueUsers = [...new Set(
      (DB.orderBookings||[]).filter(b => b.createdBy).map(b => b.createdBy)
    )].sort();
    const current = usDd.value;
    usDd.innerHTML = '<option value="">All Users</option>' +
      uniqueUsers.map(u => `<option value="${u}" ${u===current?'selected':''}>${u}${DB.users?.find(x=>x.username===u)?' ('+DB.users.find(x=>x.username===u).name+')':''}</option>`).join('');
    if (current) usDd.value = current;
  }

  const bookings = (DB.orderBookings||[]).filter(b => {
    if (b.status === 'cancelled') return false;
    const bDate = (b.date||'').split('T')[0];
    if (fromVal && bDate < fromVal) return false;
    if (toVal   && bDate > toVal)   return false;
    if (usernameFilter && (b.createdBy||'') !== usernameFilter) return false;
    return true;
  });

  // ── Financial KPIs (username/date-aware) ─────────────
  const finOrders   = bookings.length;
  const finAmount   = bookings.reduce((s,b) => s+(b.total||0), 0);
  const finTax      = bookings.reduce((s,b) => s+(b.taxAmt||b.gstAmt||0), 0);
  const finDiscount = bookings.reduce((s,b) => s+(b.discAmt||0), 0);
  // Received = payments by customers who had bookings in this set
  const custIdsInSet = [...new Set(bookings.map(b=>b.customerId).filter(Boolean))];
  const finReceived = (DB.collectionPayments||[])
    .filter(p => custIdsInSet.includes(p.customerId))
    .reduce((s,p) => s+p.amount, 0);
  const finPending  = Math.max(0, finAmount - finReceived);

  const f = v => 'Rs.' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('os-fin-orders',   finOrders.toLocaleString());
  setEl('os-fin-amount',   f(finAmount));
  setEl('os-fin-tax',      f(finTax));
  setEl('os-fin-discount', f(finDiscount));
  setEl('os-fin-pending',  f(finPending));
  setEl('os-fin-received', f(finReceived));

  // ── Username badge above table ─────────────────────────
  const usBadge = document.getElementById('os-username-badge');
  if (usBadge) {
    usBadge.style.display = usernameFilter ? '' : 'none';
    if (usernameFilter) {
      const usr = DB.users?.find(x=>x.username===usernameFilter);
      usBadge.innerHTML = `<i class="fa fa-user-tag"></i> Showing orders by: <strong>${usernameFilter}</strong>${usr?' ('+usr.name+')':''} <button onclick="document.getElementById('os-username-filter').value='';renderOrderSummary()" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:6px;font-size:12px">✕ Clear</button>`;
    }
  }

  // Aggregate per product
  const productMap = {};
  bookings.forEach(bk => {
    (bk.items||[]).forEach(it => {
      const prod = DB.products.find(p => p.id === it.productId || p.name === it.name);
      const key  = prod ? prod.id : it.name;
      if (!productMap[key]) {
        productMap[key] = {
          name: it.name,
          icon: prod?.icon || '📦',
          sku:  prod?.sku || '—',
          piecesPerCarton: prod?.piecesPerCarton || 1,
          buyPrice: prod?.buyPrice || it.rate || 0,
          totalPieces: 0,
          orderCount:  0,
        };
      }
      productMap[key].totalPieces += (it.totalPcs || it.qty || 0);
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
    if (!bookings.length && !(DB.orderBookings||[]).length) {
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

  const bookings = (DB.orderBookings||[]).filter(b => {
    if (b.status === 'cancelled') return false;
    const d = (b.date||'').split('T')[0];
    if (fromVal && d < fromVal) return false;
    if (toVal   && d > toVal)   return false;
    if (usernameFilter && (b.createdBy||'') !== usernameFilter) return false;
    return true;
  });

  const headers = ['Invoice','Date','Customer','Account','Username','Subtotal','Tax','Discount','Total','Net Payable','Status'];
  const dataRows = bookings.map(b => [
    b.invoice, b.date, b.customerName, b.accountNo||'', b.createdBy||'',
    (b.subtotal||0).toFixed(2), (b.taxAmt||0).toFixed(2), (b.discAmt||0).toFixed(2),
    (b.total||0).toFixed(2), (b.netPayable||0).toFixed(2), b.status
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
      <div class="a4-store-info"><strong>ORDER SUMMARY</strong><br>Generated: ${today}<br>By: ${currentUser?.name||'Admin'}</div>
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
window.renderSaleSlips = function() {
  const dateFilter     = document.getElementById('ss-date')?.value||'';
  const statusFilter   = document.getElementById('ss-status')?.value||'';
  const nameFilter     = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();
  const areaFilter     = (document.getElementById('ss-area')?.value||'').toLowerCase().trim();
  const invoiceFilter  = (document.getElementById('ss-invoice')?.value||'').toLowerCase().trim();
  const usernameFilter = (document.getElementById('ss-username')?.value||'').toLowerCase().trim();

  const slips = [...DB.orderBookings].reverse().filter(b =>
    b.status !== 'cancelled' &&
    (!dateFilter     || b.date === dateFilter) &&
    (!statusFilter   || b.status === statusFilter) &&
    (!nameFilter     || (b.customerName||'').toLowerCase().includes(nameFilter) || (b.accountNo||'').toLowerCase().includes(nameFilter)) &&
    (!areaFilter     || (b.customerArea||'').toLowerCase().includes(areaFilter)) &&
    (!invoiceFilter  || (b.invoice||'').toLowerCase().includes(invoiceFilter) || (b.accountNo||'').toLowerCase().includes(invoiceFilter)) &&
    (!usernameFilter || (b.createdBy||'').toLowerCase().includes(usernameFilter) || (b.createdByName||'').toLowerCase().includes(usernameFilter))
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
    const statusClass = b.status === 'saved' ? 'badge-green' : b.status === 'draft' ? 'badge-yellow' : 'badge-red';
    const hasTax  = (b.taxAmt||0) > 0;
    const hasDisc = (b.discAmt||0) > 0;
    return `<tr>
      <td class="td-mono" style="font-weight:700">${b.invoice}</td>
      <td style="font-size:12px">${b.date}</td>
      <td style="font-weight:600">${b.customerName}
        ${b.createdBy ? `<div style="font-size:10px;color:var(--text-muted)"><i class="fa fa-user-tag"></i> ${b.createdBy}</div>` : ''}
      </td>
      <td class="td-mono">${b.accountNo||'—'}</td>
      <td style="text-align:center">${b.items?.length||0}</td>
      <td class="fw-700 td-mono">Rs.${(b.subtotal||0).toFixed(2)}
        ${hasTax && ssSettings.showTax ? `<div style="font-size:10px;color:var(--yellow)">+Rs.${(b.taxAmt||0).toFixed(2)} tax</div>` : ''}
        ${hasDisc && ssSettings.showDiscount ? `<div style="font-size:10px;color:var(--green)">-Rs.${(b.discAmt||0).toFixed(2)} disc</div>` : ''}
      </td>
      <td class="fw-700 td-mono" style="color:var(--yellow)">Rs.${(b.netPayable||0).toFixed(2)}</td>
      <td><span class="badge ${statusClass}">${b.status}</span></td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-ghost btn-xs" onclick="viewSlipDetail(${b.id})" title="View Details"><i class="fa fa-eye"></i></button>
          <button class="btn btn-ghost btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print"><i class="fa fa-print"></i></button>
          <button class="btn btn-accent btn-xs" onclick="downloadSlipInvoice(${b.id})" title="Download"><i class="fa fa-download"></i></button>
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

window.viewSlipDetail   = id => viewOrderDetail(id);

window.downloadSlipInvoice = function(id) {
  const b = DB.orderBookings.find(x => x.id === id);
  if (!b) { toast('Booking not found','error'); return; }
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ' + b.invoice + '</title></head><body style="margin:0;padding:20px;font-family:sans-serif">' + buildSlipA4Html(b) + '</body></html>';
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'Invoice-' + b.invoice + '.html'; a.click();
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

// Patch openProductModal to reset new fields
const _origOpenProductModal = window.openProductModal;
window.openProductModal = function(id) {
  if (!id) {
    ['prod-discount','prod-tax'].forEach(fid => { const el=document.getElementById(fid); if(el) el.value=''; });
    const summ = document.getElementById('prod-pricing-summary');
    if (summ) summ.style.display = 'none';
  }
  if (_origOpenProductModal) _origOpenProductModal(id);
};

// Patch editProduct to load discount/tax
const _origEditProduct = window.editProduct;
window.editProduct = function(id) {
  if (_origEditProduct) _origEditProduct(id);
  const p = DB.products.find(x => x.id === id);
  if (!p) return;
  const disc = document.getElementById('prod-discount');
  const tax  = document.getElementById('prod-tax');
  if (disc) disc.value = p.discount || '';
  if (tax)  tax.value  = p.tax || '';
  calcProdPricing();
};

// Patch saveProduct to persist discount/tax + propagate to booking items
const _origSaveProduct = window.saveProduct;
window.saveProduct = function() {
  const discount = parseFloat(document.getElementById('prod-discount')?.value) || 0;
  const tax      = parseFloat(document.getElementById('prod-tax')?.value) || 0;
  const editId   = parseInt(document.getElementById('prod-edit-id')?.value);
  if (_origSaveProduct) _origSaveProduct();
  // Attach discount/tax to saved product
  if (editId) {
    const p = DB.products.find(x => x.id === editId);
    if (p) { p.discount = discount; p.tax = tax; }
  } else {
    const last = DB.products[DB.products.length - 1];
    if (last) { last.discount = discount; last.tax = tax; }
  }
};

// ── CUSTOMER COLLECTION — full v2 with username filter ─
if (!DB.collectionPayments) DB.collectionPayments = [];
if (!DB.saleReturns)      DB.saleReturns = [];
if (!DB.purchaseReturns)  DB.purchaseReturns = [];

function _custBookings(custId) {
  const c = DB.customers.find(x => x.id === custId);
  return DB.orderBookings.filter(b =>
    b.status === 'saved' &&
    (b.customerId === custId || (c && b.customerName === c.name))
  );
}

function getCustomerBalance(custId) {
  const bookings = _custBookings(custId);
  const totalOrders = bookings.reduce((s, b) => s + (b.total||0), 0);
  const payments    = DB.collectionPayments.filter(p => p.customerId === custId).reduce((s, p) => s + p.amount, 0);
  return { totalOrders, payments, balance: totalOrders - payments };
}

function getTodayOrders(custId) {
  const today = new Date().toISOString().split('T')[0];
  return _custBookings(custId).filter(b => b.date === today).reduce((s, b) => s + (b.total||0), 0);
}

function getLastPaymentDate(custId) {
  const pays = DB.collectionPayments.filter(p => p.customerId === custId);
  if (!pays.length) { const c = DB.customers.find(x => x.id === custId); return c?.lastVisit || '—'; }
  return pays.sort((a,b) => (b.date||'').localeCompare(a.date||''))[0].date || '—';
}

// Build username summary: all bookings by a username across all customers
function getUsernameCollectionRows(username) {
  const lc = username.toLowerCase();
  const bookings = DB.orderBookings.filter(b =>
    b.status === 'saved' &&
    ((b.createdBy||'').toLowerCase() === lc || (b.createdByName||'').toLowerCase().includes(lc))
  );
  // Group by customer
  const byCustomer = {};
  bookings.forEach(b => {
    const key = b.customerId || b.customerName;
    if (!byCustomer[key]) byCustomer[key] = { customerName: b.customerName, accountNo: b.accountNo||'—', username: b.createdBy||b.createdByName||username, invoices: [], totalBill: 0, discAmt: 0, taxAmt: 0 };
    byCustomer[key].invoices.push(b.invoice);
    byCustomer[key].totalBill += (b.total||0);
    byCustomer[key].discAmt  += (b.discAmt||0);
    byCustomer[key].taxAmt   += (b.taxAmt||0);
    // Find payments
    const cust = DB.customers.find(c => c.id === b.customerId || c.name === b.customerName);
    if (cust) {
      const pays = DB.collectionPayments.filter(p => p.customerId === cust.id).reduce((s,p) => s+p.amount, 0);
      byCustomer[key].received = pays;
    } else {
      byCustomer[key].received = byCustomer[key].received || 0;
    }
  });
  return Object.values(byCustomer).map(r => ({
    ...r,
    invoiceCount: r.invoices.length,
    pending: Math.max(0, r.totalBill - (r.received||0)),
    totalCollection: r.totalBill
  }));
}

function renderCollection() {
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

  let rows = DB.customers.map(c => {
    const bal = getCustomerBalance(c.id);
    const todayOrders = getTodayOrders(c.id);
    const lastPay     = getLastPaymentDate(c.id);
    const totalPending = bal.totalOrders - bal.payments;
    return { ...c, ...bal, todayOrders, lastPay, totalPending };
  });

  rows = rows.filter(r => {
    if (q && !(r.name||'').toLowerCase().includes(q) && !(r.phone||'').toLowerCase().includes(q) && !(r.accountNo||'').toLowerCase().includes(q)) return false;
    if (usernameQ) {
      // filter customers who have bookings by this username
      const hasBk = _custBookings(r.id).some(b =>
        (b.createdBy||'').toLowerCase().includes(usernameQ) ||
        (b.createdByName||'').toLowerCase().includes(usernameQ)
      );
      if (!hasBk) return false;
    }
    if (balFilter === 'pending' && r.totalPending <= 0) return false;
    if (balFilter === 'clear'   && r.totalPending > 0) return false;
    if (balFilter === 'overdue' && (r.lastPay > thirtyDaysAgo || r.totalPending <= 0)) return false;
    return true;
  });

  const totalPending  = rows.reduce((s,r) => s+Math.max(0, r.totalPending), 0);
  const totalReceived = DB.collectionPayments.filter(p => p.date===today).reduce((s,p) => s+p.amount, 0);
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
  const c = DB.customers.find(x => x.id===custId); if (!c) return;
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

function saveCollectionPayment() {
  const custId = parseInt(document.getElementById('col-pay-cust-id').value);
  const amount = parseFloat(document.getElementById('col-pay-amount').value);
  if (!amount || amount<=0) { toast('Enter a valid payment amount!','error'); return; }
  const payment = {
    id: Date.now(), customerId: custId, amount,
    date:   document.getElementById('col-pay-date').value,
    method: document.getElementById('col-pay-method').value,
    notes:  document.getElementById('col-pay-notes').value,
  };
  DB.collectionPayments.push(payment);
  const c = DB.customers.find(x => x.id===custId);
  if (c) c.lastVisit = payment.date;
  closeModal('col-payment-modal');
  renderCollection();
  toast(`Payment of Rs.${amount.toFixed(2)} recorded for ${c?.name}!`,'success');
}

function clearCollectionFilters() {
  ['col-search','col-date-from','col-date-to','col-username-filter'].forEach(id => {
    const el=document.getElementById(id); if(el) el.value='';
  });
  const bf=document.getElementById('col-balance-filter'); if(bf) bf.value='';
  const vm=document.getElementById('col-view-mode'); if(vm) vm.value='customer';
  renderCollection();
}

function printCollectionReport() {
  const rows = [];
  DB.customers.forEach(c => {
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
        <div style="font-size:11px;color:#555">Printed by: <strong>${currentUser?.name||'Admin'}</strong></div>
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
      <span>Printed: ${now} by ${currentUser?.name||'Admin'}</span>
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
(function() {
  const _origRenderSaleSlips = typeof renderSaleSlips === 'function' ? renderSaleSlips : null;
  if (!_origRenderSaleSlips) return;
  // Patch renderSaleSlips to also filter by invoice and username
  window.renderSaleSlips = function() {
    const dateFilter   = document.getElementById('ss-date')?.value||'';
    const statusFilter = document.getElementById('ss-status')?.value||'';
    const nameFilter   = (document.getElementById('ss-name')?.value||'').toLowerCase().trim();
    const areaFilter   = (document.getElementById('ss-area')?.value||'').toLowerCase().trim();
    const invoiceFilter = (document.getElementById('ss-invoice')?.value||'').toLowerCase().trim();
    const usernameFilter = (document.getElementById('ss-username')?.value||'').toLowerCase().trim();

    const slips = [...DB.orderBookings].reverse().filter(b =>
      b.status !== 'cancelled' &&
      (!dateFilter   || b.date === dateFilter) &&
      (!statusFilter || b.status === statusFilter) &&
      (!nameFilter   || (b.customerName||'').toLowerCase().includes(nameFilter) || (b.accountNo||'').toLowerCase().includes(nameFilter)) &&
      (!areaFilter   || (b.customerArea||'').toLowerCase().includes(areaFilter)) &&
      (!invoiceFilter || (b.invoice||'').toLowerCase().includes(invoiceFilter) || (b.accountNo||'').toLowerCase().includes(invoiceFilter)) &&
      (!usernameFilter || (b.createdBy||'').toLowerCase().includes(usernameFilter) || (b.createdByName||'').toLowerCase().includes(usernameFilter))
    );

    const tbody = document.getElementById('saleslips-tbody');
    const label = document.getElementById('ss-count-label');
    if (label) label.textContent = slips.length + ' slip' + (slips.length!==1?'s':'');

    if (!slips.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa fa-file-invoice" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3"></i>No sale slips found</td></tr>`;
      return;
    }

    tbody.innerHTML = slips.map(b => {
      const statusClass = b.status === 'saved' ? 'badge-green' : b.status === 'draft' ? 'badge-yellow' : 'badge-red';
      return `<tr>
        <td class="td-mono" style="font-weight:700">${b.invoice}</td>
        <td style="font-size:12px">${b.date}</td>
        <td style="font-weight:600">${b.customerName}</td>
        <td class="td-mono">${b.accountNo||'—'}</td>
        <td style="text-align:center">${b.items?.length||0}</td>
        <td class="fw-700">$${(b.total||0).toFixed(2)}</td>
        <td class="fw-700" style="color:var(--yellow)">$${(b.netPayable||0).toFixed(2)}</td>
        <td><span class="badge ${statusClass}">${b.status}</span></td>
        <td>
          <div class="flex-gap" style="gap:4px">
            <button class="btn btn-ghost btn-xs" onclick="viewSlipDetail(${b.id})" title="View Details"><i class="fa fa-eye"></i></button>
            <button class="btn btn-ghost btn-xs" onclick="printSingleSlipA4(${b.id})" title="Print"><i class="fa fa-print"></i></button>
            <button class="btn btn-accent btn-xs" onclick="downloadSlipInvoice(${b.id})" title="Download"><i class="fa fa-download"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
  };

  window.clearSaleSlipsFilters = function() {
    ['ss-date','ss-status','ss-name','ss-area','ss-invoice','ss-username'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderSaleSlips();
  };

  window.viewSlipDetail = function(id) {
    viewOrderDetail(id);
  };

  window.downloadSlipInvoice = function(id) {
    const b = DB.orderBookings.find(x => x.id === id);
    if (!b) { toast('Booking not found','error'); return; }
    const html = '<!DOCTYPE html><html><head><title>Invoice ' + b.invoice + '</title></head><body>' + buildSlipA4Html(b) + '</body></html>';
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Invoice-' + b.invoice + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Invoice downloaded!', 'success');
  };
})();

// ═══════════════════════════════════════════════════════
// SALE RETURN MODULE
// ═══════════════════════════════════════════════════════
let _srCurrentBooking = null;

function renderSaleReturn() {
  searchSaleReturnInvoice();
  renderSaleReturnHistory();
}

function searchSaleReturnInvoice() {
  const invQ   = (document.getElementById('sr-invoice-search')?.value||'').toLowerCase().trim();
  const custQ  = (document.getElementById('sr-cust-search')?.value||'').toLowerCase().trim();
  const fromD  = document.getElementById('sr-date-from')?.value||'';
  const toD    = document.getElementById('sr-date-to')?.value||'';
  const tbody  = document.getElementById('sr-invoice-tbody');
  const label  = document.getElementById('sr-results-count');
  if (!tbody) return;

  // Only show results if at least one filter is active
  if (!invQ && !custQ && !fromD && !toD) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa fa-search" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      Enter an invoice number, customer name, or select a date range to find invoices
    </td></tr>`;
    if (label) label.textContent = 'Enter filters to search';
    return;
  }

  const results = (DB.orderBookings||[]).filter(b => {
    if (b.status === 'cancelled') return false;
    if (invQ  && !(b.invoice||'').toLowerCase().includes(invQ) && !(b.accountNo||'').toLowerCase().includes(invQ)) return false;
    if (custQ && !(b.customerName||'').toLowerCase().includes(custQ)) return false;
    if (fromD && (b.date||'') < fromD) return false;
    if (toD   && (b.date||'') > toD)   return false;
    return true;
  }).slice(0, 50);

  if (label) label.textContent = results.length + ' invoice' + (results.length!==1?'s':'') + ' found';

  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-muted)">
      <i class="fa fa-file-invoice" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      No invoices match your search
    </td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(b => {
    const alreadyReturned = (DB.saleReturns||[]).some(r => r.originalInvoice === b.invoice);
    const statusClass = b.status==='saved'?'badge-green':b.status==='draft'?'badge-yellow':'badge-red';
    return `<tr>
      <td class="td-mono" style="font-weight:700">${b.invoice}</td>
      <td style="font-size:12px">${b.date}</td>
      <td style="font-weight:600">${b.customerName}</td>
      <td class="td-mono" style="font-size:11px">${b.accountNo||'—'}</td>
      <td style="text-align:center">${b.items?.length||0}</td>
      <td class="td-mono fw-700">Rs.${(b.total||0).toFixed(2)}</td>
      <td class="td-mono" style="color:var(--yellow)">${(b.taxAmt||0)>0?'Rs.'+(b.taxAmt||0).toFixed(2):'—'}</td>
      <td class="td-mono" style="color:var(--green)">${(b.discAmt||0)>0?'Rs.'+(b.discAmt||0).toFixed(2):'—'}</td>
      <td><span class="badge ${statusClass}">${b.status}</span>
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

function openSaleReturnModal(bookingId) {
  const b = DB.orderBookings.find(x => x.id === bookingId);
  if (!b) { toast('Invoice not found!','error'); return; }
  _srCurrentBooking = b;

  document.getElementById('sr-modal-invoice-label').textContent = 'Invoice: ' + b.invoice + ' — ' + b.customerName;
  document.getElementById('sr-inv-no').textContent    = b.invoice;
  document.getElementById('sr-inv-cust').textContent  = b.customerName;
  document.getElementById('sr-inv-date').textContent  = b.date;
  document.getElementById('sr-inv-total').textContent = 'Rs.' + (b.total||0).toFixed(2);
  document.getElementById('sr-reason').value          = 'Defective Product';
  document.getElementById('sr-notes').value           = '';
  document.getElementById('sr-refund-total').textContent     = 'Rs.0.00';
  document.getElementById('sr-return-items-count').textContent = '0 items selected';

  // Build item rows
  const tbody = document.getElementById('sr-items-tbody');
  tbody.innerHTML = (b.items||[]).map((it,i) => {
    const tp = (it.qty||0) + (it.cartons||0)*(it.ppc||1);
    const unitPrice = it.rate||0;
    return `<tr>
      <td style="padding:6px 10px;text-align:center">
        <input type="checkbox" class="sr-item-check" data-idx="${i}" onchange="srCalcRefund()">
      </td>
      <td style="padding:6px 10px;font-weight:600">${it.icon||'📦'} ${it.name}</td>
      <td style="padding:6px 10px;text-align:center;color:var(--cyan);font-weight:700">${tp}</td>
      <td style="padding:6px 10px">
        <input type="number" class="form-input sr-return-qty" data-idx="${i}" data-max="${tp}" data-price="${unitPrice}"
          value="0" min="0" max="${tp}" style="width:70px;padding:5px 8px;font-size:12px"
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

function saveSaleReturn() {
  if (!_srCurrentBooking) return;
  const returnItems = [];
  document.querySelectorAll('.sr-return-qty').forEach((el,i) => {
    const qty = parseInt(el.value)||0;
    if (qty > 0) {
      const origItem = _srCurrentBooking.items[i];
      returnItems.push({ ...origItem, returnQty: qty, refund: qty*(origItem.rate||0) });
    }
  });
  if (!returnItems.length) { toast('Select at least one item to return!','error'); return; }
  const reason       = document.getElementById('sr-reason').value;
  const refundMethod = document.getElementById('sr-refund-method').value;
  const notes        = document.getElementById('sr-notes').value;
  const totalRefund  = returnItems.reduce((s,i) => s+i.refund, 0);
  const returnId     = 'SR-' + String((DB.saleReturns.length+1)).padStart(4,'0');

  const record = {
    id:              DB.saleReturns.length + 1,
    returnId,
    date:            new Date().toISOString().split('T')[0],
    originalInvoice: _srCurrentBooking.invoice,
    originalId:      _srCurrentBooking.id,
    customerId:      _srCurrentBooking.customerId,
    customerName:    _srCurrentBooking.customerName,
    items:           returnItems,
    totalRefund,
    reason,
    refundMethod,
    notes,
    by:              currentUser?.username || 'admin',
  };

  DB.saleReturns.push(record);

  // Return stock to inventory
  returnItems.forEach(ri => {
    const prod = DB.products.find(p => p.id === ri.productId || p.name === ri.name);
    if (prod) {
      const before = prod.stock;
      prod.stock += ri.returnQty;
      DB.stockHistory.unshift({
        date: new Date().toLocaleString(), product: prod.name,
        type: 'Sale Return', adjType: 'returned',
        qty: ri.returnQty, before, after: prod.stock,
        ref: returnId, by: record.by
      });
    }
  });

  closeModal('sr-process-modal');
  renderSaleReturnHistory();
  searchSaleReturnInvoice();
  toast(`Return ${returnId} processed — Refund: Rs.${totalRefund.toFixed(2)}`, 'success');
}

function renderSaleReturnHistory() {
  const tbody = document.getElementById('sr-history-tbody');
  const label = document.getElementById('sr-history-count');
  if (!tbody) return;
  const returns = [...(DB.saleReturns||[])].reverse();
  if (label) label.textContent = returns.length + ' return' + (returns.length!==1?'s':'');
  if (!returns.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted)">No returns processed yet</td></tr>`;
    return;
  }
  tbody.innerHTML = returns.map(r => `<tr>
    <td class="td-mono" style="font-weight:700;color:var(--red)">${r.returnId}</td>
    <td style="font-size:12px">${r.date}</td>
    <td class="td-mono">${r.originalInvoice}</td>
    <td style="font-weight:600">${r.customerName}</td>
    <td style="text-align:center">${r.items.length} item(s)<br><span style="font-size:10px;color:var(--text-muted)">${r.items.map(i=>i.name+' ×'+i.returnQty).join(', ')}</span></td>
    <td class="td-mono fw-700" style="color:var(--red)">Rs.${r.totalRefund.toFixed(2)}</td>
    <td style="font-size:11px">${r.reason}</td>
    <td style="font-size:11px;color:var(--text-muted)">${r.by}</td>
  </tr>`).join('');
}

function clearSrFilters() {
  ['sr-invoice-search','sr-cust-search','sr-date-from','sr-date-to'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  searchSaleReturnInvoice();
}

function printSaleReturnReport() {
  const returns = DB.saleReturns||[];
  const totalVal = returns.reduce((s,r)=>s+r.totalRefund,0);
  const html = `<div class="a4-doc"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div><div style="font-size:12px;color:#555">Sale Return Report — ${new Date().toLocaleDateString()}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${['Return ID','Date','Invoice','Customer','Items','Refund','Reason'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${returns.map((r,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700;color:#dc2626">${r.returnId}</td>
      <td style="padding:6px 8px">${r.date}</td>
      <td style="padding:6px 8px;font-family:monospace">${r.originalInvoice}</td>
      <td style="padding:6px 8px;font-weight:700">${r.customerName}</td>
      <td style="padding:6px 8px">${r.items.length}</td>
      <td style="padding:6px 8px;font-weight:800;color:#dc2626">Rs.${r.totalRefund.toFixed(2)}</td>
      <td style="padding:6px 8px">${r.reason}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="5" style="padding:8px;font-weight:700">TOTAL REFUNDS</td><td colspan="2" style="padding:8px;font-weight:900;font-size:14px">Rs.${totalVal.toFixed(2)}</td></tr></tfoot>
  </table></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}

function exportSaleReturns() {
  const rows=(DB.saleReturns||[]).map(r=>[r.returnId,r.date,r.originalInvoice,r.customerName,r.items.length,r.totalRefund.toFixed(2),r.reason,r.refundMethod,r.by]);
  const csv=[['Return ID','Date','Invoice','Customer','Items','Refund','Reason','Method','By'],...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='sale-returns-'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
  URL.revokeObjectURL(a.href); toast('Exported!','success');
}

// ═══════════════════════════════════════════════════════
// PURCHASE RETURN MODULE
// ═══════════════════════════════════════════════════════
let _prItems = [];

function openPurchaseReturnModal(poId) {
  _prItems = [{ productId:'', qty:1, price:0 }];
  const supSel = document.getElementById('pr-supplier');
  if (supSel) supSel.innerHTML = '<option value="">— Select Supplier —</option>' +
    DB.suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('pr-date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('pr-notes').value  = '';
  document.getElementById('pr-po-select').innerHTML = '<option value="">— Select PO (optional) —</option>';
  if (poId) {
    const po = DB.purchases.find(p=>p.id===poId);
    if (po) {
      if (supSel) supSel.value = po.supplier;
      prLoadPurchases();
      setTimeout(()=>{ document.getElementById('pr-po-select').value=poId; prLoadPoItems(); },50);
    }
  }
  renderPrItems();
  openModal('pr-modal');
}

function prLoadPurchases() {
  const supId = parseInt(document.getElementById('pr-supplier').value)||0;
  const poSel = document.getElementById('pr-po-select');
  const pos   = DB.purchases.filter(p=>!supId||p.supplier===supId);
  poSel.innerHTML = '<option value="">— Select PO (optional) —</option>' +
    pos.map(p=>`<option value="${p.id}">PO-${String(p.id).padStart(4,'0')} — ${p.date} (Rs.${p.total.toFixed(2)})</option>`).join('');
}

function prLoadPoItems() {
  const poId = parseInt(document.getElementById('pr-po-select').value)||0;
  if (!poId) { _prItems=[{productId:'',qty:1,price:0}]; renderPrItems(); return; }
  const po = DB.purchases.find(p=>p.id===poId);
  if (!po) return;
  _prItems = po.items.map(i=>({ productId:i.productId, name:i.name, qty:i.qty, price:i.price }));
  renderPrItems();
}

function renderPrItems() {
  const el = document.getElementById('pr-items-list');
  if (!el) return;
  el.innerHTML = _prItems.map((item,i)=>`
    <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap">
      <div class="form-group-inline" style="margin-bottom:0;flex:2;min-width:160px">
        <label>Product</label>
        <select class="form-input" onchange="prItemChange(${i},'product',this.value)" style="padding:9px 12px">
          <option value="">Select Product</option>
          ${DB.products.map(p=>`<option value="${p.id}" ${item.productId==p.id?'selected':''}>${p.icon||'📦'} ${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:90px">
        <label>Qty</label>
        <input class="form-input" type="number" value="${item.qty||1}" min="1" style="padding:9px 12px"
          oninput="prItemChange(${i},'qty',this.value)">
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:110px">
        <label>Price (Rs.)</label>
        <input class="form-input" type="number" value="${item.price||0}" step="0.01" style="padding:9px 12px"
          oninput="prItemChange(${i},'price',this.value)">
      </div>
      <div class="form-group-inline" style="margin-bottom:0;width:90px">
        <label>Line Total</label>
        <div style="padding:9px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;font-weight:700;font-family:var(--mono);font-size:12px;color:var(--yellow)">Rs.${((item.qty||0)*(item.price||0)).toFixed(2)}</div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="removePrItem(${i})" style="color:var(--red);margin-bottom:2px" title="Remove"><i class="fa fa-times"></i></button>
    </div>`).join('');
  const total = _prItems.reduce((s,i)=>s+(i.qty||0)*(i.price||0),0);
  const tv = document.getElementById('pr-total-val');
  if (tv) tv.textContent = 'Rs.'+total.toFixed(2);
}

function prItemChange(i,field,val) {
  if (field==='product') {
    _prItems[i].productId = parseInt(val)||'';
    const p = DB.products.find(x=>x.id==val);
    if (p) { _prItems[i].name=p.name; _prItems[i].price=p.buyPrice||0; }
  } else if (field==='qty')   _prItems[i].qty   = parseInt(val)||1;
  else                         _prItems[i].price = parseFloat(val)||0;
  renderPrItems();
}
function addPrItem()       { _prItems.push({productId:'',qty:1,price:0}); renderPrItems(); }
function removePrItem(i)   { _prItems.splice(i,1); if(!_prItems.length) _prItems.push({productId:'',qty:1,price:0}); renderPrItems(); }

function savePurchaseReturn() {
  const supId = parseInt(document.getElementById('pr-supplier').value)||0;
  if (!supId) { toast('Please select a supplier!','error'); return; }
  const validItems = _prItems.filter(i=>i.productId && i.qty>0);
  if (!validItems.length) { toast('Add at least one item!','error'); return; }
  const total   = validItems.reduce((s,i)=>s+i.qty*i.price,0);
  const poId    = parseInt(document.getElementById('pr-po-select').value)||null;
  const reason  = document.getElementById('pr-reason').value;
  const notes   = document.getElementById('pr-notes').value;
  const retDate = document.getElementById('pr-date').value;
  const returnId= 'PR-' + String((DB.purchaseReturns.length+1)).padStart(4,'0');
  const record  = {
    id: DB.purchaseReturns.length+1, returnId,
    date: retDate, supplierId: supId,
    supplierName: DB.suppliers.find(s=>s.id===supId)?.name||'Unknown',
    poId, poRef: poId?'PO-'+String(poId).padStart(4,'0'):'—',
    items: validItems.map(i=>({...i, name: DB.products.find(p=>p.id==i.productId)?.name||i.name||''})),
    total, reason, notes, by: currentUser?.username||'admin',
  };
  DB.purchaseReturns.push(record);

  // Deduct stock (items are going back to supplier)
  validItems.forEach(item=>{
    const prod = DB.products.find(p=>p.id==item.productId);
    if (prod) {
      const before = prod.stock;
      prod.stock = Math.max(0, prod.stock - item.qty);
      DB.stockHistory.unshift({
        date: new Date().toLocaleString(), product: prod.name,
        type:'Purchase Return', adjType:'decrease',
        qty:-item.qty, before, after:prod.stock,
        ref:returnId, by:record.by
      });
    }
  });

  closeModal('pr-modal');
  renderPurchaseReturns();
  toast(`Purchase Return ${returnId} saved — Rs.${total.toFixed(2)} returned to ${record.supplierName}`, 'success');
}

function renderPurchaseReturns() {
  const q      = (document.getElementById('pr-search')?.value||'').toLowerCase();
  const fromD  = document.getElementById('pr-date-from')?.value||'';
  const toD    = document.getElementById('pr-date-to')?.value||'';
  const tbody  = document.getElementById('pr-tbody');
  const label  = document.getElementById('pr-count-label');
  if (!tbody) return;

  let rows = [...(DB.purchaseReturns||[])].reverse().filter(r=>{
    if (fromD && r.date < fromD) return false;
    if (toD   && r.date > toD)   return false;
    if (q && !(r.returnId||'').toLowerCase().includes(q) &&
             !(r.supplierName||'').toLowerCase().includes(q) &&
             !(r.poRef||'').toLowerCase().includes(q) &&
             !r.items.some(i=>(i.name||'').toLowerCase().includes(q))) return false;
    return true;
  });

  // Update KPIs
  const allRet = DB.purchaseReturns||[];
  document.getElementById('pr-total-returns').textContent = allRet.length;
  document.getElementById('pr-total-items').textContent   = allRet.reduce((s,r)=>s+r.items.reduce((a,i)=>a+i.qty,0),0);
  document.getElementById('pr-total-value').textContent   = 'Rs.'+(allRet.reduce((s,r)=>s+r.total,0)).toFixed(0);
  document.getElementById('pr-suppliers-count').textContent = new Set(allRet.map(r=>r.supplierId)).size;

  if (label) label.textContent = rows.length + ' record' + (rows.length!==1?'s':'');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa fa-truck-loading" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
      No purchase returns recorded yet
    </td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`<tr>
    <td class="td-mono fw-700" style="color:var(--yellow)">${r.returnId}</td>
    <td style="font-size:12px">${r.date}</td>
    <td class="td-mono">${r.poRef}</td>
    <td style="font-weight:600">${r.supplierName}</td>
    <td style="font-size:11px">${r.items.map(i=>i.name+' ×'+i.qty).join('<br>')}</td>
    <td style="text-align:center;font-weight:700">${r.items.reduce((s,i)=>s+i.qty,0)}</td>
    <td class="td-mono fw-700" style="color:var(--yellow)">Rs.${r.total.toFixed(2)}</td>
    <td style="font-size:11px">${r.reason}</td>
    <td><span class="badge badge-yellow">Processed</span></td>
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
  const r = (DB.purchaseReturns||[]).find(x=>x.id===id);
  if (!r) return;
  const html=`<div class="a4-doc"><div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div>
    <div style="font-size:14px;font-weight:700">Purchase Return — ${r.returnId}</div>
    <div style="font-size:11px;color:#555">Date: ${r.date} | Supplier: ${r.supplierName} | PO: ${r.poRef}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
    <thead><tr>${['Product','Qty','Unit Price','Total'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${r.items.map((it,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700">${it.name}</td>
      <td style="padding:6px 8px;text-align:center">${it.qty}</td>
      <td style="padding:6px 8px">Rs.${(it.price||0).toFixed(2)}</td>
      <td style="padding:6px 8px;font-weight:800">Rs.${(it.qty*it.price).toFixed(2)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="3" style="padding:8px;font-weight:700">TOTAL RETURN VALUE</td><td style="padding:8px;font-weight:900;font-size:14px">Rs.${r.total.toFixed(2)}</td></tr></tfoot>
  </table>
  <div style="font-size:12px;color:#555">Reason: ${r.reason}${r.notes?' | Notes: '+r.notes:''}</div>
  <div style="font-size:11px;color:#888;margin-top:8px">Processed by: ${r.by} on ${r.date}</div></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}

function printPurchaseReturnReport() {
  const rows = DB.purchaseReturns||[];
  const total = rows.reduce((s,r)=>s+r.total,0);
  const html=`<div class="a4-doc"><div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px">
    <div style="font-size:20px;font-weight:900">🏪 SmartRetail ERP</div>
    <div style="font-size:12px;color:#555">Purchase Return Report — ${new Date().toLocaleDateString()}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${['Return ID','Date','PO Ref','Supplier','Items','Total','Reason'].map(h=>`<th style="padding:7px;background:#1a1a1a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r,i)=>`<tr style="background:${i%2?'#f8f8f8':'#fff'}">
      <td style="padding:6px 8px;font-weight:700;color:#d97706">${r.returnId}</td>
      <td style="padding:6px 8px">${r.date}</td>
      <td style="padding:6px 8px;font-family:monospace">${r.poRef}</td>
      <td style="padding:6px 8px;font-weight:700">${r.supplierName}</td>
      <td style="padding:6px 8px">${r.items.length}</td>
      <td style="padding:6px 8px;font-weight:800;color:#d97706">Rs.${r.total.toFixed(2)}</td>
      <td style="padding:6px 8px">${r.reason}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="background:#1a1a1a;color:#fff"><td colspan="5" style="padding:8px;font-weight:700">TOTAL</td><td colspan="2" style="padding:8px;font-weight:900;font-size:14px">Rs.${total.toFixed(2)}</td></tr></tfoot>
  </table></div>`;
  const pa=document.getElementById('print-area'); pa.innerHTML=html; pa.style.display='block';
  window.print(); setTimeout(()=>{pa.style.display='none';},1200);
}
