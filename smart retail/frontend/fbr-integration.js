// ═══════════════════════════════════════════════════════════════
// SmartRetail ERP — FBR Integration (isolated module)
//
// Loaded AFTER script.js. It never edits script.js: it watches two places
// in the page and adds its own section there —
//   1. System Settings page  → an "FBR Integration" card (admins only)
//   2. Sale Slip detail modal → a small "FBR" status box
//
// When FBR is switched off in settings (the default), the slip box is never
// shown and nothing is sent anywhere. Uses apiRequest() from api.js, so it
// reuses the existing login/JWT handling; no second auth mechanism.
// The FBR token is write-only: it is never read back from the server.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__fbrIntegrationLoaded) return;
  window.__fbrIntegrationLoaded = true;

  const fbrApi = (path, opts) => apiRequest('/fbr' + path, opts);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const role = () => (typeof currentUser !== 'undefined' && currentUser ? currentUser.role : '');
  const isAdmin = () => ['super_admin', 'admin'].includes(role());
  const isManager = () => ['super_admin', 'admin', 'manager'].includes(role());
  const say = (msg, type) => { if (typeof toast === 'function') toast(msg, type || 'success'); };
  const errText = (e) => (e && e.message) ? e.message : 'Something went wrong';

  // ── is FBR switched on? (cached briefly) ───────────────────────
  let _flag = { at: 0, enabled: false };
  async function fbrEnabled(force) {
    if (!force && Date.now() - _flag.at < 30000) return _flag.enabled;
    try {
      const r = await fbrApi('/enabled/');
      _flag = { at: Date.now(), enabled: !!(r && r.enabled) };
    } catch (_) {
      _flag = { at: Date.now(), enabled: false };   // not logged in / no permission → hidden
    }
    return _flag.enabled;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. SETTINGS CARD
  // ═══════════════════════════════════════════════════════════════
  const CARD_ID = 'fbr-settings-card';

  const inputRow = (label, id, value, hint, type) => `
    <div class="form-group-inline">
      <label>${label}</label>
      <div style="flex:1;min-width:0">
        <input class="form-input" id="${id}" type="${type || 'text'}" value="${esc(value)}" autocomplete="off">
        ${hint ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${hint}</div>` : ''}
      </div>
    </div>`;

  const yesNoRow = (label, id, on, hint) => `
    <div class="form-group-inline">
      <label>${label}</label>
      <div style="flex:1;min-width:0">
        <select class="form-input" id="${id}">
          <option value="no" ${on ? '' : 'selected'}>No</option>
          <option value="yes" ${on ? 'selected' : ''}>Yes</option>
        </select>
        ${hint ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${hint}</div>` : ''}
      </div>
    </div>`;

  async function mountSettingsCard() {
    const page = document.getElementById('page-settings');
    if (!page || !isAdmin()) return;

    let cfg;
    try { cfg = await fbrApi('/config/'); } catch (e) { return; }

    let card = document.getElementById(CARD_ID);
    if (!card) {
      card = document.createElement('div');
      card.id = CARD_ID;
      card.className = 'card';
      card.style.marginTop = '20px';
      page.appendChild(card);
    }

    const missing = (cfg.missing_configuration || []);
    const readiness = !cfg.is_enabled
      ? '<span class="badge badge-red">Off</span>'
      : missing.length
        ? `<span class="badge badge-red">Incomplete</span> <span style="font-size:11px;color:var(--text-muted)">Missing: ${esc(missing.join(', '))}</span>`
        : `<span class="badge badge-green">Ready</span>`;

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">🧾 FBR Integration (Digital Invoicing)</div>
        <div>${readiness}</div>
      </div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
          Optional. Leave it switched off if your business doesn't need to report invoices to FBR —
          billing works exactly the same either way. Start with <b>Sandbox</b>, and only switch to
          Production once FBR has approved your sandbox test invoices.
        </div>
        ${yesNoRow('Enable FBR', 'fbr-enabled', cfg.is_enabled)}
        <div class="form-group-inline"><label>Environment</label>
          <select class="form-input" id="fbr-environment">
            <option value="sandbox" ${cfg.environment === 'sandbox' ? 'selected' : ''}>Sandbox (testing)</option>
            <option value="production" ${cfg.environment === 'production' ? 'selected' : ''}>Production (live)</option>
          </select>
        </div>
        ${inputRow('API Token', 'fbr-token', '',
          cfg.token_configured ? '✔ A token is saved. Leave blank to keep it, or paste a new one to replace it.'
                               : 'Paste the security token issued to you by PRAL/FBR.', 'password')}
        ${cfg.token_configured ? `
          <div class="form-group-inline"><label></label>
            <label style="font-size:12px"><input type="checkbox" id="fbr-clear-token"> Remove the saved token</label>
          </div>` : ''}
        ${inputRow('Seller NTN / CNIC', 'fbr-ntn', cfg.seller_ntn_cnic, '7-digit NTN or 13-digit CNIC registered with FBR')}
        ${inputRow('Business Name', 'fbr-bizname', cfg.seller_business_name, 'Blank = use the Store Name above')}
        ${inputRow('Province', 'fbr-province', cfg.seller_province, 'Must match FBR\'s spelling, e.g. Punjab, Sindh')}
        ${inputRow('Business Address', 'fbr-address', cfg.seller_address, 'Blank = use the Store Address above')}
        ${inputRow('Default HS Code', 'fbr-hs', cfg.default_hs_code, 'Used for any product without its own HS code (set per product below)')}
        ${inputRow('Default Unit of Measure', 'fbr-uom', cfg.default_uom, 'Exact FBR wording, e.g. "Numbers, pieces, units"')}
        ${inputRow('Default Sale Type', 'fbr-saletype', cfg.default_sale_type, 'e.g. "Goods at standard rate (default)"')}
        ${inputRow('Sandbox Scenario ID', 'fbr-scenario', cfg.sandbox_scenario_id, 'Sandbox only, e.g. SN001 (registered buyer) / SN002 (unregistered)')}
        ${yesNoRow('Auto-submit new sales', 'fbr-auto', cfg.auto_submit_enabled,
          'Needs the <code>fbr_submit_pending</code> command scheduled. Only sales made after you turn this on are sent.')}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="fbr-test-btn"><i class="fa fa-plug"></i> Test Connection</button>
          <button class="btn btn-accent btn-sm" id="fbr-save-btn"><i class="fa fa-save"></i> Save FBR Settings</button>
        </div>

        <hr style="margin:18px 0;border:none;border-top:1px solid var(--border,#333)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="font-weight:700">Product FBR details</div>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="fbr-prod-q" placeholder="Search name or SKU" style="max-width:200px">
            <button class="btn btn-ghost btn-sm" id="fbr-prod-load"><i class="fa fa-list"></i> Load products</button>
          </div>
        </div>
        <div id="fbr-prod-table" style="margin-top:10px"></div>
      </div>`;

    document.getElementById('fbr-save-btn').onclick = () => saveSettings(card);
    document.getElementById('fbr-test-btn').onclick = testConnection;
    document.getElementById('fbr-prod-load').onclick = loadProducts;
  }

  async function saveSettings(card) {
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const body = {
      is_enabled: val('fbr-enabled') === 'yes',
      environment: val('fbr-environment'),
      seller_ntn_cnic: val('fbr-ntn'),
      seller_business_name: val('fbr-bizname'),
      seller_province: val('fbr-province'),
      seller_address: val('fbr-address'),
      default_hs_code: val('fbr-hs'),
      default_uom: val('fbr-uom'),
      default_sale_type: val('fbr-saletype'),
      sandbox_scenario_id: val('fbr-scenario'),
      auto_submit_enabled: val('fbr-auto') === 'yes',
    };
    const tok = val('fbr-token').trim();
    if (tok) body.api_token = tok;
    const clr = document.getElementById('fbr-clear-token');
    if (clr && clr.checked) body.clear_token = true;

    if (body.environment === 'production' && body.is_enabled &&
        !confirm('Production sends REAL invoices to FBR. Are you sure the sandbox tests are approved?')) return;

    const btn = document.getElementById('fbr-save-btn');
    btn.disabled = true;
    try {
      await fbrApi('/config/', { method: 'PATCH', body });
      _flag.at = 0;
      say('FBR settings saved');
      await mountSettingsCard();
    } catch (e) {
      say(errText(e), 'error');
      btn.disabled = false;
    }
  }

  async function testConnection() {
    const btn = document.getElementById('fbr-test-btn');
    btn.disabled = true;
    try {
      const r = await fbrApi('/test-connection/', { method: 'POST', body: {} });
      say(r.message, r.ok ? 'success' : 'error');
    } catch (e) { say(errText(e), 'error'); }
    btn.disabled = false;
  }

  async function loadProducts() {
    const q = (document.getElementById('fbr-prod-q') || {}).value || '';
    const box = document.getElementById('fbr-prod-table');
    box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Loading…</div>';
    try {
      const r = await fbrApi('/products/?limit=200&q=' + encodeURIComponent(q.trim()));
      const rows = r.results || [];
      if (!rows.length) { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No products found.</div>'; return; }
      box.innerHTML = `
        <div style="overflow-x:auto"><table>
          <thead><tr><th>Product</th><th>Tax</th><th>HS Code</th><th>Unit of Measure</th><th>Sale Type</th><th></th></tr></thead>
          <tbody>${rows.map((p) => `
            <tr data-pid="${p.id}">
              <td>${esc(p.name)}<div style="font-size:10px;color:var(--text-muted)">${esc(p.sku)}</div></td>
              <td>${esc(p.tax_rate)}%</td>
              <td><input class="form-input fbr-p-hs" value="${esc(p.hs_code)}" placeholder="${esc(p.effective_hs_code || 'required')}"
                    style="${p.missing_hs_code ? 'border-color:var(--red)' : ''};min-width:110px"></td>
              <td><input class="form-input fbr-p-uom" value="${esc(p.uom)}" placeholder="default" style="min-width:130px"></td>
              <td><input class="form-input fbr-p-st" value="${esc(p.sale_type)}" placeholder="default" style="min-width:150px"></td>
              <td><button class="btn btn-ghost btn-xs fbr-p-save"><i class="fa fa-save"></i></button></td>
            </tr>`).join('')}</tbody></table></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          Red border = no HS code yet (the invoice can't be sent until it has one). Blank unit/sale type use the defaults above.
        </div>`;
      box.querySelectorAll('.fbr-p-save').forEach((b) => {
        b.onclick = async () => {
          const tr = b.closest('tr');
          const body = {
            hs_code: tr.querySelector('.fbr-p-hs').value.trim(),
            uom: tr.querySelector('.fbr-p-uom').value.trim(),
            sale_type: tr.querySelector('.fbr-p-st').value.trim(),
          };
          b.disabled = true;
          try {
            await fbrApi(`/products/${tr.dataset.pid}/profile/`, { method: 'PUT', body });
            tr.querySelector('.fbr-p-hs').style.borderColor = body.hs_code ? '' : 'var(--red)';
            say('Saved');
          } catch (e) { say(errText(e), 'error'); }
          b.disabled = false;
        };
      });
    } catch (e) {
      box.innerHTML = `<div style="font-size:12px;color:var(--red)">${esc(errText(e))}</div>`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. SALE SLIP MODAL — FBR status box
  // ═══════════════════════════════════════════════════════════════
  const BOX_ID = 'fbr-slip-box';
  const STATUS_LABEL = {
    not_submitted: ['Not submitted', 'badge-blue'],
    pending: ['In progress', 'badge-blue'],
    submitted: ['Submitted', 'badge-green'],
    failed: ['Failed', 'badge-red'],
    unknown: ['Needs review', 'badge-red'],
  };

  function currentSlip() {
    const title = (document.getElementById('od-title') || {}).textContent || '';
    if (!/^Sale Slip/.test(title)) return null;
    const inv = title.replace(/^Sale Slip\s*—\s*/, '').trim();
    if (typeof _slipsCache === 'undefined' || !Array.isArray(_slipsCache)) return null;
    return _slipsCache.find((s) => s.invoice_number === inv) || null;
  }

  async function mountSlipBox() {
    const body = document.getElementById('order-detail-body');
    if (!body || document.getElementById(BOX_ID)) return;
    const slip = currentSlip();
    if (!slip || slip.status === 'draft') return;
    if (!(await fbrEnabled())) return;
    // modal may have changed while we were asking the server
    if (document.getElementById(BOX_ID) || currentSlip() !== slip) return;

    const box = document.createElement('div');
    box.id = BOX_ID;
    box.style.cssText = 'margin-top:16px;padding:12px;border:1px solid var(--border,#333);border-radius:8px';
    body.appendChild(box);
    await renderSlipBox(slip.id, slip.customer);
  }

  async function renderSlipBox(saleId, customerId) {
    const box = document.getElementById(BOX_ID);
    if (!box) return;
    let st;
    try { st = await fbrApi(`/invoices/${saleId}/status/`); }
    catch (e) { box.innerHTML = `<div style="font-size:12px;color:var(--red)">FBR: ${esc(errText(e))}</div>`; return; }
    if (!document.getElementById(BOX_ID)) return;
    if (st.status === 'disabled') { box.remove(); return; }

    const [label, cls] = STATUS_LABEL[st.status] || [st.status, 'badge-blue'];
    const d = st.details;
    const manager = isManager();

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="font-weight:700">🧾 FBR ${st.environment === 'sandbox' ? '<span style="font-size:10px;color:var(--yellow)">(sandbox)</span>' : ''}</div>
        <span class="badge ${cls}">${esc(label)}</span>
      </div>
      ${st.fbr_invoice_number ? `<div style="margin-top:8px;font-size:12px">FBR Invoice No: <b style="font-family:var(--mono)">${esc(st.fbr_invoice_number)}</b></div>` : ''}
      ${st.submitted_at ? `<div style="font-size:12px;color:var(--text-muted)">Submitted: ${esc(String(st.submitted_at).replace('T', ' ').slice(0, 19))}</div>` : ''}
      ${st.retry_count ? `<div style="font-size:11px;color:var(--text-muted)">Retries: ${st.retry_count}</div>` : ''}
      ${st.note ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">${esc(st.note)}</div>` : ''}
      ${st.message ? `<div style="font-size:12px;margin-top:8px">${esc(st.message)}</div>` : ''}
      ${st.warning ? `<div style="font-size:12px;margin-top:8px;color:var(--yellow)">⚠ ${esc(st.warning)}</div>` : ''}
      ${d && d.error ? `<div style="font-size:11px;margin-top:6px;color:var(--text-muted)">${esc(d.error)}${d.code ? ` (code ${esc(d.code)})` : ''}</div>` : ''}
      ${manager ? `<div id="fbr-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap"></div>` : ''}
      ${manager && customerId ? `
        <details id="fbr-buyer" style="margin-top:10px">
          <summary style="font-size:12px;cursor:pointer">Buyer FBR details</summary>
          <div id="fbr-buyer-body" style="margin-top:8px;font-size:12px;color:var(--text-muted)">Loading…</div>
        </details>` : ''}`;

    if (manager) {
      const actions = box.querySelector('#fbr-actions');
      const add = (text, icon, handler, ghost) => {
        const b = document.createElement('button');
        b.className = 'btn btn-sm ' + (ghost ? 'btn-ghost' : 'btn-accent');
        b.innerHTML = `<i class="fa ${icon}"></i> ${text}`;
        b.onclick = async () => {
          actions.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          try { await handler(); } catch (e) { say(errText(e), 'error'); }
          await renderSlipBox(saleId, customerId);
        };
        actions.appendChild(b);
      };

      if (st.can_submit || st.can_retry) {
        add('Check with FBR', 'fa-check', async () => {
          const r = await fbrApi(`/invoices/${saleId}/validate/`, { method: 'POST', body: {} });
          say(r.ok ? 'FBR says this invoice is valid' : ('Not valid: ' + (r.problems || []).join('; ')), r.ok ? 'success' : 'error');
        }, true);
      }
      if (st.status === 'not_submitted' && st.can_submit) {
        add('Submit to FBR', 'fa-paper-plane', async () => {
          const r = await fbrApi(`/invoices/${saleId}/submit/`, { method: 'POST', body: {} });
          say(r.success ? 'Submitted to FBR' : (r.message || 'FBR submission failed'), r.success ? 'success' : 'error');
        });
      } else if (st.status === 'failed' && st.can_retry) {
        add('Retry Submission', 'fa-redo', async () => {
          const r = await fbrApi(`/invoices/${saleId}/retry/`, { method: 'POST', body: {} });
          say(r.success ? 'Submitted to FBR' : (r.message || 'FBR submission failed'), r.success ? 'success' : 'error');
        });
      } else if (st.status === 'unknown' && st.can_retry) {
        add('Re-send (I checked FBR)', 'fa-redo', async () => {
          if (!confirm('The earlier attempt may already have reached FBR. Re-sending could create a duplicate there.\n\nOnly continue if you have checked that FBR does NOT have this invoice.')) return;
          const r = await fbrApi(`/invoices/${saleId}/retry/`, { method: 'POST', body: { confirm_unknown: true } });
          say(r.success ? 'Submitted to FBR' : (r.message || 'FBR submission failed'), r.success ? 'success' : 'error');
        });
      }
    }

    const det = box.querySelector('#fbr-buyer');
    if (det) det.addEventListener('toggle', () => { if (det.open) loadBuyer(customerId); }, { once: true });
  }

  async function loadBuyer(customerId) {
    const holder = document.getElementById('fbr-buyer-body');
    if (!holder) return;
    try {
      const p = await fbrApi(`/customers/${customerId}/profile/`);
      holder.innerHTML = `
        <div class="form-group-inline"><label>Registration</label>
          <select class="form-input" id="fbr-b-type">
            <option value="Unregistered" ${p.registration_type !== 'Registered' ? 'selected' : ''}>Unregistered</option>
            <option value="Registered" ${p.registration_type === 'Registered' ? 'selected' : ''}>Registered (business)</option>
          </select></div>
        <div class="form-group-inline"><label>NTN / CNIC</label><input class="form-input" id="fbr-b-ntn" value="${esc(p.ntn_cnic)}"></div>
        <div class="form-group-inline"><label>Province</label><input class="form-input" id="fbr-b-prov" value="${esc(p.province)}" placeholder="Blank = seller's province"></div>
        <div style="text-align:right"><button class="btn btn-ghost btn-sm" id="fbr-b-save"><i class="fa fa-save"></i> Save</button></div>`;
      document.getElementById('fbr-b-save').onclick = async () => {
        try {
          await fbrApi(`/customers/${customerId}/profile/`, { method: 'PUT', body: {
            registration_type: document.getElementById('fbr-b-type').value,
            ntn_cnic: document.getElementById('fbr-b-ntn').value,
            province: document.getElementById('fbr-b-prov').value,
          } });
          say('Buyer details saved');
        } catch (e) { say(errText(e), 'error'); }
      };
    } catch (e) { holder.textContent = errText(e); }
  }

  // ═══════════════════════════════════════════════════════════════
  // wiring (observers only — no changes to existing code)
  // ═══════════════════════════════════════════════════════════════
  function init() {
    const settingsPage = document.getElementById('page-settings');
    if (settingsPage) {
      new MutationObserver(() => {
        if (settingsPage.classList.contains('active')) mountSettingsCard();
      }).observe(settingsPage, { attributes: true, attributeFilter: ['class'] });
    }
    const detail = document.getElementById('order-detail-body');
    if (detail) {
      new MutationObserver(() => { mountSlipBox(); }).observe(detail, { childList: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
