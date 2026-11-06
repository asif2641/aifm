/**
 * @file settings.js
 * @description Comprehensive Settings view for Smart Bill Auditor.
 * Features tabs for General, Features & Presets, Security & Users, Data & Backup, About, and Factory Reset.
 */

import { APP_VERSION, BUILD_MODE } from '../../../config.js';
import * as DB from '../../core/db.js';
import * as Auth from '../../core/auth.js';
import * as Modules from '../../core/modules.js';
import { CURRENCY_CONFIG } from '../../core/money.js';
import { createAndDownloadBackup, promptRestoreFromFile } from '../backup/backup.js';
import { promptHardResetConfirmation } from '../seller-panel/seller-panel.js';
import { openDeleteRequestsInbox } from '../delete-flow/delete-flow.js';
import { logAction } from '../../core/audit-log.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

let activeTab = 'general';

export async function renderSettings() {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  const user = Auth.getCurrentUser();
  const isAdmin = user && user.role === 'admin';

  // Load existing settings
  const genSettings = (await DB.get('settings', 'general'))?.value || {
    businessName: 'My Business',
    currency: 'PKR',
    numberSystem: 'indian',
    taxRateBp: 1500,
    deleteConfirmation: true,
    idleTimeoutMinutes: 15
  };

  const lastBackupAt = (await DB.get('meta', 'last_backup_at'))?.value || null;

  function render() {
    const tabs = [
      { id: 'general', label: 'General' },
      { id: 'features', label: 'Features & Presets' },
      { id: 'security', label: 'Security & Users' },
      { id: 'data', label: 'Data & Backup' },
      { id: 'about', label: 'About' },
      { id: 'reset', label: 'Factory Reset' }
    ];

    const tabNavHtml = tabs.map(t => `
      <button type="button" class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-tab-id="${t.id}" style="border-bottom: 2px solid ${activeTab === t.id ? 'var(--primary)' : 'transparent'};">
        ${t.label}
      </button>
    `).join('');

    mainEl.innerHTML = `
      <div class="card" style="margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 style="font-size: 22px; margin-bottom: 4px;">Application Settings</h1>
            <p style="color: var(--muted); margin: 0; font-size: 13px;">Manage business preferences, security, backups, and feature toggles.</p>
          </div>
          ${isAdmin ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-open-inbox">
              <span>📥</span> Deletion Requests Inbox
            </button>
          ` : ''}
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-top: 16px;">
          ${tabNavHtml}
        </div>
      </div>

      <div id="settings-tab-content"></div>
    `;

    // Tab click listeners
    mainEl.querySelectorAll('[data-tab-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTab = e.currentTarget.getAttribute('data-tab-id');
        render();
      });
    });

    const inboxBtn = document.getElementById('btn-open-inbox');
    if (inboxBtn) {
      inboxBtn.addEventListener('click', () => {
        openDeleteRequestsInbox();
      });
    }

    renderActiveTabContent(genSettings, lastBackupAt, isAdmin);
  }

  render();
}

function renderActiveTabContent(genSettings, lastBackupAt, isAdmin) {
  const container = document.getElementById('settings-tab-content');
  if (!container) return;

  if (activeTab === 'general') {
    const curOptions = Object.keys(CURRENCY_CONFIG).map(c => `
      <option value="${c}" ${genSettings.currency === c ? 'selected' : ''}>
        ${c} — ${CURRENCY_CONFIG[c].name} (${CURRENCY_CONFIG[c].symbol})
      </option>
    `).join('');

    container.innerHTML = `
      <div class="card" style="max-width: 680px;">
        <h3 class="card-title" style="margin-bottom: 16px;">General Configuration</h3>

        <div class="form-group">
          <label class="form-label">Business / Entity Name</label>
          <input type="text" class="form-control" id="gen-business-name" value="${escapeHTML(genSettings.businessName || '')}" ${!isAdmin ? 'disabled' : ''}>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Operating Currency</label>
            <select class="form-control" id="gen-currency" ${!isAdmin ? 'disabled' : ''}>
              ${curOptions}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Default Tax Rate (%)</label>
            <input type="number" step="0.1" class="form-control" id="gen-tax-rate" value="${(genSettings.taxRateBp || 1500) / 100}" ${!isAdmin ? 'disabled' : ''}>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Number Formatting Standard</label>
          <div style="display: flex; gap: 16px; margin-top: 6px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
              <input type="radio" name="gen_num_system" value="indian" ${genSettings.numberSystem === 'indian' ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              Indian System (Lakh / Crore)
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
              <input type="radio" name="gen_num_system" value="western" ${genSettings.numberSystem === 'western' ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              Western System (Million / Billion)
            </label>
          </div>
        </div>

        ${isAdmin ? `
          <div style="margin-top: 24px;">
            <button type="button" class="btn btn-primary" id="btn-save-general">Save Preferences</button>
          </div>
        ` : '<p style="color:var(--muted); font-size:12px;">Settings can only be modified by an Administrator.</p>'}
      </div>
    `;

    document.getElementById('btn-save-general')?.addEventListener('click', async () => {
      const name = document.getElementById('gen-business-name')?.value.trim() || 'My Business';
      const curr = document.getElementById('gen-currency')?.value || 'PKR';
      const taxRateStr = document.getElementById('gen-tax-rate')?.value || '15';
      const taxParts = taxRateStr.trim().split('.');
      const taxWhole = parseInt(taxParts[0] || '0', 10);
      const taxFrac = (taxParts[1] || '').padEnd(2, '0').slice(0, 2);
      const taxRateBp = (taxWhole * 100) + parseInt(taxFrac || '0', 10);

      const updated = {
        ...genSettings,
        businessName: name,
        currency: curr,
        taxRateBp: taxRateBp,
        numberSystem: numSys
      };

      await DB.put('settings', { key: 'general', value: updated });
      await logAction({
        action: 'SETTINGS_UPDATE',
        entity: 'settings',
        summary: `General settings updated. Business: "${name}", Currency: "${curr}".`,
        outcome: 'success'
      });

      toast.success('General settings saved successfully.');
    });

  } else if (activeTab === 'features') {
    container.innerHTML = `
      <div class="card" style="margin-bottom: 20px;">
        <h3 class="card-title" style="margin-bottom: 8px;">Persona Presets</h3>
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
          Applying a preset immediately configures active modules to match your operating workflow.
        </p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" data-apply-preset="shop">Retail & Shop (Full)</button>
          <button type="button" class="btn btn-secondary btn-sm" data-apply-preset="professional">Professional / Freelancer</button>
          <button type="button" class="btn btn-secondary btn-sm" data-apply-preset="household">Household / Family (Simple)</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title" style="margin-bottom: 12px;">Feature Modules</h3>
        <div id="settings-modules-list"></div>
      </div>
    `;

    // Render modules registry list
    import('../system-check/system-check.js').then(sys => {
      const listEl = document.getElementById('settings-modules-list');
      if (listEl) {
        listEl.id = 'modules-table-container';
        sys.renderModulesTable();
      }
    });

    container.querySelectorAll('[data-apply-preset]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const preset = e.currentTarget.getAttribute('data-apply-preset');
        if (confirm(`Apply the "${preset.toUpperCase()}" feature preset? This will enable and disable corresponding modules.`)) {
          const { applyModulePreset } = await import('../auth/onboarding.js');
          await applyModulePreset(preset);
          toast.success(`Preset "${preset}" applied.`);
        }
      });
    });

  } else if (activeTab === 'security') {
    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">User Accounts & Roles</h3>
            ${isAdmin ? `<button type="button" class="btn btn-primary btn-sm" id="btn-add-user">+ Add User</button>` : ''}
          </div>
          <div id="users-table-container">Loading users...</div>
        </div>

        <div class="card">
          <h3 class="card-title" style="margin-bottom: 16px;">Security Controls</h3>

          <div class="form-group">
            <label class="form-label">Idle Auto-Lock Screen</label>
            <select class="form-control" id="sec-idle-lock" ${!isAdmin ? 'disabled' : ''}>
              <option value="5" ${genSettings.idleTimeoutMinutes === 5 ? 'selected' : ''}>Lock after 5 minutes of inactivity</option>
              <option value="15" ${genSettings.idleTimeoutMinutes === 15 ? 'selected' : ''}>Lock after 15 minutes of inactivity</option>
              <option value="30" ${genSettings.idleTimeoutMinutes === 30 ? 'selected' : ''}>Lock after 30 minutes of inactivity</option>
              <option value="0" ${genSettings.idleTimeoutMinutes === 0 ? 'selected' : ''}>Never lock automatically</option>
            </select>
          </div>

          <div class="form-group" style="margin-top: 20px;">
            <label class="toggle-switch">
              <input type="checkbox" class="toggle-input" id="sec-del-confirm" ${genSettings.deleteConfirmation !== false ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span style="font-size: 13px; font-weight: 600;">Ask for confirmation before deleting records</span>
            </label>
          </div>

          ${isAdmin ? `
            <div style="margin-top: 24px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-save-security">Save Security Settings</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    renderUsersTable();

    document.getElementById('btn-add-user')?.addEventListener('click', () => {
      promptAddUserModal();
    });

    document.getElementById('btn-save-security')?.addEventListener('click', async () => {
      const idleMin = parseInt(document.getElementById('sec-idle-lock')?.value || '15', 10);
      const delConfirm = document.getElementById('sec-del-confirm')?.checked;

      const updated = {
        ...genSettings,
        idleTimeoutMinutes: idleMin,
        deleteConfirmation: delConfirm
      };

      await DB.put('settings', { key: 'general', value: updated });
      Auth.setIdleTimeoutMinutes(idleMin);
      toast.success('Security settings saved.');
    });

  } else if (activeTab === 'data') {
    // Calculate days since last backup
    let backupWarningHtml = '';
    if (lastBackupAt) {
      const daysAgo = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo >= 7) {
        backupWarningHtml = `
          <div class="notice-banner" style="background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text); margin-bottom: 16px;">
            <span>⚠️</span>
            <div><strong>Backup Warning:</strong> Your last safety backup was <strong>${daysAgo} days ago</strong>. We strongly recommend downloading a fresh backup now.</div>
          </div>
        `;
      }
    } else {
      backupWarningHtml = `
        <div class="notice-banner" style="margin-bottom: 16px;">
          <span>ℹ️</span>
          <div>No backup recorded on this device yet. Please download a backup to keep your records safe.</div>
        </div>
      `;
    }

    container.innerHTML = `
      ${backupWarningHtml}

      <div class="grid-2">
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 12px;">Backup & Export</h3>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
            Generates a self-contained JSON backup with SHA-256 cryptographic checksum. Excludes API keys by default.
          </p>
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 16px;">
            Last Backup: <strong>${lastBackupAt ? lastBackupAt.slice(0, 19).replace('T', ' ') : 'Never'}</strong>
          </div>
          <button type="button" class="btn btn-primary" id="btn-download-backup">
            <span>📥</span> Download Backup JSON
          </button>
        </div>

        <div class="card">
          <h3 class="card-title" style="margin-bottom: 12px;">Restore Data</h3>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
            Restore from a previous backup file using either Replace mode or safe Merge mode.
          </p>
          <label class="btn btn-secondary" style="display: inline-flex; cursor: pointer;">
            <span>📤</span> Select Backup File to Restore
            <input type="file" id="inp-restore-file" accept=".json" style="display: none;">
          </label>
        </div>
      </div>
    `;

    document.getElementById('btn-download-backup')?.addEventListener('click', async () => {
      await createAndDownloadBackup();
      renderSettings();
    });

    document.getElementById('inp-restore-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await promptRestoreFromFile(file, () => renderSettings());
      }
    });

  } else if (activeTab === 'about') {
    container.innerHTML = `
      <div class="card" style="max-width: 680px;">
        <h3 class="card-title" style="margin-bottom: 12px;">Smart Bill Auditor & Expense Suite</h3>
        <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">
          Version <strong>${APP_VERSION}</strong> &bull; Build Mode: <strong>${BUILD_MODE.toUpperCase()}</strong>
        </p>

        <div class="panel" style="margin-bottom: 16px; font-size: 13px;">
          <strong>Legal & Compliance Disclaimer:</strong>
          <p style="margin: 4px 0 0 0; color: var(--muted);">
            This software is designed as an internal record-keeping, auditing, and calculation utility. It is not a substitute for formal accounting, tax advisory, or legal counsel. Multi-user role controls are administrative safeguards for a single shared device.
          </p>
        </div>

        <div class="panel" style="font-size: 13px;">
          <strong>AI & Privacy Guarantee:</strong>
          <p style="margin: 4px 0 0 0; color: var(--muted);">
            All AI operations utilize Bring-Your-Own-Key (BYOK). Your credentials and scanned bills are only transmitted directly to the configured provider API, never stored on any intermediary servers.
          </p>
        </div>

        ${BUILD_MODE === 'demo' ? `
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-seller-panel-shortcut">
              <span>🛠️</span> Open Seller & Demo Panel (Alt+Shift+D)
            </button>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btn-seller-panel-shortcut')?.addEventListener('click', () => {
      import('../seller-panel/seller-panel.js').then(sp => sp.promptSellerPin());
    });

  } else if (activeTab === 'reset') {
    container.innerHTML = `
      <div class="card" style="max-width: 680px; border-color: var(--error-border);">
        <h3 class="card-title" style="color: var(--error-text); margin-bottom: 12px;">Factory Reset</h3>
        <p style="font-size: 13px; color: var(--error-text); margin-bottom: 16px;">
          Factory Reset completely deletes all IndexedDB tables, transactions, vendor files, and settings on this device.
        </p>

        <div style="margin-bottom: 16px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-download-backup">
            <span>📥</span> Download Safety Backup First
          </button>
        </div>

        <div class="form-group">
          <label style="display: flex; gap: 8px; font-size: 13px; cursor: pointer; align-items: flex-start;">
            <input type="checkbox" id="chk-reset-ack" style="margin-top: 3px;">
            <span>I confirm that I want to wipe all records and reset the application to its first-run state.</span>
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">Type <code>RESET</code> to proceed:</label>
          <input type="text" class="form-control" id="inp-reset-word" placeholder="Type RESET in capital letters" disabled>
        </div>

        <button type="button" class="btn btn-danger" id="btn-execute-factory-reset" disabled>
          Execute Factory Reset
        </button>
      </div>
    `;

    const chk = document.getElementById('chk-reset-ack');
    const inp = document.getElementById('inp-reset-word');
    const btn = document.getElementById('btn-execute-factory-reset');

    chk?.addEventListener('change', () => {
      inp.disabled = !chk.checked;
      btn.disabled = !chk.checked || inp.value.trim() !== 'RESET';
    });

    inp?.addEventListener('input', () => {
      btn.disabled = !chk.checked || inp.value.trim() !== 'RESET';
    });

    document.getElementById('btn-reset-download-backup')?.addEventListener('click', async () => {
      await createAndDownloadBackup();
    });

    btn?.addEventListener('click', () => {
      promptHardResetConfirmation();
    });
  }
}

