/**
 * @file dashboard.js
 * @description Dynamic Dashboard view for Smart Bill Auditor.
 * Dashboard cards are generated ONLY from currently enabled modules in the registry.
 */

import * as Modules from '../../core/modules.js';
import { t } from '../../core/i18n.js';
import { escapeHTML } from '../../core/utils.js';

export async function renderDashboard() {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  const enabledModules = Modules.getEnabledModules().filter(m => m.id !== 'dashboard');

  const cardsHtml = enabledModules.map(mod => {
    const isBuilt = mod.isBuilt;
    const actionBtn = isBuilt
      ? `<a href="${mod.route}" class="btn btn-secondary btn-sm" style="width: 100%;">Open Module</a>`
      : `<button class="btn btn-secondary btn-sm" disabled style="width: 100%; opacity: 0.6;">Phase Deliverable</button>`;

    const statusBadge = isBuilt
      ? `<span class="pill pill-success">${t('status_active')}</span>`
      : `<span class="pill pill-neutral">${t('status_coming_soon')}</span>`;

    return `
      <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 15px;">${escapeHTML(t(mod.nameKey))}</div>
            ${statusBadge}
          </div>
          <p style="font-size: 12px; color: var(--muted); margin-bottom: 16px;">
            Group: <strong>${mod.group}</strong> &bull; Route: <code>${mod.route}</code>
          </p>
        </div>
        <div>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');

  mainEl.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h1 style="font-size: 24px; margin-bottom: 6px;">${escapeHTML(t('app_title'))}</h1>
          <p style="color: var(--muted); margin: 0; font-size: 14px;">${escapeHTML(t('app_tagline'))}</p>
        </div>
        <div>
          <a href="#/system-check" class="btn btn-primary">
            <span>⚙️</span> ${escapeHTML(t('nav_system_check'))}
          </a>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 style="font-size: 16px; font-weight: 700;">Active Application Modules (${enabledModules.length})</h2>
      <span style="font-size: 12px; color: var(--muted);">Dynamically populated from module registry</span>
    </div>

    <div class="grid-3" style="margin-bottom: 24px;">
      ${cardsHtml}
    </div>
  `;
}
