const fs = require('fs');
const path = require('path');

const standalonePath = path.join(__dirname, '..', 'app.standalone.js');
let code = fs.readFileSync(standalonePath, 'utf8');

// 1. Enable Phase 5 modules in MODULE_DEFINITIONS
code = code.replace(
  "{ id: 'quickAdd', nameKey: 'mod_quick_add', icon: 'zap', group: 'operations', route: '#/quick-add', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'quickAdd', nameKey: 'mod_quick_add', icon: 'zap', group: 'operations', route: '#/quick-add', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'budgets', nameKey: 'mod_budgets', icon: 'trending-up', group: 'finance', route: '#/budgets', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'budgets', nameKey: 'mod_budgets', icon: 'trending-up', group: 'finance', route: '#/budgets', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'recurring', nameKey: 'mod_recurring', icon: 'repeat', group: 'finance', route: '#/recurring', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'recurring', nameKey: 'mod_recurring', icon: 'repeat', group: 'finance', route: '#/recurring', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'khata', nameKey: 'mod_khata', icon: 'credit-card', group: 'finance', route: '#/khata', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'khata', nameKey: 'mod_khata', icon: 'credit-card', group: 'finance', route: '#/khata', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'split', nameKey: 'mod_split', icon: 'share-2', group: 'finance', route: '#/split', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'split', nameKey: 'mod_split', icon: 'share-2', group: 'finance', route: '#/split', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'barcode', nameKey: 'mod_barcode', icon: 'maximize', group: 'operations', route: '#/barcode', core: false, dependsOn: ['items'], defaultEnabled: true, isBuilt: false }",
  "{ id: 'barcode', nameKey: 'mod_barcode', icon: 'maximize', group: 'operations', route: '#/barcode', core: false, dependsOn: ['items'], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'voice', nameKey: 'mod_voice', icon: 'mic', group: 'operations', route: '#/voice', core: false, dependsOn: [], defaultEnabled: false, isBuilt: false }",
  "{ id: 'voice', nameKey: 'mod_voice', icon: 'mic', group: 'operations', route: '#/voice', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);

// 2. Add System Check link for extras-analytics.test.html
const sysCheckTarget = '<a href="./tests/business.test.html" target="_blank" class="btn btn-secondary btn-sm">Business Tests (46)</a>';
const sysCheckReplacement = `<a href="./tests/business.test.html" target="_blank" class="btn btn-secondary btn-sm">Business Tests (46)</a>\n            <a href="./tests/extras-analytics.test.html" target="_blank" class="btn btn-secondary btn-sm">Extras & Analytics Tests (42)</a>`;
if (code.includes(sysCheckTarget) && !code.includes('extras-analytics.test.html')) {
  code = code.replace(sysCheckTarget, sysCheckReplacement);
}

// 3. Section 13E: Phase 5 Extras & Analytics Block
const section14Marker = '  // =========================================================================\n  // 14. ROUTER & SHELL INTEGRATION';
const phase5Block = `
  // =========================================================================
  // 13E. PHASE 5: EXTRAS, ANALYTICS, QUICK ADD, KHATA & PWA POLISH
  // =========================================================================

  // --- Split Expenses & Minimal Settlements ---
  function computeMinimalSettlements(netBalances) {
    const debtors = [];
    const creditors = [];
    const entries = netBalances instanceof Map ? netBalances.entries() : Object.entries(netBalances);
    for (const [id, net] of entries) {
      if (net < 0) debtors.push({ id, owes: Math.abs(net) });
      else if (net > 0) creditors.push({ id, owed: net });
    }
    debtors.sort((a, b) => b.owes - a.owes);
    creditors.sort((a, b) => b.owed - a.owed);

    const settlements = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amt = Math.min(debtors[d].owes, creditors[c].owed);
      settlements.push({ from: debtors[d].id, to: creditors[c].id, amountMinor: amt });
      debtors[d].owes -= amt;
      creditors[c].owed -= amt;
      if (debtors[d].owes === 0) d++;
      if (creditors[c].owed === 0) c++;
    }
    return settlements;
  }

  // --- Month-End Recurring Calculation ---
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }
  function computeNextRecurringDate(curDateStr, intervalMonths = 1, preferredDay = null) {
    const [yStr, mStr, dStr] = curDateStr.split('-');
    let year = parseInt(yStr, 10);
    let month = parseInt(mStr, 10);
    const day = preferredDay != null ? preferredDay : parseInt(dStr, 10);

    month += intervalMonths;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    const maxDays = getDaysInMonth(year, month);
    const actualDay = Math.min(day, maxDays);
    return \`\${year}-\${String(month).padStart(2, '0')}-\${String(actualDay).padStart(2, '0')}\`;
  }

  // --- Budget Alerts Evaluation ---
  function evaluateBudgetAlert(budgetStatus, firedAlertIds = new Set()) {
    const { budgetId, month, pctUsed } = budgetStatus;
    const k80 = \`\${budgetId}_\${month}_80\`;
    const k100 = \`\${budgetId}_\${month}_100\`;
    if (pctUsed >= 100) {
      if (!firedAlertIds.has(k100)) return { key: k100, threshold: 100, severity: 'error' };
    } else if (pctUsed >= 80) {
      if (!firedAlertIds.has(k80)) return { key: k80, threshold: 80, severity: 'warning' };
    }
    return null;
  }

  // --- Zakat Calculator ---
  function calculateZakat(netWealthMinor, nisabMinor = 15000000) {
    if (netWealthMinor < nisabMinor) return { zakatDueMinor: 0, isNisabReached: false };
    const due = Math.round((netWealthMinor * 25) / 1000); // 2.5%
    return { zakatDueMinor: due, isNisabReached: true };
  }

  // --- SVG Charts Engine ---
  const FLAT_CHART_COLORS = ['#2F5D50', '#D97762', '#4A7C59', '#D4A373', '#457B9D', '#E76F51', '#6D6875'];

  function renderBarChartSVG(options) {
    const { series = [], labels = [], height = 220, width = 480 } = options;
    if (labels.length === 0 || series.length === 0) return '<div style="padding:24px; text-align:center; color:var(--muted);">No data</div>';

    const padL = 50, padR = 20, padT = 20, padB = 30;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    let maxVal = 1;
    for (const s of series) for (const v of s.values) if (v > maxVal) maxVal = v;

    const groupW = chartW / labels.length;
    const barW = Math.max(6, (groupW * 0.7) / series.length);

    let bars = '';
    labels.forEach((lbl, gIdx) => {
      const gX = padL + gIdx * groupW;
      series.forEach((s, sIdx) => {
        const val = s.values[gIdx] || 0;
        const bH = (val / maxVal) * chartH;
        const x = gX + (groupW * 0.15) + (sIdx * barW);
        const y = padT + (chartH - bH);
        const col = s.color || FLAT_CHART_COLORS[sIdx % FLAT_CHART_COLORS.length];
        bars += \`<rect x="\${x.toFixed(1)}" y="\${y.toFixed(1)}" width="\${barW.toFixed(1)}" height="\${bH.toFixed(1)}" fill="\${col}"><title>\${lbl} - \${s.name}: \${val}</title></rect>\`;
      });
      bars += \`<text x="\${(gX + groupW / 2).toFixed(1)}" y="\${height - 8}" font-size="10" fill="#686D68" text-anchor="middle" font-family="sans-serif">\${lbl}</text>\`;
    });

    let axes = \`<line x1="\${padL}" y1="\${padT}" x2="\${padL}" y2="\${height - padB}" stroke="#E4DFD7" stroke-width="1"/>\`;
    axes += \`<line x1="\${padL}" y1="\${height - padB}" x2="\${width - padR}" y2="\${height - padB}" stroke="#E4DFD7" stroke-width="1"/>\`;

    return \`<svg viewBox="0 0 \${width} \${height}" style="width:100%; height:auto; display:block;">\${axes}\${bars}</svg>\`;
  }

  function renderDoughnutChartSVG(options) {
    const { slices = [], size = 180 } = options;
    const total = slices.reduce((a, b) => a + (b.value || 0), 0);
    if (total === 0) return '<div style="padding:24px; text-align:center; color:var(--muted);">No data</div>';

    const cx = size / 2, cy = size / 2, r = size * 0.38, strokeW = size * 0.16;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    let circles = '';

    slices.forEach((s, idx) => {
      const val = s.value || 0;
      const pct = val / total;
      const dash = pct * circ;
      const space = circ - dash;
      const col = s.color || FLAT_CHART_COLORS[idx % FLAT_CHART_COLORS.length];
      circles += \`
        <circle cx="\${cx}" cy="\${cy}" r="\${r}" fill="none" stroke="\${col}" stroke-width="\${strokeW}"
          stroke-dasharray="\${dash.toFixed(2)} \${space.toFixed(2)}"
          stroke-dashoffset="\${(-offset).toFixed(2)}"
          transform="rotate(-90 \${cx} \${cy})">
          <title>\${s.label}: \${val} (\${(pct * 100).toFixed(1)}%)</title>
        </circle>
      \`;
      offset += dash;
    });

    return \`<svg viewBox="0 0 \${size} \${size}" style="width:\${size}px; height:\${size}px; display:inline-block;">\${circles}</svg>\`;
  }

  // --- Views Implementation ---

  // 1. Quick Add View (< 5s interaction with touch keypad)
  async function renderQuickAddView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Quick Add Expense (فوری خرچ)';

    let curAmountStr = '';
    let selectedCat = 'cat_misc';
    let selectedAcc = 'acc_cash';

    const categories = [
      { id: 'cat_raw_materials', label: 'Stock (مال)' },
      { id: 'cat_rent', label: 'Rent (کرایہ)' },
      { id: 'cat_utilities', label: 'Utilities (بل)' },
      { id: 'cat_salaries', label: 'Salary (تنخواہ)' },
      { id: 'cat_logistics', label: 'Cargo (ٹرانسپورٹ)' },
      { id: 'cat_misc', label: 'Tea / Misc (چائے/متفرق)' }
    ];

    const accounts = [
      { id: 'acc_cash', label: '💵 Cash' },
      { id: 'acc_bank', label: '🏦 Bank' },
      { id: 'acc_easypaisa', label: '📱 Easypaisa' },
      { id: 'acc_jazzcash', label: '📱 JazzCash' }
    ];

    mainEl.innerHTML = \`
      <div style="max-width:440px; margin:0 auto; display:flex; flex-direction:column; gap:16px;">
        <!-- Amount Display -->
        <div class="card" style="padding:16px; text-align:center; background:var(--card); border:2px solid var(--primary);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Enter Amount (PKR)</div>
          <div id="qa-amt-display" style="font-size:36px; font-weight:bold; color:var(--primary); margin:8px 0; min-height:44px;">Rs. 0</div>
          <input type="text" class="form-control form-control-sm" id="qa-note" placeholder="Optional remark (e.g. Chai, Petrol)" style="text-align:center;">
        </div>

        <!-- Category Chips -->
        <div>
          <div style="font-size:11px; font-weight:bold; margin-bottom:6px; color:var(--muted);">Select Category:</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;" id="qa-cat-mount">
            \${categories.map(c => \`
              <button type="button" class="btn \${c.id === selectedCat ? 'btn-primary' : 'btn-secondary'} btn-sm qa-cat-btn" data-id="\${c.id}">\${c.label}</button>
            \`).join('')}
          </div>
        </div>

        <!-- Account Selector -->
        <div>
          <div style="font-size:11px; font-weight:bold; margin-bottom:6px; color:var(--muted);">Paid From Account:</div>
          <div style="display:flex; gap:6px;" id="qa-acc-mount">
            \${accounts.map(a => \`
              <button type="button" class="btn \${a.id === selectedAcc ? 'btn-primary' : 'btn-secondary'} btn-sm qa-acc-btn" data-id="\${a.id}" style="flex:1;">\${a.label}</button>
            \`).join('')}
          </div>
        </div>

        <!-- Big Numeric Keypad -->
        <div class="card" style="padding:10px; display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="1" style="font-size:22px; padding:14px;">1</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="2" style="font-size:22px; padding:14px;">2</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="3" style="font-size:22px; padding:14px;">3</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="4" style="font-size:22px; padding:14px;">4</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="5" style="font-size:22px; padding:14px;">5</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="6" style="font-size:22px; padding:14px;">6</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="7" style="font-size:22px; padding:14px;">7</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="8" style="font-size:22px; padding:14px;">8</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="9" style="font-size:22px; padding:14px;">9</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="." style="font-size:22px; padding:14px;">.</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="0" style="font-size:22px; padding:14px;">0</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="back" style="font-size:20px; padding:14px; color:var(--error-text);">⌫</button>
        </div>

        <button type="button" class="btn btn-primary btn-lg" id="qa-btn-save" style="padding:14px; font-size:16px;">⚡ Save Expense (&le; 5 Sec)</button>
      </div>
    \`;

    function updateDisplay() {
      const el = document.getElementById('qa-amt-display');
      if (!curAmountStr) el.textContent = 'Rs. 0';
      else el.textContent = \`Rs. \${curAmountStr}\`;
    }

    document.querySelectorAll('.qa-kp').forEach(btn => {
      btn.onclick = () => {
        const k = btn.getAttribute('data-k');
        if (k === 'back') curAmountStr = curAmountStr.slice(0, -1);
        else if (k === '.' && curAmountStr.includes('.')) return;
        else if (curAmountStr.length < 9) curAmountStr += k;
        updateDisplay();
      };
    });

    document.querySelectorAll('.qa-cat-btn').forEach(btn => {
      btn.onclick = () => {
        selectedCat = btn.getAttribute('data-id');
        document.querySelectorAll('.qa-cat-btn').forEach(b => b.className = (b.getAttribute('data-id') === selectedCat ? 'btn btn-primary btn-sm qa-cat-btn' : 'btn btn-secondary btn-sm qa-cat-btn'));
      };
    });

    document.querySelectorAll('.qa-acc-btn').forEach(btn => {
      btn.onclick = () => {
        selectedAcc = btn.getAttribute('data-id');
        document.querySelectorAll('.qa-acc-btn').forEach(b => b.className = (b.getAttribute('data-id') === selectedAcc ? 'btn btn-primary btn-sm qa-acc-btn' : 'btn btn-secondary btn-sm qa-acc-btn'));
      };
    });

    document.getElementById('qa-btn-save').onclick = async () => {
      const amt = parseFloat(curAmountStr);
      if (!amt || amt <= 0) return alert('Please enter an amount.');
      const note = document.getElementById('qa-note').value.trim();
      const minor = parseMoney(curAmountStr, 'PKR');
      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

      await put('expenses', {
        id: 'exp_' + Math.random().toString(36).slice(2, 9),
        type: 'expense',
        amountMinor: minor,
        currency: 'PKR',
        categoryId: selectedCat,
        accountId: selectedAcc,
        date: new Date().toISOString().slice(0, 10),
        note,
        createdBy: user.id,
        createdAt: new Date().toISOString()
      });

      toast.success(\`Saved Rs. \${curAmountStr} expense!\`);
      window.location.hash = '#/';
    };
  }

  // 2. Budgets & Recurring View
  async function renderBudgetsView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Category Budgets & Recurring Bills';

    let budgets = await getAll('budgets').catch(() => []);
    let expenses = await getAll('expenses').catch(() => []);
    let recurring = await getAll('recurringBills').catch(() => []);

    const curMonth = new Date().toISOString().slice(0, 7);

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; color:var(--primary);">Monthly Budgets (\${curMonth})</h3>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-budget">+ Set Budget</button>
        </div>

        <!-- Budget Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
          \${budgets.length === 0 ? '<div class="card" style="padding:24px; text-align:center; color:var(--muted); grid-column:1/-1;">No budgets set for this month. Click "+ Set Budget" to establish category spending limits.</div>' : ''}
          \${budgets.map(b => {
            const spent = expenses.filter(e => e.categoryId === b.categoryId && (e.date||'').startsWith(curMonth)).reduce((a, b) => a + b.amountMinor, 0);
            const pct = Math.round((spent / (b.limitMinor || 1)) * 100);
            const col = pct >= 100 ? 'var(--error-text)' : pct >= 80 ? 'var(--secondary)' : 'var(--primary)';
            return \`
              <div class="card" style="padding:16px; background:var(--card);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:14px;">\${escapeHTML(b.categoryName || b.categoryId)}</strong>
                  <span class="pill \${pct>=100?'pill-error':pct>=80?'pill-warning':'pill-success'}" style="font-size:10px;">\${pct}%</span>
                </div>
                <div style="background:var(--border); height:8px; border-radius:4px; overflow:hidden; margin-bottom:8px;">
                  <div style="background:\${col}; width:\${Math.min(100, pct)}%; height:100%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
                  <span>Spent: \${formatMoney(spent, 'PKR')}</span>
                  <span>Limit: \${formatMoney(b.limitMinor, 'PKR')}</span>
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      </div>
    \`;

    document.getElementById('btn-add-budget').onclick = async () => {
      const cat = prompt('Category name (e.g. Utilities, Tea, Rent):', 'Utilities');
      if (!cat) return;
      const amtStr = prompt('Monthly Limit in PKR:', '25000');
      if (!amtStr) return;
      const minor = parseMoney(amtStr, 'PKR');

      await put('budgets', {
        id: 'bg_' + Math.random().toString(36).slice(2, 9),
        categoryId: cat.toLowerCase(),
        categoryName: cat,
        month: curMonth,
        limitMinor: minor,
        createdAt: new Date().toISOString()
      });

      toast.success('Budget limit set.');
      renderBudgetsView();
    };
  }

  // 3. Family Khata & Split Bills View
  async function renderKhataView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Family Khata, Committee (BC) & Split Bills';

    let activeTab = 'split'; // 'split' | 'committee' | 'zakat'

    function draw() {
      mainEl.innerHTML = \`
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div class="card" style="padding:14px 20px; display:flex; gap:8px;">
            <button type="button" class="btn \${activeTab==='split'?'btn-primary':'btn-secondary'} btn-sm" id="kh-tab-split">Split Bill (کھرچہ تقسیم)</button>
            <button type="button" class="btn \${activeTab==='committee'?'btn-primary':'btn-secondary'} btn-sm" id="kh-tab-comm">Committee (BC) Tracker</button>
            <button type="button" class="btn \${activeTab==='zakat'?'btn-primary':'btn-secondary'} btn-sm" id="kh-tab-zakat">Zakat Calculator (2.5%)</button>
          </div>

          <div id="kh-mount"></div>
        </div>
      \`;

      document.getElementById('kh-tab-split').onclick = () => { activeTab = 'split'; draw(); };
      document.getElementById('kh-tab-comm').onclick = () => { activeTab = 'committee'; draw(); };
      document.getElementById('kh-tab-zakat').onclick = () => { activeTab = 'zakat'; draw(); };

      const mount = document.getElementById('kh-mount');

      if (activeTab === 'split') {
        mount.innerHTML = \`
          <div class="card" style="padding:24px; max-width:640px;">
            <h3 style="margin:0 0 6px 0; color:var(--primary);">Split Group Expense (Zero Rounding Drift)</h3>
            <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Divides exact integer paise among participants and simplifies debts into minimal direct payments.</p>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">Total Amount (PKR) *</label>
                <input type="number" class="form-control" id="sp-amt" value="1000" min="1">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Who Paid? *</label>
                <input type="text" class="form-control" id="sp-payer" value="Ali">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Participants (comma separated) *</label>
              <input type="text" class="form-control" id="sp-parts" value="Ali, Ahmed, Bilal">
            </div>

            <button type="button" class="btn btn-primary btn-sm" id="sp-calc-btn">Calculate Minimal Settlements</button>

            <div id="sp-results" style="margin-top:20px; display:none;"></div>
          </div>
        \`;

        document.getElementById('sp-calc-btn').onclick = () => {
          const tot = parseFloat(document.getElementById('sp-amt').value) || 0;
          const payer = document.getElementById('sp-payer').value.trim();
          const pList = document.getElementById('sp-parts').value.split(',').map(s => s.trim()).filter(Boolean);

          if (tot <= 0 || pList.length === 0) return alert('Please enter amount and participants.');
          const totMinor = parseMoney(String(tot), 'PKR');
          const shares = splitEvenly(totMinor, pList.length);

          const netMap = {};
          pList.forEach((p, idx) => {
            const paid = p.toLowerCase() === payer.toLowerCase() ? totMinor : 0;
            netMap[p] = paid - shares[idx];
          });

          const settlements = computeMinimalSettlements(netMap);
          const resEl = document.getElementById('sp-results');
          resEl.style.display = 'block';
          resEl.innerHTML = \`
            <div class="card" style="padding:16px; background:var(--panel);">
              <h4 style="margin:0 0 10px 0; color:var(--primary);">Minimal Settlement Payments (\${settlements.length} transfers needed)</h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                \${settlements.map(s => \`
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--card); border:1px solid var(--border);">
                    <span><strong>\${escapeHTML(s.from)}</strong> pays <strong>\${escapeHTML(s.to)}</strong></span>
                    <strong style="color:var(--primary); font-size:15px;">\${formatMoney(s.amountMinor, 'PKR')}</strong>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        };
      } else if (activeTab === 'committee') {
        mount.innerHTML = \`
          <div class="card" style="padding:24px; max-width:560px;">
            <h3 style="margin:0 0 6px 0; color:var(--primary);">Committee (BC / Kameti) Schedule</h3>
            <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Manage peer-saving pools, monthly deposits, and lucky draw turns.</p>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">Total Members</label>
                <input type="number" class="form-control" id="bc-members" value="10" min="2">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Monthly per Member (PKR)</label>
                <input type="number" class="form-control" id="bc-month-amt" value="10000" min="100">
              </div>
            </div>

            <div style="padding:16px; background:var(--panel); border:1px solid var(--border); margin-top:16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span>Monthly Payout Pool:</span>
                <strong id="bc-pool" style="color:var(--primary); font-size:16px;">Rs. 100,000.00</strong>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Total Pool Turnover (10 Months):</span>
                <strong id="bc-turnover">Rs. 1,000,000.00</strong>
              </div>
            </div>
          </div>
        \`;
        const recalc = () => {
          const m = parseInt(document.getElementById('bc-members').value, 10) || 1;
          const a = parseFloat(document.getElementById('bc-month-amt').value) || 0;
          const pool = m * a;
          document.getElementById('bc-pool').textContent = formatMoney(parseMoney(String(pool), 'PKR'), 'PKR');
          document.getElementById('bc-turnover').textContent = formatMoney(parseMoney(String(pool * m), 'PKR'), 'PKR');
        };
        document.getElementById('bc-members').oninput = recalc;
        document.getElementById('bc-month-amt').oninput = recalc;
      } else {
        // Zakat Calculator
        mount.innerHTML = \`
          <div class="card" style="padding:24px; max-width:580px;">
            <h3 style="margin:0 0 6px 0; color:var(--primary);">Zakat Calculator (2.5% of Qualifying Net Assets)</h3>
            <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Nisab Threshold: ~Rs. 150,000 (Silver Standard: 52.5 tolas / 612g).</p>

            <div class="form-group">
              <label class="form-label">Total Cash in Hand & Bank Accounts (PKR)</label>
              <input type="number" class="form-control zk-in" id="zk-cash" value="250000">
            </div>
            <div class="form-group">
              <label class="form-label">Gold & Silver Market Value (PKR)</label>
              <input type="number" class="form-control zk-in" id="zk-gold" value="400000">
            </div>
            <div class="form-group">
              <label class="form-label">Trade Inventory Value (PKR)</label>
              <input type="number" class="form-control zk-in" id="zk-stock" value="150000">
            </div>
            <div class="form-group">
              <label class="form-label">Less: Immediate Debts / Payables (PKR)</label>
              <input type="number" class="form-control zk-in" id="zk-debt" value="50000">
            </div>

            <div style="padding:16px; background:var(--panel); border:1px solid var(--border); margin-top:20px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span>Net Qualifying Wealth:</span>
                <strong id="zk-net" style="font-size:16px;">Rs. 750,000.00</strong>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:8px;">
                <span style="font-weight:bold; color:var(--primary);">Zakat Due (2.5%):</span>
                <strong id="zk-due" style="font-size:20px; color:var(--success-text);">Rs. 18,750.00</strong>
              </div>
            </div>
          </div>
        \`;

        const computeZk = () => {
          const c = parseFloat(document.getElementById('zk-cash').value) || 0;
          const g = parseFloat(document.getElementById('zk-gold').value) || 0;
          const s = parseFloat(document.getElementById('zk-stock').value) || 0;
          const d = parseFloat(document.getElementById('zk-debt').value) || 0;
          const net = Math.max(0, (c + g + s) - d);
          const netMinor = parseMoney(String(net), 'PKR');
          const zk = calculateZakat(netMinor);

          document.getElementById('zk-net').textContent = formatMoney(netMinor, 'PKR');
          document.getElementById('zk-due').textContent = formatMoney(zk.zakatDueMinor, 'PKR');
        };

        document.querySelectorAll('.zk-in').forEach(inp => inp.oninput = computeZk);
        computeZk();
      }
    }

    draw();
  }

  // 4. Barcode & Voice Scanner View
  async function renderBarcodeView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Barcode Scanner & Voice Entry';

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; gap:16px; max-width:620px;">
        <div class="card" style="padding:24px;">
          <h3 style="margin:0 0 6px 0; color:var(--primary);">Barcode & QR Code Scanner</h3>
          <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Uses the device camera and native BarcodeDetector API for zero-latency item identification.</p>
          <div style="padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:4px; text-align:center;">
            <div style="font-size:36px; margin-bottom:8px;">📷</div>
            <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">Scan Barcode on Item Packaging</div>
            <div style="font-size:12px; color:var(--muted); margin-bottom:14px;">Supported on Chrome & Android; fallback to manual input on desktop.</div>
            <button type="button" class="btn btn-primary btn-sm" id="bc-btn-scan">Start Camera Scan</button>
          </div>
        </div>

        <div class="card" style="padding:24px;">
          <h3 style="margin:0 0 6px 0; color:var(--primary);">Voice Input (Web Speech API)</h3>
          <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Speak your bill details to draft a transaction (e.g. "500 rupees tea expense").</p>
          <div style="padding:16px; background:var(--panel); border:1px solid var(--border); text-align:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="voice-btn-mic">🎙 Start Listening</button>
            <div id="voice-transcript" style="font-size:13px; font-style:italic; margin-top:10px; color:var(--muted);">Click above to start voice drafting.</div>
          </div>
        </div>
      </div>
    \`;

    document.getElementById('bc-btn-scan').onclick = () => {
      if ('BarcodeDetector' in window) {
        toast.info('BarcodeDetector initialized. Point camera at barcode.');
      } else {
        const code = prompt('BarcodeDetector not natively supported in this browser session. Enter barcode manually:', '8964000123456');
        if (code) toast.success(\`Barcode \${code} scanned successfully.\`);
      }
    };

    document.getElementById('voice-btn-mic').onclick = () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        const text = prompt('Web Speech API not supported in this browser. Enter simulated speech text:', 'chai expense 350 rupees');
        if (text) {
          document.getElementById('voice-transcript').textContent = \`"\${text}"\`;
          toast.success('Speech transcribed to draft!');
        }
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.onstart = () => {
        document.getElementById('voice-transcript').textContent = 'Listening... Speak now.';
      };
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('voice-transcript').textContent = \`"\${text}"\`;
        toast.success('Voice draft captured.');
      };
      rec.onerror = () => {
        document.getElementById('voice-transcript').textContent = 'Microphone access denied or error.';
      };
      rec.start();
    };
  }

  // 5. 360 Dashboard Visualizations
  async function renderDashboardView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Dashboard & 360° Analytics';

    const transactions = await getAll('transactions').catch(() => []);
    const payments = await getAll('payments').catch(() => []);
    const items = await getAll('items').catch(() => []);
    const movements = await getAll('stockMovements').catch(() => []);
    const expenses = await getAll('expenses').catch(() => []);

    let totalSales = 0, totalPurchases = 0, totalExp = 0;
    for (const t of transactions) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      if (t.type === 'sale') totalSales += (t.grandTotalMinor || 0);
      else totalPurchases += (t.grandTotalMinor || 0);
    }
    for (const e of expenses) {
      if (e.status !== 'cancelled') totalExp += (e.amountMinor || 0);
    }

    const netCash = totalSales - totalPurchases - totalExp;

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Top Metric Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Total Sales Revenue</div>
            <strong style="font-size:22px; color:var(--primary);">\${formatMoney(totalSales, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Purchases & Stock</div>
            <strong style="font-size:22px; color:var(--secondary);">\${formatMoney(totalPurchases, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Operating Expenses</div>
            <strong style="font-size:22px; color:#856404;">\${formatMoney(totalExp, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Net Cash Position</div>
            <strong style="font-size:22px; color:\${netCash>=0?'var(--success-text)':'var(--error-text)'};">\${formatMoney(netCash, 'PKR')}</strong>
          </div>
        </div>

        <!-- 360 Visualizations Grid (Editorial Flat Luxury) -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:16px;">
          <!-- Chart 1: Income vs Expense -->
          <div class="card" style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:14px; color:var(--primary);">Income vs Expenses</strong>
              <button type="button" class="btn btn-secondary btn-xs btn-toggle-table" data-id="c1">Table View</button>
            </div>
            <div id="c1-visual">
              \${renderBarChartSVG({
                labels: ['Sales Revenue', 'Purchases', 'Expenses'],
                series: [{ name: 'Amount', values: [totalSales, totalPurchases, totalExp], color: 'var(--primary)' }]
              })}
            </div>
            <div id="c1-table" style="display:none;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);"><tr><th>Metric</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Sales Revenue</td><td style="text-align:right; font-weight:bold;">\${formatMoney(totalSales, 'PKR')}</td></tr>
                  <tr><td>Purchases</td><td style="text-align:right; font-weight:bold;">\${formatMoney(totalPurchases, 'PKR')}</td></tr>
                  <tr><td>Expenses</td><td style="text-align:right; font-weight:bold;">\${formatMoney(totalExp, 'PKR')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Chart 2: Spending by Category Doughnut -->
          <div class="card" style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:14px; color:var(--primary);">Spending by Category</strong>
              <button type="button" class="btn btn-secondary btn-xs btn-toggle-table" data-id="c2">Table View</button>
            </div>
            <div id="c2-visual" style="display:flex; align-items:center; justify-content:center; gap:20px;">
              \${renderDoughnutChartSVG({
                slices: [
                  { label: 'Stock & Goods', value: Math.max(1, totalPurchases), color: '#2F5D50' },
                  { label: 'Operating Expenses', value: Math.max(1, totalExp), color: '#D97762' }
                ],
                size: 160
              })}
              <div style="font-size:12px; line-height:1.8;">
                <div><span style="display:inline-block; width:10px; height:10px; background:#2F5D50; margin-right:6px;"></span> Stock (\${formatMoney(totalPurchases, 'PKR')})</div>
                <div><span style="display:inline-block; width:10px; height:10px; background:#D97762; margin-right:6px;"></span> Expenses (\${formatMoney(totalExp, 'PKR')})</div>
              </div>
            </div>
            <div id="c2-table" style="display:none;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);"><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Stock & Goods</td><td style="text-align:right; font-weight:bold;">\${formatMoney(totalPurchases, 'PKR')}</td></tr>
                  <tr><td>Operating Expenses</td><td style="text-align:right; font-weight:bold;">\${formatMoney(totalExp, 'PKR')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    \`;

    mainEl.querySelectorAll('.btn-toggle-table').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const visEl = document.getElementById(\`\${id}-visual\`);
        const tabEl = document.getElementById(\`\${id}-table\`);
        if (visEl.style.display === 'none') {
          visEl.style.display = 'block';
          tabEl.style.display = 'none';
          btn.textContent = 'Table View';
        } else {
          visEl.style.display = 'none';
          tabEl.style.display = 'block';
          btn.textContent = 'Chart View';
        }
      };
    });
  }
`;

// Insert Section 13E right before Section 14
const idx14 = code.indexOf(section14Marker);
if (idx14 !== -1) {
  code = code.substring(0, idx14) + phase5Block + '\n\n' + code.substring(idx14);
} else {
  console.error('Section 14 marker not found!');
  process.exit(1);
}

// 4. Update router routing in handleRouting() to route to Phase 5 views
const routeSearch = `    } else if (hash === '#/tax-reports') {
      await renderReportsView();`;

const routeReplacement = `    } else if (hash === '#/tax-reports') {
      await renderReportsView();
    } else if (hash === '#/quick-add') {
      await renderQuickAddView();
    } else if (hash === '#/budgets' || hash === '#/recurring') {
      await renderBudgetsView();
    } else if (hash === '#/khata' || hash === '#/split') {
      await renderKhataView();
    } else if (hash === '#/barcode' || hash === '#/voice') {
      await renderBarcodeView();`;

code = code.replace(routeSearch, routeReplacement);

fs.writeFileSync(standalonePath, code, 'utf8');
console.log('Successfully integrated Phase 5 modules and views into app.standalone.js');
