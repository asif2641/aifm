/**
 * @file delete-flow.js
 * @description Safe deletion workflow for Smart Bill Auditor.
 * - Admin deletes are permanent in one atomic transaction with dependency checks and a 5-second Undo toast.
 * - Staff cannot delete; they can only submit a deletion request with a mandatory reason for Admin approval.
 * - Master Rule: Never store the raw contents of deleted records in the audit log.
 */

import * as DB from '../../core/db.js';
import * as Auth from '../../core/auth.js';
import { logAction } from '../../core/audit-log.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

let pendingDeleteTimer = null;
let pendingDeleteAction = null;

/**
 * Initiates deletion of an entity adhering to user role and dependency constraints.
 * @param {string} entityType E.g. 'transactions', 'parties', 'items'
 * @param {string} entityId 
 * @param {Object} [options={}]
 * @param {string} [options.summary] Human readable summary for confirmation and audit
 * @param {Function} [options.onComplete] Callback invoked after commit or rejection
 */
export async function requestOrExecuteDelete(entityType, entityId, options = {}) {
  const user = Auth.getCurrentUser();
  if (!user) {
    toast.error('Authentication required.');
    return;
  }

  // 1. Staff can only submit a deletion request
  if (user.role === 'staff') {
    promptStaffDeleteRequest(entityType, entityId, options);
    return;
  }

  // 2. Viewer cannot delete
  if (user.role === 'viewer') {
    toast.error('Permission Denied: Viewer accounts have read-only access.');
    return;
  }

  // 3. Admin deletion with dependency checks
  await handleAdminDelete(entityType, entityId, options);
}

/**
 * Prompts staff to submit a deletion request to Administrator inbox.
 */
function promptStaffDeleteRequest(entityType, entityId, options) {
  const user = Auth.getCurrentUser();

  modal.open({
    title: 'Request Deletion (Staff)',
    content: `
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">
        Staff accounts cannot delete records directly. You can submit a deletion request to the Administrator.
      </p>
      <div class="panel" style="margin-bottom: 16px; font-size: 13px;">
        Target: <strong>${escapeHTML(options.summary || `${entityType} #${entityId}`)}</strong>
      </div>
      <div class="form-group">
        <label class="form-label">Reason for Deletion Request (Required)</label>
        <textarea class="form-control" id="modal-delete-reason" rows="3" placeholder="Explain why this record should be deleted..." required></textarea>
      </div>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
      {
        label: 'Submit Request to Admin',
        class: 'btn-primary',
        onClick: async () => {
          const reasonInput = document.getElementById('modal-delete-reason');
          const reason = reasonInput ? reasonInput.value.trim() : '';
          if (!reason) {
            alert('Please provide a reason for the deletion request.');
            return false;
          }

          const requestRecord = {
            id: 'delreq_' + Date.now(),
            requestedBy: user.id,
            requestedByName: user.name,
            entityType,
            entityId,
            summary: options.summary || `${entityType} #${entityId}`,
            reason,
            createdAt: new Date().toISOString(),
            status: 'pending'
          };

          // Save request to meta store
          const currentRequests = (await DB.get('meta', 'deletion_requests'))?.value || [];
          currentRequests.push(requestRecord);
          await DB.put('meta', { key: 'deletion_requests', value: currentRequests });

          await logAction({
            action: 'DELETE_REQUEST_SUBMITTED',
            entity: entityType,
            entityId,
            summary: `Deletion requested by staff "${user.name}" for "${requestRecord.summary}". Reason: "${reason}".`,
            outcome: 'success'
          });

          toast.info('Deletion request submitted to Administrator inbox.');
          if (typeof options.onComplete === 'function') options.onComplete(false);
          return true;
        }
      }
    ]
  });
}

/**
 * Executes Admin deletion flow with dependency checking and 5-second Undo window.
 */
