/**
 * @file system-check.js
 * @description Temporary System Check & Diagnostics view for Phase 1A.
 * Displays real-time database status, persistence, service worker cache, and interactive module toggles.
 */

import { APP_VERSION } from '../../../config.js';
import * as DB from '../../core/db.js';
import * as Modules from '../../core/modules.js';
import { t } from '../../core/i18n.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

export async function renderSystemCheck() {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
        <div>
          <h1 style="font-size: 22px; margin-bottom: 6px;">${escapeHTML(t('sys_title'))}</h1>
          <p style="color: var(--muted); margin: 0; font-size: 14px;">${escapeHTML(t('sys_subtitle'))}</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="./tests/money.test.html" target="_blank" class="btn btn-primary btn-sm">
            <span>🧪</span> Money Tests (60+)
          </a>
          <a href="./tests/db.test.html" target="_blank" class="btn btn-secondary btn-sm">
            <span>🗄️</span> DB & Rollback Tests
          </a>
          <a href="./tests/auth-shifts.test.html" target="_blank" class="btn btn-secondary btn-sm">
            <span>🔐</span> Auth & Shifts Tests
          </a>
        </div>
      </div>
    </div>

    <!-- System Diagnostic Metrics -->
    <div class="grid-2" style="margin-bottom: 24px;">
      <div class="card" style="margin-bottom: 0;">
        <div class="card-header">
          <h3 class="card-title">Environment & Storage</h3>
          <span class="pill pill-success" id="db-health-pill">IndexedDB Active</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">${escapeHTML(t('sys_app_version'))}:</span>
            <strong>v${APP_VERSION}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">${escapeHTML(t('sys_db_version'))}:</span>
            <strong>Schema v${DB.DB_VERSION} (${DB.DB_NAME})</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">${escapeHTML(t('sys_storage_status'))}:</span>
            <span id="storage-persist-status" class="pill pill-neutral">Checking...</span>
          </div>
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">${escapeHTML(t('sys_storage_usage'))}:</span>
            <span id="storage-usage-val">Calculating...</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 4px;">
            <span style="color: var(--muted);">${escapeHTML(t('sys_environment'))}:</span>
            <code>${window.location.protocol}//${window.location.host || 'local'}</code>
          </div>
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-request-persist">
            ${escapeHTML(t('btn_request_persist'))}
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 0;">
        <div class="card-header">
          <h3 class="card-title">Service Worker & Cache</h3>
          <span class="pill pill-neutral" id="sw-status-pill">Checking...</span>
        </div>
        <div style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
          Network-First strategy serves instant updates for HTML/JS/CSS, while fonts and vendor libraries are cached locally for offline reliability.
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">Cache Name:</span>
            <code>app-${APP_VERSION}</code>
          </div>
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <span style="color: var(--muted);">Online Status:</span>
            <strong style="color: ${navigator.onLine ? 'var(--success-text)' : 'var(--error-text)'};">
              ${navigator.onLine ? 'Online' : 'Offline'}
            </strong>
          </div>
        </div>
        <div style="margin-top: 24px;">
          <button type="button" class="btn btn-danger btn-sm" id="btn-clear-cache">
            ${escapeHTML(t('btn_clear_cache'))}
          </button>
        </div>
      </div>
    </div>

    <!-- Dynamic Modules Registry -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHTML(t('sys_modules_title'))}</h3>
          <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
            ${escapeHTML(t('sys_modules_desc'))}
          </div>
        </div>
      </div>

      <div id="modules-table-container"></div>
    </div>
  `;

  // Update dynamic telemetry
  updateStorageInfo();
  updateServiceWorkerInfo();
  renderModulesTable();

  // Attach button events
  const btnPersist = document.getElementById('btn-request-persist');
  if (btnPersist) {
    btnPersist.addEventListener('click', async () => {
      const persisted = await DB.requestStoragePersistence();
      if (persisted) {
        toast.success('Persistent storage granted by browser.');
      } else {
        toast.warning('Persistent storage was not granted (browser may manage automatically).');
      }
      updateStorageInfo();
    });
  }

  const btnClear = document.getElementById('btn-clear-cache');
  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (confirm('Clear application cache storage and reload? (Your IndexedDB records will remain completely intact).')) {
        await clearAppCacheAndReload();
      }
    });
  }
}

async function updateStorageInfo() {
  const persistEl = document.getElementById('storage-persist-status');
  const usageEl = document.getElementById('storage-usage-val');

  if (navigator.storage && navigator.storage.persisted) {
    const isPersisted = await navigator.storage.persisted();
    if (persistEl) {
      persistEl.className = isPersisted ? 'pill pill-success' : 'pill pill-warning';
      persistEl.textContent = isPersisted ? t('status_persisted') : t('status_temporary');
    }
  }

  const estimate = await DB.getStorageEstimate();
  if (usageEl) {
    const mbUsed = (estimate.usageBytes / (1024 * 1024)).toFixed(2);
    const mbTotal = (estimate.quotaBytes / (1024 * 1024)).toFixed(0);
    usageEl.textContent = `${mbUsed} MB used of ${mbTotal} MB (${estimate.percentUsed.toFixed(1)}%)`;
  }
}

function updateServiceWorkerInfo() {
  const swPill = document.getElementById('sw-status-pill');
  if (!swPill) return;

  if (window.location.protocol === 'file:') {
    swPill.className = 'pill pill-neutral';
    swPill.textContent = 'Disabled on file://';
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        swPill.className = 'pill pill-success';
        swPill.textContent = 'Active & Registered';
      } else {
        swPill.className = 'pill pill-neutral';
        swPill.textContent = 'Not Registered';
      }
    });
  } else {
    swPill.className = 'pill pill-warning';
    swPill.textContent = 'Not Supported';
  }
}

export function renderModulesTable() {
  const container = document.getElementById('modules-table-container');
  if (!container) return;

  const modules = Modules.getAllModules();

  const rows = modules.map(mod => {
    const isCore = mod.core;
    const isBuilt = mod.isBuilt;
    const checked = mod.enabled ? 'checked' : '';
    const disabledAttr = isCore ? 'disabled' : '';

    let statusBadge = '';
    if (isCore) {
      statusBadge = `<span class="pill pill-primary">${t('status_core')}</span>`;
    } else if (!isBuilt) {
      statusBadge = `<span class="pill pill-neutral">${t('status_coming_soon')}</span>`;
    } else if (mod.enabled) {
      statusBadge = `<span class="pill pill-success">${t('status_active')}</span>`;
    } else {
      statusBadge = `<span class="pill pill-neutral">${t('status_inactive')}</span>`;
    }

    const deps = mod.dependsOn.length > 0 ? mod.dependsOn.join(', ') : '—';

    return `
      <tr>
        <td>
          <div style="font-weight: 600;">${escapeHTML(t(mod.nameKey))}</div>
          <div style="font-size: 11px; color: var(--muted);">ID: <code>${mod.id}</code> &bull; Group: ${mod.group}</div>
        </td>
        <td><code>${mod.route}</code></td>
        <td><span style="font-size: 12px; color: var(--muted);">${deps}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <label class="toggle-switch">
            <input type="checkbox" class="toggle-input" data-module-id="${mod.id}" ${checked} ${disabledAttr}>
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-container" style="margin-bottom: 0;">
      <table class="table">
        <thead>
          <tr>
            <th>Module Name</th>
            <th>Route</th>
            <th>Dependencies</th>
            <th>Status</th>
            <th style="text-align: right;">Toggle</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  // Attach toggle listeners
  const toggles = container.querySelectorAll('.toggle-input');
  toggles.forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const modId = e.target.getAttribute('data-module-id');
      const isEnabled = e.target.checked;

      if (isEnabled) {
        const res = await Modules.enableModule(modId);
        toast.success(res.message);
      } else {
        const res = await Modules.disableModule(modId);
        toast.info(res.message);
      }

      // Re-render table and trigger layout update
      renderModulesTable();
      window.dispatchEvent(new CustomEvent('module-state-changed'));
    });
  });
}

/**
 * Clears application cache storage without touching IndexedDB data, then reloads.
 */
export async function clearAppCacheAndReload() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('app-')).map(k => caches.delete(k))
    );
  }
  window.location.reload();
}
