const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'app.standalone.js');
let code = fs.readFileSync(targetFile, 'utf8');

// Locate renderSplitEditor start and vault start
const startMarker = 'async function renderSplitEditor(draft, pages) {';
const endMarker = '  // --- View: Receipt Vault ---';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const newSplitEditorCode = `async function renderSplitEditor(draft, pages) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Review & Edit Bill';

    const parties = await getAll('parties').catch(() => []);
    const vendors = parties.filter(p => p.type === 'vendor').map(p => p.name);
    const history = await getAll('transactions').catch(() => []);

    let currentAuditFindings = [];
    let filterOnlyProblems = false;

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; height: calc(100vh - 120px); min-height:580px;">
        <!-- Top bar -->
        <div class="card" style="margin-bottom:10px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-back">&larr; Back</button>
            <strong style="font-size:15px;">Review Bill</strong>
            <span class="pill pill-primary">\${draft.status.toUpperCase()}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-save-draft">💾 Save Draft</button>
            <button type="button" class="btn btn-primary btn-sm" id="ed-confirm">✓ Confirm & Post</button>
          </div>
        </div>

        <!-- Split Body -->
        <div style="display:flex; flex:1; gap:16px; min-height:0; overflow:hidden;">
          <!-- Left: Image Viewer -->
          <div style="flex:1; min-width:300px; display:flex; flex-direction:column;" id="ed-left-mount"></div>

          <!-- Right: Lines & Header -->
          <div style="flex:1.2; min-width:360px; display:flex; flex-direction:column; overflow-y:auto; padding-right:4px;">
            <!-- Header Meta -->
            <div class="card" style="margin-bottom:12px; padding:12px;">
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Vendor Name</label>
                  <input type="text" class="form-control" id="ed-vendor" value="\${escapeHTML(draft.vendorName || '')}" list="known-v-list" required>
                  <datalist id="known-v-list">\${vendors.map(v => \`<option value="\${escapeHTML(v)}"></option>\`).join('')}</datalist>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill / Invoice #</label>
                  <input type="text" class="form-control" id="ed-bill-no" value="\${escapeHTML(draft.billNumber || '')}">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill Date</label>
                  <input type="date" class="form-control" id="ed-date" value="\${draft.date}">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Payment Mode</label>
                  <select class="form-control" id="ed-pay-mode">
                    <option value="cash" \${draft.paymentMode==='cash'?'selected':''}>Cash (Naqd)</option>
                    <option value="credit" \${draft.paymentMode==='credit'?'selected':''}>Credit (Udhaar)</option>
                    <option value="bank" \${draft.paymentMode==='bank'?'selected':''}>Bank / Online</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Live Audit Summary Bar -->
            <div class="card" style="margin-bottom:12px; padding:10px 14px; background:var(--panel); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div id="ed-audit-badges" style="display:flex; align-items:center; gap:8px;">
                <span class="pill pill-success" style="background:var(--success-bg); color:var(--success-text); border:1px solid currentColor;">✓ Calculations Clean</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none; margin:0; font-weight:600;">
                  <input type="checkbox" id="ed-filter-problems"> Show only problems
                </label>
              </div>
            </div>

            <!-- Lines Table -->
            <div class="card" style="flex:1; display:flex; flex-direction:column; padding:0; overflow:hidden; margin-bottom:12px;">
              <div style="padding:10px 14px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
                <span style="font-weight:bold; font-size:12px;">Line Items (<span id="ed-line-count">\${draft.lines.length}</span>)</span>
                <button type="button" class="btn btn-secondary btn-sm" id="ed-add-line">+ Add Line</button>
              </div>
              <div style="flex:1; overflow-y:auto; max-height:360px;">
                <table class="table" style="font-size:12px; margin:0;">
                  <thead style="position:sticky; top:0; background:var(--panel); z-index:2;">
                    <tr>
                      <th style="width:28px;">#</th>
                      <th>Item</th>
                      <th style="width:65px;">Qty</th>
                      <th style="width:60px;">Unit</th>
                      <th style="width:85px;">Rate</th>
                      <th style="width:90px;">Total</th>
                      <th style="width:30px;"></th>
                    </tr>
                  </thead>
                  <tbody id="ed-lines-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Totals Footer -->
            <div class="card" style="padding:14px; background:var(--card);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:12px;">
                  <div>
                    <label class="form-label" style="font-size:10px;">Discount</label>
                    <input type="text" class="form-control" id="ed-disc" style="width:90px;" value="\${formatMoney(draft.discountMinor, draft.currency, {showSymbol:false})}">
                  </div>
                  <div>
                    <label class="form-label" style="font-size:10px;">Freight</label>
                    <input type="text" class="form-control" id="ed-frt" style="width:90px;" value="\${formatMoney(draft.freightMinor, draft.currency, {showSymbol:false})}">
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px; color:var(--muted);">Grand Total:</div>
                  <strong style="font-size:18px; color:var(--primary);" id="ed-grand-total">\${formatMoney(draft.printedGrandTotalMinor, draft.currency)}</strong>
                </div>
              </div>
              <!-- Invoice Total Audit Discrepancy Notice -->
              <div id="ed-invoice-audit-msg" style="margin-top:10px; display:none; padding:8px 12px; background:rgba(217, 119, 98, 0.08); border:1px solid var(--secondary); font-size:12px; color:var(--secondary); justify-content:space-between; align-items:center;">
                <span id="ed-invoice-audit-text"></span>
                <button type="button" class="btn btn-secondary btn-xs" id="ed-fix-invoice-tot" style="background:#fff;">Fix Grand Total</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    \`;

    const viewer = new StandaloneImageViewer(document.getElementById('ed-left-mount'));
    viewer.setPages(pages);

    function calcTotals() {
      let sub = 0;
      for (const l of draft.lines) sub = add(sub, l.printedLineTotalMinor);
      draft.subtotalMinor = sub;
      let g = sub;
      g = subMoney(g, draft.discountMinor || 0);
      g = add(g, draft.freightMinor || 0);
      draft.printedGrandTotalMinor = g;
      const gtEl = document.getElementById('ed-grand-total');
      if (gtEl) gtEl.textContent = formatMoney(g, draft.currency);
    }

    function recalcAudit() {
      draft.vendorName = document.getElementById('ed-vendor')?.value.trim() || draft.vendorName;
      draft.billNumber = document.getElementById('ed-bill-no')?.value.trim() || draft.billNumber;
      draft.date = document.getElementById('ed-date')?.value || draft.date;

      const res = runCompleteAudit(draft, { history, options: { toleranceMinor: 1 } });
      currentAuditFindings = res.findings || [];

      // Update Audit Badges
      const badgesEl = document.getElementById('ed-audit-badges');
      if (badgesEl) {
        if (res.summary.pass) {
          badgesEl.innerHTML = \`<span class="pill pill-success" style="background:var(--success-bg); color:var(--success-text); border:1px solid currentColor;">✓ Calculations Clean</span>\`;
        } else {
          let h = '';
          if (res.summary.errorCount > 0) {
            h += \`<span class="pill pill-error" style="background:var(--error-bg); color:var(--error-text); border:1px solid currentColor;">\${res.summary.errorCount} Error\${res.summary.errorCount > 1 ? 's' : ''}</span>\`;
          }
          if (res.summary.warningCount > 0) {
            h += \`<span class="pill" style="background:#FFF3CD; color:#856404; border:1px solid #FFEEBA; padding:4px 10px; font-weight:600; font-size:12px;">\${res.summary.warningCount} Warning\${res.summary.warningCount > 1 ? 's' : ''}</span>\`;
          }
          badgesEl.innerHTML = h;
        }
      }

      // Check Invoice Totals Mismatch
      const invFinding = currentAuditFindings.find(f => f.code === AUDIT_FINDING_CODES.INVOICE_TOTAL_MISMATCH);
      const invMsgEl = document.getElementById('ed-invoice-audit-msg');
      const invTxtEl = document.getElementById('ed-invoice-audit-text');
      if (invMsgEl && invTxtEl) {
        if (invFinding) {
          invMsgEl.style.display = 'flex';
          invTxtEl.textContent = \`Discrepancy: Lines sum minus discount + freight is \${formatMoney(invFinding.expected, draft.currency)}, but printed is \${formatMoney(invFinding.actual, draft.currency)} (Diff: \${formatMoney(Math.abs(invFinding.diff), draft.currency)})\`;
          document.getElementById('ed-fix-invoice-tot').onclick = () => {
            draft.printedGrandTotalMinor = invFinding.expected;
            document.getElementById('ed-grand-total').textContent = formatMoney(draft.printedGrandTotalMinor, draft.currency);
            calcTotals();
            recalcAudit();
            renderLines();
          };
        } else {
          invMsgEl.style.display = 'none';
        }
      }
    }

    function renderLines() {
      const tbody = document.getElementById('ed-lines-tbody');
      if (!tbody) return;

      let html = '';
      draft.lines.forEach((l, idx) => {
        const mathFinding = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
        const lineFindings = currentAuditFindings.filter(f => f.lineId === l.id);
        const hasError = !!mathFinding || lineFindings.some(f => f.severity === 'error');
        const hasWarning = lineFindings.some(f => f.severity === 'warning');
        const hike = lineFindings.find(f => f.code === AUDIT_FINDING_CODES.PRICE_HIKE);

        if (filterOnlyProblems && !hasError && !hasWarning) {
          return;
        }

        const rowStyle = mathFinding
          ? 'background: rgba(217, 119, 98, 0.06); border-left: 3px solid var(--secondary); cursor:pointer;'
          : 'cursor:pointer;';

        html += \`
          <tr data-lidx="\${idx}" style="\${rowStyle}">
            <td style="color:var(--muted); font-size:10px; text-align:center;">\${idx+1}</td>
            <td>
              <div style="display:flex; align-items:center;">
                <input type="text" class="form-control form-control-sm ed-cell-name" value="\${escapeHTML(l.nameRaw)}" style="\${l.confidence < 80 ? 'border-color:var(--secondary);' : ''}; flex:1;">
                \${hike ? \`<span class="pill" style="font-size:10px; padding:1px 5px; margin-left:4px; background:#FFF3CD; color:#856404; border:1px solid #FFEEBA; white-space:nowrap;" title="\${escapeHTML(hike.message)}">▲ +\${hike.hikePercent}% hike</span>\` : ''}
              </div>
            </td>
            <td>
              <input type="number" class="form-control form-control-sm ed-cell-qty" value="\${l.qtyBilled}" step="any" min="0.01" style="text-align:right;">
            </td>
            <td>
              <input type="text" class="form-control form-control-sm ed-cell-unit" value="\${escapeHTML(l.unit||'pcs')}">
            </td>
            <td>
              <input type="text" class="form-control form-control-sm ed-cell-rate" value="\${formatMoney(l.unitPriceMinor, draft.currency, {showSymbol:false})}" style="text-align:right;">
            </td>
            <td style="text-align:right; font-weight:bold;">
              <span class="ed-cell-tot">\${formatMoney(l.printedLineTotalMinor, draft.currency)}</span>
            </td>
            <td style="text-align:center;">
              <button type="button" class="ed-del-line" data-i="\${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer;">✕</button>
            </td>
          </tr>
        \`;

        // If row math error exists, render discrepancy alert row directly beneath
        if (mathFinding) {
          const expectedTotal = mathFinding.expected;
          const diff = Math.abs(mathFinding.diff);
          const fixQty = mathFinding.suggestedFixes.find(f => f.type === 'SET_QTY');
          const fixPrice = mathFinding.suggestedFixes.find(f => f.type === 'SET_PRICE');

          html += \`
            <tr class="ed-audit-subrow" style="background: rgba(217, 119, 98, 0.09); font-size:11px;">
              <td colspan="7" style="padding:6px 12px; border-top:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                  <span style="color:var(--secondary); font-weight:600;">
                    ⚠ Math Mismatch &mdash; Printed: \${formatMoney(mathFinding.actual, draft.currency)} | Calculated: \${formatMoney(expectedTotal, draft.currency)} (Diff: \${formatMoney(diff, draft.currency)})
                  </span>
                  <div style="display:flex; gap:4px;">
                    <button type="button" class="btn btn-secondary btn-xs btn-fix-total" data-idx="\${idx}">Fix Total (\${formatMoney(expectedTotal, draft.currency)})</button>
                    \${fixQty ? \`<button type="button" class="btn btn-secondary btn-xs btn-fix-qty" data-idx="\${idx}">Fix Qty (\${fixQty.value})</button>\` : ''}
                    \${fixPrice ? \`<button type="button" class="btn btn-secondary btn-xs btn-fix-price" data-idx="\${idx}">Fix Rate (\${formatMoney(fixPrice.value, draft.currency)})</button>\` : ''}
                  </div>
                </div>
              </td>
            </tr>
          \`;
        }
      });

      tbody.innerHTML = html;
      document.getElementById('ed-line-count').textContent = draft.lines.length;

      tbody.querySelectorAll('tr[data-lidx]').forEach(r => {
        r.onclick = (e) => {
          if (['INPUT','BUTTON'].includes(e.target.tagName)) return;
          const i = parseInt(r.getAttribute('data-lidx'), 10);
          if (draft.lines[i]?.pageIndex) viewer.goToPage(draft.lines[i].pageIndex - 1);
        };
      });

      tbody.querySelectorAll('.ed-cell-name').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          draft.lines[i].nameRaw = e.target.value.trim();
          recalcAudit();
        };
      });
      tbody.querySelectorAll('.ed-cell-qty').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          const q = parseFloat(e.target.value) || 1;
          draft.lines[i].qtyBilled = q;
          const qM = Math.round(q * 1000);
          draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor);
          e.target.closest('tr').querySelector('.ed-cell-tot').textContent = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency);
          calcTotals();
          recalcAudit();
          renderLines();
        };
      });
      tbody.querySelectorAll('.ed-cell-rate').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          draft.lines[i].unitPriceMinor = parseMoney(e.target.value, draft.currency);
          const qM = Math.round((draft.lines[i].qtyBilled || 1) * 1000);
          draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor);
          e.target.closest('tr').querySelector('.ed-cell-tot').textContent = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency);
          calcTotals();
          recalcAudit();
          renderLines();
        };
      });
      tbody.querySelectorAll('.ed-del-line').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          draft.lines.splice(i, 1);
          calcTotals();
          recalcAudit();
          renderLines();
        };
      });

      // One-click Fix Handlers
      tbody.querySelectorAll('.btn-fix-total').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          const l = draft.lines[i];
          const mf = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
          if (mf) {
            l.printedLineTotalMinor = mf.expected;
            calcTotals();
            recalcAudit();
            renderLines();
          }
        };
      });
      tbody.querySelectorAll('.btn-fix-qty').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          const l = draft.lines[i];
          const mf = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
          const fix = mf?.suggestedFixes?.find(f => f.type === 'SET_QTY');
          if (fix) {
            l.qtyBilled = fix.value;
            l.printedLineTotalMinor = mf.actual;
            calcTotals();
            recalcAudit();
            renderLines();
          }
        };
      });
      tbody.querySelectorAll('.btn-fix-price').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          const l = draft.lines[i];
          const mf = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
          const fix = mf?.suggestedFixes?.find(f => f.type === 'SET_PRICE');
          if (fix) {
            l.unitPriceMinor = fix.value;
            l.printedLineTotalMinor = mf.actual;
            calcTotals();
            recalcAudit();
            renderLines();
          }
        };
      });
    }

    document.getElementById('ed-filter-problems').onchange = (e) => {
      filterOnlyProblems = e.target.checked;
      renderLines();
    };

    document.getElementById('ed-vendor').oninput = recalcAudit;
    document.getElementById('ed-bill-no').oninput = recalcAudit;
    document.getElementById('ed-date').onchange = recalcAudit;

    calcTotals();
    recalcAudit();
    renderLines();

    document.getElementById('ed-add-line').onclick = () => {
      draft.lines.push({
        id: 'l_' + Math.random().toString(36).slice(2, 8),
        nameRaw: 'New Item',
        qtyBilled: 1,
        unit: 'pcs',
        unitPriceMinor: 0,
        printedLineTotalMinor: 0,
        taxable: true,
        confidence: 100,
        pageIndex: viewer.curPage + 1
      });
      calcTotals();
      recalcAudit();
      renderLines();
    };

    document.getElementById('ed-disc').oninput = (e) => {
      draft.discountMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
      recalcAudit();
    };
    document.getElementById('ed-frt').oninput = (e) => {
      draft.freightMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
      recalcAudit();
    };

    document.getElementById('ed-back').onclick = () => {
      if (confirm('Discard changes and return to scan?')) renderScanView();
    };

    async function commit(status) {
      const vName = document.getElementById('ed-vendor')?.value.trim();
      if (!vName) return alert('Please enter a vendor name.');
      draft.vendorName = vName;
      draft.billNumber = document.getElementById('ed-bill-no')?.value.trim();
      draft.date = document.getElementById('ed-date')?.value || new Date().toISOString().split('T')[0];
      draft.paymentMode = document.getElementById('ed-pay-mode')?.value || 'cash';
      draft.status = status;

      // Final Audit check on Confirm
      const finalAudit = runCompleteAudit(draft, { history });
      if (status === 'confirmed' && finalAudit.summary.errorCount > 0) {
        const proceed = confirm(\`This bill has \${finalAudit.summary.errorCount} unresolved audit error(s).\\n\\nAre you sure you want to confirm and post anyway?\`);
        if (!proceed) return;
      }

      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
      const txId = draft.id || ('tx_' + Math.random().toString(36).slice(2, 9));

      await tx(['transactions', 'transactionLines', 'documents'], 'readwrite', (stores) => {
        stores.transactions.put({
          id: txId,
          type: 'purchase',
          status,
          currency: draft.currency,
          vendorName: draft.vendorName,
          billNumber: draft.billNumber,
          date: draft.date,
          paymentMode: draft.paymentMode,
          subtotalMinor: draft.subtotalMinor,
          discountMinor: draft.discountMinor,
          freightMinor: draft.freightMinor,
          grandTotalMinor: draft.printedGrandTotalMinor,
          lineCount: draft.lines.length,
          findings: finalAudit.findings || [],
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });
        for (const l of draft.lines) {
          stores.transactionLines.put({
            id: l.id,
            transactionId: txId,
            nameRaw: l.nameRaw,
            qtyBilled: l.qtyBilled,
            unit: l.unit,
            unitPriceMinor: l.unitPriceMinor,
            lineTotalMinor: l.printedLineTotalMinor,
            pageIndex: l.pageIndex || 1,
            createdBy: user.id
          });
        }
        for (const p of pages) {
          stores.documents.put({
            id: p.id,
            transactionId: txId,
            pageIndex: p.pageIndex,
            sha256: p.sha256,
            dHash: p.dHash,
            thumbnailUrl: p.thumbnailUrl,
            vendorName: draft.vendorName,
            billNumber: draft.billNumber,
            date: draft.date,
            createdBy: user.id
          });
        }
      });

      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: status === 'confirmed' ? 'BILL_CONFIRMED' : 'BILL_DRAFT_SAVED',
        summary: \`\${status === 'confirmed' ? 'Confirmed' : 'Draft'} bill from "\${draft.vendorName}" (\${formatMoney(draft.printedGrandTotalMinor, draft.currency)})\`,
        outcome: 'success'
      });

      toast.success(status === 'confirmed' ? 'Bill confirmed successfully!' : 'Bill draft saved.');
      window.location.hash = '#/vault';
    }

    document.getElementById('ed-save-draft').onclick = () => commit('draft');
    document.getElementById('ed-confirm').onclick = () => commit('confirmed');
  }

`;

code = code.substring(0, startIndex) + newSplitEditorCode + code.substring(endIndex);
fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully wired split editor audit into app.standalone.js');
