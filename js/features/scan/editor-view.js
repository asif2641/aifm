/**
 * @file editor-view.js
 * @description Split-screen bill review & editing suite.
 * Left pane provides smooth pan/zoom/rotate inspection; right pane provides high-density,
 * fast line-item editing with money.js calculations and atomic transaction posting.
 */

import { ImageViewer } from '../../ui/image-viewer.js';
import { formatMoney, parseMoney, add, sub, lineTotal } from '../../core/money.js';
import { tx, put, getAll, get } from '../../core/db.js';
import { appendAuditLog } from '../../core/audit-log.js';
import { getCurrentUser } from '../../core/auth.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

export class SplitScreenEditor {
  /**
   * @param {HTMLElement} container 
   * @param {Object} draft Initial normalized draft transaction
   * @param {Array<Object>} pages Captured pages with dataUrl
   * @param {Object} options { onSaved: Function, onCancelled: Function }
   */
  constructor(container, draft, pages = [], options = {}) {
    this.container = container;
    this.draft = draft;
    this.pages = pages;
    this.options = options;
    this.activeMobileTab = 'table'; // 'image' | 'table'
    this.isDirty = false;
    this.knownVendors = [];

    this.init();
  }

  async init() {
    // Load vendors for autocomplete
    const parties = await getAll('parties').catch(() => []);
    this.knownVendors = parties.filter(p => p.type === 'vendor').map(p => p.name);

    this.renderLayout();
    this.initViewer();
    this.recalculateTotals();
    this.setupGuard();
  }

