/**
 * @file vault-view.js
 * @description Receipt Vault view for browsing, filtering, and inspecting stored bills and documents.
 */

import { scopedQuery } from '../../core/data-access.js';
import { formatMoney } from '../../core/money.js';
import { escapeHTML } from '../../core/utils.js';

export async function renderReceiptVault(container, onSelectBill) {
  const transactions = await scopedQuery('transactions').catch(() => []);
  const documents = await scopedQuery('documents').catch(() => []);

  // Map first document thumbnail to transaction
  const docMap = new Map();
  for (const d of documents) {
    if (!docMap.has(d.transactionId)) {
      docMap.set(d.transactionId, d);
    }
  }

  container.innerHTML = `
    <div class="receipt-vault-root" style="max-width:1100px; margin:0 auto;">
      <!-- Vault Header -->
      <div class="card" style="margin-bottom:20px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 style="font-size:20px; margin:0 0 4px 0;">Receipt Vault</h1>
            <p style="color:var(--muted); font-size:13px; margin:0;">Saved bills, invoices, and photo documents stored in IndexedDB.</p>
          </div>
          <a href="#/scan" class="btn btn-primary btn-sm">+ Scan New Bill</a>
        </div>

        <!-- Filter Controls -->
        <div style="display:flex; gap:12px; margin-top:16px; flex-wrap:wrap;">
          <input type="text" class="form-control form-control-sm" id="vault-filter-vendor" placeholder="Filter by Vendor..." style="width:200px;">
          <select class="form-control form-control-sm" id="vault-filter-status" style="width:140px;">
            <option value="all">All Statuses</option>
            <option value="draft">Drafts Only</option>
            <option value="confirmed">Confirmed Only</option>
          </select>
        </div>
      </div>

      <!-- Vault Grid / List -->
      <div id="vault-items-container" class="grid-3" style="gap:16px;"></div>
    </div>
  `;

  function drawItems() {
    const vendorFilter = container.querySelector('#vault-filter-vendor')?.value.toLowerCase().trim() || '';
    const statusFilter = container.querySelector('#vault-filter-status')?.value || 'all';

    const filtered = transactions.filter(t => {
      if (vendorFilter && !t.vendorName?.toLowerCase().includes(vendorFilter)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });

    const itemsMount = container.querySelector('#vault-items-container');
    if (!itemsMount) return;

    if (filtered.length === 0) {
      itemsMount.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding:48px 24px;">
          <div style="font-size:36px; margin-bottom:12px;">📁</div>
          <h3>No Receipts Found</h3>
          <p style="color:var(--muted); font-size:13px;">No bills matched your filter criteria or vault is empty.</p>
          <div style="margin-top:16px;">
            <a href="#/scan" class="btn btn-primary btn-sm">Scan First Bill</a>
          </div>
        </div>
      `;
      return;
    }

    itemsMount.innerHTML = filtered.map(t => {
      const doc = docMap.get(t.id);
      const thumbSrc = doc?.thumbnailUrl || '';
      return `
        <div class="card vault-card" data-id="${t.id}" style="cursor:pointer; padding:0; overflow:hidden; display:flex; flex-direction:column;">
          <div style="height:140px; background:#111; display:flex; align-items:center; justify-content:center; overflow:hidden;">
            ${thumbSrc ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;" alt="Receipt">` : '<span style="color:#666; font-size:24px;">📄</span>'}
          </div>
          <div style="padding:12px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <h4 style="font-size:14px; margin:0; font-weight:700;">${escapeHTML(t.vendorName)}</h4>
                <span class="pill ${t.status === 'confirmed' ? 'pill-success' : 'pill-neutral'}" style="font-size:10px; padding:2px 6px;">
                  ${t.status.toUpperCase()}
                </span>
              </div>
              <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">
                ${t.date} ${t.billNumber ? `&bull; #${escapeHTML(t.billNumber)}` : ''}
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid var(--border); padding-top:8px;">
              <span style="font-size:11px; color:var(--muted);">${t.lineCount || 0} items</span>
              <strong style="font-size:15px; color:var(--primary);">${formatMoney(t.grandTotalMinor, t.currency)}</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');

    itemsMount.querySelectorAll('.vault-card').forEach(c => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-id');
        if (typeof onSelectBill === 'function') onSelectBill(id);
      });
    });
  }

  container.querySelector('#vault-filter-vendor')?.addEventListener('input', drawItems);
  container.querySelector('#vault-filter-status')?.addEventListener('change', drawItems);

  drawItems();
}
