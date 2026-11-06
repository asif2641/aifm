/**
 * @file audit-view.js
 * @description Audit Journal Viewer for Smart Bill Auditor.
 * Displays append-only immutable security and operation records with filtering and CSV export.
 */

import * as Audit from '../../core/audit-log.js';
import * as Auth from '../../core/auth.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML, formatDate } from '../../core/utils.js';

export async function renderAuditView() {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  const user = Auth.getCurrentUser();
  if (user && user.role !== 'admin') {
    mainEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>Administrator Access Required</h3>
        <p>The Audit Journal is restricted to Administrator accounts.</p>
      </div>
    `;
    return;
  }

  let filters = {
    action: '',
    outcome: ''
  };

  async function loadAndRender() {
    const logs = await Audit.getAuditLogs(filters);

    const rows = logs.map(l => {
      let outcomePill = '';
      if (l.outcome === 'success') outcomePill = '<span class="pill pill-success">SUCCESS</span>';
      else if (l.outcome === 'failure') outcomePill = '<span class="pill pill-error">FAILURE</span>';
      else outcomePill = '<span class="pill pill-warning">REJECTED</span>';

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 11px; color: var(--muted);">${formatDate(l.timestamp)}</td>
          <td>
            <strong>${escapeHTML(l.userName || l.userId)}</strong>
            <div style="font-size: 10px; color: var(--muted);">${l.userRole || ''}</div>
          </td>
          <td><code>${escapeHTML(l.action)}</code></td>
          <td>${escapeHTML(l.summary)}</td>
          <td>${outcomePill}</td>
        </tr>
      `;
    }).join('');

    mainEl.innerHTML = `
      <div class="card" style="margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h1 style="font-size: 22px; margin-bottom: 4px;">Security Audit Journal</h1>
            <p style="color: var(--muted); margin: 0; font-size: 13px;">
              Append-only tamper-evident log of all system authentication, mutations, and shift activities.
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-export-audit-csv">
            <span>📊</span> Export Log to CSV
          </button>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
          <select class="form-control" id="audit-filter-action" style="max-width: 220px; font-size: 12px;">
            <option value="">All Actions</option>
            <option value="LOGIN" ${filters.action === 'LOGIN' ? 'selected' : ''}>Login</option>
            <option value="SHIFT_OPEN" ${filters.action === 'SHIFT_OPEN' ? 'selected' : ''}>Shift Open</option>
            <option value="SHIFT_CLOSE" ${filters.action === 'SHIFT_CLOSE' ? 'selected' : ''}>Shift Close</option>
            <option value="DELETE_RECORD" ${filters.action === 'DELETE_RECORD' ? 'selected' : ''}>Record Deletion</option>
            <option value="DELETE_REQUEST_SUBMITTED" ${filters.action === 'DELETE_REQUEST_SUBMITTED' ? 'selected' : ''}>Delete Request</option>
            <option value="SETTINGS_UPDATE" ${filters.action === 'SETTINGS_UPDATE' ? 'selected' : ''}>Settings Update</option>
            <option value="BACKUP_CREATED" ${filters.action === 'BACKUP_CREATED' ? 'selected' : ''}>Backup Download</option>
          </select>

          <select class="form-control" id="audit-filter-outcome" style="max-width: 180px; font-size: 12px;">
            <option value="">All Outcomes</option>
            <option value="success" ${filters.outcome === 'success' ? 'selected' : ''}>Success</option>
            <option value="failure" ${filters.outcome === 'failure' ? 'selected' : ''}>Failure</option>
            <option value="rejected" ${filters.outcome === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="table-container" style="margin: 0; border: none;">
          <table class="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User / Agent</th>
                <th>Action</th>
                <th>Summary</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted);">No audit events matching criteria.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-export-audit-csv')?.addEventListener('click', () => {
      Audit.downloadAuditLogsCSV(logs);
      toast.success('Audit log CSV exported.');
    });

    document.getElementById('audit-filter-action')?.addEventListener('change', (e) => {
      filters.action = e.target.value;
      loadAndRender();
    });

    document.getElementById('audit-filter-outcome')?.addEventListener('change', (e) => {
      filters.outcome = e.target.value;
      loadAndRender();
    });
  }

  await loadAndRender();
}
