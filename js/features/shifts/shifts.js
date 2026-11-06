/**
 * @file shifts.js
 * @description Point-of-Work Shift Management for Smart Bill Auditor.
 * Staff must open a shift with opening cash before creating records.
 * Generating printable shift closing report with cash counts and payment mode totals to the last paisa.
 */

import * as DB from '../../core/db.js';
import * as Auth from '../../core/auth.js';
import * as Money from '../../core/money.js';
import { store } from '../../core/store.js';
import { logAction } from '../../core/audit-log.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML, formatDate } from '../../core/utils.js';

/**
 * Retrieves the currently open shift for the active user, if any.
 * @returns {Promise<Object|null>}
 */
export async function getActiveShift() {
  const user = Auth.getCurrentUser();
  if (!user) return null;

  const openShifts = await DB.getAllByIndex('shifts', 'compound_user_status', [user.id, 'open']);
  return openShifts.length > 0 ? openShifts[0] : null;
}

/**
 * Prompts user to open a new shift by entering opening cash.
 * @param {Function} [onShiftOpened] 
 */
export function promptOpenShift(onShiftOpened) {
  const user = Auth.getCurrentUser();
  if (!user) {
    toast.error('Authentication required to open shift.');
    return;
  }

  modal.open({
    title: 'Open Work Shift',
    content: `
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
        Opening a shift records your drawer start time and opening cash. All records created during this shift will be stamped with your User and Shift IDs.
      </p>
      <div class="form-group">
        <label class="form-label">Drawer Opening Cash Amount</label>
        <input type="text" class="form-control" id="modal-opening-cash" placeholder="e.g. 5,000.00" value="0.00" required autofocus>
      </div>
    `,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => true
      },
      {
        label: 'Open Shift Now',
        class: 'btn-primary',
        onClick: async () => {
          const inp = document.getElementById('modal-opening-cash');
          const cashStr = inp ? inp.value : '0';
          const openingCashMinor = Money.parseMoney(cashStr, 'PKR');

          const newShift = {
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            openedAt: new Date().toISOString(),
            closedAt: null,
            openingCashMinor,
            closingCashMinor: null,
            expectedCashMinor: null,
            differenceMinor: null,
            status: 'open',
            notes: ''
          };

          const savedShift = await DB.put('shifts', newShift);
          DB.setContext(user.id, savedShift.id);
          store.setState({ activeShift: savedShift });

          await logAction({
            action: 'SHIFT_OPEN',
            entity: 'shifts',
            entityId: savedShift.id,
            summary: `Shift opened by ${user.name} with Opening Cash: ${Money.formatMoney(openingCashMinor, 'PKR')}.`,
            outcome: 'success'
          });

          toast.success('Shift opened successfully.');
          if (typeof onShiftOpened === 'function') onShiftOpened(savedShift);
          return true;
        }
      }
    ]
  });
}

/**
 * Prompts user to close their active shift with counted cash reconciliation.
 * @param {Object} shift 
 * @param {Function} [onShiftClosed] 
 */
