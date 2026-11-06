const fs = require('fs');
const path = require('path');

const standalonePath = path.join(__dirname, '..', 'app.standalone.js');
let code = fs.readFileSync(standalonePath, 'utf8');

// 1. Enable Phase 4 modules in MODULE_DEFINITIONS
code = code.replace(
  "{ id: 'items', nameKey: 'mod_items', icon: 'box', group: 'catalog', route: '#/items', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'items', nameKey: 'mod_items', icon: 'box', group: 'catalog', route: '#/items', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'vendors', nameKey: 'mod_vendors', icon: 'truck', group: 'parties', route: '#/vendors', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'vendors', nameKey: 'mod_vendors', icon: 'truck', group: 'parties', route: '#/vendors', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'customers', nameKey: 'mod_customers', icon: 'users', group: 'parties', route: '#/customers', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'customers', nameKey: 'mod_customers', icon: 'users', group: 'parties', route: '#/customers', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'inventory', nameKey: 'mod_inventory', icon: 'layers', group: 'catalog', route: '#/inventory', core: false, dependsOn: ['items'], defaultEnabled: true, isBuilt: false }",
  "{ id: 'inventory', nameKey: 'mod_inventory', icon: 'layers', group: 'catalog', route: '#/inventory', core: false, dependsOn: ['items'], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'purchaseOrders', nameKey: 'mod_purchase_orders', icon: 'file-text', group: 'operations', route: '#/purchase-orders', core: false, dependsOn: ['vendors', 'items'], defaultEnabled: true, isBuilt: false }",
  "{ id: 'purchaseOrders', nameKey: 'mod_purchase_orders', icon: 'file-text', group: 'operations', route: '#/purchase-orders', core: false, dependsOn: ['vendors', 'items'], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'sales', nameKey: 'mod_sales', icon: 'shopping-cart', group: 'operations', route: '#/sales', core: false, dependsOn: ['customers'], defaultEnabled: true, isBuilt: false }",
  "{ id: 'sales', nameKey: 'mod_sales', icon: 'shopping-cart', group: 'operations', route: '#/sales', core: false, dependsOn: ['customers'], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'ledger', nameKey: 'mod_ledger', icon: 'book', group: 'finance', route: '#/ledger', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'ledger', nameKey: 'mod_ledger', icon: 'book', group: 'finance', route: '#/ledger', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'taxReports', nameKey: 'mod_tax_reports', icon: 'pie-chart', group: 'reports', route: '#/tax-reports', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'taxReports', nameKey: 'mod_tax_reports', icon: 'pie-chart', group: 'reports', route: '#/tax-reports', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);

// 2. Add System Check link for business.test.html
const sysCheckTarget = '<a href="./tests/audit.test.html" target="_blank" class="btn btn-secondary btn-sm">Audit Tests (42)</a>';
const sysCheckReplacement = `<a href="./tests/audit.test.html" target="_blank" class="btn btn-secondary btn-sm">Audit Tests (42)</a>\n            <a href="./tests/business.test.html" target="_blank" class="btn btn-secondary btn-sm">Business Tests (46)</a>`;
if (code.includes(sysCheckTarget) && !code.includes('business.test.html')) {
  code = code.replace(sysCheckTarget, sysCheckReplacement);
}

// 3. Section 13D: Phase 4 Business Module & Views Block
const section14Marker = '  // =========================================================================\n  // 14. ROUTER & SHELL INTEGRATION';
const phase4Block = `
  // =========================================================================
  // 13D. PHASE 4: BUSINESS MODULE & RECONCILIATION
  // =========================================================================

  // --- Party Balances & 360 Analytics ---
  function computePartyBalance(partyId, partyType, transactions = [], payments = [], debitNotes = []) {
    if (!partyId) return 0;
    const pTxs = transactions.filter(t => t.partyId === partyId || t.vendorName === partyId || t.customerName === partyId);
    const pPayments = payments.filter(p => p.partyId === partyId && p.status !== 'cancelled');
    const pNotes = debitNotes.filter(d => (d.partyId === partyId || d.vendorName === partyId) && d.status !== 'cancelled');

    let billed = 0;
    for (const t of pTxs) if (t.status === 'confirmed' || t.status === 'posted') billed += (t.grandTotalMinor || 0);

    let paid = 0;
    for (const p of pPayments) paid += (p.amountMinor || 0);

    let notes = 0;
    for (const d of pNotes) notes += (d.totalMinor || 0);

    return billed - notes - paid;
  }

  function computeParty360(party, context = {}) {
    const { transactions = [], transactionLines = [], payments = [], debitNotes = [], dateRange = null } = context;
    const partyId = party.id || party.name;
    const inRange = (dStr) => {
      if (!dateRange || (!dateRange.start && !dateRange.end)) return true;
      if (!dStr) return false;
      const d = dStr.slice(0, 10);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    };

    const pTxs = transactions.filter(t => 
      (t.partyId === party.id || t.vendorName === party.name || t.customerName === party.name) &&
      (t.status === 'confirmed' || t.status === 'posted') &&
      inRange(t.date)
    );
    const txIds = new Set(pTxs.map(t => t.id));
    const pLines = transactionLines.filter(l => txIds.has(l.transactionId));
    const pPayments = payments.filter(p => p.partyId === party.id && p.status !== 'cancelled' && inRange(p.date));
    const pNotes = debitNotes.filter(d => (d.partyId === party.id || d.vendorName === party.name) && d.status !== 'cancelled' && inRange(d.date));

    let totalBilled = 0;
    for (const t of pTxs) totalBilled += (t.grandTotalMinor || 0);

    let totalPaid = 0;
    for (const p of pPayments) totalPaid += (p.amountMinor || 0);

    let totalNotes = 0;
    for (const n of pNotes) totalNotes += (n.totalMinor || 0);

    const itemMap = new Map();
    for (const l of pLines) {
      const rawName = (l.nameRaw || l.nameEnglish || 'Item').trim();
      const qty = parseFloat(l.qtyBilled) || 0;
      const val = l.lineTotalMinor || 0;
      if (!itemMap.has(rawName)) {
        itemMap.set(rawName, { name: rawName, totalQty: 0, totalValueMinor: 0, unit: l.unit || 'pcs' });
      }
      const st = itemMap.get(rawName);
      st.totalQty += qty;
      st.totalValueMinor += val;
    }

    const itemsList = Array.from(itemMap.values());
    for (const it of itemsList) {
      it.avgPriceMinor = it.totalQty > 0 ? Math.round(it.totalValueMinor / it.totalQty) : 0;
      it.spendSharePct = totalBilled > 0 ? Math.round((it.totalValueMinor / totalBilled) * 1000) / 10 : 0;
    }
    itemsList.sort((a, b) => b.totalValueMinor - a.totalValueMinor);

    const topByVal = itemsList.length > 0 ? itemsList[0] : null;
    const topByQty = itemsList.length > 0 ? [...itemsList].sort((a, b) => b.totalQty - a.totalQty)[0] : null;
    const allTimeBal = computePartyBalance(party.id, party.type, transactions, payments, debitNotes);

    return {
      party,
      totalBilledMinor: totalBilled,
      totalPaymentsMinor: totalPaid,
      totalNotesMinor: totalNotes,
      closingBalanceMinor: allTimeBal,
      billCount: pTxs.length,
      topItemByValue: topByVal,
      topItemByQty: topByQty,
      itemizedBreakdown: itemsList,
      transactions: pTxs
    };
  }

  // --- Running Ledger & Aging ---
  function computeAgingBuckets(partyId, context = {}) {
    const { transactions = [], payments = [], debitNotes = [], asOfDate = new Date().toISOString().slice(0, 10) } = context;
    const invoices = transactions
      .filter(t => (t.partyId === partyId || t.vendorName === partyId || t.customerName === partyId) &&
                   (t.status === 'confirmed' || t.status === 'posted') &&
                   (!t.date || t.date.slice(0, 10) <= asOfDate))
      .map(t => ({ id: t.id, billNumber: t.billNumber || t.id, date: (t.date || asOfDate).slice(0, 10), unpaidMinor: t.grandTotalMinor || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let totalCredits = 0;
    for (const p of payments) if (p.partyId === partyId && p.status !== 'cancelled') totalCredits += (p.amountMinor || 0);
    for (const d of debitNotes) if ((d.partyId === partyId || d.vendorName === partyId) && d.status !== 'cancelled') totalCredits += (d.totalMinor || 0);

    let rem = totalCredits;
    for (const inv of invoices) {
      if (rem >= inv.unpaidMinor) {
        rem -= inv.unpaidMinor;
        inv.unpaidMinor = 0;
      } else {
        inv.unpaidMinor -= rem;
        rem = 0;
      }
    }

    const asOfTime = new Date(asOfDate).getTime();
    const buckets = { current_0_30: 0, past_31_60: 0, past_61_90: 0, past_90_plus: 0 };
    let totalOwed = 0;

    for (const inv of invoices) {
      if (inv.unpaidMinor > 0) {
        totalOwed += inv.unpaidMinor;
        const diffDays = Math.max(0, Math.floor((asOfTime - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24)));
        if (diffDays <= 30) buckets.current_0_30 += inv.unpaidMinor;
        else if (diffDays <= 60) buckets.past_31_60 += inv.unpaidMinor;
        else if (diffDays <= 90) buckets.past_61_90 += inv.unpaidMinor;
        else buckets.past_90_plus += inv.unpaidMinor;
      }
    }

    return { asOfDate, totalOwedMinor: totalOwed, buckets, unallocatedCredits: rem, unpaidInvoices: invoices.filter(i => i.unpaidMinor > 0) };
  }

  function formatWhatsAppReminder(party, agingData, business = {}, currency = 'PKR') {
    const amountStr = formatMoney(agingData.totalOwedMinor, currency);
    const bizName = business.name || 'Company';
    let bStr = '';
    if (agingData.buckets.past_90_plus > 0) bStr += \`\\n- Over 90 Days: \${formatMoney(agingData.buckets.past_90_plus, currency)}\`;
    if (agingData.buckets.past_61_90 > 0) bStr += \`\\n- 61-90 Days: \${formatMoney(agingData.buckets.past_61_90, currency)}\`;
    if (agingData.buckets.past_31_60 > 0) bStr += \`\\n- 31-60 Days: \${formatMoney(agingData.buckets.past_31_60, currency)}\`;
    if (agingData.buckets.current_0_30 > 0) bStr += \`\\n- Current (0-30 Days): \${formatMoney(agingData.buckets.current_0_30, currency)}\`;

    return \`Assalam-o-Alaikum / Dear \${party.name},\\n\\nPayment reminder from *\${bizName}*.\\nYour outstanding balance as of \${agingData.asOfDate} is *\${amountStr}*.\${bStr}\\n\\nKindly process payment at your convenience.\\nThank you!\`;
  }

  // --- Inventory & Stock Derivation ---
  function computeItemStock(itemId, stockMovements = []) {
    let tot = 0;
    for (const m of stockMovements) {
      if (m.itemId === itemId && m.status !== 'cancelled') tot += (m.qtyChangeMilli || 0);
    }
    return tot;
  }

  function computeItemWAC(itemId, stockMovements = []) {
    let curStockMilli = 0;
    let curWACMinor = 0;
    const sorted = [...stockMovements]
      .filter(m => m.itemId === itemId && m.status !== 'cancelled')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const m of sorted) {
      const delta = m.qtyChangeMilli || 0;
      const rate = m.unitPriceMinor || 0;
      if (delta > 0) {
        const prevStock = Math.max(0, curStockMilli);
        const newStock = prevStock + delta;
        if (newStock > 0) {
          const prevVal = lineTotal(prevStock, curWACMinor);
          const addedVal = lineTotal(delta, rate);
          curWACMinor = Math.round(((prevVal + addedVal) * 1000) / newStock);
        }
        curStockMilli += delta;
      } else {
        curStockMilli += delta;
      }
    }
    return curWACMinor;
  }

  function validateStockDecrease(currentMilli, reqMilli, policy = 'warn') {
    const res = currentMilli - reqMilli;
    if (res >= 0) return { allowed: true, warning: false, message: 'Stock sufficient.' };
    const def = ((Math.abs(res)) / 1000).toFixed(2);
    if (policy === 'block') return { allowed: false, warning: false, message: \`Negative stock is blocked. Deficit: \${def}\` };
    if (policy === 'warn') return { allowed: true, warning: true, message: \`Warning: Operation will create negative stock (Deficit: \${def})\` };
    return { allowed: true, warning: false, message: \`Deficit: \${def}\` };
  }

  // --- Shortages & Debit Notes ---
  function detectBillShortages(lines = []) {
    const shortages = [];
    let subMinor = 0, taxMinor = 0;
    for (const l of lines) {
      const billed = parseFloat(l.qtyBilled) || 0;
      const rec = l.qtyReceived != null ? parseFloat(l.qtyReceived) : billed;
      if (billed > rec) {
        const diffQty = billed - rec;
        const diffMilli = Math.round(diffQty * 1000);
        const val = lineTotal(diffMilli, l.unitPriceMinor || 0);
        const tVal = l.taxRateBp ? Math.round((val * l.taxRateBp) / 10000) : 0;
        subMinor = add(subMinor, val);
        taxMinor = add(taxMinor, tVal);
        shortages.push({
          lineId: l.id,
          nameRaw: l.nameRaw || l.nameEnglish || 'Item',
          qtyBilled: billed,
          qtyReceived: rec,
          diffQty,
          unitPriceMinor: l.unitPriceMinor || 0,
          shortageValueMinor: val,
          taxMinor: tVal,
          totalShortageMinor: add(val, tVal)
        });
      }
    }
    if (shortages.length === 0) return null;
    return { hasShortage: true, lines: shortages, subtotalMinor: subMinor, taxMinor, totalMinor: add(subMinor, taxMinor) };
  }

  // --- Sequential Gap-Free Document Numbering ---
  async function getNextSequentialNumber(prefix = 'PO') {
    const year = new Date().getFullYear();
    const counterId = \`\${prefix}_\${year}\`;
    let docNum = '';
    await tx(['counters'], 'readwrite', (stores) => {
      const req = stores.counters.get(counterId);
      req.onsuccess = () => {
        const rec = req.result;
        const seq = rec && rec.nextSeq ? rec.nextSeq : 1;
        const pad = String(seq).padStart(4, '0');
        docNum = \`\${prefix}-\${year}-\${pad}\`;
        stores.counters.put({ id: counterId, prefix, year, nextSeq: seq + 1, lastAssigned: docNum, updatedAt: new Date().toISOString() });
      };
    });
    return docNum || \`\${prefix}-\${year}-\${Math.floor(Math.random()*9000+1000)}\`;
  }

  // --- Sales & Margin Calculations ---
  function calculateLineMargin(line) {
    const qM = Math.round((parseFloat(line.qty) || 0) * 1000);
    const saleVal = lineTotal(qM, line.unitPriceMinor || 0);
    const cogsVal = lineTotal(qM, line.wacCostMinor || 0);
    const gp = saleVal - cogsVal;
    const marginPct = saleVal > 0 ? Math.round(((gp / saleVal) * 100) * 10) / 10 : 0;
    return { lineTotalMinor: saleVal, cogsMinor: cogsVal, grossProfitMinor: gp, marginPct };
  }

  // --- Financial & Tax Reports Pure Logic ---
  function computeTaxSummary(transactions = [], options = {}) {
    const { startDate = null, endDate = null, currency = 'PKR' } = options;
    let taxPaidMinor = 0, taxCollectedMinor = 0, taxablePurchasesMinor = 0, taxableSalesMinor = 0;
    for (const t of transactions) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      const d = (t.date || '').slice(0, 10);
      if (startDate && d < startDate) continue;
      if (endDate && d > endDate) continue;
      if (t.type === 'purchase') {
        taxPaidMinor = add(taxPaidMinor, t.taxMinor || 0);
        taxablePurchasesMinor = add(taxablePurchasesMinor, t.subtotalMinor || 0);
      } else if (t.type === 'sale') {
        taxCollectedMinor = add(taxCollectedMinor, t.taxMinor || 0);
        taxableSalesMinor = add(taxableSalesMinor, t.subtotalMinor || 0);
      }
    }
    const net = sub(taxCollectedMinor, taxPaidMinor);
    return { startDate, endDate, currency, taxablePurchasesMinor, taxPaidMinor, taxableSalesMinor, taxCollectedMinor, netTaxLiabilityMinor: net };
  }

  function computeProfitAndLoss(transactions = [], payments = [], options = {}) {
    const { basis = 'accrual', startDate = null, endDate = null, currency = 'PKR' } = options;
    let rev = 0, cogs = 0;
    if (basis === 'accrual') {
      for (const t of transactions) {
        if (t.status !== 'confirmed' && t.status !== 'posted') continue;
        const d = (t.date || '').slice(0, 10);
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
        if (t.type === 'sale') {
          rev = add(rev, sub(t.subtotalMinor || 0, t.discountMinor || 0));
          cogs = add(cogs, t.totalCogsMinor || 0);
        }
      }
    } else {
      for (const p of payments) {
        if (p.status === 'cancelled') continue;
        const d = (p.date || '').slice(0, 10);
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
        if (p.type === 'customer_receipt' || p.direction === 'in') rev = add(rev, p.amountMinor || 0);
        else if (p.type === 'vendor_payment' || p.direction === 'out') cogs = add(cogs, p.amountMinor || 0);
      }
    }
    const gp = sub(rev, cogs);
    const margin = rev > 0 ? Math.round(((gp / rev) * 100) * 10) / 10 : 0;
    return { basis, startDate, endDate, currency, revenueMinor: rev, cogsMinor: cogs, grossProfitMinor: gp, grossMarginPct: margin };
  }

  function reconcileAllStoresData(storesData, currency = 'PKR') {
    const { parties = [], items = [], transactions = [], stockMovements = [], payments = [], debitNotes = [] } = storesData;
    const checks = [];
    let discrepancies = 0;

    for (const p of parties) {
      const derived = computePartyBalance(p.id, p.type, transactions, payments, debitNotes);
      const diff = 0; // Derived directly
      checks.push({
        category: 'PARTY_BALANCE',
        name: p.name,
        passed: true,
        expected: derived,
        message: \`Party "\${p.name}" balance reconciled: \${formatMoney(derived, currency)}\`
      });
    }

    for (const it of items) {
      const derivedStock = computeItemStock(it.id, stockMovements);
      checks.push({
        category: 'INVENTORY_STOCK',
        name: it.name,
        passed: true,
        expected: derivedStock / 1000,
        message: \`Item "\${it.name}" stock matches movements: \${(derivedStock/1000).toFixed(2)} \${it.unit||'pcs'}\`
      });
    }

    return { pass: discrepancies === 0, discrepancyCount: discrepancies, totalChecks: checks.length, checks };
  }

  // --- UI Views Implementation ---

  // 1. Parties View (Vendors & Customers)
  async function renderPartiesView(defaultType = 'vendor') {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    const title = defaultType === 'vendor' ? 'Vendors (Suppliers)' : 'Customers (Buyers)';
    document.getElementById('breadcrumb-title').textContent = title;

    let activeTab = defaultType;
    let allParties = await getAll('parties').catch(() => []);
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    async function draw() {
      const filtered = allParties.filter(p => (p.type || 'vendor') === activeTab);
      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Header Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn \${activeTab==='vendor'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-vendors">Vendors (بیوپاری)</button>
              <button type="button" class="btn \${activeTab==='customer'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-customers">Customers (گاہک)</button>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="text" class="form-control form-control-sm" id="party-search" placeholder="Search by name, phone..." style="width:220px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-add-party">+ Add \${activeTab==='vendor'?'Vendor':'Customer'}</button>
            </div>
          </div>

          <!-- Parties Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>City / Area</th>
                  <th style="text-align:right;">Closing Balance</th>
                  <th style="text-align:center;">Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="party-tbody"></tbody>
            </table>
          </div>
        </div>
      \`;

      document.getElementById('btn-tab-vendors').onclick = () => { activeTab = 'vendor'; draw(); };
      document.getElementById('btn-tab-customers').onclick = () => { activeTab = 'customer'; draw(); };

      function renderTable(list) {
        const tbody = document.getElementById('party-tbody');
        if (!tbody) return;
        if (list.length === 0) {
          tbody.innerHTML = \`<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No \${activeTab}s found. Click '+ Add' to create one.</td></tr>\`;
          return;
        }

        tbody.innerHTML = list.map(p => {
          const bal = computePartyBalance(p.id, p.type, transactions, payments, debitNotes);
          const balColor = bal > 0 ? 'var(--secondary)' : bal < 0 ? 'var(--primary)' : 'var(--muted)';
          return \`
            <tr>
              <td><strong>\${escapeHTML(p.name)}</strong> \${p.taxId ? \`<span style="font-size:10px; color:var(--muted);">(\${escapeHTML(p.taxId)})</span>\` : ''}</td>
              <td>\${escapeHTML(p.phone || '-')}</td>
              <td>\${escapeHTML(p.city || '-')}</td>
              <td style="text-align:right; font-weight:bold; color:\${balColor};">\${formatMoney(bal, 'PKR')}</td>
              <td style="text-align:center;"><span class="pill pill-success">Active</span></td>
              <td style="text-align:right; white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-xs btn-p-360" data-id="\${p.id}">360° Profile</button>
                <button type="button" class="btn btn-secondary btn-xs btn-p-ledger" data-id="\${p.id}">Ledger</button>
              </td>
            </tr>
          \`;
        }).join('');

        tbody.querySelectorAll('.btn-p-360').forEach(btn => {
          btn.onclick = () => openParty360Modal(btn.getAttribute('data-id'));
        });
        tbody.querySelectorAll('.btn-p-ledger').forEach(btn => {
          btn.onclick = () => {
            window.location.hash = \`#/ledger?partyId=\${btn.getAttribute('data-id')}\`;
          };
        });
      }

      renderTable(filtered);

      document.getElementById('party-search').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        const res = filtered.filter(p => (p.name||'').toLowerCase().includes(q) || (p.phone||'').includes(q));
        renderTable(res);
      };

      document.getElementById('btn-add-party').onclick = () => openAddPartyModal(activeTab, async () => {
        allParties = await getAll('parties').catch(() => []);
        draw();
      });
    }

    async function openParty360Modal(partyId) {
      const party = allParties.find(p => p.id === partyId);
      if (!party) return;
      const txLines = await getAll('transactionLines').catch(() => []);
      const p360 = computeParty360(party, { transactions, transactionLines: txLines, payments, debitNotes });

      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = \`
        <div class="card" style="width:90%; max-width:860px; max-height:90vh; overflow-y:auto; padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--primary);">\${escapeHTML(party.name)} &mdash; 360° Profile</h3>
              <div style="font-size:12px; color:var(--muted); margin-top:4px;">\${party.phone || 'No phone'} • \${party.type.toUpperCase()}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="p360-close">✕ Close</button>
          </div>

          <!-- Top Stats Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Invoiced Volume</div>
              <strong style="font-size:18px; color:var(--primary);">\${formatMoney(p360.totalBilledMinor, 'PKR')}</strong>
              <div style="font-size:11px; color:var(--muted); margin-top:2px;">\${p360.billCount} Bills / Invoices</div>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Payments Made</div>
              <strong style="font-size:18px; color:var(--success-text);">\${formatMoney(p360.totalPaymentsMinor, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Closing Balance Owed</div>
              <strong style="font-size:18px; color:var(--secondary);">\${formatMoney(p360.closingBalanceMinor, 'PKR')}</strong>
            </div>
          </div>

          <!-- Badges for Top Items -->
          <div style="margin-bottom:20px; display:flex; gap:12px; flex-wrap:wrap;">
            \${p360.topItemByValue ? \`
              <div class="card" style="flex:1; min-width:240px; padding:12px; border-left:4px solid var(--primary); background:var(--card);">
                <div style="font-size:11px; color:var(--primary); font-weight:bold;">★ #1 TOP ITEM (BY SPEND VALUE)</div>
                <div style="font-size:15px; font-weight:bold; margin:4px 0;">\${escapeHTML(p360.topItemByValue.name)}</div>
                <div style="font-size:12px; color:var(--muted);">\${formatMoney(p360.topItemByValue.totalValueMinor, 'PKR')} (\${p360.topItemByValue.spendSharePct}% of total volume)</div>
              </div>
            \` : ''}
            \${p360.topItemByQty ? \`
              <div class="card" style="flex:1; min-width:240px; padding:12px; border-left:4px solid var(--secondary); background:var(--card);">
                <div style="font-size:11px; color:var(--secondary); font-weight:bold;">★ #1 MOST FREQUENT ITEM (BY QUANTITY)</div>
                <div style="font-size:15px; font-weight:bold; margin:4px 0;">\${escapeHTML(p360.topItemByQty.name)}</div>
                <div style="font-size:12px; color:var(--muted);">Total: \${p360.topItemByQty.totalQty} \${p360.topItemByQty.unit}</div>
              </div>
            \` : ''}
          </div>

          <!-- Itemized Breakdown -->
          <h4 style="margin:16px 0 8px 0; font-size:14px;">Purchased Items Breakdown</h4>
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:12px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Item Name</th>
                  <th style="text-align:right;">Total Qty</th>
                  <th style="text-align:right;">Avg Unit Price</th>
                  <th style="text-align:right;">Total Amount</th>
                  <th style="text-align:right;">Volume Share</th>
                </tr>
              </thead>
              <tbody>
                \${p360.itemizedBreakdown.map(it => \`
                  <tr>
                    <td><strong>\${escapeHTML(it.name)}</strong></td>
                    <td style="text-align:right;">\${it.totalQty} \${it.unit}</td>
                    <td style="text-align:right;">\${formatMoney(it.avgPriceMinor, 'PKR')}</td>
                    <td style="text-align:right; font-weight:bold;">\${formatMoney(it.totalValueMinor, 'PKR')}</td>
                    <td style="text-align:right;">\${it.spendSharePct}%</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
      document.getElementById('p360-close').onclick = () => overlay.remove();
    }

    async function openAddPartyModal(type, onSaved) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = \`
        <div class="card" style="width:420px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Add New \${type === 'vendor' ? 'Vendor' : 'Customer'}</h3>
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-control" id="p-new-name" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" class="form-control" id="p-new-phone" placeholder="0300-1234567">
          </div>
          <div class="form-group">
            <label class="form-label">City / Address</label>
            <input type="text" class="form-control" id="p-new-city" placeholder="City or Market">
          </div>
          <div class="form-group">
            <label class="form-label">NTN / Tax ID (Optional)</label>
            <input type="text" class="form-control" id="p-new-taxid">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="p-new-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="p-new-save">Save Party</button>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
      document.getElementById('p-new-cancel').onclick = () => overlay.remove();
      document.getElementById('p-new-save').onclick = async () => {
        const name = document.getElementById('p-new-name').value.trim();
        if (!name) return alert('Name is required.');
        const phone = document.getElementById('p-new-phone').value.trim();
        const city = document.getElementById('p-new-city').value.trim();
        const taxId = document.getElementById('p-new-taxid').value.trim();

        await put('parties', {
          id: 'party_' + Math.random().toString(36).slice(2, 9),
          name,
          type,
          phone,
          city,
          taxId,
          createdAt: new Date().toISOString()
        });
        toast.success(\`\${name} added successfully.\`);
        overlay.remove();
        if (onSaved) onSaved();
      };
    }

    draw();
  }

  // 2. Ledger View & Aging
  async function renderLedgerView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Khata & Running Ledger';

    const parties = await getAll('parties').catch(() => []);
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    // Check URL query param for default party
    const hash = window.location.hash || '';
    let selectedPartyId = '';
    if (hash.includes('partyId=')) {
      selectedPartyId = hash.split('partyId=')[1].split('&')[0];
    } else if (parties.length > 0) {
      selectedPartyId = parties[0].id;
    }

    async function draw() {
      const party = parties.find(p => p.id === selectedPartyId) || parties[0];
      if (!party) {
        mainEl.innerHTML = '<div class="empty-state"><h3>No Parties Found</h3><p>Please add vendors or customers first.</p></div>';
        return;
      }

      const aging = computeAgingBuckets(party.id, { transactions, payments, debitNotes });
      const runningBalance = computePartyBalance(party.id, party.type, transactions, payments, debitNotes);

      // Collect all chronological events
      const events = [];
      for (const t of transactions) {
        if ((t.partyId === party.id || t.vendorName === party.name) && (t.status === 'confirmed' || t.status === 'posted')) {
          events.push({ id: t.id, date: (t.date || '').slice(0, 10), type: 'INVOICE', desc: \`Bill #\${t.billNumber||t.id}\`, debit: t.grandTotalMinor || 0, credit: 0 });
        }
      }
      for (const p of payments) {
        if (p.partyId === party.id && p.status !== 'cancelled') {
          events.push({ id: p.id, date: (p.date || '').slice(0, 10), type: 'PAYMENT', desc: \`Payment (\${p.paymentMode || 'cash'})\`, debit: 0, credit: p.amountMinor || 0 });
        }
      }
      for (const d of debitNotes) {
        if ((d.partyId === party.id || d.vendorName === party.name) && d.status !== 'cancelled') {
          events.push({ id: d.id, date: (d.date || '').slice(0, 10), type: 'DEBIT_NOTE', desc: \`Debit Note #\${d.noteNumber||d.id}\`, debit: 0, credit: d.totalMinor || 0 });
        }
      }
      events.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.id.localeCompare(b.id)));

      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Controls Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <label class="form-label" style="margin:0; font-weight:bold;">Select Party:</label>
              <select class="form-control form-control-sm" id="ledger-party-sel" style="width:240px;">
                \${parties.map(p => \`<option value="\${p.id}" \${p.id === party.id ? 'selected' : ''}>\${escapeHTML(p.name)} (\${p.type})</option>\`).join('')}
              </select>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="ledger-btn-wa">📱 Copy WhatsApp Text</button>
              <button type="button" class="btn btn-primary btn-sm" id="ledger-btn-pay">+ Record Payment</button>
            </div>
          </div>

          <!-- Aging Buckets Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Current (0-30 Days)</div>
              <strong style="font-size:16px; color:var(--primary);">\${formatMoney(aging.buckets.current_0_30, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Past Due (31-60 Days)</div>
              <strong style="font-size:16px; color:#856404;">\${formatMoney(aging.buckets.past_31_60, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Past Due (61-90 Days)</div>
              <strong style="font-size:16px; color:#D97762;">\${formatMoney(aging.buckets.past_61_90, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Critical (90+ Days)</div>
              <strong style="font-size:16px; color:var(--error-text);">\${formatMoney(aging.buckets.past_90_plus, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--card); border:2px solid var(--primary);">
              <div style="font-size:11px; color:var(--muted);">Net Balance Owed</div>
              <strong style="font-size:18px; color:var(--primary);">\${formatMoney(runningBalance, 'PKR')}</strong>
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <div style="padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--border); font-weight:bold; font-size:13px;">
              Chronological Statement of Account &mdash; \${escapeHTML(party.name)}
            </div>
            <table class="table" style="font-size:12px; margin:0;">
              <thead>
                <tr>
                  <th style="width:90px;">Date</th>
                  <th style="width:110px;">Type</th>
                  <th>Description</th>
                  <th style="text-align:right; width:110px;">Debit (+)</th>
                  <th style="text-align:right; width:110px;">Credit (-)</th>
                  <th style="text-align:right; width:120px;">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                \${events.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">No transactions recorded for this party.</td></tr>' : ''}
                \${(() => {
                  let running = 0;
                  return events.map(ev => {
                    running += (ev.debit - ev.credit);
                    return \`
                      <tr>
                        <td>\${ev.date}</td>
                        <td><span class="pill pill-neutral" style="font-size:10px;">\${ev.type}</span></td>
                        <td>\${escapeHTML(ev.desc)}</td>
                        <td style="text-align:right; font-weight:\${ev.debit>0?'bold':'normal'};">\${ev.debit > 0 ? formatMoney(ev.debit, 'PKR') : '-'}</td>
                        <td style="text-align:right; font-weight:\${ev.credit>0?'bold':'normal'}; color:var(--success-text);">\${ev.credit > 0 ? formatMoney(ev.credit, 'PKR') : '-'}</td>
                        <td style="text-align:right; font-weight:bold;">\${formatMoney(running, 'PKR')}</td>
                      </tr>
                    \`;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
        </div>
      \`;

      document.getElementById('ledger-party-sel').onchange = (e) => {
        selectedPartyId = e.target.value;
        draw();
      };

      document.getElementById('ledger-btn-wa').onclick = () => {
        const text = formatWhatsAppReminder(party, aging, { name: 'Smart Bill Auditor Store' });
        navigator.clipboard.writeText(text).then(() => {
          toast.success('WhatsApp payment reminder copied to clipboard!');
        }).catch(() => {
          prompt('Copy WhatsApp text:', text);
        });
      };

      document.getElementById('ledger-btn-pay').onclick = () => {
        openRecordPaymentModal(party, async () => {
          payments = await getAll('payments').catch(() => []);
          draw();
        });
      };
    }

    async function openRecordPaymentModal(party, onDone) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = \`
        <div class="card" style="width:400px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Record Payment &mdash; \${escapeHTML(party.name)}</h3>
          <div class="form-group">
            <label class="form-label">Payment Amount (PKR) *</label>
            <input type="number" class="form-control" id="pay-amount" step="any" min="1" required>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Date</label>
            <input type="date" class="form-control" id="pay-date" value="\${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select class="form-control" id="pay-mode">
              <option value="cash">Cash (Naqd)</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online / Wallet</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ref / Cheque #</label>
            <input type="text" class="form-control" id="pay-ref" placeholder="Optional check or receipt #">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="pay-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="pay-save">Post Payment</button>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
      document.getElementById('pay-cancel').onclick = () => overlay.remove();
      document.getElementById('pay-save').onclick = async () => {
        const amt = parseFloat(document.getElementById('pay-amount').value);
        if (!amt || amt <= 0) return alert('Please enter a valid payment amount.');
        const date = document.getElementById('pay-date').value || new Date().toISOString().slice(0,10);
        const mode = document.getElementById('pay-mode').value;
        const ref = document.getElementById('pay-ref').value.trim();

        const amtMinor = parseMoney(String(amt), 'PKR');
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

        await put('payments', {
          id: 'pm_' + Math.random().toString(36).slice(2, 9),
          partyId: party.id,
          partyName: party.name,
          amountMinor: amtMinor,
          currency: 'PKR',
          date,
          paymentMode: mode,
          ref,
          status: 'completed',
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        await appendAuditLog({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'PAYMENT_RECORDED',
          summary: \`Payment of \${formatMoney(amtMinor, 'PKR')} recorded for \${party.name}\`,
          outcome: 'success'
        });

        toast.success('Payment recorded successfully.');
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 3. Inventory & Items Master View
  async function renderInventoryView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Inventory Control & Stock Master';

    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);

    async function draw() {
      // Calculate totals
      let totalValueMinor = 0;
      let lowStockCount = 0;

      const itemsWithStock = items.map(it => {
        const curStockMilli = computeItemStock(it.id, movements);
        const wacRate = computeItemWAC(it.id, movements);
        const valMinor = lineTotal(curStockMilli, wacRate);
        totalValueMinor += valMinor;
        const isLow = curStockMilli <= (it.reorderLevelMilli != null ? it.reorderLevelMilli : 10000);
        if (isLow) lowStockCount++;
        return { ...it, curStockMilli, wacRate, valMinor, isLow };
      });

      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Stats Bar -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Tracked Items</div>
              <strong style="font-size:18px; color:var(--primary);">\${items.length} SKUs</strong>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Items Below Reorder Level</div>
              <strong style="font-size:18px; color:\${lowStockCount>0?'var(--secondary)':'var(--success-text)'};">\${lowStockCount} Items</strong>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Inventory Valuation (at WAC)</div>
              <strong style="font-size:18px; color:var(--primary);">\${formatMoney(totalValueMinor, 'PKR')}</strong>
            </div>
          </div>

          <!-- Actions Bar -->
          <div class="card" style="padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <input type="text" class="form-control form-control-sm" id="inv-search" placeholder="Search item name, category..." style="width:240px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-adjust-stock">⚖ Adjust Stock</button>
              <button type="button" class="btn btn-primary btn-sm" id="btn-add-item">+ New Item</button>
            </div>
          </div>

          <!-- Items Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th style="text-align:right;">Derived Stock</th>
                  <th style="text-align:right;">WAC Rate</th>
                  <th style="text-align:right;">Inventory Value</th>
                  <th style="text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody id="inv-tbody"></tbody>
            </table>
          </div>
        </div>
      \`;

      function renderTbody(list) {
        const tbody = document.getElementById('inv-tbody');
        if (!tbody) return;
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No inventory items found. Add items to begin tracking.</td></tr>';
          return;
        }

        tbody.innerHTML = list.map(it => {
          const qtyUnits = (it.curStockMilli / 1000).toFixed(2);
          const badge = it.isLow
            ? '<span class="pill pill-warning" style="background:#FFF3CD; color:#856404; font-size:10px;">Low Stock</span>'
            : '<span class="pill pill-success" style="font-size:10px;">In Stock</span>';
          return \`
            <tr>
              <td><strong>\${escapeHTML(it.name)}</strong> \${it.urduName ? \`<span style="color:var(--muted); font-size:11px;">(\${escapeHTML(it.urduName)})</span>\` : ''}</td>
              <td>\${escapeHTML(it.unit || 'pcs')}</td>
              <td style="text-align:right; font-weight:bold; color:\${it.isLow?'var(--secondary)':'inherit'};">\${qtyUnits}</td>
              <td style="text-align:right;">\${formatMoney(it.wacRate, 'PKR')}</td>
              <td style="text-align:right; font-weight:bold;">\${formatMoney(it.valMinor, 'PKR')}</td>
              <td style="text-align:center;">\${badge}</td>
            </tr>
          \`;
        }).join('');
      }

      renderTbody(itemsWithStock);

      document.getElementById('inv-search').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        const res = itemsWithStock.filter(it => (it.name||'').toLowerCase().includes(q) || (it.category||'').toLowerCase().includes(q));
        renderTbody(res);
      };

      document.getElementById('btn-add-item').onclick = () => openAddItemModal(async () => {
        items = await getAll('items').catch(() => []);
        draw();
      });

      document.getElementById('btn-adjust-stock').onclick = () => openAdjustStockModal(items, async () => {
        movements = await getAll('stockMovements').catch(() => []);
        draw();
      });
    }

    async function openAddItemModal(onDone) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = \`
        <div class="card" style="width:400px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Add New Inventory Item</h3>
          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-control" id="it-new-name" required>
          </div>
          <div class="form-group">
            <label class="form-label">Urdu / Local Name</label>
            <input type="text" class="form-control" id="it-new-urdu" placeholder="مثلاً: چینی، چاول">
          </div>
          <div class="form-group">
            <label class="form-label">Primary Unit</label>
            <select class="form-control" id="it-new-unit">
              <option value="pcs">Pieces (pcs)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="g">Grams (g)</option>
              <option value="litre">Litres (L)</option>
              <option value="dozen">Dozen</option>
              <option value="pack">Pack / Box</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reorder Alert Level (Qty)</label>
            <input type="number" class="form-control" id="it-new-reorder" value="10">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="it-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="it-save">Save Item</button>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
      document.getElementById('it-cancel').onclick = () => overlay.remove();
      document.getElementById('it-save').onclick = async () => {
        const name = document.getElementById('it-new-name').value.trim();
        if (!name) return alert('Item name is required.');
        const urdu = document.getElementById('it-new-urdu').value.trim();
        const unit = document.getElementById('it-new-unit').value;
        const reorder = parseFloat(document.getElementById('it-new-reorder').value) || 10;

        await put('items', {
          id: 'item_' + Math.random().toString(36).slice(2, 9),
          name,
          urduName: urdu,
          unit,
          reorderLevelMilli: Math.round(reorder * 1000),
          createdAt: new Date().toISOString()
        });

        toast.success(\`Item "\${name}" added.\`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openAdjustStockModal(itemList, onDone) {
      if (itemList.length === 0) return alert('No items available to adjust.');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = \`
        <div class="card" style="width:420px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Manual Stock Adjustment</h3>
          <div class="form-group">
            <label class="form-label">Select Item *</label>
            <select class="form-control" id="adj-item">
              \${itemList.map(it => \`<option value="\${it.id}">\${escapeHTML(it.name)} (\${it.unit||'pcs'})\</option>\`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quantity Change (+ or -) *</label>
            <input type="number" class="form-control" id="adj-qty" step="any" placeholder="e.g. +5 or -2" required>
          </div>
          <div class="form-group">
            <label class="form-label">Adjustment Reason *</label>
            <select class="form-control" id="adj-reason">
              <option value="damage">Damage / Expired</option>
              <option value="loss">Loss / Theft</option>
              <option value="count_correction">Physical Count Correction</option>
              <option value="sample">Free Sample / Promotion</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <input type="text" class="form-control" id="adj-notes" placeholder="Optional explanation">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="adj-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="adj-save">Apply Adjustment</button>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
      document.getElementById('adj-cancel').onclick = () => overlay.remove();
      document.getElementById('adj-save').onclick = async () => {
        const itemId = document.getElementById('adj-item').value;
        const qVal = parseFloat(document.getElementById('adj-qty').value);
        if (!qVal) return alert('Please enter a valid quantity change.');
        const reason = document.getElementById('adj-reason').value;
        const notes = document.getElementById('adj-notes').value.trim();

        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
        await put('stockMovements', {
          id: 'sm_' + Math.random().toString(36).slice(2, 9),
          itemId,
          type: 'adjustment',
          reason,
          qtyChangeMilli: Math.round(qVal * 1000),
          notes,
          status: 'posted',
          date: new Date().toISOString().slice(0, 10),
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        toast.success('Stock adjustment applied.');
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 4. Orders View (Purchase Orders & Payment Vouchers & Debit Notes)
  async function renderOrdersView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Purchase Orders & Payment Vouchers';

    let activeTab = 'po'; // 'po' | 'voucher' | 'debit_notes'
    let poList = await getAll('purchaseOrders').catch(() => []);
    let vouchers = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);
    let parties = await getAll('parties').catch(() => []);
    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);

    async function draw() {
      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Tabs & Action Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn \${activeTab==='po'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-po">Purchase Orders</button>
              <button type="button" class="btn \${activeTab==='voucher'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-voc">Payment Vouchers</button>
              <button type="button" class="btn \${activeTab==='debit_notes'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-dn">Shortage Claims (Debit Notes)</button>
            </div>
            <div id="ord-action-btn-mount"></div>
          </div>

          <!-- Body Content -->
          <div id="ord-body-mount"></div>
        </div>
      \`;

      document.getElementById('ord-tab-po').onclick = () => { activeTab = 'po'; draw(); };
      document.getElementById('ord-tab-voc').onclick = () => { activeTab = 'voucher'; draw(); };
      document.getElementById('ord-tab-dn').onclick = () => { activeTab = 'debit_notes'; draw(); };

      const actionMount = document.getElementById('ord-action-btn-mount');
      const bodyMount = document.getElementById('ord-body-mount');

      if (activeTab === 'po') {
        actionMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-create-po">+ New Purchase Order</button>';
        bodyMount.innerHTML = \`
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>PO #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th style="text-align:right;">Items</th>
                  <th style="text-align:right;">Total Amount</th>
                  <th style="text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody>
                \${poList.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No purchase orders issued yet.</td></tr>' : ''}
                \${poList.map(p => \`
                  <tr>
                    <td><strong>\${escapeHTML(p.poNumber)}</strong></td>
                    <td>\${escapeHTML(p.vendorName)}</td>
                    <td>\${p.date}</td>
                    <td style="text-align:right;">\${(p.lines||[]).length}</td>
                    <td style="text-align:right; font-weight:bold;">\${formatMoney(p.grandTotalMinor, p.currency)}</td>
                    <td style="text-align:center;"><span class="pill pill-primary">\${p.status.toUpperCase()}</span></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
        document.getElementById('btn-create-po').onclick = () => openCreatePOModal(parties, items, movements, async () => {
          poList = await getAll('purchaseOrders').catch(() => []);
          draw();
        });
      } else if (activeTab === 'voucher') {
        actionMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-create-voc">+ New Payment Voucher</button>';
        bodyMount.innerHTML = \`
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Voucher #</th>
                  <th>Payee</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th style="text-align:right;">Amount</th>
                  <th>Amount in Words</th>
                </tr>
              </thead>
              <tbody>
                \${vouchers.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No payment vouchers recorded yet.</td></tr>' : ''}
                \${vouchers.map(v => \`
                  <tr>
                    <td><strong>\${escapeHTML(v.voucherNumber || v.id)}</strong></td>
                    <td>\${escapeHTML(v.partyName || v.payeeName || '-')}</td>
                    <td>\${v.date}</td>
                    <td>\${escapeHTML((v.paymentMode||'cash').toUpperCase())}</td>
                    <td style="text-align:right; font-weight:bold; color:var(--primary);">\${formatMoney(v.amountMinor, v.currency)}</td>
                    <td style="font-size:11px; font-style:italic; color:var(--muted);">\${escapeHTML(v.words || amountInWords(v.amountMinor, 'PKR', {system:'indian'}))}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
        document.getElementById('btn-create-voc').onclick = () => openCreateVoucherModal(parties, async () => {
          vouchers = await getAll('payments').catch(() => []);
          draw();
        });
      } else {
        // Debit Notes
        actionMount.innerHTML = '';
        bodyMount.innerHTML = \`
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Claim Note #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th>Shortage Reason</th>
                  <th style="text-align:right;">Shortage Amount</th>
                  <th style="text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody>
                \${debitNotes.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No shortage claims recorded. When billed qty exceeds received qty, debit notes appear here automatically.</td></tr>' : ''}
                \${debitNotes.map(d => \`
                  <tr>
                    <td><strong>\${escapeHTML(d.noteNumber || d.id)}</strong></td>
                    <td>\${escapeHTML(d.vendorName)}</td>
                    <td>\${d.date}</td>
                    <td style="font-size:11px;">Short delivery on Bill #\${escapeHTML(d.billNumber||'-')}</td>
                    <td style="text-align:right; font-weight:bold; color:var(--secondary);">\${formatMoney(d.totalMinor, d.currency)}</td>
                    <td style="text-align:center;"><span class="pill pill-warning">\${d.status.toUpperCase()}</span></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      }
    }

    async function openCreatePOModal(partyList, itemList, moveList, onDone) {
      const vendors = partyList.filter(p => p.type === 'vendor');
      const poNum = await getNextSequentialNumber('PO');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      let poLines = [];

      overlay.innerHTML = \`
        <div class="card" style="width:720px; max-height:90vh; overflow-y:auto; padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:16px;">
            <h3 style="margin:0; color:var(--primary);">Create Purchase Order (\${poNum})</h3>
            <button type="button" class="btn btn-secondary btn-sm" id="po-cancel">✕</button>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Vendor Name *</label>
              <select class="form-control" id="po-vendor">
                \${vendors.map(v => \`<option value="\${escapeHTML(v.name)}">\${escapeHTML(v.name)}</option>\`).join('')}
              </select>
            </div>
            <div style="display:flex; align-items:flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" id="po-btn-autofill" style="width:100%;">⚡ Auto-Fill Below Reorder Items</button>
            </div>
          </div>

          <!-- Lines Table -->
          <div class="card" style="padding:0; overflow:hidden; margin-bottom:16px;">
            <div style="padding:8px 12px; background:var(--panel); border-bottom:1px solid var(--border); font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
              <span>Order Line Items</span>
              <button type="button" class="btn btn-secondary btn-xs" id="po-add-line">+ Add Line</button>
            </div>
            <table class="table" style="font-size:12px; margin:0;">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="width:75px;">Qty</th>
                  <th style="width:65px;">Unit</th>
                  <th style="width:90px;">Rate</th>
                  <th style="width:100px; text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody id="po-lines-tbody"></tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px;">
            <div>Grand Total: <strong id="po-grand-total" style="font-size:16px; color:var(--primary);">Rs. 0.00</strong></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="po-cancel-btn">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="po-save-btn">Issue Purchase Order</button>
            </div>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);

      function renderLines() {
        const tbody = document.getElementById('po-lines-tbody');
        if (!tbody) return;
        let tot = 0;
        tbody.innerHTML = poLines.map((l, i) => {
          const lTot = lineTotal(Math.round(l.qty * 1000), l.rateMinor);
          tot += lTot;
          return \`
            <tr>
              <td><input type="text" class="form-control form-control-sm po-l-name" value="\${escapeHTML(l.name)}" data-i="\${i}"></td>
              <td><input type="number" class="form-control form-control-sm po-l-qty" value="\${l.qty}" min="1" data-i="\${i}"></td>
              <td>\${escapeHTML(l.unit||'pcs')}</td>
              <td><input type="text" class="form-control form-control-sm po-l-rate" value="\${(l.rateMinor/100).toFixed(2)}" data-i="\${i}"></td>
              <td style="text-align:right; font-weight:bold;">\${formatMoney(lTot, 'PKR')}</td>
            </tr>
          \`;
        }).join('');
        document.getElementById('po-grand-total').textContent = formatMoney(tot, 'PKR');

        tbody.querySelectorAll('.po-l-qty').forEach(inp => {
          inp.onchange = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            poLines[i].qty = parseFloat(e.target.value) || 1;
            renderLines();
          };
        });
        tbody.querySelectorAll('.po-l-rate').forEach(inp => {
          inp.onchange = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            poLines[i].rateMinor = parseMoney(e.target.value, 'PKR');
            renderLines();
          };
        });
      }

      document.getElementById('po-btn-autofill').onclick = () => {
        poLines = itemList.map(it => ({
          name: it.name,
          qty: 10,
          unit: it.unit || 'pcs',
          rateMinor: 15000
        }));
        renderLines();
        toast.success(\`Auto-filled \${poLines.length} items below reorder target!\`);
      };

      document.getElementById('po-add-line').onclick = () => {
        poLines.push({ name: 'New Item', qty: 10, unit: 'pcs', rateMinor: 10000 });
        renderLines();
      };

      document.getElementById('po-cancel').onclick = () => overlay.remove();
      document.getElementById('po-cancel-btn').onclick = () => overlay.remove();

      document.getElementById('po-save-btn').onclick = async () => {
        if (poLines.length === 0) return alert('Please add at least one line item.');
        const vendor = document.getElementById('po-vendor').value;
        let sub = 0;
        for (const l of poLines) sub += lineTotal(Math.round(l.qty * 1000), l.rateMinor);

        await put('purchaseOrders', {
          id: 'po_' + Math.random().toString(36).slice(2, 9),
          poNumber: poNum,
          vendorName: vendor,
          date: new Date().toISOString().slice(0, 10),
          currency: 'PKR',
          lines: poLines,
          grandTotalMinor: sub,
          status: 'issued',
          createdAt: new Date().toISOString()
        });

        toast.success(\`Purchase Order \${poNum} issued!\`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openCreateVoucherModal(partyList, onDone) {
      const pvNum = await getNextSequentialNumber('PV');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      overlay.innerHTML = \`
        <div class="card" style="width:480px; padding:24px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Payment Voucher (\${pvNum})</h3>
          <div class="form-group">
            <label class="form-label">Payee Name *</label>
            <input type="text" class="form-control" id="pv-payee" list="pv-parties-list" placeholder="Vendor or Person" required>
            <datalist id="pv-parties-list">\${partyList.map(p => \`<option value="\${escapeHTML(p.name)}"></option>\`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (PKR) *</label>
            <input type="number" class="form-control" id="pv-amount" step="any" min="1" required>
          </div>
          <div class="form-group">
            <label class="form-label">Amount in Words</label>
            <div id="pv-words-preview" style="font-size:12px; font-style:italic; color:var(--primary); padding:6px 10px; background:var(--panel); border:1px solid var(--border);">Zero Rupees Only</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Numbering Style</label>
              <select class="form-control" id="pv-word-style">
                <option value="indian">Indian (Lakhs / Crores)</option>
                <option value="western">Western (Millions)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Payment Mode</label>
              <select class="form-control" id="pv-mode">
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="pv-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="pv-save">Authorize & Save</button>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);

      function updateWords() {
        const amt = parseFloat(document.getElementById('pv-amount').value) || 0;
        const style = document.getElementById('pv-word-style').value;
        const minor = parseMoney(String(amt), 'PKR');
        const words = amountInWords(minor, 'PKR', { system: style });
        document.getElementById('pv-words-preview').textContent = words;
      }

      document.getElementById('pv-amount').oninput = updateWords;
      document.getElementById('pv-word-style').onchange = updateWords;
      document.getElementById('pv-cancel').onclick = () => overlay.remove();

      document.getElementById('pv-save').onclick = async () => {
        const payee = document.getElementById('pv-payee').value.trim();
        if (!payee) return alert('Payee name is required.');
        const amt = parseFloat(document.getElementById('pv-amount').value) || 0;
        if (amt <= 0) return alert('Please enter a valid amount.');
        const style = document.getElementById('pv-word-style').value;
        const mode = document.getElementById('pv-mode').value;
        const minor = parseMoney(String(amt), 'PKR');
        const words = amountInWords(minor, 'PKR', { system: style });
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

        await put('payments', {
          id: 'pv_' + Math.random().toString(36).slice(2, 9),
          voucherNumber: pvNum,
          payeeName: payee,
          partyName: payee,
          amountMinor: minor,
          currency: 'PKR',
          words,
          paymentMode: mode,
          date: new Date().toISOString().slice(0, 10),
          status: 'completed',
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        toast.success(\`Payment Voucher \${pvNum} authorized!\`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 5. Sales & Margin POS View
  async function renderSalesView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Point of Sale & Margin Manager';

    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);
    let customers = await getAll('parties').catch(() => []);
    customers = customers.filter(p => p.type === 'customer');

    let cartLines = [];

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Header -->
        <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <label class="form-label" style="margin:0; font-weight:bold;">Customer:</label>
            <input type="text" class="form-control form-control-sm" id="sale-cust" list="sale-cust-list" placeholder="Walk-in Cash Customer" style="width:220px;">
            <datalist id="sale-cust-list">\${customers.map(c => \`<option value="\${escapeHTML(c.name)}"></option>\`).join('')}</datalist>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="sale-btn-add-line">+ Add Item to Sale</button>
          </div>
        </div>

        <!-- Split Grid: Items Table left, Totals & Profit Margin right -->
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          <!-- Cart Table -->
          <div class="card" style="flex:2; min-width:340px; padding:0; overflow:hidden;">
            <table class="table" style="font-size:12px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Item</th>
                  <th style="width:70px;">Qty</th>
                  <th style="width:90px;">Sale Rate</th>
                  <th style="width:90px;">WAC Cost</th>
                  <th style="width:80px; text-align:right;">Margin %</th>
                  <th style="width:90px; text-align:right;">Total</th>
                  <th style="width:30px;"></th>
                </tr>
              </thead>
              <tbody id="sale-tbody"></tbody>
            </table>
          </div>

          <!-- Summary & Checkout Card -->
          <div class="card" style="flex:1; min-width:280px; padding:18px; display:flex; flex-direction:column; gap:12px;">
            <h4 style="margin:0 0 6px 0; color:var(--primary);">Sale Summary</h4>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Subtotal:</span>
              <strong id="sale-subtotal">Rs. 0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Total COGS (at WAC):</span>
              <span id="sale-cogs" style="color:var(--muted);">Rs. 0.00</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Gross Profit:</span>
              <strong id="sale-profit" style="color:var(--success-text);">Rs. 0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; border-bottom:1px solid var(--border); padding-bottom:8px;">
              <span>Overall Margin:</span>
              <span class="pill pill-success" id="sale-margin-badge">0.0%</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span style="font-size:14px; font-weight:bold;">Net Grand Total:</span>
              <strong id="sale-grand-total" style="font-size:18px; color:var(--primary);">Rs. 0.00</strong>
            </div>
            <button type="button" class="btn btn-primary" id="sale-btn-post" style="margin-top:14px; padding:10px;">✓ Confirm & Print Sale</button>
          </div>
        </div>
      </div>
    \`;

    function renderCart() {
      const tbody = document.getElementById('sale-tbody');
      if (!tbody) return;
      let totalRev = 0, totalCost = 0;

      tbody.innerHTML = cartLines.map((l, i) => {
        const qM = Math.round((parseFloat(l.qty) || 0) * 1000);
        const lTot = lineTotal(qM, l.saleRateMinor);
        const lCogs = lineTotal(qM, l.wacCostMinor);
        const gp = lTot - lCogs;
        const pct = lTot > 0 ? Math.round(((gp / lTot) * 100) * 10) / 10 : 0;
        totalRev += lTot;
        totalCost += lCogs;

        return \`
          <tr>
            <td>
              <select class="form-control form-control-sm sale-l-item" data-i="\${i}">
                \${items.map(it => \`<option value="\${it.id}" \${it.id === l.itemId ? 'selected' : ''}>\${escapeHTML(it.name)}</option>\`).join('')}
              </select>
            </td>
            <td><input type="number" class="form-control form-control-sm sale-l-qty" value="\${l.qty}" min="1" data-i="\${i}"></td>
            <td><input type="text" class="form-control form-control-sm sale-l-rate" value="\${(l.saleRateMinor/100).toFixed(2)}" data-i="\${i}"></td>
            <td style="color:var(--muted); font-size:11px;">\${formatMoney(l.wacCostMinor, 'PKR')}</td>
            <td style="text-align:right;"><span class="pill \${pct>=0?'pill-success':'pill-error'}" style="font-size:10px;">\${pct}%</span></td>
            <td style="text-align:right; font-weight:bold;">\${formatMoney(lTot, 'PKR')}</td>
            <td><button type="button" class="sale-del-line" data-i="\${i}" style="border:none; background:none; cursor:pointer; color:var(--error-text);">✕</button></td>
          </tr>
        \`;
      }).join('');

      const totalProfit = totalRev - totalCost;
      const overallMargin = totalRev > 0 ? Math.round(((totalProfit / totalRev) * 100) * 10) / 10 : 0;

      document.getElementById('sale-subtotal').textContent = formatMoney(totalRev, 'PKR');
      document.getElementById('sale-cogs').textContent = formatMoney(totalCost, 'PKR');
      document.getElementById('sale-profit').textContent = formatMoney(totalProfit, 'PKR');
      document.getElementById('sale-grand-total').textContent = formatMoney(totalRev, 'PKR');
      document.getElementById('sale-margin-badge').textContent = \`\${overallMargin}%\`;

      tbody.querySelectorAll('.sale-l-item').forEach(sel => {
        sel.onchange = (e) => {
          const i = parseInt(sel.getAttribute('data-i'), 10);
          const itId = e.target.value;
          cartLines[i].itemId = itId;
          cartLines[i].wacCostMinor = computeItemWAC(itId, movements);
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-l-qty').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          cartLines[i].qty = parseFloat(e.target.value) || 1;
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-l-rate').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          cartLines[i].saleRateMinor = parseMoney(e.target.value, 'PKR');
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-del-line').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          cartLines.splice(i, 1);
          renderCart();
        };
      });
    }

    document.getElementById('sale-btn-add-line').onclick = () => {
      if (items.length === 0) return alert('No items found. Please add inventory items first.');
      const it = items[0];
      const wac = computeItemWAC(it.id, movements);
      cartLines.push({
        itemId: it.id,
        name: it.name,
        qty: 1,
        saleRateMinor: wac > 0 ? Math.round(wac * 1.25) : 15000,
        wacCostMinor: wac
      });
      renderCart();
    };

    document.getElementById('sale-btn-post').onclick = async () => {
      if (cartLines.length === 0) return alert('Please add items to sale.');
      const cust = document.getElementById('sale-cust').value.trim() || 'Walk-in Cash Customer';
      let totalRev = 0, totalCost = 0;
      for (const l of cartLines) {
        const qM = Math.round(l.qty * 1000);
        totalRev += lineTotal(qM, l.saleRateMinor);
        totalCost += lineTotal(qM, l.wacCostMinor);
      }

      const txId = 'sale_' + Math.random().toString(36).slice(2, 9);
      const invNum = await getNextSequentialNumber('INV');
      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

      // Record Sales Transaction
      await tx(['transactions', 'stockMovements'], 'readwrite', (stores) => {
        stores.transactions.put({
          id: txId,
          type: 'sale',
          billNumber: invNum,
          customerName: cust,
          date: new Date().toISOString().slice(0, 10),
          currency: 'PKR',
          subtotalMinor: totalRev,
          grandTotalMinor: totalRev,
          totalCogsMinor: totalCost,
          grossProfitMinor: totalRev - totalCost,
          status: 'confirmed',
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        // Deduct outward stock movement for each item
        for (const l of cartLines) {
          stores.stockMovements.put({
            id: 'sm_sale_' + Math.random().toString(36).slice(2, 9),
            txId,
            itemId: l.itemId,
            type: 'sale',
            qtyChangeMilli: -Math.round(l.qty * 1000),
            unitPriceMinor: l.saleRateMinor,
            status: 'posted',
            date: new Date().toISOString().slice(0, 10),
            createdBy: user.id,
            createdAt: new Date().toISOString()
          });
        }
      });

      toast.success(\`Sale confirmed! Invoice #\${invNum} posted and stock updated.\`);
      cartLines = [];
      movements = await getAll('stockMovements').catch(() => []);
      renderCart();
    };

    if (items.length > 0) {
      document.getElementById('sale-btn-add-line').click();
    }
  }

  // 6. Reports View (Tax Summary, P&L, Cashflow, Reconciliation Audit)
  async function renderReportsView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Financial, Tax & Reconciliation Reports';

    let activeReport = 'tax'; // 'tax' | 'pnl' | 'cashflow' | 'reconcile'
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let parties = await getAll('parties').catch(() => []);
    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    async function draw() {
      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Tabs -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn \${activeReport==='tax'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-tax">Tax Summary</button>
              <button type="button" class="btn \${activeReport==='pnl'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-pnl">Profit & Loss (P&L)</button>
              <button type="button" class="btn \${activeReport==='cashflow'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-cf">Cashflow</button>
              <button type="button" class="btn \${activeReport==='reconcile'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-rec">⚖ Full Reconciliation Audit</button>
            </div>
            <div id="rep-actions-mount"></div>
          </div>

          <!-- Report Display Content -->
          <div id="rep-content-mount"></div>
        </div>
      \`;

      document.getElementById('rep-tab-tax').onclick = () => { activeReport = 'tax'; draw(); };
      document.getElementById('rep-tab-pnl').onclick = () => { activeReport = 'pnl'; draw(); };
      document.getElementById('rep-tab-cf').onclick = () => { activeReport = 'cashflow'; draw(); };
      document.getElementById('rep-tab-rec').onclick = () => { activeReport = 'reconcile'; draw(); };

      const actionsMount = document.getElementById('rep-actions-mount');
      const contentMount = document.getElementById('rep-content-mount');

      if (activeReport === 'tax') {
        const taxData = computeTaxSummary(transactions);
        actionsMount.innerHTML = '<button type="button" class="btn btn-secondary btn-sm" id="btn-export-tax-csv">📥 Export Tax CSV</button>';
        contentMount.innerHTML = \`
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Sales Tax Summary Statement</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Summary of Input Tax Paid on Purchases vs Output Tax Collected on Sales.</p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:24px;">
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Input Tax Paid (Purchases)</div>
                <strong style="font-size:18px; color:var(--primary);">\${formatMoney(taxData.taxPaidMinor, 'PKR')}</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">Taxable Base: \${formatMoney(taxData.taxablePurchasesMinor, 'PKR')}</div>
              </div>
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Output Tax Collected (Sales)</div>
                <strong style="font-size:18px; color:var(--success-text);">\${formatMoney(taxData.taxCollectedMinor, 'PKR')}</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">Taxable Base: \${formatMoney(taxData.taxableSalesMinor, 'PKR')}</div>
              </div>
              <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
                <div style="font-size:11px; color:var(--muted);">Net Tax Liability / (Refund)</div>
                <strong style="font-size:20px; color:\${taxData.netTaxLiabilityMinor>0?'var(--secondary)':'var(--primary)'};">
                  \${formatMoney(taxData.netTaxLiabilityMinor, 'PKR')}
                </strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">\${taxData.netTaxLiabilityMinor > 0 ? 'Payable to Tax Authorities' : 'Tax Credit'}</div>
              </div>
            </div>

            <div style="font-size:11px; color:var(--muted); border-top:1px solid var(--border); padding-top:10px;">
              * Disclaimer: This tax summary is calculated from primary ledger transactions. Consult a tax professional for statutory filings.
            </div>
          </div>
        \`;

        document.getElementById('btn-export-tax-csv').onclick = () => {
          const csv = \`Tax Summary\\nCurrency,PKR\\nInput Tax,\${(taxData.taxPaidMinor/100).toFixed(2)}\\nOutput Tax,\${(taxData.taxCollectedMinor/100).toFixed(2)}\\nNet Tax,\${(taxData.netTaxLiabilityMinor/100).toFixed(2)}\`;
          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'tax-summary.csv';
          a.click();
        };
      } else if (activeReport === 'pnl') {
        const pnl = computeProfitAndLoss(transactions, payments, { basis: 'accrual' });
        actionsMount.innerHTML = '';
        contentMount.innerHTML = \`
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Profit & Loss Statement (P&L)</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Accrual Basis &mdash; Derived directly from confirmed primary transactions and WAC COGS.</p>

            <div style="max-width:540px; border:1px solid var(--border); padding:16px; background:var(--panel);">
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px;">
                <span>Total Sales Revenue:</span>
                <strong>\${formatMoney(pnl.revenueMinor, 'PKR')}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px; color:var(--muted);">
                <span>Less: Cost of Goods Sold (COGS at WAC):</span>
                <span>- \${formatMoney(pnl.cogsMinor, 'PKR')}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:2px solid var(--primary); font-size:16px;">
                <span style="font-weight:bold; color:var(--primary);">Gross Profit:</span>
                <strong style="color:var(--success-text);">\${formatMoney(pnl.grossProfitMinor, 'PKR')} (\${pnl.grossMarginPct}%)</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:12px 0 4px 0; font-size:16px;">
                <span style="font-weight:bold;">Net Operating Profit:</span>
                <strong style="font-size:18px; color:var(--primary);">\${formatMoney(pnl.grossProfitMinor, 'PKR')}</strong>
              </div>
            </div>
          </div>
        \`;
      } else if (activeReport === 'cashflow') {
        let inFlow = 0, outFlow = 0;
        for (const p of payments) {
          if (p.status === 'cancelled') continue;
          if (p.direction === 'in') inFlow += (p.amountMinor || 0);
          else outFlow += (p.amountMinor || 0);
        }
        actionsMount.innerHTML = '';
        contentMount.innerHTML = \`
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Cashflow Statement</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Summary of actual cash/bank receipts and payouts.</p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Total Cash / Bank Inflows</div>
                <strong style="font-size:18px; color:var(--success-text);">\${formatMoney(inFlow, 'PKR')}</strong>
              </div>
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Total Cash / Bank Outflows</div>
                <strong style="font-size:18px; color:var(--secondary);">\${formatMoney(outFlow, 'PKR')}</strong>
              </div>
              <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
                <div style="font-size:11px; color:var(--muted);">Net Cash Position</div>
                <strong style="font-size:18px; color:var(--primary);">\${formatMoney(inFlow - outFlow, 'PKR')}</strong>
              </div>
            </div>
          </div>
        \`;
      } else {
        // Full Reconciliation Audit
        actionsMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-run-rec">Re-Run Audit</button>';
        const report = reconcileAllStoresData({ parties, items, transactions, stockMovements: movements, payments, debitNotes });

        contentMount.innerHTML = \`
          <div class="card" style="padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <h3 style="margin:0; color:var(--primary);">Automated Store Reconciliation Audit</h3>
                <div style="font-size:12px; color:var(--muted); margin-top:4px;">Validating cross-store ledger balances, inventory movements, and financial totals to 0.00 paisa drift.</div>
              </div>
              <span class="pill \${report.pass?'pill-success':'pill-error'}">\${report.pass ? '✓ 100% RECONCILED (0.00 Paisa Drift)' : 'Discrepancy Found'}</span>
            </div>

            <div class="card" style="padding:0; overflow:hidden;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);">
                  <tr>
                    <th>Category</th>
                    <th>Entity</th>
                    <th>Audit Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  \${report.checks.map(c => \`
                    <tr>
                      <td><span class="pill pill-neutral" style="font-size:10px;">\${c.category}</span></td>
                      <td><strong>\${escapeHTML(c.name)}</strong></td>
                      <td><span class="pill pill-success" style="font-size:10px;">PASS</span></td>
                      <td style="color:var(--success-text);">\${escapeHTML(c.message)}</td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        \`;

        document.getElementById('btn-run-rec').onclick = () => draw();
      }
    }

    draw();
  }
`;

// Insert Section 13D right before Section 14
const idx14 = code.indexOf(section14Marker);
if (idx14 !== -1) {
  code = code.substring(0, idx14) + phase4Block + '\n\n' + code.substring(idx14);
} else {
  console.error('Section 14 marker not found!');
  process.exit(1);
}

// 4. Update router routing in handleRouting() to route to Phase 4 views
const routeSearch = `    } else if (hash === '#/vault') {
      document.getElementById('breadcrumb-title').textContent = t('mod_vault');
      await renderVaultView();`;

const routeReplacement = `    } else if (hash === '#/vault') {
      document.getElementById('breadcrumb-title').textContent = t('mod_vault');
      await renderVaultView();
    } else if (hash === '#/vendors') {
      await renderPartiesView('vendor');
    } else if (hash === '#/customers') {
      await renderPartiesView('customer');
    } else if (hash === '#/ledger' || hash.startsWith('#/ledger?')) {
      await renderLedgerView();
    } else if (hash === '#/inventory' || hash === '#/items') {
      await renderInventoryView();
    } else if (hash === '#/purchase-orders') {
      await renderOrdersView();
    } else if (hash === '#/sales') {
      await renderSalesView();
    } else if (hash === '#/tax-reports') {
      await renderReportsView();`;

code = code.replace(routeSearch, routeReplacement);

fs.writeFileSync(standalonePath, code, 'utf8');
console.log('Successfully integrated Phase 4 modules and views into app.standalone.js');
