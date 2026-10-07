// ═══════════════════════════════════════════════════════════════════════
// Banking Records — "My Digital Bank Payment Register"
// A record-keeping + verification tool only: who was paid / deposited /
// transferred, when, from which account, which slip, which reference, and the
// proof. No accounting, no customer/supplier links, no balances.
// Self-contained: relies only on api.js (apiRequest, TokenStore, API_BASE_URL)
// and script.js (navigate, toast, openModal/closeModal).
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const API = '/bank-records';
  const TABS = [
    { id: 'dashboard',    label: 'Dashboard',        icon: 'fa-gauge-high' },
    { id: 'accounts',     label: 'Bank Accounts',    icon: 'fa-building-columns' },
    { id: 'contacts',     label: 'Payment Contacts', icon: 'fa-address-book' },
    { id: 'payment',      label: 'Add Payment',      icon: 'fa-money-bill-transfer' },
    { id: 'deposit',      label: 'Add Deposit',      icon: 'fa-piggy-bank' },
    { id: 'transfer',     label: 'Add Transfer',     icon: 'fa-right-left' },
    { id: 'transactions', label: 'All Transactions', icon: 'fa-list' },
    { id: 'slips',        label: 'Bank Slips',       icon: 'fa-receipt' },
    { id: 'reports',      label: 'Reports',          icon: 'fa-chart-simple' },
    { id: 'verification', label: 'Daily Verification', icon: 'fa-clipboard-check' },
  ];
  const METHODS = [['bank_transfer', 'Bank Transfer'], ['online_transfer', 'Online Transfer'], ['cheque', 'Cheque'],
                   ['cash_deposit', 'Cash Deposit'], ['atm', 'ATM'], ['other', 'Other']];
  const STATUSES = [['completed', 'Completed'], ['recorded', 'Recorded'], ['pending', 'Pending'],
                    ['cancelled', 'Cancelled'], ['reversed', 'Reversed']];
  const STATUS_BADGE = { completed: 'badge-green', recorded: 'badge-blue', pending: 'badge-yellow',
                         cancelled: 'badge-red', reversed: 'badge-gray' };
  const TYPE_LABEL = { payment: 'Payment', deposit: 'Deposit', transfer: 'Transfer', withdrawal: 'Withdrawal', other: 'Other' };

  const BR = {
    tab: 'dashboard', accounts: [], banks: [], contacts: [],
    dashDate: null, page: 1, pageSize: 25,
    tx: { quick: 'all', sort: 'newest' },
    slips: {}, report: { type: 'daily', quick: 'month' }, verDate: null, justSaved: null,
  };

  // ───────────────────────────── helpers ─────────────────────────────
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dmy = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}-${MON[+m - 1]}-${y}`; };
  const t12 = (t) => { if (!t) return ''; let [h, m] = t.split(':'); h = +h; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${pad(h)}:${m} ${ap}`; };
  const money = (n) => 'Rs.' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const role = () => ((typeof currentUser !== 'undefined' && currentUser && currentUser.role) || (TokenStore.getUser() || {}).role || '');
  const isAdmin = () => ['super_admin', 'admin'].includes(role());
  const results = (d) => (d && d.results) || d || [];
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const fail = (e) => toast((e && e.message) || 'Something went wrong', 'error');

  const api = {
    get: (p) => apiRequest(API + p),
    post: (p, b) => apiRequest(API + p, { method: 'POST', body: b }),
    patch: (p, b) => apiRequest(API + p, { method: 'PATCH', body: b }),
    form: (p, fd) => apiRequest(API + p, { method: 'POST', body: fd, isForm: true }),
  };

  async function blobFetch(path, retried) {
    const r = await fetch(API_BASE_URL + API + path, { headers: { Authorization: 'Bearer ' + TokenStore.getAccess() } });
    if (r.status === 401 && !retried && TokenStore.getRefresh() && (await AuthAPI.refreshToken())) return blobFetch(path, true);
    if (!r.ok) {
      let m = 'Download failed';
      try { const j = await r.json(); m = j.message || m; } catch (_) { /* not json */ }
      throw new Error(m);
    }
    return r;
  }
  async function download(path, filename) {
    try {
      const blob = await (await blobFetch(path)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { fail(e); }
  }
  async function openProof(attId) {
    try {
      const blob = await (await blobFetch(`/attachments/${attId}/file/`)).blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) { fail(e); }
  }


  // ───────────────────────────── bank logos ─────────────────────────────
  // A bank's own logo (uploaded under Bank Accounts → bank) is used when there is
  // one. Otherwise a coloured initials badge is drawn — not an official logo.
  const BRANDS = [
    [/\bhbl\b|habib bank/i, 'HBL', '#00796b'], [/habib metro/i, 'HMB', '#0f766e'], [/meezan/i, 'MBL', '#6a1b4d'],
    [/\bubl\b|united bank/i, 'UBL', '#1565c0'], [/\bmcb\b|muslim commercial/i, 'MCB', '#2e7d32'], [/allied|\babl\b/i, 'ABL', '#0d47a1'],
    [/alfalah/i, 'BAF', '#c62828'], [/faysal/i, 'FBL', '#00897b'], [/askari/i, 'AKB', '#1a237e'], [/standard chartered/i, 'SC', '#0072aa'],
    [/punjab|\bbop\b/i, 'BOP', '#388e3c'], [/national bank|\bnbp\b/i, 'NBP', '#1b5e20'], [/\bjs bank|\bjs\b/i, 'JS', '#ef6c00'],
    [/soneri/i, 'SNB', '#b71c1c'], [/bankislami/i, 'BIP', '#2e7d32'], [/dubai islamic/i, 'DIB', '#1565c0'], [/silk/i, 'SLK', '#6a1b9a'],
    [/samba/i, 'SMB', '#00695c'], [/easypaisa|easy paisa/i, 'EP', '#2e9d44'], [/jazzcash|jazz cash/i, 'JC', '#c62828'], [/sada ?pay/i, 'SP', '#00acc1'],
  ];
  const PALETTE = ['#ea6c4d', '#3b82f6', '#16a34a', '#8b5cf6', '#f59e0b', '#0ea5e9', '#e11d48', '#14b8a6'];
  function brandOf(name) {
    name = String(name || '');
    for (const [re, text, bg] of BRANDS) if (re.test(name)) return { text, bg };
    const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !/^(bank|limited|ltd|the|of|pvt)$/i.test(w));
    const text = (words.slice(0, 3).map((w) => w[0]).join('') || '?').toUpperCase();
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { text, bg: PALETTE[h % PALETTE.length] };
  }
  function badgeSrc(name) {
    const b = brandOf(name), fs = b.text.length > 3 ? 17 : b.text.length === 3 ? 21 : 27;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${b.bg}"/><text x="32" y="${32 + fs * 0.36}" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="${fs}" fill="#fff" text-anchor="middle">${esc(b.text)}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  // the bank record (with its uploaded logo) for a bank id / account id / free-typed bank name
  function bankFor({ bankId, accountId, name }) {
    if (accountId) { const a = BR.accounts.find((x) => x.id === accountId); if (a) bankId = a.bank; }
    if (bankId) return BR.banks.find((b) => b.id === bankId) || null;
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return BR.banks.find((b) => b.name.toLowerCase() === n) || BR.banks.find((b) => b.name.toLowerCase().includes(n) || n.includes(b.name.toLowerCase())) || null;
  }
  function logoSrc(ref) {
    const bank = bankFor(ref);
    return (bank && bank.logo) || badgeSrc((bank && bank.name) || ref.name || '');
  }
  const logoImg = (ref, size = 22) => ((ref.bankId || ref.accountId || ref.name)
    ? `<img class="br-lg" src="${logoSrc(ref)}" alt="" style="width:${size}px;height:${size}px">` : '');
  const withLogo = (ref, text, size) => `<span class="br-bk">${logoImg(ref, size)}<span>${esc(text)}</span></span>`;

  // ───────────────────────────── page shell ─────────────────────────────
  const CSS = `
  #page-bankrec .br-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 16px;padding-bottom:4px}
  #page-bankrec .br-tab{border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary);padding:9px 14px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;gap:7px;align-items:center}
  #page-bankrec .br-tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
  #page-bankrec .br-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
  #page-bankrec .br-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;border-left:4px solid var(--accent)}
  #page-bankrec .br-card.green{border-left-color:var(--green)} #page-bankrec .br-card.purple{border-left-color:var(--purple)} #page-bankrec .br-card.yellow{border-left-color:var(--yellow)}
  #page-bankrec .br-card .v{font-size:22px;font-weight:800;font-family:var(--mono);margin:4px 0 2px}
  #page-bankrec .br-card .l{font-size:11.5px;color:var(--text-secondary);font-weight:600}
  #page-bankrec .br-card .s{font-size:11px;color:var(--text-muted)}
  #page-bankrec .br-banks{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-bottom:16px}
  #page-bankrec .br-bank{cursor:pointer;transition:transform .15s} #page-bankrec .br-bank:hover{transform:translateY(-2px)}
  #page-bankrec .br-bank .row{display:flex;justify-content:space-between;font-size:12px;margin-top:5px;color:var(--text-secondary)}
  #page-bankrec .br-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:16px}
  #page-bankrec .br-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}
  #page-bankrec .br-form .wide{grid-column:1/-1} #page-bankrec .br-form .two{grid-column:span 2}
  #page-bankrec .br-form label{display:block;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
  #page-bankrec .br-form .form-input,.br-modal .form-input{width:100%;box-sizing:border-box}
  #page-bankrec textarea.form-input,.br-modal textarea.form-input{min-height:84px;resize:vertical}
  #page-bankrec .br-note{font-size:12px;color:var(--text-muted);margin:2px 0 14px}
  #page-bankrec .num{font-family:var(--mono);font-weight:700;text-align:right;white-space:nowrap}
  #page-bankrec .br-ok{background:var(--green-glow);border:1px solid var(--green);border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:13px}
  .br-modal .modal{max-width:760px;width:calc(100% - 24px)} .br-modal .modal-body{max-height:72vh;overflow-y:auto}
  .br-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px} .br-kv .k{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;font-weight:700}
  .br-kv .v{font-size:13px;font-weight:600;word-break:break-word}
  .br-att{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:12.5px}
  @media(max-width:900px){#page-bankrec .br-grid{grid-template-columns:repeat(2,minmax(0,1fr))} #page-bankrec .br-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:560px){#page-bankrec .br-form{grid-template-columns:1fr} #page-bankrec .br-form .two{grid-column:auto} .br-kv{grid-template-columns:1fr}}
  `;


  // ───────────────────────────── themed calendar ─────────────────────────────
  // Replaces the browser's native date picker (which ignores the app theme) with
  // a calendar that follows the light/dark theme. Fields are created with
  // dateInp() / monthInp(); read them with val(id) — it returns YYYY-MM-DD / YYYY-MM.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let cal = null;

  const monthText = (ym) => { if (!ym) return ''; const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
  function dateInp(id, iso, attrs, wrapStyle) {
    return `<div class="br-datewrap" style="${wrapStyle || ''}"><input class="form-input br-date" id="${id}" type="text" readonly data-mode="day" data-iso="${esc(iso || '')}"
      value="${esc(iso ? dmy(iso) : '')}" placeholder="Select date" onclick="brCalOpen(this)" ${attrs || ''}><i class="fa fa-calendar-days"></i></div>`;
  }
  function monthInp(id, ym, attrs, wrapStyle) {
    return `<div class="br-datewrap" style="${wrapStyle || ''}"><input class="form-input br-date" id="${id}" type="text" readonly data-mode="month" data-iso="${esc(ym || '')}"
      value="${esc(monthText(ym))}" placeholder="Select month" onclick="brCalOpen(this)" ${attrs || ''}><i class="fa fa-calendar"></i></div>`;
  }
  function calClose() {
    if (cal && cal.el) cal.el.remove();
    cal = null;
  }
  window.brCalOpen = function (input) {
    const same = cal && cal.input === input;
    calClose();
    if (same || input.disabled) return;
    const mode = input.dataset.mode || 'day';
    const parts = (input.dataset.iso || '').split('-').map(Number);
    const now = new Date();
    const y = parts[0] || now.getFullYear(), m = parts[1] ? parts[1] - 1 : now.getMonth();
    cal = { input, mode, view: mode === 'month' ? 'months' : 'days', y, m, base: y - (y % 12), el: document.createElement('div') };
    cal.el.className = 'br-cal';
    document.body.appendChild(cal.el);
    calDraw();
  };
  function calPlace() {
    if (!cal) return;
    const r = cal.input.getBoundingClientRect(), h = cal.el.offsetHeight, w = cal.el.offsetWidth;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    cal.el.style.top = top + 'px';
    cal.el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  }
  function calDraw() {
    if (!cal) return;
    const sel = cal.input.dataset.iso || '';
    const todayIso = today();
    const nav = (prev, next, mid) => `<div class="br-cal-head"><button type="button" class="br-cal-nav" onclick="${prev}"><i class="fa fa-chevron-left"></i></button>
      <div class="br-cal-title">${mid}</div><button type="button" class="br-cal-nav" onclick="${next}"><i class="fa fa-chevron-right"></i></button></div>`;
    let html = '';
    if (cal.view === 'days') {
      const first = new Date(cal.y, cal.m, 1), offset = (first.getDay() + 6) % 7, dim = new Date(cal.y, cal.m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(cal.y, cal.m, 1 - offset + i), iso = ymd(d), out = d.getMonth() !== cal.m;
        cells += `<button type="button" class="br-cal-day ${out ? 'out' : ''} ${iso === todayIso ? 'today' : ''} ${iso === sel ? 'sel' : ''}" onclick="brCalPick('${iso}')">${d.getDate()}</button>`;
      }
      html = nav('brCalMove(-1)', 'brCalMove(1)',
        `<button type="button" onclick="brCalView('months')">${MONTHS[cal.m]}</button><button type="button" onclick="brCalView('years')">${cal.y}</button>`)
        + `<div class="br-cal-dow">${DOW.map((x) => `<span>${x}</span>`).join('')}</div><div class="br-cal-days">${cells}</div>`;
    } else if (cal.view === 'months') {
      const selYm = sel.slice(0, 7);
      html = nav('brCalYear(-1)', 'brCalYear(1)', `<button type="button" onclick="brCalView('years')">${cal.y}</button>`)
        + `<div class="br-cal-grid">${MONTHS.map((n, i) => `<button type="button" class="${selYm === `${cal.y}-${pad(i + 1)}` ? 'sel' : ''}" onclick="brCalMonth(${i})">${n.slice(0, 3)}</button>`).join('')}</div>`;
    } else {
      html = nav('brCalBase(-12)', 'brCalBase(12)', `<span style="font-weight:800;font-size:14px;padding:5px 8px">${cal.base} – ${cal.base + 11}</span>`)
        + `<div class="br-cal-grid">${Array.from({ length: 12 }, (_, i) => cal.base + i).map((yy) => `<button type="button" class="${String(yy) === sel.slice(0, 4) ? 'sel' : ''}" onclick="brCalYearPick(${yy})">${yy}</button>`).join('')}</div>`;
    }
    const foot = cal.mode === 'month'
      ? `<button type="button" onclick="brCalPick('${todayIso.slice(0, 7)}')">This month</button><button type="button" onclick="brCalPick('')">Clear</button>`
      : `<button type="button" onclick="brCalPick('${todayIso}')">Today</button><button type="button" onclick="brCalPick('')">Clear</button>`;
    cal.el.innerHTML = html + `<div class="br-cal-foot">${foot}</div>`;
    calPlace();
  }
  window.brCalMove = (n) => { cal.m += n; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } calDraw(); };
  window.brCalYear = (n) => { cal.y += n; calDraw(); };
  window.brCalBase = (n) => { cal.base += n; calDraw(); };
  window.brCalView = (v) => { cal.view = v; if (v === 'years') cal.base = cal.y - (cal.y % 12); calDraw(); };
  window.brCalYearPick = (yy) => { cal.y = yy; cal.view = 'months'; calDraw(); };
  window.brCalMonth = function (i) {
    cal.m = i;
    if (cal.mode === 'month') return brCalPick(`${cal.y}-${pad(i + 1)}`);
    cal.view = 'days'; calDraw();
  };
  window.brCalPick = function (iso) {
    if (!cal) return;
    const input = cal.input;
    input.dataset.iso = iso;
    input.value = iso ? (cal.mode === 'month' ? monthText(iso) : dmy(iso)) : '';
    calClose();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.addEventListener('mousedown', (e) => { if (cal && !cal.el.contains(e.target) && e.target !== cal.input) calClose(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') calClose(); });
  window.addEventListener('resize', calClose);
  window.addEventListener('scroll', (e) => { if (cal && !cal.el.contains(e.target)) calClose(); }, true);

  // ───────────────────────────── printing (with company details) ─────────────────────────────
  async function companyInfo() {
    try {
      if (typeof _companySettingsCache !== 'undefined' && _companySettingsCache && _companySettingsCache.company_name) return _companySettingsCache;
      const s = await SettingsAPI.getCompany();
      if (typeof _companySettingsCache !== 'undefined') _companySettingsCache = s;
      return s;
    } catch (_) { return {}; }
  }
  // Same look as the invoices / reports: company logo, name, address, contact and
  // NTN on the left; document title, date and user on the right.
  async function printDoc({ title, subtitle = '', body, landscape = false, stamp = '' }) {
    const s = await companyInfo();
    const logo = s.logo ? new URL(s.logo, location.origin).href : '';
    const contact = [s.phone, s.email].filter(Boolean).join(' · ');
    const user = (typeof currentUser !== 'undefined' && currentUser && (currentUser.full_name || currentUser.email)) || '';
    const w = window.open('', '_blank');
    if (!w) { toast('Please allow pop-ups to print.', 'warning'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .doc{position:relative;padding:4mm 2mm}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #000;padding-bottom:4mm;margin-bottom:4mm}
      .co img{max-height:46px;max-width:140px;object-fit:contain;margin-bottom:4px;display:block}
      .co .nm{font-size:22px;font-weight:800;letter-spacing:-.5px} .co .sm{font-size:11px;color:#555;margin-top:2px}
      .ti{text-align:right;font-size:10.5px;color:#555;line-height:1.6} .ti b{font-size:15px;color:#000}
      table.t{width:100%;border-collapse:collapse;margin-bottom:5mm} table.t th{background:#d9d9d9;padding:7px 8px;text-align:left;font-size:11px}
      table.t td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:11px;vertical-align:top} table.t td.r{text-align:right;white-space:nowrap;font-weight:700}
      .kv{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;margin-bottom:6mm} .kv div{display:flex;gap:8px;padding:4px 0;align-items:center;border-bottom:1px solid #e3e3e3;font-size:11.5px}
      .kv span{color:#777;min-width:135px} .kv b{font-weight:700}
      .amt{border:2px solid #000;border-radius:8px;padding:8px 14px;margin:0 0 4mm;display:flex;justify-content:space-between;align-items:center;gap:12px}
      .amt .big{font-size:24px;font-weight:800} .amt .w{font-size:11px;color:#333;text-align:right;max-width:60%}
      .box{border:1px solid #bbb;border-radius:6px;padding:8px 10px;font-size:11.5px;margin-bottom:5mm;white-space:pre-wrap}
      .proof{display:grid;gap:3mm;margin-bottom:4mm} .proof.n1{grid-template-columns:1fr} .proof.n2{grid-template-columns:1fr 1fr} .proof.n3{grid-template-columns:repeat(3,1fr)} .proof img{display:block;width:100%;height:auto;max-height:100mm;object-fit:contain;object-position:top center;border:1px solid #ccc;border-radius:4px} .lg{width:16px;height:16px;border-radius:4px;vertical-align:-3px;margin-right:6px;object-fit:contain} .sig{break-inside:avoid;page-break-inside:avoid}
      .sig{display:flex;justify-content:space-between;gap:14px;margin-top:9mm} .sig div{flex:1;text-align:center;border-top:1px solid #000;padding-top:4px;font-size:10.5px}
      .ft{display:flex;justify-content:space-between;font-size:8.5px;color:#555;border-top:1px solid #ccc;padding-top:3mm;margin-top:8mm}
      .void{position:absolute;top:42%;left:12%;font-size:80px;font-weight:900;color:rgba(200,0,0,.16);transform:rotate(-24deg);pointer-events:none}
      @media screen{.doc{width:${landscape ? '273mm' : '186mm'};margin:0 auto}}
      @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}
    </style></head><body><div class="doc">${stamp}
      <div class="hdr"><div class="co">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div class="nm">${esc(s.company_name || 'SmartRetail Store')}</div>
        ${s.address ? `<div class="sm">${esc(s.address)}</div>` : ''}${contact ? `<div class="sm">${esc(contact)}</div>` : ''}${s.tax_id ? `<div class="sm">NTN/Tax ID: ${esc(s.tax_id)}</div>` : ''}</div>
        <div class="ti"><b>${esc(title.toUpperCase())}</b><br>${subtitle}Generated: ${new Date().toLocaleString()}<br>By: ${esc(user)}</div></div>
      ${body}
      <div class="ft"><span>SmartRetail ERP · Banking Records</span><span>${esc(title)} · Printed: ${new Date().toLocaleString()}</span></div></div>
      <script>window.onload=function(){
        var imgs=document.querySelectorAll('.proof img');
        if(imgs.length){
          var proof=document.querySelector('.proof'), doc=document.querySelector('.doc');
          proof.style.display='none'; var used=doc.scrollHeight; proof.style.display='';
          var pageH=(${landscape ? 186 : 273})*96/25.4;                    /* printable height in px */
          var h=Math.max(190, pageH-used-34);                               /* keep the signature block on this page */
          for(var i=0;i<imgs.length;i++){imgs[i].style.maxHeight=h+'px';}
        }
        setTimeout(function(){window.print()},500)}<\/script></body></html>`);
    w.document.close();
  }
  function amountWords(value) {
    const n = Math.floor(Math.abs(+value || 0)), paisa = Math.round((Math.abs(+value || 0) - n) * 100);
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''));
    const three = (x) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    if (!n && !paisa) return 'Zero Rupees Only';
    let rest = n, out = [];
    [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']].forEach(([div, name]) => {
      const q = Math.floor(rest / div);
      if (q) { out.push(three(q) + ' ' + name); rest %= div; }
    });
    if (rest) out.push(three(rest));
    return `Rupees ${out.join(' ')}${paisa ? ` and ${two(paisa)} Paisa` : ''} Only`;
  }
  const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(blob); });

  // One record as an A4 voucher / slip (payment voucher, deposit slip, transfer voucher …)
  window.brPrintVoucher = async function (id) {
    try {
      const [a, att] = await Promise.all([api.get(`/activities/${id}/`), api.get(`/activities/${id}/attachments/`)]);
      const titles = { payment: 'Bank Payment Voucher', deposit: 'Bank Deposit Slip', transfer: 'Bank Transfer Voucher', withdrawal: 'Bank Withdrawal Voucher', other: 'Bank Record Voucher' };
      const rows = [['System Reference', a.system_reference], ['Bank Reference', a.bank_reference], ['Slip Number', a.slip_number],
        ['Date', dmy(a.date)], ['Time', t12(a.time)], ['Payment Method', a.method_label],
        ['From Account', a.from_label], ['To / Recipient', a.to_label], ['Recipient Bank', a.recipient_bank],
        ['Recipient Account Title', a.recipient_account_title], ['Recipient Account No.', a.recipient_account_masked], ['Purpose', a.purpose],
        ['Status', a.status_label]].filter(([, v]) => v);
      const lg = (ref) => { const src = logoSrc(ref); return src ? `<img class="lg" src="${src}">` : ''; };
      const refFor = { 'From Account': a.activity_type === 'deposit' ? null : { accountId: a.from_account },
        'To / Recipient': a.activity_type === 'payment' ? { name: a.recipient_bank } : { accountId: a.to_account },
        'Recipient Bank': { name: a.recipient_bank } };
      const images = [];
      for (const x of att.results.filter((x) => x.file_type !== 'pdf').slice(0, 3)) {
        try { images.push(await blobToDataUrl(await (await blobFetch(`/attachments/${x.id}/file/`)).blob())); } catch (_) { /* skip unreadable proof */ }
      }
      const pdfs = att.results.filter((x) => x.file_type === 'pdf');
      const void_ = ['cancelled', 'reversed'].includes(a.status);
      const body = `
        <div class="amt"><div><div style="font-size:10.5px;color:#555;font-weight:700">AMOUNT</div><div class="big">Rs. ${Number(a.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
          <div class="w">${amountWords(a.amount)}</div></div>
        <div class="kv">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${refFor[k] ? lg(refFor[k]) : ''}${esc(v)}</b></div>`).join('')}</div>
        ${a.description ? `<div class="box"><b>Description:</b> ${esc(a.description)}</div>` : ''}
        ${a.notes ? `<div class="box"><b>Notes:</b> ${esc(a.notes)}</div>` : ''}
        ${void_ && a.status_reason ? `<div class="box"><b>${esc(a.status_label)}:</b> ${esc(a.status_reason)}</div>` : ''}
        ${images.length || pdfs.length ? `<div style="font-size:11px;font-weight:700;margin-bottom:4px">Attached proof</div>
          <div class="proof n${images.length}">${images.map((src) => `<img src="${src}">`).join('')}</div>
          ${pdfs.length ? `<div style="font-size:10.5px;color:#555;margin-bottom:5mm">PDF on file: ${pdfs.map((x) => esc(x.original_name)).join(', ')}</div>` : ''}` : ''}
        <div class="sig"><div>Prepared By<br><b>${esc(a.created_by_name || '')}</b></div><div>Checked By</div><div>${a.activity_type === 'payment' ? 'Received By' : 'Authorised By'}</div></div>`;
      await printDoc({ title: titles[a.activity_type] || 'Bank Voucher', subtitle: `${esc(a.system_reference)}<br>Date: ${dmy(a.date)} ${t12(a.time)}<br>`,
        body, stamp: void_ ? `<div class="void">${esc(a.status_label.toUpperCase())}</div>` : '' });
    } catch (e) { fail(e); }
  };

  // A register-style list (all transactions / slips) on A4 landscape with the company header
  async function printRegister(title, params, subtitle) {
    try {
      const d = await api.get(`/activities/export/?${qs({ ...params, fmt: 'json' })}`);
      const heads = ['Date', 'Time', 'From', 'To', 'Amount', 'Slip', 'Reference', 'Purpose', 'Status'];
      const rows = d.results.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
        <td class="r">${Number(r.amount).toLocaleString('en-US')}</td><td>${esc(r.slip_number)}</td><td>${esc(r.bank_reference || r.system_reference)}</td><td>${esc(r.purpose)}</td><td>${esc(r.status)}</td></tr>`).join('');
      await printDoc({ title, landscape: true, subtitle: `${subtitle || ''}${d.results.length} record(s)<br>`,
        body: `<table class="t"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="9" style="text-align:center">No records.</td></tr>'}</tbody></table>` });
    } catch (e) { fail(e); }
  }
  const rangeText = (f) => { const [a, b] = rangeOf(f); return a || b ? `Period: ${a ? dmy(a) : '…'} to ${b ? dmy(b) : '…'}<br>` : ''; };


  const CSS2 = `
  .br-group-head .br-caret{margin-left:auto;font-size:11px;transition:transform .2s;opacity:.7}
  #br-nav-group.open .br-caret{transform:rotate(180deg)}
  .br-submenu{display:none;margin:2px 0 4px 14px;padding-left:6px;border-left:2px solid var(--border)}
  #br-nav-group.open .br-submenu{display:block}
  .br-submenu .nav-item.nav-sub{padding-top:8px;padding-bottom:8px;min-height:0;font-size:12.5px;margin-bottom:2px}
  .sidebar.collapsed .br-submenu{margin-left:0;padding-left:0;border-left:0}
  .sidebar.collapsed .br-caret{display:none}
  .br-lg{border-radius:6px;object-fit:contain;flex:0 0 auto;background:#fff;border:1px solid var(--border);padding:1px}
  .br-bk{display:inline-flex;align-items:center;gap:8px;min-width:0}
  .br-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
  .br-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);font-size:12.5px;font-weight:700}
  .br-chip button{border:0;background:transparent;color:var(--text-muted);cursor:pointer;padding:2px 4px;border-radius:6px}
  .br-chip button:hover{color:var(--accent)}
  #page-bankrec td.br-wrap{white-space:normal;min-width:190px;max-width:260px;line-height:1.35}
  #page-bankrec th.br-act,#page-bankrec td.br-act{position:sticky;right:0;z-index:2;background:var(--bg-card);white-space:nowrap;text-align:center;box-shadow:-8px 0 10px -8px rgba(0,0,0,.25)}
  #page-bankrec th.br-act{background:var(--bg-secondary)}
  .br-eye{position:relative;width:34px;height:34px;border-radius:10px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--accent);cursor:pointer;display:inline-grid;place-items:center;font-size:13px;margin:0 2px;vertical-align:middle}
  .br-eye:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
  .br-actbar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;padding-bottom:14px;border-bottom:1px solid var(--border)}
  .br-act-btn{height:38px;padding:0 16px;border-radius:10px;border:1.5px solid currentColor;background:transparent;font-family:inherit;font-weight:700;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s}
  .br-act-btn.edit{color:#3b82f6} .br-act-btn.done{color:#16a34a} .br-act-btn.cancel{color:#ef4444} .br-act-btn.reverse{color:#f59e0b}
  .br-act-btn.print{color:#fff;background:var(--accent);border-color:var(--accent);margin-left:auto}
  .br-act-btn:hover{color:#fff;box-shadow:0 5px 14px rgba(0,0,0,.18)}
  .br-act-btn.edit:hover{background:#3b82f6} .br-act-btn.done:hover{background:#16a34a} .br-act-btn.cancel:hover{background:#ef4444} .br-act-btn.reverse:hover{background:#f59e0b}
  .br-act-btn.print:hover{filter:brightness(1.07)}
  .br-datewrap{position:relative;display:block;min-width:0;flex:0 0 auto}
  .br-datewrap input.br-date{cursor:pointer;padding-right:34px;width:100%;box-sizing:border-box;text-overflow:ellipsis}
  .br-datewrap input.br-date:disabled{cursor:not-allowed;opacity:.55}
  .br-datewrap>i{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--accent);pointer-events:none;font-size:13px}
  .br-cal{position:fixed;z-index:100000;width:292px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.30);padding:14px;color:var(--text-primary);animation:brCalIn .14s ease-out}
  @keyframes brCalIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
  .br-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:10px}
  .br-cal-nav{width:30px;height:30px;border-radius:9px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:grid;place-items:center;font-size:11px}
  .br-cal-nav:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
  .br-cal-title{flex:1;display:flex;justify-content:center;gap:2px}
  .br-cal-title button{border:0;background:transparent;color:var(--text-primary);font-weight:800;font-size:14px;padding:5px 8px;border-radius:8px;cursor:pointer;font-family:inherit}
  .br-cal-title button:hover{background:rgba(234,108,77,.14);color:var(--accent)}
  .br-cal-dow,.br-cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
  .br-cal-dow span{text-align:center;font-size:10.5px;font-weight:700;color:var(--text-muted);padding:4px 0}
  .br-cal-day{height:34px;border:0;border-radius:10px;background:transparent;color:var(--text-primary);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
  .br-cal-day:hover{background:var(--bg-secondary)}
  .br-cal-day.out{color:var(--text-muted);opacity:.5}
  .br-cal-day.today{box-shadow:inset 0 0 0 1.5px var(--accent);color:var(--accent)}
  .br-cal-day.sel{background:var(--accent);color:#fff;box-shadow:0 4px 12px rgba(234,108,77,.4)}
  .br-cal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:4px 0}
  .br-cal-grid button{padding:13px 4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);border-radius:10px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
  .br-cal-grid button:hover{border-color:var(--accent);color:var(--accent)}
  .br-cal-grid button.sel{background:var(--accent);color:#fff;border-color:var(--accent)}
  .br-cal-foot{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}
  .br-cal-foot button{border:0;background:transparent;color:var(--accent);font-weight:800;font-size:12.5px;cursor:pointer;padding:6px 10px;border-radius:8px;font-family:inherit}
  .br-cal-foot button:hover{background:rgba(234,108,77,.12)}
  `;
  function injectStyle() {
    if (el('br-style')) return;
    const st = document.createElement('style'); st.id = 'br-style'; st.textContent = CSS + CSS2; document.head.appendChild(st);
  }

  function ensurePage() {
    if (el('page-bankrec')) return;
    injectStyle();
    const content = document.querySelector('.content');
    if (!content) return;
    const p = document.createElement('div');
    p.className = 'page'; p.id = 'page-bankrec';
    p.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Banking Records</h2>
          <p>Your digital bank payment register — what was paid, deposited and transferred, with the slip and proof</p>
        </div>
      </div>
      <div class="br-tabs" id="br-tabs"></div>
      <div id="br-body"></div>`;
    content.appendChild(p);
  }

  function renderTabs() {
    const bar = el('br-tabs'); if (!bar) return;
    bar.innerHTML = TABS.map((t) => `<button class="br-tab ${t.id === BR.tab ? 'active' : ''}" onclick="brOpen('${t.id}')"><i class="fa ${t.icon}"></i>${t.label}</button>`).join('');
    document.querySelectorAll('.nav-item[data-page="bankrec"]').forEach((n) => n.classList.toggle('active', n.dataset.sub === BR.tab));
  }

  async function loadLookups(force) {
    if (BR.loaded && !force) return;
    const [a, b, c] = await Promise.all([api.get('/accounts/?page_size=500'), api.get('/banks/?page_size=500'), api.get('/contacts/?page_size=500')]);
    BR.accounts = results(a); BR.banks = results(b); BR.contacts = results(c); BR.loaded = true;
  }
  const accOpts = (sel, onlyActive = true) => BR.accounts.filter((a) => !onlyActive || a.status === 'active' || a.id === sel)
    .map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.label)}</option>`).join('');

  async function render() {
    ensurePage(); renderTabs();
    const body = el('br-body'); if (!body) return;
    body.innerHTML = '<div class="br-panel" style="text-align:center;color:var(--text-muted)"><i class="fa fa-spinner fa-spin"></i> Loading…</div>';
    try {
      await loadLookups();
      const fn = { dashboard: rDashboard, accounts: rAccounts, contacts: rContacts, payment: () => rForm('payment'),
                   deposit: () => rForm('deposit'), transfer: () => rForm('transfer'), transactions: rTransactions,
                   slips: rSlips, reports: rReports, verification: rVerification }[BR.tab];
      await fn();
    } catch (e) { body.innerHTML = `<div class="br-panel" style="color:var(--red)">${esc(e.message || 'Failed to load')}</div>`; }
  }

  window.brOpen = function (tab, preset) {
    BR.tab = tab;
    if (tab === 'transactions' && preset) { BR.tx = { quick: 'all', sort: 'newest', ...preset }; BR.page = 1; }
    navigate('bankrec');
  };

  // hook into the app's navigate()
  window.brToggleGroup = function (force) {
    const g = el('br-nav-group'); if (!g) return;
    const open = typeof force === 'boolean' ? force : !g.classList.contains('open');
    g.classList.toggle('open', open);
    try { localStorage.setItem('br_group_open', open ? '1' : '0'); } catch (_) { /* private mode */ }
  };
  const _nav = window.navigate;
  window.navigate = function (page) {
    if (page === 'bankrec') { ensurePage(); if (typeof pageTitles !== 'undefined') pageTitles.bankrec = 'Banking Records'; }
    _nav(page);
    if (page === 'bankrec') { brToggleGroup(true); render(); }
  };
  injectStyle();
  try { brToggleGroup(localStorage.getItem('br_group_open') === '1'); } catch (_) { /* ignore */ }

  // ───────────────────────────── dashboard ─────────────────────────────
  async function rDashboard() {
    const day = BR.dashDate || today();
    const [s, recent] = await Promise.all([api.get(`/activities/summary/?date=${day}`), api.get('/activities/?page_size=10&sort=newest')]);
    const banks = s.by_account.length ? s.by_account.map((b) => `
      <div class="br-card br-bank" onclick="brOpen('transactions',{account:'${b.account}',quick:'all'})">
        <div style="font-weight:800">${withLogo({ accountId: b.account }, b.bank, 26)}</div><div class="s" style="margin-top:4px">${esc(b.label)}</div>
        <div class="row"><span>Today's Payments</span><b>${money(b.payments)}</b></div>
        <div class="row"><span>Today's Deposits</span><b>${money(b.deposits)}</b></div>
        <div class="row"><span>Today's Transfers</span><b>${money(b.transfers)}</b></div>
        <div class="row"><span>Transactions</span><b>${b.count}</b></div>
      </div>`).join('') : '<div class="br-panel" style="color:var(--text-muted)">No bank activity recorded on this day.</div>';
    el('br-body').innerHTML = `
      <div class="filter-bar">
        ${dateInp('br-dash-date', day, 'onchange="brDash(this.dataset.iso)"', 'width:190px')}
        <button class="btn btn-ghost btn-sm" onclick="brDash('${today()}')">Today</button>
        <span style="color:var(--text-muted);font-size:12px">Activity summary only — not revenue, expense or profit. Cancelled / reversed records are not counted.</span>
      </div>
      <div class="br-grid">
        <div class="br-card"><div class="l">Payments Made</div><div class="v">${money(s.payments)}</div><div class="s">${s.payments_count} record(s)</div></div>
        <div class="br-card green"><div class="l">Deposits</div><div class="v">${money(s.deposits)}</div><div class="s">${s.deposits_count} record(s)</div></div>
        <div class="br-card purple"><div class="l">Transfers</div><div class="v">${money(s.transfers)}</div><div class="s">${s.transfers_count} record(s)</div></div>
        <div class="br-card yellow"><div class="l">Total Banking Activities</div><div class="v">${s.total_activities}</div>
          <div class="s">${s.withdrawals_count} withdrawal(s) · ${s.other_count} other</div></div>
      </div>
      <h3 style="margin:6px 0 10px;font-size:14px">Bank-wise activity — ${dmy(day)}</h3>
      <div class="br-banks">${banks}</div>
      <div class="card"><div class="card-header"><div class="card-title">Latest records</div>
        <button class="btn btn-ghost btn-sm" onclick="brOpen('transactions')">View all</button></div>
        ${txTable(results(recent), false)}</div>`;
  }
  window.brDash = (d) => { BR.dashDate = d || today(); render(); };

  // ───────────────────────────── bank accounts ─────────────────────────────
  async function rAccounts() {
    await loadLookups(true);
    const rows = BR.accounts.map((a) => `<tr>
      <td><b>${withLogo({ bankId: a.bank }, a.bank_name, 24)}</b></td><td>${esc(a.account_title)}</td><td class="td-mono">${esc(a.masked_account_number)}</td>
      <td>${esc(a.branch)}</td><td>${esc(a.account_type)}</td>
      <td><span class="badge ${a.status === 'active' ? 'badge-green' : 'badge-gray'}">${a.status}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-xs" title="Details" onclick="brAccountView(${a.id})"><i class="fa fa-eye"></i></button>
        <button class="btn btn-ghost btn-xs" title="Activity" onclick="brOpen('transactions',{account:'${a.id}'})"><i class="fa fa-list"></i></button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-xs" title="Edit" onclick="brAccountForm(${a.id})"><i class="fa fa-pen"></i></button>` : ''}
      </td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No bank accounts yet.</td></tr>';
    el('br-body').innerHTML = `
      <div class="filter-bar">
        <button class="btn btn-accent btn-sm" onclick="brAccountForm()"><i class="fa fa-plus"></i> Add Account</button>
        <button class="btn btn-ghost btn-sm" onclick="brBankForm()"><i class="fa fa-building-columns"></i> Add Bank</button>
        <span style="color:var(--text-muted);font-size:12px">Account numbers are masked in lists. ${BR.banks.length} bank(s).</span>
      </div>
      <div class="br-chips">${BR.banks.map((b) => `<span class="br-chip">${withLogo({ bankId: b.id }, b.name, 24)}
        <button title="Edit bank / logo" onclick="brBankForm(${b.id})"><i class="fa fa-pen"></i></button></span>`).join('')}</div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Bank</th><th>Account Title</th><th>Account No.</th><th>Branch</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function modal(id, title, body, footer, cls = '') {
    let m = el(id); if (m) m.remove();
    m = document.createElement('div');
    m.className = 'modal-overlay br-modal ' + cls; m.id = id;
    m.innerHTML = `<div class="modal"><div class="modal-header"><div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal('${id}')">✕</button></div>
      <div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</div>`;
    document.body.appendChild(m); openModal(id); return m;
  }
  const field = (label, html, cls = '') => `<div class="${cls}"><label>${label}</label>${html}</div>`;
  const inp = (id, v = '', type = 'text', extra = '') => `<input class="form-input" id="${id}" type="${type}" value="${esc(v)}" ${extra}>`;
  const sel = (id, opts, v = '') => `<select class="form-input" id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const val = (id) => { const e = el(id); if (!e) return ''; return e.classList.contains('br-date') ? (e.dataset.iso || '') : e.value.trim(); };

  window.brBankForm = function (id) {
    const b = id ? BR.banks.find((x) => x.id === id) || {} : {};
    modal('br-bank-modal', id ? 'Edit Bank' : 'Add Bank', `<div class="br-form" style="display:grid;gap:12px">
      ${field('Bank Name *', inp('bm-name', b.name, 'text', 'placeholder="e.g. HBL"'))}${field('Code', inp('bm-code', b.code))}${field('Branch', inp('bm-branch', b.branch))}
      ${field('Bank Logo (optional — PNG, JPG or WebP)', `<div style="display:flex;align-items:center;gap:12px">
          <img id="bm-preview" class="br-lg" alt="" style="width:44px;height:44px" src="${b.id ? logoSrc({ bankId: b.id }) : badgeSrc(b.name || '?')}">
          <input class="form-input" type="file" id="bm-logo" accept="image/png,image/jpeg,image/webp" onchange="brLogoPreview(this)"></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:5px">Without a logo a coloured badge with the bank's initials is shown.</div>
        ${b.logo ? `<label style="display:flex;gap:8px;align-items:center;margin-top:6px;text-transform:none;letter-spacing:0;font-size:12px"><input type="checkbox" id="bm-remove"> Remove the current logo</label>` : ''}`)}</div>`,
      `<button class="btn btn-ghost" onclick="closeModal('br-bank-modal')">Cancel</button><button class="btn btn-accent" onclick="brBankSave(${id || 0})"><i class="fa fa-save"></i> Save</button>`);
  };
  window.brLogoPreview = function (input) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { el('bm-preview').src = r.result; }; r.readAsDataURL(f);
  };
  window.brBankSave = async function (id) {
    try {
      const body = { name: val('bm-name'), code: val('bm-code'), branch: val('bm-branch') };
      let b = id ? await api.patch(`/banks/${id}/`, body) : await api.post('/banks/', body);
      const file = el('bm-logo') && el('bm-logo').files[0];
      if (file) { const fd = new FormData(); fd.append('file', file); b = await api.form(`/banks/${b.id}/logo/`, fd); }
      else if (el('bm-remove') && el('bm-remove').checked) b = await api.post(`/banks/${b.id}/logo/`, { remove: '1' });
      closeModal('br-bank-modal'); toastDone(id ? 'update' : 'add', 'Bank', b.name);
      await loadLookups(true);
      if (BR.tab === 'accounts') render();
      if (el('br-account-modal') && el('ac-bank')) el('ac-bank').innerHTML = BR.banks.map((x) => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    } catch (e) { fail(e); }
  };

  window.brAccountForm = async function (id) {
    let a = {};
    if (id) { try { a = await api.get(`/accounts/${id}/`); } catch (e) { return fail(e); } }
    if (!BR.banks.length) { toast('Add a bank first (Add Bank).', 'warning'); return; }
    modal('br-account-modal', id ? 'Edit Bank Account' : 'Add Bank Account', `<div class="br-form">
      ${field('Bank *', `<select class="form-input" id="ac-bank">${BR.banks.map((b) => `<option value="${b.id}" ${b.id === a.bank ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
         <a href="#" onclick="brBankForm();return false" style="font-size:11px">+ new bank</a>`)}
      ${field('Account Title *', inp('ac-title', a.account_title))}
      ${field('Account Number *', inp('ac-number', a.account_number))}
      ${field('IBAN (optional)', inp('ac-iban', a.iban))}
      ${field('Branch', inp('ac-branch', a.branch))}
      ${field('Account Type', sel('ac-type', [['current', 'Current'], ['savings', 'Savings'], ['other', 'Other']], a.account_type || 'current'))}
      ${field('Status', sel('ac-status', [['active', 'Active'], ['inactive', 'Inactive']], a.status || 'active'))}
      ${field('Notes', `<textarea class="form-input" id="ac-notes">${esc(a.notes)}</textarea>`, 'wide')}</div>`,
      `<button class="btn btn-ghost" onclick="closeModal('br-account-modal')">Cancel</button><button class="btn btn-accent" onclick="brAccountSave(${id || 0})"><i class="fa fa-save"></i> Save</button>`);
  };
  window.brAccountSave = async function (id) {
    const body = { bank: +val('ac-bank'), account_title: val('ac-title'), account_number: val('ac-number'), iban: val('ac-iban'),
                   branch: val('ac-branch'), account_type: val('ac-type'), status: val('ac-status'), notes: val('ac-notes') };
    try {
      const a = id ? await api.patch(`/accounts/${id}/`, body) : await api.post('/accounts/', body);
      closeModal('br-account-modal'); toastDone(id ? 'update' : 'add', 'Bank account', a.account_title);
      await loadLookups(true); render();
    } catch (e) { fail(e); }
  };
  window.brAccountView = async function (id) {
    try {
      const a = await api.get(`/accounts/${id}/`);
      modal('br-acc-view', 'Bank Account', `<div class="br-kv">
        ${[['Bank', a.bank_name], ['Account Title', a.account_title], ['Account Number', a.account_number], ['IBAN', a.iban || '—'],
           ['Branch', a.branch || '—'], ['Type', a.account_type], ['Status', a.status]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
        <div style="grid-column:1/-1"><div class="k">Notes</div><div class="v">${esc(a.notes) || '—'}</div></div></div>`, '');
    } catch (e) { fail(e); }
  };

  // ───────────────────────────── payment contacts ─────────────────────────────
  async function rContacts() {
    const q = BR.contactQ || '';
    const d = await api.get(`/contacts/?page_size=500${q ? '&q=' + encodeURIComponent(q) : ''}`);
    const rows = results(d).map((c) => `<tr>
      <td><b>${esc(c.name)}</b></td><td>${esc(c.company_name)}</td><td>${esc(c.bank_name)}</td><td>${esc(c.account_title)}</td>
      <td class="td-mono">${esc(c.masked_account_number)}</td><td>${esc(c.phone)}</td>
      <td><span class="badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}">${c.status}</span></td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-xs" title="Payment history" onclick="brContactHistory(${c.id})"><i class="fa fa-clock-rotate-left"></i></button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-xs" title="Edit" onclick="brContactForm(${c.id})"><i class="fa fa-pen"></i></button>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">No payment contacts yet.</td></tr>';
    el('br-body').innerHTML = `
      <div class="filter-bar">
        <input class="form-input" id="br-contact-q" placeholder="Search name, company, bank, account, phone…" value="${esc(q)}" style="max-width:340px" onkeydown="if(event.key==='Enter')brContactSearch()">
        <button class="btn btn-ghost btn-sm" onclick="brContactSearch()"><i class="fa fa-search"></i> Search</button>
        <button class="btn btn-accent btn-sm" onclick="brContactForm()"><i class="fa fa-plus"></i> Add Contact</button>
      </div>
      <p class="br-note">An address book of people / companies you send money to — not customers or suppliers, and no balances are kept.</p>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Company</th><th>Bank</th><th>Account Title</th><th>Account No.</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  window.brContactSearch = () => { BR.contactQ = val('br-contact-q'); render(); };
  window.brContactForm = async function (id) {
    let c = {};
    if (id) { try { c = await api.get(`/contacts/${id}/`); } catch (e) { return fail(e); } }
    modal('br-contact-modal', id ? 'Edit Payment Contact' : 'Add Payment Contact', `<div class="br-form">
      ${field('Name *', inp('pc-name', c.name))}${field('Company Name', inp('pc-company', c.company_name))}${field('Phone', inp('pc-phone', c.phone))}
      ${field('Bank Name', inp('pc-bank', c.bank_name))}${field('Account Title', inp('pc-title', c.account_title))}${field('Account Number', inp('pc-number', c.account_number))}
      ${field('IBAN', inp('pc-iban', c.iban), 'two')}${field('Status', sel('pc-status', [['active', 'Active'], ['inactive', 'Inactive']], c.status || 'active'))}
      ${field('Notes', `<textarea class="form-input" id="pc-notes">${esc(c.notes)}</textarea>`, 'wide')}</div>`,
      `<button class="btn btn-ghost" onclick="closeModal('br-contact-modal')">Cancel</button><button class="btn btn-accent" onclick="brContactSave(${id || 0})"><i class="fa fa-save"></i> Save</button>`);
  };
  window.brContactSave = async function (id) {
    const body = { name: val('pc-name'), company_name: val('pc-company'), phone: val('pc-phone'), bank_name: val('pc-bank'),
                   account_title: val('pc-title'), account_number: val('pc-number'), iban: val('pc-iban'), status: val('pc-status'), notes: val('pc-notes') };
    try {
      const c = id ? await api.patch(`/contacts/${id}/`, body) : await api.post('/contacts/', body);
      closeModal('br-contact-modal'); toastDone(id ? 'update' : 'add', 'Contact', c.name);
      await loadLookups(true); if (BR.tab === 'contacts') render();
    } catch (e) { fail(e); }
  };
  window.brContactHistory = async function (id) {
    try {
      const h = await api.get(`/contacts/${id}/history/`);
      const rows = h.records.map((a) => `<tr style="cursor:pointer" onclick="brView(${a.id})"><td>${dmy(a.date)}</td><td>${t12(a.time)}</td><td class="num">${money(a.amount)}</td>
        <td>${esc(a.from_label)}</td><td>${esc(a.slip_number)}</td><td>${esc(a.bank_reference)}</td>
        <td><span class="badge ${STATUS_BADGE[a.status]}">${a.status_label}</span></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No payments recorded.</td></tr>';
      modal('br-hist-modal', `Payment history — ${esc(h.contact.name)}`, `
        <p class="br-note">${h.count} payment(s) recorded · ${money(h.total)} in total (cancelled / reversed excluded). History only — no balance is kept.</p>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Amount</th><th>From</th><th>Slip</th><th>Reference</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`, '');
    } catch (e) { fail(e); }
  };

  // ───────────────────────────── add payment / deposit / transfer ─────────────────────────────
  function formHtml(kind, a, p) {
    a = a || {}; const f = (id) => `${p}${id}`; const editing = !!a.id;
    const contacts = `<option value="">— type manually —</option>` + BR.contacts.filter((c) => c.status === 'active' || c.id === a.recipient)
      .map((c) => `<option value="${c.id}" ${c.id === a.recipient ? 'selected' : ''}>${esc(c.name)}${c.company_name ? ' · ' + esc(c.company_name) : ''}</option>`).join('');
    const typeSel = kind === 'payment' ? field('Record Type', sel(f('type'), [['payment', 'Payment'], ['withdrawal', 'Withdrawal'], ['other', 'Other']], a.activity_type || 'payment')) : '';
    const accounts = kind === 'deposit'
      ? field('Bank Account (deposited into) *', `<select class="form-input" id="${f('to')}"><option value="">Select…</option>${accOpts(a.to_account)}</select>`, 'two')
      : field(kind === 'transfer' ? 'From Account *' : 'From Account *', `<select class="form-input" id="${f('from')}"><option value="">Select…</option>${accOpts(a.from_account)}</select>`, kind === 'payment' ? '' : 'two')
        + (kind === 'transfer' ? field('To Account *', `<select class="form-input" id="${f('to')}"><option value="">Select…</option>${accOpts(a.to_account)}</select>`) : '');
    const recipient = kind === 'payment' ? `
      ${field('Recipient / Person', `<select class="form-input" id="${f('rec')}" onchange="brPickContact('${p}')">${contacts}</select>`)}
      ${field('Recipient Name *', inp(f('rname'), a.recipient_name))}${field('Recipient Bank', inp(f('rbank'), a.recipient_bank))}
      ${field('Recipient Account Title', inp(f('rtitle'), a.recipient_account_title))}${field('Recipient Account Number', inp(f('rnum'), a.recipient_account_number))}
      ${field('Recipient IBAN', inp(f('riban'), a.recipient_iban))}` : '';
    return `<div class="br-form">
      ${typeSel}${field('Date *', dateInp(f('date'), a.date || today()))}${field('Time *', inp(f('time'), (a.time || nowTime()).slice(0, 5), 'time'))}
      ${accounts}${recipient}
      ${field('Amount (Rs.) *', inp(f('amount'), a.amount || '', 'number', 'step="0.01" min="0.01" placeholder="0.00"'))}
      ${field(kind === 'deposit' ? 'Deposit Type' : 'Payment Method', sel(f('method'), METHODS, a.payment_method || (kind === 'deposit' ? 'cash_deposit' : 'bank_transfer')))}
      ${field('Status', sel(f('status'), STATUSES.slice(0, 3), a.status || 'completed'))}
      ${field('Slip Number', inp(f('slip'), a.slip_number, 'text', 'placeholder="e.g. SLIP-0051"'))}
      ${field('Bank Reference / Transaction No.', inp(f('bref'), a.bank_reference, 'text', 'placeholder="the bank\'s own number"'))}
      ${field('Purpose', inp(f('purpose'), a.purpose, 'text', 'placeholder="Payment / Daily Deposit / Internal Transfer"'))}
      ${field('Description', inp(f('desc'), a.description), 'wide')}
      ${field('Notes', `<textarea class="form-input" id="${f('notes')}" placeholder="Anything useful for later verification…">${esc(a.notes)}</textarea>`, 'wide')}
      ${editing ? field('Reason for change' + (a.status === 'completed' ? ' *' : ''), inp(f('reason'), '', 'text', 'placeholder="e.g. Incorrect amount entered"'), 'wide')
        : field('Attach slip / proof (JPG, PNG, PDF — several allowed)', `<input class="form-input" type="file" id="${f('files')}" multiple accept=".jpg,.jpeg,.png,.pdf"><div style="margin-top:6px">${sel(f('kind'), [['slip', 'Bank Slip'], ['screenshot', 'Screenshot'], ['receipt', 'Transaction Receipt'], ['proof', 'Payment Proof'], ['other', 'Other Document']], 'slip').replace('class="form-input"', 'class="form-input" style="max-width:260px"')}</div>`, 'wide')}
    </div>`;
  }
  window.brPickContact = function (p) {
    const c = BR.contacts.find((x) => String(x.id) === el(p + 'rec').value); if (!c) return;
    el(p + 'rname').value = c.name; el(p + 'rbank').value = c.bank_name || ''; el(p + 'rtitle').value = c.account_title || '';
    api.get(`/contacts/${c.id}/`).then((d) => { el(p + 'rnum').value = d.account_number || ''; el(p + 'riban').value = d.iban || ''; }).catch(() => {});
  };
  function collect(kind, p) {
    const g = (id) => val(p + id); const num = (id) => (g(id) ? +g(id) : null);
    const body = { activity_type: kind === 'payment' ? g('type') : kind, date: g('date'), time: g('time') || nowTime(), amount: g('amount'),
                   payment_method: g('method'), status: g('status'), slip_number: g('slip'), bank_reference: g('bref'),
                   purpose: g('purpose'), description: g('desc'), notes: g('notes') };
    if (kind === 'payment') Object.assign(body, { from_account: num('from'), recipient: num('rec'), recipient_name: g('rname'), recipient_bank: g('rbank'),
      recipient_account_title: g('rtitle'), recipient_account_number: g('rnum'), recipient_iban: g('riban') });
    if (kind === 'deposit') body.to_account = num('to');
    if (kind === 'transfer') Object.assign(body, { from_account: num('from'), to_account: num('to') });
    return body;
  }
  async function rForm(kind) {
    const titles = { payment: 'Add Payment', deposit: 'Add Deposit Record', transfer: 'Add Bank-to-Bank Transfer' };
    const hints = { payment: 'Record a payment you made to a person or company. Nothing is sent to the bank — this only records what happened.',
                    deposit: 'Record money deposited into one of your own accounts, and attach the physical deposit slip.',
                    transfer: 'Record a transfer between two of your own accounts (one transfer record).' };
    if (!BR.accounts.length) { el('br-body').innerHTML = '<div class="br-panel">Add a bank account first (Bank Accounts → Add Account).</div>'; return; }
    const saved = BR.justSaved ? `<div class="br-ok"><i class="fa fa-circle-check" style="color:var(--green)"></i> Saved as <b>${esc(BR.justSaved.system_reference)}</b> — ${money(BR.justSaved.amount)}.
        <a href="#" onclick="brView(${BR.justSaved.id});return false"><b>View record</b></a></div>` : '';
    BR.justSaved = null;
    el('br-body').innerHTML = `${saved}<div class="br-panel"><h3 style="margin:0 0 4px">${titles[kind]}</h3><p class="br-note">${hints[kind]}</p>
      ${formHtml(kind, null, 'nf-')}
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" id="nf-save" onclick="brSave('${kind}')"><i class="fa fa-save"></i> Save Record</button>
        <button class="btn btn-ghost" onclick="brOpen('${kind}')">Clear</button></div></div>`;
  }
  window.brSave = async function (kind) {
    const btn = el('nf-save'); if (btn) btn.disabled = true;
    try {
      const rec = await api.post('/activities/', collect(kind, 'nf-'));
      const files = el('nf-files') && el('nf-files').files;
      if (files && files.length) {
        const fd = new FormData(); [...files].forEach((f) => fd.append('files', f)); fd.append('kind', val('nf-kind'));
        try { await api.form(`/activities/${rec.id}/attachments/`, fd); }
        catch (e) { toast(`Record saved (${rec.system_reference}), but the attachment failed: ${e.message}`, 'warning'); }
      }
      toast({ title: 'Record saved', text: `${esc(rec.system_reference)} — ${money(rec.amount)} has been recorded successfully.`, kind: 'add' }, 'success');
      BR.justSaved = rec; render();
    } catch (e) { fail(e); if (btn) btn.disabled = false; }
  };

  // ───────────────────────────── transaction register ─────────────────────────────
  function quickRange(q) {
    const t = new Date(), d = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return ymd(x); };
    if (q === 'today') return [today(), today()];
    if (q === 'yesterday') return [d(-1), d(-1)];
    if (q === 'week') { const dow = (t.getDay() + 6) % 7; return [d(-dow), today()]; }
    if (q === 'month') return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), today()];
    if (q === 'lastmonth') return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
    return ['', ''];
  }
  function monthRange(ym) {
    if (!ym) return ['', ''];
    const [y, m] = ym.split('-').map(Number);
    return [`${y}-${pad(m)}-01`, ymd(new Date(y, m, 0))];
  }
  // One place that turns the chosen period (preset / a picked month / custom dates) into from–to.
  function rangeOf(f) {
    if (f.quick === 'custom') return [f.date_from || '', f.date_to || ''];
    if (f.quick === 'pickmonth') return monthRange(f.month);
    return quickRange(f.quick);                                   // 'all' → no dates at all
  }
  function txParams(f) {
    const p = { ...f };
    [p.date_from, p.date_to] = rangeOf(f);
    delete p.quick; delete p.month; return p;
  }
  function txTable(rows, actions = true) {
    const body = rows.map((a) => `<tr style="${a.status === 'cancelled' || a.status === 'reversed' ? 'opacity:.55' : ''}">
      <td style="white-space:nowrap">${dmy(a.date)}</td><td style="white-space:nowrap">${t12(a.time)}</td>
      <td><span class="badge badge-blue">${esc(a.type_label)}</span></td><td class="br-wrap">${a.activity_type === 'deposit' ? esc(a.from_label) : withLogo({ accountId: a.from_account }, a.from_label)}</td>
      <td class="br-wrap">${withLogo(a.activity_type === 'payment' ? { name: a.recipient_bank } : { accountId: a.to_account }, a.to_label)}</td>
      <td>${a.recipient_bank ? withLogo({ name: a.recipient_bank }, a.recipient_bank, 20) : ''}</td><td class="num">${money(a.amount)}</td><td>${esc(a.slip_number)}</td>
      <td class="td-mono">${esc(a.bank_reference || a.system_reference)}</td><td>${esc(a.purpose)}</td>
      <td><span class="badge ${STATUS_BADGE[a.status]}">${esc(a.status_label)}</span></td>
      ${actions ? `<td class="br-act"><button class="br-eye" title="View record — edit, cancel, reverse, print" onclick="brView(${a.id})"><i class="fa fa-eye"></i></button></td>` : ''}</tr>`).join('')
      || `<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:24px">No records found.</td></tr>`;
    return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>From Account</th><th>To / Recipient</th><th>Bank</th><th>Amount</th><th>Slip No.</th><th>Reference</th><th>Purpose</th><th>Status</th>${actions ? '<th class="br-act">View</th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  async function rTransactions() {
    const f = BR.tx;
    const [from, to] = rangeOf(f);
    const d = await api.get(`/activities/?${qs({ ...txParams(f), page: BR.page, page_size: BR.pageSize })}`);
    const o = (opts, v) => opts.map(([k, l]) => `<option value="${k}" ${String(v || '') === k ? 'selected' : ''}>${l}</option>`).join('');
    el('br-body').innerHTML = `
      <div class="br-panel" style="padding:14px 16px">
        <div class="filter-bar" style="margin-bottom:10px">
          <input class="form-input" id="tf-q" placeholder="Search name, bank, account no., slip, reference, amount, notes…" value="${esc(f.q)}" style="flex:1;min-width:240px" onkeydown="if(event.key==='Enter')brTxApply()">
          <select class="form-input" id="tf-quick" onchange="brTxQuick()" style="max-width:150px">${o([['all', 'All time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['pickmonth', 'Pick a month'], ['custom', 'Custom range']], f.quick)}</select>
          ${dateInp('tf-from', from, f.quick === 'custom' ? '' : 'disabled', 'width:160px')}
          ${dateInp('tf-to', to, f.quick === 'custom' ? '' : 'disabled', 'width:160px')}
          ${monthInp('tf-month', f.month, (f.quick === 'pickmonth' ? '' : 'disabled') + ' onchange="brTxApply()"', 'width:175px')}
        </div>
        <div class="filter-bar" style="margin-bottom:10px">
          <select class="form-input" id="tf-account" style="max-width:230px"><option value="">All accounts / banks</option>${BR.accounts.map((a) => `<option value="${a.id}" ${String(f.account) === String(a.id) ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
          <select class="form-input" id="tf-type" style="max-width:140px">${o([['', 'All types'], ['payment', 'Payment'], ['deposit', 'Deposit'], ['transfer', 'Transfer'], ['withdrawal', 'Withdrawal'], ['other', 'Other']], f.type)}</select>
          <select class="form-input" id="tf-status" style="max-width:140px">${o([['', 'All statuses'], ...STATUSES], f.status)}</select>
          <select class="form-input" id="tf-method" style="max-width:160px">${o([['', 'All methods'], ...METHODS], f.method)}</select>
          <input class="form-input" id="tf-recq" placeholder="Recipient" value="${esc(f.recipient_q)}" style="max-width:150px">
          <input class="form-input" id="tf-slip" placeholder="Slip no." value="${esc(f.slip)}" style="max-width:120px">
          <input class="form-input" id="tf-ref" placeholder="Reference" value="${esc(f.reference)}" style="max-width:130px">
          <input class="form-input" id="tf-amount" placeholder="Amount" value="${esc(f.amount)}" style="max-width:110px">
          <select class="form-input" id="tf-sort" style="max-width:150px">${o([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['highest', 'Highest amount'], ['lowest', 'Lowest amount']], f.sort)}</select>
        </div>
        <div class="filter-bar" style="margin:0">
          <button class="btn btn-accent btn-sm" onclick="brTxApply()"><i class="fa fa-filter"></i> Apply</button>
          <button class="btn btn-ghost btn-sm" onclick="brTxClear()">Clear</button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" onclick="brExport('csv')"><i class="fa fa-file-csv"></i> CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="brExport('xlsx')"><i class="fa fa-file-excel"></i> Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="brExport('pdf')"><i class="fa fa-file-pdf"></i> PDF</button>
          <button class="btn btn-warning btn-sm" onclick="brPrintRegister()"><i class="fa fa-print"></i> Print Register</button>
        </div>
      </div>
      <div class="card">${txTable(results(d))}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;font-size:12px;color:var(--text-muted)">
          <span>${d.count} record(s)</span>
          <span>${d.total_pages > 1 ? `<button class="btn btn-ghost btn-xs" ${d.current_page <= 1 ? 'disabled' : ''} onclick="brPage(${d.current_page - 1})">‹ Prev</button>
            Page ${d.current_page} / ${d.total_pages}
            <button class="btn btn-ghost btn-xs" ${d.current_page >= d.total_pages ? 'disabled' : ''} onclick="brPage(${d.current_page + 1})">Next ›</button>` : ''}</span></div></div>`;
  }
  window.brPage = (n) => { BR.page = n; render(); };
  window.brTxQuick = function () {
    const q = val('tf-quick');
    ['tf-from', 'tf-to'].forEach((i) => { el(i).disabled = q !== 'custom'; });
    el('tf-month').disabled = q !== 'pickmonth';
  };
  window.brTxApply = function () {
    const quick = val('tf-quick'), month = val('tf-month');
    if (quick === 'pickmonth' && !month) { toast('Choose a month from the calendar first.', 'warning'); return; }
    BR.tx = { quick, month, date_from: val('tf-from'), date_to: val('tf-to'), account: val('tf-account'), type: val('tf-type'),
              status: val('tf-status'), method: val('tf-method'), recipient_q: val('tf-recq'), slip: val('tf-slip'),
              reference: val('tf-ref'), amount: val('tf-amount'), sort: val('tf-sort'), q: val('tf-q') };
    BR.page = 1; render();
  };
  window.brTxClear = () => { BR.tx = { quick: 'all', sort: 'newest' }; BR.page = 1; render(); };
  window.brExport = (fmt) => download(`/activities/export/?${qs({ ...txParams(BR.tx), fmt })}`, `bank-register.${fmt}`);
  window.brPrintRegister = () => printRegister('Bank Payment Record', txParams(BR.tx), rangeText(BR.tx));

  // ───────────────────────────── record detail ─────────────────────────────
  function prompt(title, label) {
    return new Promise((resolve) => {
      modal('br-prompt', title, `<label style="font-size:12px;font-weight:700">${label}</label><textarea class="form-input" id="br-prompt-text" style="margin-top:6px"></textarea>`,
        `<button class="btn btn-ghost" id="br-p-cancel">Cancel</button><button class="btn btn-accent" id="br-p-ok">Confirm</button>`);
      el('br-p-cancel').onclick = () => { closeModal('br-prompt'); resolve(null); };
      el('br-p-ok').onclick = () => { const t = val('br-prompt-text'); if (!t) { toast('A reason is required.', 'warning'); return; } closeModal('br-prompt'); resolve(t); };
    });
  }
  window.brView = async function (id) {
    try {
      const [a, att, ch] = await Promise.all([api.get(`/activities/${id}/`), api.get(`/activities/${id}/attachments/`), api.get(`/activities/${id}/changes/`)]);
      const kv = [['System Reference', a.system_reference], ['Bank Reference', a.bank_reference || '—'], ['Slip Number', a.slip_number || '—'],
        ['Type', a.type_label], ['Date', dmy(a.date)], ['Time', t12(a.time)], ['Amount', money(a.amount)], ['Method', a.method_label],
        ['From Account', a.from_label || '—'], ['To / Recipient', a.to_label || '—'], ['Recipient Bank', a.recipient_bank || '—'],
        ['Recipient Account Title', a.recipient_account_title || '—'], ['Recipient Account No.', a.recipient_account_number || '—'], ['Recipient IBAN', a.recipient_iban || '—'],
        ['Purpose', a.purpose || '—'], ['Status', a.status_label + (a.status_reason ? ` — ${a.status_reason}` : '')], ['Entered By', a.created_by_name || '—']];
      const admin = isAdmin() && !['cancelled', 'reversed'].includes(a.status);
      const bar = `<div class="br-actbar">
        ${admin ? `<button class="br-act-btn edit" onclick="brEdit(${a.id})"><i class="fa fa-pen"></i> Edit</button>
          ${['pending', 'recorded'].includes(a.status) ? `<button class="br-act-btn done" onclick="brStatus(${a.id},'completed')"><i class="fa fa-check"></i> Mark Completed</button>` : ''}
          <button class="br-act-btn cancel" onclick="brStatus(${a.id},'cancelled')"><i class="fa fa-ban"></i> Cancel</button>
          <button class="br-act-btn reverse" onclick="brStatus(${a.id},'reversed')"><i class="fa fa-rotate-left"></i> Reverse</button>` : ''}
        <button class="br-act-btn print" onclick="brPrintVoucher(${a.id})"><i class="fa fa-print"></i> Print A4</button></div>`;
      modal('br-view-modal', `${esc(a.system_reference)} <span class="badge ${STATUS_BADGE[a.status]}" style="margin-left:8px">${esc(a.status_label)}</span>`, `
        ${bar}
        <div class="br-kv">${kv.map(([k, v]) => {
          const ref = k === 'From Account' ? (a.activity_type === 'deposit' ? null : { accountId: a.from_account })
            : k === 'To / Recipient' ? (a.activity_type === 'payment' ? { name: a.recipient_bank } : { accountId: a.to_account })
            : k === 'Recipient Bank' ? { name: a.recipient_bank } : null;
          return `<div><div class="k">${k}</div><div class="v">${ref && v !== '—' ? withLogo(ref, v, 22) : esc(v)}</div></div>`;
        }).join('')}</div>
        <div style="margin-top:14px"><div class="k" style="font-size:10.5px;color:var(--text-muted);font-weight:700;text-transform:uppercase">Notes</div>
          <div style="white-space:pre-wrap;font-size:13px;margin-top:4px">${esc(a.notes) || '—'}</div>
          ${a.description ? `<div style="font-size:12.5px;color:var(--text-secondary);margin-top:6px">${esc(a.description)}</div>` : ''}</div>
        <h4 style="margin:18px 0 8px;font-size:13px">Attachments</h4>
        ${att.results.map((x) => `<div class="br-att"><span><i class="fa ${x.file_type === 'pdf' ? 'fa-file-pdf' : 'fa-image'}"></i> ${esc(x.original_name)} · ${esc(x.kind)} · ${dmy(x.created_at)} · ${esc(x.uploaded_by_name)}</span>
          <span><button class="btn btn-ghost btn-xs" onclick="brProof(${x.id})">View</button>${isAdmin() ? `<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="brRemoveAtt(${x.id},${a.id})">Remove</button>` : ''}</span></div>`).join('') || '<div style="font-size:12.5px;color:var(--text-muted)">No proof attached yet.</div>'}
        ${!['cancelled', 'reversed'].includes(a.status) ? `<div style="margin-top:8px"><input type="file" id="br-add-files" multiple accept=".jpg,.jpeg,.png,.pdf" class="form-input" style="max-width:300px;display:inline-block">
          <button class="btn btn-ghost btn-sm" onclick="brAddFiles(${a.id})"><i class="fa fa-paperclip"></i> Attach</button></div>` : ''}
        <h4 style="margin:18px 0 8px;font-size:13px">Change history</h4>
        ${ch.results.map((c) => `<div style="font-size:12px;border-bottom:1px solid var(--border);padding:6px 0"><b>${esc(c.field)}</b>: ${esc(c.old_value) || '—'} → <b>${esc(c.new_value) || '—'}</b>
          <span style="color:var(--text-muted)"> · ${esc(c.changed_by_name)} · ${new Date(c.changed_at).toLocaleString()}${c.reason ? ' · ' + esc(c.reason) : ''}</span></div>`).join('') || '<div style="font-size:12.5px;color:var(--text-muted)">No changes since it was recorded.</div>'}`,
        `<button class="btn btn-accent" onclick="closeModal('br-view-modal')">Close</button>`);
    } catch (e) { fail(e); }
  };
  window.brProof = openProof;
  window.brAddFiles = async function (id) {
    const files = el('br-add-files').files; if (!files.length) return toast('Choose a file first.', 'warning');
    const fd = new FormData(); [...files].forEach((f) => fd.append('files', f)); fd.append('kind', 'slip');
    try { await api.form(`/activities/${id}/attachments/`, fd); toast('Attachment added.', 'success'); brView(id); } catch (e) { fail(e); }
  };
  window.brRemoveAtt = async function (attId, id) {
    const reason = await prompt('Remove attachment', 'Why is this attachment being removed?'); if (!reason) return;
    try { await api.post(`/attachments/${attId}/remove/`, { reason }); toast('Attachment removed (logged).', 'success'); brView(id); } catch (e) { fail(e); }
  };
  window.brStatus = async function (id, status) {
    let reason = '';
    if (status !== 'completed') {
      reason = await prompt(status === 'cancelled' ? 'Cancel record' : 'Reverse record', `Reason for marking this record ${status}:`);
      if (!reason) return;
    }
    try { await api.post(`/activities/${id}/status/`, { status, reason }); toast(`Record marked ${status}. The original stays on file.`, 'success'); brView(id); if (BR.tab !== 'payment') render(); } catch (e) { fail(e); }
  };
  window.brEdit = async function (id) {
    try {
      const a = await api.get(`/activities/${id}/`);
      const kind = a.activity_type === 'deposit' ? 'deposit' : a.activity_type === 'transfer' ? 'transfer' : 'payment';
      closeModal('br-view-modal');
      modal('br-edit-modal', `Edit ${esc(a.system_reference)}`, formHtml(kind, a, 'ef-'),
        `<button class="btn btn-ghost" onclick="closeModal('br-edit-modal')">Cancel</button><button class="btn btn-accent" onclick="brEditSave(${a.id},'${kind}')"><i class="fa fa-save"></i> Save Changes</button>`);
    } catch (e) { fail(e); }
  };
  window.brEditSave = async function (id, kind) {
    const body = collect(kind, 'ef-'); delete body.status; delete body.activity_type; body.change_reason = val('ef-reason');
    try { await api.patch(`/activities/${id}/`, body); closeModal('br-edit-modal'); toastDone('update', 'Record'); brView(id); if (BR.tab !== 'payment') render(); } catch (e) { fail(e); }
  };

  // ───────────────────────────── bank slips ─────────────────────────────
  async function rSlips() {
    const f = BR.slips;
    const d = await api.get(`/activities/?${qs({ has_slip: 1, q: f.q, date_from: f.from, date_to: f.to, sort: 'newest', page_size: 200 })}`);
    const rows = results(d).map((a) => `<tr style="cursor:pointer" onclick="brView(${a.id})"><td><b>${esc(a.slip_number)}</b></td><td>${dmy(a.date)}</td><td>${t12(a.time)}</td>
      <td>${esc(a.from_label && a.activity_type !== 'deposit' ? a.from_label : a.to_label)}</td><td class="num">${money(a.amount)}</td>
      <td>${esc(a.activity_type === 'payment' ? a.to_label : TYPE_LABEL[a.activity_type])}</td><td class="td-mono">${esc(a.bank_reference || a.system_reference)}</td>
      <td>${a.attachment_count ? `<span class="badge badge-green"><i class="fa fa-paperclip"></i> ${a.attachment_count} attached</span>` : '<span class="badge badge-red">Missing</span>'}</td>
      <td class="br-act" onclick="event.stopPropagation()"><button class="br-eye" title="View record" onclick="brView(${a.id})"><i class="fa fa-eye"></i></button>
        <button class="br-eye" title="Print A4 voucher" onclick="brPrintVoucher(${a.id})"><i class="fa fa-print"></i></button></td></tr>`).join('')
      || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">No slips found.</td></tr>';
    el('br-body').innerHTML = `
      <div class="filter-bar">
        <input class="form-input" id="sl-q" placeholder="Search slip number, reference, name, amount…" value="${esc(f.q)}" style="max-width:340px" onkeydown="if(event.key==='Enter')brSlipSearch()">
        ${dateInp('sl-from', f.from, '', 'width:160px')}${dateInp('sl-to', f.to, '', 'width:160px')}
        <button class="btn btn-accent btn-sm" onclick="brSlipSearch()"><i class="fa fa-search"></i> Search</button>
        <button class="btn btn-ghost btn-sm" onclick="BR_slipClear()">Clear</button>
        <span style="flex:1"></span>
        <button class="btn btn-warning btn-sm" onclick="brSlipPrintAll()"><i class="fa fa-print"></i> Print A4 (all listed)</button>
      </div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Slip No.</th><th>Date</th><th>Time</th><th>Bank / Account</th><th>Amount</th><th>Recipient / Type</th><th>Reference</th><th>Proof</th><th class="br-act">Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  window.brSlipSearch = () => { BR.slips = { q: val('sl-q'), from: val('sl-from'), to: val('sl-to') }; render(); };
  window.BR_slipClear = () => { BR.slips = {}; render(); };
  window.brSlipPrintAll = () => printRegister('Bank Slips Register', { has_slip: 1, q: BR.slips.q, date_from: BR.slips.from, date_to: BR.slips.to, sort: 'oldest' },
    BR.slips.from || BR.slips.to ? `Period: ${BR.slips.from ? dmy(BR.slips.from) : '…'} to ${BR.slips.to ? dmy(BR.slips.to) : '…'}<br>` : '');

  // ───────────────────────────── reports ─────────────────────────────
  const REPORTS = {
    daily:   { label: 'Daily Report', cols: [['date', 'Date'], ['count', 'Transactions'], ['payments', 'Total Payments'], ['deposits', 'Total Deposits'], ['transfers', 'Total Transfers']] },
    monthly: { label: 'Monthly Report', cols: [['month', 'Month'], ['payments', 'Total Payments'], ['deposits', 'Total Deposits'], ['transfers', 'Total Transfers'], ['count', 'Transactions']] },
    person:  { label: 'Person / Recipient Report', cols: [['person', 'Person'], ['payments', 'Number of Payments'], ['total_amount', 'Total Amount'], ['last_payment_date', 'Last Payment Date']] },
    bank:    { label: 'Bank Activity Report', cols: [['label', 'Bank Account'], ['count', 'Transactions'], ['payments', 'Total Payments'], ['deposits', 'Total Deposits'], ['transfers', 'Total Transfers']] },
    slips:   { label: 'Slip Report', cols: [['slip_number', 'Slip No.'], ['date', 'Date'], ['bank', 'Bank'], ['amount', 'Amount'], ['recipient', 'Recipient'], ['reference', 'Reference'], ['attachment', 'Attachment']] },
  };
  const MONEYCOLS = new Set(['payments', 'deposits', 'transfers', 'total_amount', 'amount']);
  async function rReports() {
    const r = BR.report; const [from, to] = rangeOf(r);
    const d = await api.get(`/activities/reports/?${qs({ report: r.type, date_from: from, date_to: to })}`);
    const spec = REPORTS[r.type]; BR.reportRows = d.results;
    const cell = (k, row) => (MONEYCOLS.has(k) && !(r.type === 'person' && k === 'payments') ? `<td class="num">${money(row[k])}</td>` : `<td>${esc(row[k])}</td>`);
    el('br-body').innerHTML = `
      <div class="filter-bar">
        <select class="form-input" id="rp-type" style="max-width:240px">${Object.entries(REPORTS).map(([k, v]) => `<option value="${k}" ${k === r.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <select class="form-input" id="rp-quick" style="max-width:150px" onchange="brRpQuick()">
          ${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['pickmonth', 'Pick a month'], ['all', 'All time'], ['custom', 'Custom range']].map(([k, l]) => `<option value="${k}" ${k === r.quick ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${dateInp('rp-from', from, r.quick === 'custom' ? '' : 'disabled', 'width:160px')}
        ${dateInp('rp-to', to, r.quick === 'custom' ? '' : 'disabled', 'width:160px')}
        ${monthInp('rp-month', r.month, r.quick === 'pickmonth' ? '' : 'disabled', 'width:175px')}
        <button class="btn btn-accent btn-sm" onclick="brReportRun()"><i class="fa fa-play"></i> Run</button>
        <button class="btn btn-ghost btn-sm" onclick="brReportCsv()"><i class="fa fa-file-csv"></i> CSV</button>
        <button class="btn btn-warning btn-sm" onclick="brReportPrint()"><i class="fa fa-print"></i> Print A4</button>
      </div>
      <p class="br-note">Historical banking activity only. Cancelled and reversed records are not counted.</p>
      <div class="card"><div class="card-header"><div class="card-title">${spec.label}</div></div><div class="table-wrap"><table>
        <thead><tr>${spec.cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${d.results.map((row) => `<tr>${spec.cols.map(([k]) => cell(k, row)).join('')}</tr>`).join('') || `<tr><td colspan="${spec.cols.length}" style="text-align:center;color:var(--text-muted);padding:24px">No data for this period.</td></tr>`}</tbody></table></div></div>`;
  }
  window.brRpQuick = function () {
    const q = val('rp-quick');
    ['rp-from', 'rp-to'].forEach((i) => { el(i).disabled = q !== 'custom'; });
    el('rp-month').disabled = q !== 'pickmonth';
  };
  window.brReportRun = function () {
    const quick = val('rp-quick'), month = val('rp-month');
    if (quick === 'pickmonth' && !month) { toast('Choose a month from the calendar first.', 'warning'); return; }
    BR.report = { type: val('rp-type'), quick, month, date_from: val('rp-from'), date_to: val('rp-to') }; render();
  };
  window.brReportPrint = async function () {
    const r = BR.report, spec = REPORTS[r.type], rows = BR.reportRows || [];
    const cell = (k, row) => (MONEYCOLS.has(k) && !(r.type === 'person' && k === 'payments') ? `<td class="r">${money(row[k])}</td>` : `<td>${esc(row[k])}</td>`);
    await printDoc({ title: spec.label, subtitle: rangeText(r), landscape: spec.cols.length > 5,
      body: `<table class="t"><thead><tr>${spec.cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${spec.cols.map(([k]) => cell(k, row)).join('')}</tr>`).join('') || `<tr><td colspan="${spec.cols.length}" style="text-align:center">No data for this period.</td></tr>`}</tbody></table>
        <p style="font-size:10px;color:#555">Historical banking activity only. Cancelled and reversed records are not counted.</p>` });
  };
  window.brReportCsv = function () {
    const spec = REPORTS[BR.report.type]; const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [spec.cols.map(([, h]) => q(h)).join(',')].concat((BR.reportRows || []).map((r) => spec.cols.map(([k]) => q(r[k])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = `bank-report-${BR.report.type}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ───────────────────────────── daily verification ─────────────────────────────
  async function rVerification() {
    const day = BR.verDate || today();
    const [s, v, hist] = await Promise.all([api.get(`/activities/summary/?date=${day}`), api.get(`/verifications/?date=${day}`), api.get('/verifications/?page_size=30')]);
    const cur = results(v)[0] || {};
    const chk = (id, label, on) => `<label style="display:flex;gap:9px;align-items:center;font-size:13px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--text-primary);margin:0"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
    el('br-body').innerHTML = `
      <div class="filter-bar">${dateInp('ver-date', day, 'onchange="brVerDay(this.dataset.iso)"', 'width:190px')}
        <span style="color:var(--text-muted);font-size:12px">${s.total_activities} record(s) on this day · payments ${money(s.payments)} · deposits ${money(s.deposits)} · transfers ${money(s.transfers)}</span></div>
      <div class="br-panel"><h3 style="margin:0 0 4px">Daily Verification — ${dmy(day)}</h3>
        <p class="br-note">Optional end-of-day check of your handwritten ledger against these digital records and the bank slips.</p>
        <div style="display:grid;gap:12px;margin-bottom:14px">
          ${chk('ver-phys', 'Physical ledger checked', cur.physical_ledger_checked)}${chk('ver-dig', 'Digital records checked', cur.digital_records_checked)}
          ${chk('ver-slips', 'Bank slips checked', cur.bank_slips_checked)}${chk('ver-match', 'All records matched', cur.all_records_matched)}
          ${chk('ver-mis', 'Mismatch found', cur.mismatch_found)}</div>
        <div class="br-form"><div class="wide"><label>Notes</label><textarea class="form-input" id="ver-notes" placeholder="e.g. One payment slip missing.">${esc(cur.notes)}</textarea></div></div>
        <div style="margin-top:14px"><button class="btn btn-accent" onclick="brVerSave()"><i class="fa fa-save"></i> Save Verification</button>
          ${cur.verified_by_name ? `<span style="font-size:12px;color:var(--text-muted);margin-left:10px">Last saved by ${esc(cur.verified_by_name)}</span>` : ''}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Recent verifications</div></div><div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Ledger</th><th>Digital</th><th>Slips</th><th>Matched</th><th>Mismatch</th><th>Notes</th></tr></thead>
        <tbody>${results(hist).map((h) => `<tr style="cursor:pointer" onclick="brVerDay('${h.date}')"><td>${dmy(h.date)}</td>
          ${[h.physical_ledger_checked, h.digital_records_checked, h.bank_slips_checked, h.all_records_matched].map((b) => `<td>${b ? '✅' : '—'}</td>`).join('')}
          <td>${h.mismatch_found ? '<span class="badge badge-red">YES</span>' : '—'}</td><td>${esc(h.notes)}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">Nothing verified yet.</td></tr>'}</tbody></table></div></div>`;
  }
  window.brVerDay = (d) => { BR.verDate = d || today(); render(); };
  window.brVerSave = async function () {
    const on = (id) => !!(el(id) && el(id).checked);
    try {
      await api.post('/verifications/', { date: val('ver-date'), physical_ledger_checked: on('ver-phys'), digital_records_checked: on('ver-dig'),
        bank_slips_checked: on('ver-slips'), all_records_matched: on('ver-match'), mismatch_found: on('ver-mis'), notes: val('ver-notes') });
      toast({ title: 'Verification saved', text: `The check for ${dmy(val('ver-date'))} has been saved successfully.`, kind: 'update' }, 'success'); render();
    } catch (e) { fail(e); }
  };
})();