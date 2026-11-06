/**
 * @file shifts-view.js
 * @description Shift & Register History view for Smart Bill Auditor.
 * Allows staff and admin to manage drawer shifts, opening/closing cash, and printable reports.
 */

import * as Shifts from './shifts.js';
import * as Auth from '../../core/auth.js';
import * as Money from '../../core/money.js';
import * as DB from '../../core/db.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML, formatDate } from '../../core/utils.js';

export async function renderShiftsView() {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  const user = Auth.getCurrentUser();
  const activeShift = await Shifts.getActiveShift();
  const allShifts = await DB.getAll('shifts');

  // Role scoping: Staff see only own shifts; Admin sees all
  const filteredShifts = user && user.role === 'staff'
    ? allShifts.filter(s => s.userId === user.id)
    : allShifts;

  filteredShifts.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  let activeShiftCard = '';
  if (activeShift) {
    activeShiftCard = `
      <div class="card" style="border-color: var(--primary); background-color: var(--panel); margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="pill pill-success">ACTIVE WORK SHIFT</span>
              <strong>Opened ${formatDate(activeShift.openedAt)}</strong>
            </div>
            <div style="font-size: 13px; color: var(--muted); margin-top: 4px;">
              Drawer Opening Cash: <strong>${Money.formatMoney(activeShift.openingCashMinor, 'PKR')}</strong>
            </div>
          </div>
          <div>
            <button type="button" class="btn btn-primary" id="btn-close-active-shift">
              Close Shift & Reconcile Cash
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    activeShiftCard = `
      <div class="card" style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="font-size: 16px; margin-bottom: 4px;">No Active Shift</h3>
            <p style="font-size: 13px; color: var(--muted); margin: 0;">You must open a shift before creating bills or recording sales.</p>
          </div>
          <div>
            <button type="button" class="btn btn-primary" id="btn-open-new-shift">
              <span>💼</span> Open New Shift
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const rows = filteredShifts.map(s => `
    <tr>
      <td>${formatDate(s.openedAt)}</td>
      <td><strong>${escapeHTML(s.userName || s.userId)}</strong></td>
      <td><span class="pill ${s.status === 'open' ? 'pill-success' : 'pill-neutral'}">${s.status.toUpperCase()}</span></td>
      <td>${Money.formatMoney(s.openingCashMinor, 'PKR')}</td>
      <td>${s.closingCashMinor !== null ? Money.formatMoney(s.closingCashMinor, 'PKR') : '—'}</td>
      <td>
        ${s.differenceMinor !== null ? `
          <span style="color: ${s.differenceMinor === 0 ? 'var(--success-text)' : 'var(--error-text)'}; font-weight: 600;">
            ${Money.formatMoney(s.differenceMinor, 'PKR')}
          </span>
        ` : '—'}
      </td>
      <td style="text-align: right;">
        ${s.status === 'closed' ? `
          <button type="button" class="btn btn-secondary btn-sm" data-view-report="${s.id}">Report</button>
        ` : 'Active'}
      </td>
    </tr>
  `).join('');

  mainEl.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <h1 style="font-size: 22px; margin-bottom: 4px;">Drawer Shifts & Cash Registers</h1>
      <p style="color: var(--muted); margin: 0; font-size: 13px;">
        Track shift opening/closing drawers, payment mode breakdown, and cash variances.
      </p>
    </div>

    ${activeShiftCard}

    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="card-header" style="padding: 16px 20px; margin: 0;">
        <h3 class="card-title">Shift History (${filteredShifts.length})</h3>
      </div>
      <div class="table-container" style="margin: 0; border: none;">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Staff Member</th>
              <th>Status</th>
              <th>Opening Cash</th>
              <th>Closing Cash</th>
              <th>Variance</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">No shifts recorded yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-open-new-shift')?.addEventListener('click', () => {
    Shifts.promptOpenShift(() => renderShiftsView());
  });

  document.getElementById('btn-close-active-shift')?.addEventListener('click', () => {
    if (activeShift) {
      Shifts.promptCloseShift(activeShift, () => renderShiftsView());
    }
  });

  mainEl.querySelectorAll('[data-view-report]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sId = e.currentTarget.getAttribute('data-view-report');
      const shift = await DB.get('shifts', sId);
      if (shift) {
        Shifts.renderPrintableShiftReport(shift);
      }
    });
  });
}