  setupGuard() {
    this.beforeUnloadHandler = (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  teardownGuard() {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="split-editor-root" style="display:flex; flex-direction:column; height: calc(100vh - 120px); min-height: 600px;">
        
        <!-- Header Bar -->
        <div class="card" style="margin-bottom: 12px; padding: 12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-editor-back">&larr; Back</button>
            <h2 style="font-size: 16px; margin: 0; font-weight: 700;">Review Bill: <span id="editor-vendor-title">${escapeHTML(this.draft.vendorName || 'New Bill')}</span></h2>
            <span class="pill pill-primary" id="editor-status-pill">${this.draft.status.toUpperCase()}</span>
          </div>

          <!-- Mobile Toggle Switch (shown on small screens) -->
          <div class="mobile-only-toggle" style="display:none;">
            <div style="display:flex; border:1px solid var(--border); border-radius:4px; overflow:hidden;">
              <button type="button" class="btn btn-sm ${this.activeMobileTab === 'image' ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-image">📷 Bill Photo</button>
              <button type="button" class="btn btn-sm ${this.activeMobileTab === 'table' ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-table">📋 Details & Lines</button>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-save-draft">💾 Save Draft</button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-confirm-post">✓ Confirm & Post</button>
          </div>
        </div>

        <!-- Main Body: Split Screen -->
        <div class="split-body" style="display:flex; flex:1; gap:16px; min-height:0; overflow:hidden;">
          
          <!-- Left: Image Viewer Pane -->
          <div class="editor-pane-left" id="editor-left-pane" style="flex:1; min-width:320px; display:flex; flex-direction:column;">
            <div id="image-viewer-mount" style="flex:1; width:100%; height:100%;"></div>
          </div>

          <!-- Right: Bill Header & Lines Pane -->
          <div class="editor-pane-right" id="editor-right-pane" style="flex:1.2; min-width:380px; display:flex; flex-direction:column; overflow-y:auto; padding-right:4px;">
            
            <!-- Metadata Card -->
            <div class="card" style="margin-bottom:12px; padding:16px;">
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Vendor Name</label>
                  <input type="text" class="form-control" id="inp-vendor" value="${escapeHTML(this.draft.vendorName || '')}" list="known-vendors-list" required>
                  <datalist id="known-vendors-list">
                    ${this.knownVendors.map(v => `<option value="${escapeHTML(v)}"></option>`).join('')}
                  </datalist>
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill / Invoice #</label>
                  <input type="text" class="form-control" id="inp-bill-no" value="${escapeHTML(this.draft.billNumber || '')}">
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill Date</label>
                  <input type="date" class="form-control" id="inp-date" value="${this.draft.date}">
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Payment Mode</label>
                  <select class="form-control" id="inp-payment-mode">
                    <option value="cash" ${this.draft.paymentMode === 'cash' ? 'selected' : ''}>Cash (Naqd)</option>
                    <option value="credit" ${this.draft.paymentMode === 'credit' ? 'selected' : ''}>Credit (Udhaar)</option>
                    <option value="bank" ${this.draft.paymentMode === 'bank' ? 'selected' : ''}>Bank / Online</option>
                    <option value="other" ${this.draft.paymentMode === 'other' ? 'selected' : ''}>Other</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Lines Table Card -->
            <div class="card" style="flex:1; display:flex; flex-direction:column; padding:0; overflow:hidden; margin-bottom:12px;">
              <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
                <div style="font-weight:700; font-size:13px;">Line Items (<span id="line-count-display">${this.draft.lines.length}</span>)</div>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-add-line">+ Add Line Item</button>
              </div>

              <!-- Lines Scroll Container -->
              <div style="flex:1; overflow-y:auto; max-height:420px;">
                <table class="table" style="font-size:12px; margin:0;" id="editor-lines-table">
                  <thead style="position:sticky; top:0; background:var(--panel); z-index:2;">
                    <tr>
                      <th style="width:36px;">#</th>
                      <th>Item Description</th>
                      <th style="width:70px;">Qty</th>
                      <th style="width:65px;">Unit</th>
                      <th style="width:90px;">Rate</th>
                      <th style="width:95px;">Total</th>
                      <th style="width:36px;">Tax</th>
                      <th style="width:36px;"></th>
                    </tr>
                  </thead>
                  <tbody id="lines-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Totals & Reconciliation Bar -->
            <div class="card" style="padding:16px; background:var(--card);">
              <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; align-items:flex-end;">
                <div style="display:flex; gap:16px; flex-wrap:wrap;">
                  <div>
                    <label class="form-label" style="font-size:11px;">Discount</label>
                    <input type="text" class="form-control" id="inp-discount" style="width:100px;" value="${formatMoney(this.draft.discountMinor, this.draft.currency, { showSymbol: false })}">
                  </div>
                  <div>
                    <label class="form-label" style="font-size:11px;">Freight / Delivery</label>
                    <input type="text" class="form-control" id="inp-freight" style="width:100px;" value="${formatMoney(this.draft.freightMinor, this.draft.currency, { showSymbol: false })}">
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-size:11px; color:var(--muted); margin-bottom:2px;">Calculated Total: <span id="computed-subtotal-val" style="font-weight:600;">Rs. 0</span></div>
                  <div style="font-size:18px; font-weight:800; color:var(--primary);" id="grand-total-val">Rs. 0</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    this.wireEditorEvents();
    this.renderLinesTable();
  }

  initViewer() {
    const mount = this.container.querySelector('#image-viewer-mount');
    if (mount) {
      this.viewer = new ImageViewer(mount, {
        onPageChange: (pageNum) => {
          // Highlight rows belonging to this page
          this.container.querySelectorAll('.line-row').forEach(row => {
            const rowPage = parseInt(row.getAttribute('data-page-index'), 10);
            row.style.background = rowPage === pageNum ? 'var(--canvas)' : '';
          });
        }
      });
      this.viewer.setPages(this.pages);
    }
  }

  wireEditorEvents() {
    const root = this.container;

    // Mobile tabs
    root.querySelector('#btn-tab-image')?.addEventListener('click', () => this.setMobileTab('image'));
    root.querySelector('#btn-tab-table')?.addEventListener('click', () => this.setMobileTab('table'));

    // Back button
    root.querySelector('#btn-editor-back').addEventListener('click', () => {
      if (this.isDirty && !confirm('You have unsaved changes. Discard and go back?')) return;
      this.teardownGuard();
      if (typeof this.options.onCancelled === 'function') this.options.onCancelled();
    });

    // Add line
    root.querySelector('#btn-add-line').addEventListener('click', () => {
      this.addLine();
    });

    // Discount and freight inputs
    root.querySelector('#inp-discount').addEventListener('input', (e) => {
      this.draft.discountMinor = parseMoney(e.target.value, this.draft.currency);
      this.isDirty = true;
      this.recalculateTotals();
    });

    root.querySelector('#inp-freight').addEventListener('input', (e) => {
      this.draft.freightMinor = parseMoney(e.target.value, this.draft.currency);
      this.isDirty = true;
      this.recalculateTotals();
    });

    // Save Draft & Confirm Actions
    root.querySelector('#btn-save-draft').addEventListener('click', () => this.saveTransaction('draft'));
    root.querySelector('#btn-confirm-post').addEventListener('click', () => this.saveTransaction('confirmed'));
  }

  setMobileTab(tab) {
    this.activeMobileTab = tab;
    const leftPane = this.container.querySelector('#editor-left-pane');
    const rightPane = this.container.querySelector('#editor-right-pane');
    const tabImg = this.container.querySelector('#btn-tab-image');
    const tabTbl = this.container.querySelector('#btn-tab-table');

    if (window.innerWidth <= 768) {
      if (tab === 'image') {
        if (leftPane) leftPane.style.display = 'flex';
        if (rightPane) rightPane.style.display = 'none';
        tabImg.className = 'btn btn-sm btn-primary';
        tabTbl.className = 'btn btn-sm btn-secondary';
      } else {
        if (leftPane) leftPane.style.display = 'none';
        if (rightPane) rightPane.style.display = 'flex';
        tabImg.className = 'btn btn-sm btn-secondary';
        tabTbl.className = 'btn btn-sm btn-primary';
      }
    }
  }

  renderLinesTable() {
    const tbody = this.container.querySelector('#lines-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.draft.lines.map((l, idx) => {
      const isLowConfidence = l.confidence < 80;
      return `
        <tr class="line-row" data-idx="${idx}" data-page-index="${l.pageIndex || 1}" style="cursor:pointer;">
          <td style="color:var(--muted); font-size:11px; text-align:center;">${idx + 1}</td>
          <td>
            <div style="display:flex; flex-direction:column; gap:2px;">
              <input type="text" class="form-control form-control-sm cell-name" value="${escapeHTML(l.nameRaw)}" style="${isLowConfidence ? 'border-color: var(--secondary);' : ''}">
              ${l.nameUrdu ? `<span style="font-size:10px; color:var(--muted); font-family:serif;">${escapeHTML(l.nameUrdu)}</span>` : ''}
            </div>
          </td>
          <td>
            <input type="number" class="form-control form-control-sm cell-qty" value="${l.qtyBilled}" step="any" min="0.001" style="text-align:right;">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm cell-unit" value="${escapeHTML(l.unit || 'pcs')}" style="width:100%;">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm cell-rate" value="${formatMoney(l.unitPriceMinor, this.draft.currency, { showSymbol: false })}" style="text-align:right;">
          </td>
          <td style="text-align:right; font-weight:700;">
            <span class="cell-line-total">${formatMoney(l.printedLineTotalMinor, this.draft.currency)}</span>
          </td>
          <td style="text-align:center;">
            <input type="checkbox" class="cell-taxable" ${l.taxable ? 'checked' : ''}>
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn-delete-line" data-idx="${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer; font-weight:bold;" title="Remove">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    this.container.querySelector('#line-count-display').textContent = this.draft.lines.length;

    // Attach row click to jump viewer to line's page
    tbody.querySelectorAll('.line-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        const pageIdx = parseInt(row.getAttribute('data-page-index'), 10);
        if (this.viewer && pageIdx) {
          this.viewer.goToPage(pageIdx);
        }
      });
    });

    // Wire input changes
    tbody.querySelectorAll('.cell-name').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').getAttribute('data-idx'), 10);
        this.draft.lines[idx].nameRaw = e.target.value.trim();
        this.isDirty = true;
      });
    });

    tbody.querySelectorAll('.cell-qty').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').getAttribute('data-idx'), 10);
        const qty = parseFloat(e.target.value) || 1;
        this.draft.lines[idx].qtyBilled = qty;
        this.draft.lines[idx].qtyReceived = qty;
        this.recalculateLineTotal(idx);
        this.isDirty = true;
      });
    });

    tbody.querySelectorAll('.cell-rate').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').getAttribute('data-idx'), 10);
        this.draft.lines[idx].unitPriceMinor = parseMoney(e.target.value, this.draft.currency);
        this.recalculateLineTotal(idx);
        this.isDirty = true;
      });
    });

    tbody.querySelectorAll('.cell-taxable').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').getAttribute('data-idx'), 10);
        this.draft.lines[idx].taxable = chk.checked;
        this.isDirty = true;
        this.recalculateTotals();
      });
    });

    tbody.querySelectorAll('.btn-delete-line').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.draft.lines.splice(idx, 1);
        this.isDirty = true;
        this.renderLinesTable();
        this.recalculateTotals();
      });
    });
  }

  addLine() {
    this.draft.lines.push({
      id: 'line_' + Math.random().toString(36).slice(2, 9),
      nameRaw: 'New Item',
      nameEnglish: 'New Item',
      nameUrdu: '',
      category: 'General',
      qtyBilled: 1,
      qtyReceived: 1,
      unit: 'pcs',
      unitPriceMinor: 0,
      printedLineTotalMinor: 0,
      taxable: true,
      confidence: 100,
      pageIndex: (this.viewer?.currentPageIndex || 0) + 1
    });
    this.isDirty = true;
    this.renderLinesTable();
    this.recalculateTotals();
  }

  recalculateLineTotal(lineIdx) {
    const l = this.draft.lines[lineIdx];
    if (!l) return;
    const qtyMilli = Math.round(l.qtyBilled * 1000);
    l.printedLineTotalMinor = lineTotal(qtyMilli, l.unitPriceMinor);

    const row = this.container.querySelector(`.line-row[data-idx="${lineIdx}"]`);
    if (row) {
      row.querySelector('.cell-line-total').textContent = formatMoney(l.printedLineTotalMinor, this.draft.currency);
    }
    this.recalculateTotals();
  }

  recalculateTotals() {
    let subtotal = 0;
    for (const l of this.draft.lines) {
      subtotal = add(subtotal, l.printedLineTotalMinor);
    }
    this.draft.subtotalMinor = subtotal;

    let grand = sub(subtotal, this.draft.discountMinor || 0);
    grand = add(grand, this.draft.freightMinor || 0);
    this.draft.printedGrandTotalMinor = grand;

    const subEl = this.container.querySelector('#computed-subtotal-val');
    const grandEl = this.container.querySelector('#grand-total-val');

    if (subEl) subEl.textContent = formatMoney(subtotal, this.draft.currency);
    if (grandEl) grandEl.textContent = formatMoney(grand, this.draft.currency);
  }

  async saveTransaction(status = 'draft') {
    const vendorInp = this.container.querySelector('#inp-vendor')?.value.trim();
    const billNoInp = this.container.querySelector('#inp-bill-no')?.value.trim();
    const dateInp = this.container.querySelector('#inp-date')?.value;
    const paymentModeInp = this.container.querySelector('#inp-payment-mode')?.value;

    if (!vendorInp) {
      alert('Please specify a vendor name.');
      return;
    }

    this.draft.vendorName = vendorInp;
    this.draft.billNumber = billNoInp;
    this.draft.date = dateInp || new Date().toISOString().split('T')[0];
    this.draft.paymentMode = paymentModeInp || 'cash';
    this.draft.status = status;

    const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
    const txId = this.draft.id || ('tx_' + Math.random().toString(36).slice(2, 9));
    this.draft.id = txId;

    try {
      // Execute Atomic Multi-Store Transaction: transactions + transactionLines + documents
      await tx(['transactions', 'transactionLines', 'documents'], 'readwrite', (stores) => {
        // 1. Transaction record
        stores.transactions.put({
          id: txId,
          type: 'purchase',
          status,
          currency: this.draft.currency,
          vendorName: this.draft.vendorName,
          billNumber: this.draft.billNumber,
          date: this.draft.date,
          paymentMode: this.draft.paymentMode,
          subtotalMinor: this.draft.subtotalMinor,
          discountMinor: this.draft.discountMinor,
          freightMinor: this.draft.freightMinor,
          grandTotalMinor: this.draft.printedGrandTotalMinor,
          lineCount: this.draft.lines.length,
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        // 2. Transaction Lines
        for (const l of this.draft.lines) {
          stores.transactionLines.put({
            id: l.id,
            transactionId: txId,
            nameRaw: l.nameRaw,
            nameEnglish: l.nameEnglish,
            nameUrdu: l.nameUrdu,
            category: l.category,
            qtyBilled: l.qtyBilled,
            qtyReceived: l.qtyReceived,
            unit: l.unit,
            unitPriceMinor: l.unitPriceMinor,
            lineTotalMinor: l.printedLineTotalMinor,
            taxable: l.taxable,
            pageIndex: l.pageIndex,
            createdBy: user.id
          });
        }

        // 3. Document Records (images)
        for (const p of this.pages) {
          stores.documents.put({
            id: p.id,
            transactionId: txId,
            pageIndex: p.pageIndex,
            sha256: p.sha256,
            dHash: p.dHash,
            thumbnailUrl: p.thumbnailUrl,
            vendorName: this.draft.vendorName,
            billNumber: this.draft.billNumber,
            date: this.draft.date,
            createdBy: user.id
          });
        }
      });

      // Audit Log append
      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: status === 'confirmed' ? 'BILL_CONFIRMED' : 'BILL_DRAFT_SAVED',
        summary: `${status === 'confirmed' ? 'Confirmed' : 'Saved draft'} purchase bill from "${this.draft.vendorName}" (${formatMoney(this.draft.printedGrandTotalMinor, this.draft.currency)})`,
        outcome: 'success',
        details: { txId, lineCount: this.draft.lines.length }
      });

      this.isDirty = false;
      this.teardownGuard();
      toast.success(status === 'confirmed' ? 'Bill confirmed and posted successfully!' : 'Bill draft saved.');
      
      if (typeof this.options.onSaved === 'function') {
        this.options.onSaved(txId);
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save bill: ' + err.message);
    }
  }
}