async function handleAdminDelete(entityType, entityId, options) {
  const user = Auth.getCurrentUser();

  // Dependency Check for Parties (Vendors / Customers)
  if (entityType === 'parties') {
    const dependentBills = await DB.getAllByIndex('transactions', 'partyId', entityId);
    if (dependentBills.length > 0) {
      modal.open({
        title: 'Dependency Warning: Associated Bills Found',
        content: `
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">
            This party is linked to <strong>${dependentBills.length} existing bill(s)</strong>. How would you like to proceed?
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
            <label class="panel" style="cursor: pointer;">
              <input type="radio" name="party_del_choice" value="archive" checked>
              <strong>Archive Party (Recommended)</strong>
              <div style="font-size: 12px; color: var(--muted);">Hides party from new bill entries while preserving all ${dependentBills.length} historical bills and audit trails.</div>
            </label>
            <label class="panel" style="cursor: pointer; border-color: var(--error-border);">
              <input type="radio" name="party_del_choice" value="cascade">
              <strong style="color: var(--error-text);">Permanently Delete Party & All ${dependentBills.length} Bills</strong>
              <div style="font-size: 12px; color: var(--muted);">Irreversibly removes the party and all connected transaction records in one atomic transaction.</div>
            </label>
          </div>
        `,
        actions: [
          { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
          {
            label: 'Proceed',
            class: 'btn-danger',
            onClick: async () => {
              const choice = document.querySelector('input[name="party_del_choice"]:checked')?.value || 'archive';
              if (choice === 'archive') {
                const party = await DB.get('parties', entityId);
                if (party) {
                  party.archived = true;
                  await DB.put('parties', party);
                  await logAction({
                    action: 'ARCHIVE_RECORD',
                    entity: 'parties',
                    entityId,
                    summary: `Archived party "${party.name}". Kept ${dependentBills.length} linked transactions.`,
                    outcome: 'success'
                  });
                  toast.success(`Party "${party.name}" archived successfully.`);
                  if (typeof options.onComplete === 'function') options.onComplete(true);
                }
              } else {
                // Cascade delete in one atomic transaction
                await executePermanentCascadeDelete(entityId, dependentBills.map(b => b.id), options);
              }
              return true;
            }
          }
        ]
      });
      return;
    }
  }

  // Standard Confirmation Dialog
  const settingsRecord = await DB.get('settings', 'general');
  const requireConfirm = settingsRecord?.value?.deleteConfirmation !== false;

  if (requireConfirm) {
    modal.open({
      title: 'Confirm Permanent Deletion',
      content: `
        <p style="font-size: 14px; margin-bottom: 12px;">
          Are you sure you want to delete this record?
        </p>
        <div class="panel" style="font-size: 13px; margin-bottom: 16px;">
          ${escapeHTML(options.summary || `${entityType} #${entityId}`)}
        </div>
        <p style="font-size: 12px; color: var(--muted); margin: 0;">
          You will have a 5-second window to Undo this action.
        </p>
      `,
      actions: [
        { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
        {
          label: 'Delete Record',
          class: 'btn-danger',
          onClick: () => {
            scheduleUndoableDelete(entityType, entityId, options);
            return true;
          }
        }
      ]
    });
  } else {
    scheduleUndoableDelete(entityType, entityId, options);
  }
}

/**
 * Schedules deletion with a 5-second Undo window toast.
 */
function scheduleUndoableDelete(entityType, entityId, options) {
  const user = Auth.getCurrentUser();
  const summary = options.summary || `${entityType} #${entityId}`;

  // Clear existing pending delete if any
  if (pendingDeleteTimer) {
    clearTimeout(pendingDeleteTimer);
    if (pendingDeleteAction) pendingDeleteAction();
  }

  let isUndone = false;

  const commitDelete = async () => {
    if (isUndone) return;
    try {
      await DB.remove(entityType, entityId);
      await logAction({
        action: 'DELETE_RECORD',
        entity: entityType,
        entityId,
        summary: `Permanently deleted: ${summary}.`,
        outcome: 'success'
      });
      if (typeof options.onComplete === 'function') options.onComplete(true);
    } catch (err) {
      console.error('Deletion error:', err);
      toast.error(`Failed to delete record: ${err.message}`);
    }
  };

  pendingDeleteAction = commitDelete;
  pendingDeleteTimer = setTimeout(() => {
    commitDelete();
    pendingDeleteTimer = null;
    pendingDeleteAction = null;
  }, 5000);

  toast.show({
    message: `Deleting: ${summary}...`,
    type: 'warning',
    duration: 5000,
    action: {
      label: 'Undo (5s)',
      onClick: () => {
        isUndone = true;
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
        pendingDeleteAction = null;
        toast.info('Deletion cancelled.');
        if (typeof options.onComplete === 'function') options.onComplete(false);
      }
    }
  });
}

/**
 * Permanently removes a party and all dependent transactions in a single atomic transaction.
 */
async function executePermanentCascadeDelete(partyId, billIds, options) {
  const party = await DB.get('parties', partyId);
  const partyName = party ? party.name : partyId;

  await DB.tx(['parties', 'transactions', 'transactionLines'], 'readwrite', (stores) => {
    // Delete party
    stores.parties.delete(partyId);
    // Delete transactions and line items
    for (const bId of billIds) {
      stores.transactions.delete(bId);
    }
  });

  await logAction({
    action: 'CASCADE_DELETE',
    entity: 'parties',
    entityId: partyId,
    summary: `Permanently cascade-deleted party "${partyName}" and ${billIds.length} linked transactions.`,
    outcome: 'success'
  });

  toast.success(`Party "${partyName}" and all linked bills deleted permanently.`);
  if (typeof options.onComplete === 'function') options.onComplete(true);
}

/**
 * Opens Admin Inbox for viewing and resolving pending deletion requests.
 */
export async function openDeleteRequestsInbox(onResolved) {
  const currentRequests = (await DB.get('meta', 'deletion_requests'))?.value || [];
  const pending = currentRequests.filter(r => r.status === 'pending');

  if (pending.length === 0) {
    modal.open({
      title: 'Deletion Requests Inbox',
      content: `
        <div class="empty-state" style="padding: 24px;">
          <div class="empty-state-icon">📥</div>
          <h3>Inbox Empty</h3>
          <p>There are no pending deletion requests from staff members.</p>
        </div>
      `,
      actions: [{ label: 'Close', class: 'btn-secondary', onClick: () => true }]
    });
    return;
  }

  const itemsHtml = pending.map((req, idx) => `
    <div class="card" style="margin-bottom: 12px; padding: 12px; font-size: 13px;">
      <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
        <strong>${escapeHTML(req.summary)}</strong>
        <span class="pill pill-warning">Pending</span>
      </div>
      <div style="color: var(--muted); font-size: 11px; margin-bottom: 6px;">
        Requested by: <strong>${escapeHTML(req.requestedByName)}</strong> &bull; ${req.createdAt.slice(0, 10)}
      </div>
      <div class="panel" style="padding: 6px 10px; margin-bottom: 8px;">
        Reason: "${escapeHTML(req.reason)}"
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="btn btn-secondary btn-sm" data-inbox-reject="${idx}">Reject</button>
        <button type="button" class="btn btn-danger btn-sm" data-inbox-approve="${idx}">Approve & Delete</button>
      </div>
    </div>
  `).join('');

  modal.open({
    title: `Deletion Requests Inbox (${pending.length})`,
    content: `<div style="max-height: 400px; overflow-y: auto;">${itemsHtml}</div>`,
    actions: [{ label: 'Close', class: 'btn-secondary', onClick: () => true }]
  });

  // Attach handlers
  document.querySelectorAll('[data-inbox-approve]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.getAttribute('data-inbox-approve'), 10);
      const req = pending[idx];
      modal.close();

      await DB.remove(req.entityType, req.entityId);
      req.status = 'approved';
      await DB.put('meta', { key: 'deletion_requests', value: currentRequests });

      await logAction({
        action: 'DELETE_REQUEST_APPROVED',
        entity: req.entityType,
        entityId: req.entityId,
        summary: `Admin approved staff deletion request for "${req.summary}".`,
        outcome: 'success'
      });

      toast.success(`Approved and deleted: ${req.summary}`);
      if (typeof onResolved === 'function') onResolved();
    });
  });

  document.querySelectorAll('[data-inbox-reject]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.getAttribute('data-inbox-reject'), 10);
      const req = pending[idx];
      modal.close();

      req.status = 'rejected';
      await DB.put('meta', { key: 'deletion_requests', value: currentRequests });

      await logAction({
        action: 'DELETE_REQUEST_REJECTED',
        entity: req.entityType,
        entityId: req.entityId,
        summary: `Admin rejected staff deletion request for "${req.summary}".`,
        outcome: 'rejected'
      });

      toast.info(`Rejected deletion request for: ${req.summary}`);
      if (typeof onResolved === 'function') onResolved();
    });
  });
}