export async function promptCloseShift(shift, onShiftClosed) {
  const user = Auth.getCurrentUser();

  // Calculate shift figures from source transactions
  const txList = await DB.getAllByIndex('transactions', 'compound_createdBy_shiftId', [shift.userId, shift.id]);

  let totalCashIn = 0;
  let totalCashOut = 0;
  let countsByMode = { cash: 0, credit: 0, bank: 0, card: 0, wallet: 0 };
  let totalsByMode = { cash: 0, credit: 0, bank: 0, card: 0, wallet: 0 };

  for (const t of txList) {
    const mode = t.paymentMode || 'cash';
    if (countsByMode[mode] !== undefined) countsByMode[mode]++;
    if (totalsByMode[mode] !== undefined) {
      totalsByMode[mode] = Money.add(totalsByMode[mode], t.grandTotalMinor || 0);
    }

    if (mode === 'cash') {
      if (t.type === 'sale' || t.type === 'income') {
        totalCashIn = Money.add(totalCashIn, t.grandTotalMinor || 0);
      } else if (t.type === 'purchase' || t.type === 'expense' || t.type === 'return') {
        totalCashOut = Money.add(totalCashOut, t.grandTotalMinor || 0);
      }
    }
  }

  // Expected Cash = Opening Cash + Cash In - Cash Out
  const expectedCashMinor = Money.sub(Money.add(shift.openingCashMinor, totalCashIn), totalCashOut);

  modal.open({
    title: 'Close Shift & Cash Count',
    content: `
      <div style="font-size: 13px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
          <span style="color: var(--muted);">Shift Opened:</span>
          <span>${formatDate(shift.openedAt)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
          <span style="color: var(--muted);">Opening Cash:</span>
          <strong>${Money.formatMoney(shift.openingCashMinor, 'PKR')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
          <span style="color: var(--muted);">Total Transactions Entered:</span>
          <span>${txList.length}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
          <span style="color: var(--muted);">Calculated Expected Cash:</span>
          <strong style="color: var(--primary);">${Money.formatMoney(expectedCashMinor, 'PKR')}</strong>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Physical Counted Cash in Drawer</label>
        <input type="text" class="form-control" id="modal-counted-cash" placeholder="Enter physically counted cash" value="${Money.formatMoney(expectedCashMinor, 'PKR', { showSymbol: false })}" required autofocus>
      </div>

      <div class="form-group">
        <label class="form-label">Shift Notes / Remarks</label>
        <textarea class="form-control" id="modal-shift-notes" rows="2" placeholder="Optional notes..."></textarea>
      </div>
    `,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => true
      },
      {
        label: 'Reconcile & Close Shift',
        class: 'btn-primary',
        onClick: async () => {
          const countedInput = document.getElementById('modal-counted-cash');
          const notesInput = document.getElementById('modal-shift-notes');

          const countedStr = countedInput ? countedInput.value : '0';
          const countedCashMinor = Money.parseMoney(countedStr, 'PKR');
          const diffMinor = Money.sub(countedCashMinor, expectedCashMinor);

          const closedShift = {
            ...shift,
            closedAt: new Date().toISOString(),
            closingCashMinor: countedCashMinor,
            expectedCashMinor,
            differenceMinor: diffMinor,
            status: 'closed',
            notes: notesInput ? notesInput.value.trim() : ''
          };

          await DB.put('shifts', closedShift);
          DB.setContext(user ? user.id : 'system', 'none');
          store.setState({ activeShift: null });

          await logAction({
            action: 'SHIFT_CLOSE',
            entity: 'shifts',
            entityId: closedShift.id,
            summary: `Shift closed. Counted: ${Money.formatMoney(countedCashMinor, 'PKR')} | Expected: ${Money.formatMoney(expectedCashMinor, 'PKR')} | Diff: ${Money.formatMoney(diffMinor, 'PKR')}.`,
            outcome: 'success'
          });

          toast.success('Shift closed successfully.');
          renderPrintableShiftReport(closedShift, txList, totalsByMode);
          if (typeof onShiftClosed === 'function') onShiftClosed(closedShift);
          return true;
        }
      }
    ]
  });
}

/**
 * Renders a printable Shift Closing Report dialog.
 */
export function renderPrintableShiftReport(shift, txList = [], totalsByMode = {}) {
  const reportHtml = `
    <div id="printable-shift-report" style="padding: 16px; background: white; color: #1E201E; font-size: 13px; font-family: monospace;">
      <div style="text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 12px;">
        <h2 style="font-size: 18px; margin: 0 0 4px 0;">SHIFT CLOSING REPORT</h2>
        <div>Smart Bill Auditor</div>
        <div>Staff: <strong>${escapeHTML(shift.userName || shift.userId)}</strong></div>
        <div>Shift ID: <code>${shift.id.slice(0, 8)}</code></div>
      </div>

      <div style="margin-bottom: 12px; line-height: 1.6;">
        <div>Opened: ${formatDate(shift.openedAt)}</div>
        <div>Closed: ${formatDate(shift.closedAt)}</div>
        <div>Transactions Logged: ${txList.length}</div>
      </div>

      <div style="border-top: 1px dashed #333; border-bottom: 1px dashed #333; padding: 8px 0; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Opening Cash:</span>
          <span>${Money.formatMoney(shift.openingCashMinor, 'PKR')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Expected Cash:</span>
          <span>${Money.formatMoney(shift.expectedCashMinor || 0, 'PKR')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>Counted Cash:</span>
          <span>${Money.formatMoney(shift.closingCashMinor || 0, 'PKR')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid #ddd; margin-top: 4px; padding-top: 4px;">
          <span>Difference / Variance:</span>
          <span style="color: ${shift.differenceMinor === 0 ? 'green' : 'red'};">
            ${Money.formatMoney(shift.differenceMinor || 0, 'PKR')}
          </span>
        </div>
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <button type="button" class="btn btn-primary" onclick="window.print()">Print Report</button>
      </div>
    </div>
  `;

  modal.open({
    title: 'Shift Closing Summary',
    content: reportHtml,
    actions: [
      { label: 'Close', class: 'btn-secondary', onClick: () => true }
    ]
  });
}