async function renderUsersTable() {
  const container = document.getElementById('users-table-container');
  if (!container) return;

  const users = await DB.getAll('users');
  const rows = users.map(u => `
    <tr>
      <td><strong>${escapeHTML(u.name)}</strong></td>
      <td><span class="pill ${u.role === 'admin' ? 'pill-primary' : 'pill-neutral'}">${u.role.toUpperCase()}</span></td>
      <td><span class="pill ${u.active !== false ? 'pill-success' : 'pill-error'}">${u.active !== false ? 'Active' : 'Inactive'}</span></td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-secondary btn-sm" data-reset-pin="${u.id}">Reset PIN</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="table-container" style="margin: 0;">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-reset-pin]').forEach(b => {
    b.addEventListener('click', (e) => {
      const uId = e.currentTarget.getAttribute('data-reset-pin');
      promptResetUserPinModal(uId);
    });
  });
}

function promptAddUserModal() {
  modal.open({
    title: 'Create New User Account',
    content: `
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input type="text" class="form-control" id="new-user-name" placeholder="e.g. Cashier Counter 1" required autofocus>
      </div>

      <div class="form-group">
        <label class="form-label">Role Permissions</label>
        <select class="form-control" id="new-user-role">
          <option value="staff" selected>Staff (Only own bills & shifts; cannot delete)</option>
          <option value="viewer">Viewer (Read-only)</option>
          <option value="admin">Administrator (Full control)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Security PIN (4-6 Digits)</label>
        <input type="password" class="form-control" id="new-user-pin" placeholder="Enter PIN" maxlength="6" required>
      </div>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
      {
        label: 'Create Account',
        class: 'btn-primary',
        onClick: async () => {
          const name = document.getElementById('new-user-name')?.value.trim();
          const role = document.getElementById('new-user-role')?.value || 'staff';
          const pin = document.getElementById('new-user-pin')?.value.trim();

          if (!name || !/^\d{4,6}$/.test(pin)) {
            alert('Please provide a valid name and 4-6 digit numeric PIN.');
            return false;
          }

          await Auth.createUser({ name, role, pin });
          toast.success(`User "${name}" created.`);
          renderUsersTable();
          return true;
        }
      }
    ]
  });
}

function promptResetUserPinModal(userId) {
  modal.open({
    title: 'Reset Security PIN',
    content: `
      <div class="form-group">
        <label class="form-label">New Security PIN (4-6 Digits)</label>
        <input type="password" class="form-control" id="reset-user-pin" placeholder="Enter new PIN" maxlength="6" required autofocus>
      </div>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
      {
        label: 'Update PIN',
        class: 'btn-primary',
        onClick: async () => {
          const pin = document.getElementById('reset-user-pin')?.value.trim();
          if (!/^\d{4,6}$/.test(pin)) {
            alert('PIN must be 4 to 6 numeric digits.');
            return false;
          }
          await Auth.resetUserPin(userId, pin);
          toast.success('User PIN reset successfully.');
          return true;
        }
      }
    ]
  });
}
