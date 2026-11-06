/**
 * @file onboarding.js
 * @description First-run ~60-second onboarding wizard for Smart Bill Auditor.
 * Guides through disclaimer, preset selection, currency, and Admin PBKDF2 PIN setup.
 */

import * as DB from '../../core/db.js';
import * as Auth from '../../core/auth.js';
import * as Modules from '../../core/modules.js';
import { logAction } from '../../core/audit-log.js';
import { CURRENCY_CONFIG } from '../../core/money.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

export function renderOnboarding(onComplete) {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  let currentStep = 1;
  const formData = {
    persona: 'shop',
    businessName: 'My Business',
    currency: 'PKR',
    numberSystem: 'indian',
    adminName: 'Administrator',
    pin: '',
    confirmPin: ''
  };

  function renderStep() {
    let contentHtml = '';

    if (currentStep === 1) {
      // Step 1: Welcome & Disclaimer
      contentHtml = `
        <div class="card" style="max-width: 620px; margin: 40px auto;">
          <div class="card-header">
            <h2 class="card-title">Welcome to Smart Bill Auditor</h2>
            <span class="pill pill-primary">Step 1 of 4</span>
          </div>
          <p style="color: var(--muted); margin-bottom: 20px;">
            A fast, offline-first suite for auditing bills, tracking expenses, and managing financial records.
          </p>

          <div class="panel" style="margin-bottom: 24px; border-left: 3px solid var(--secondary);">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">Important Disclaimer</div>
            <p style="font-size: 13px; color: var(--text); margin: 0;">
              This application is an internal record-keeping and auditing tool. It does not constitute legal, tax, or formal financial accounting advice. Role permissions are administrative controls on a single client device.
            </p>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-primary" id="btn-next">
              I Understand & Agree &rarr;
            </button>
          </div>
        </div>
      `;
    } else if (currentStep === 2) {
      // Step 2: Persona Preset
      contentHtml = `
        <div class="card" style="max-width: 620px; margin: 40px auto;">
          <div class="card-header">
            <h2 class="card-title">Choose Your Operating Profile</h2>
            <span class="pill pill-primary">Step 2 of 4</span>
          </div>
          <p style="color: var(--muted); margin-bottom: 20px;">
            Select a preset to tailor active modules and navigation. You can adjust this anytime in Settings.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
            <label class="panel" style="display: flex; gap: 12px; cursor: pointer; border: 1px solid ${formData.persona === 'shop' ? 'var(--primary)' : 'var(--border)'};">
              <input type="radio" name="preset" value="shop" ${formData.persona === 'shop' ? 'checked' : ''} style="margin-top: 4px;">
              <div>
                <strong style="font-size: 14px;">Shop / Retail & Business (Recommended)</strong>
                <p style="font-size: 12px; color: var(--muted); margin: 2px 0 0 0;">
                  Full business operations: bill scanning, inventory, vendors, customers, cash registers, and shifts.
                </p>
              </div>
            </label>

            <label class="panel" style="display: flex; gap: 12px; cursor: pointer; border: 1px solid ${formData.persona === 'professional' ? 'var(--primary)' : 'var(--border)'};">
              <input type="radio" name="preset" value="professional" ${formData.persona === 'professional' ? 'checked' : ''} style="margin-top: 4px;">
              <div>
                <strong style="font-size: 14px;">Professional / Freelancer</strong>
                <p style="font-size: 12px; color: var(--muted); margin: 2px 0 0 0;">
                  Bill scanning, client accounts, expense claims, tax logs, and financial ledger.
                </p>
              </div>
            </label>

            <label class="panel" style="display: flex; gap: 12px; cursor: pointer; border: 1px solid ${formData.persona === 'household' ? 'var(--primary)' : 'var(--border)'};">
              <input type="radio" name="preset" value="household" ${formData.persona === 'household' ? 'checked' : ''} style="margin-top: 4px;">
              <div>
                <strong style="font-size: 14px;">Household / Family & Student</strong>
                <p style="font-size: 12px; color: var(--muted); margin: 2px 0 0 0;">
                  Streamlined mode: utility bills, grocery receipts, family budgets, and expense splits.
                </p>
              </div>
            </label>
          </div>

          <div style="display: flex; justify-content: space-between;">
            <button type="button" class="btn btn-secondary" id="btn-back">&larr; Back</button>
            <button type="button" class="btn btn-primary" id="btn-next">Next &rarr;</button>
          </div>
        </div>
      `;
    } else if (currentStep === 3) {
      // Step 3: Currency & Business Details
      const currencyOptions = Object.keys(CURRENCY_CONFIG).map(code => `
        <option value="${code}" ${formData.currency === code ? 'selected' : ''}>
          ${code} — ${CURRENCY_CONFIG[code].name} (${CURRENCY_CONFIG[code].symbol})
        </option>
      `).join('');

      contentHtml = `
        <div class="card" style="max-width: 620px; margin: 40px auto;">
          <div class="card-header">
            <h2 class="card-title">Business & Currency Preferences</h2>
            <span class="pill pill-primary">Step 3 of 4</span>
          </div>

          <div class="form-group">
            <label class="form-label">Business or Family Name</label>
            <input type="text" class="form-control" id="inp-business-name" value="${escapeHTML(formData.businessName)}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Operating Currency</label>
            <select class="form-control" id="inp-currency">
              ${currencyOptions}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Number Formatting System</label>
            <div style="display: flex; gap: 16px; margin-top: 6px;">
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                <input type="radio" name="numSystem" value="indian" ${formData.numberSystem === 'indian' ? 'checked' : ''}>
                Indian (Lakh / Crore — 12,34,567.00)
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                <input type="radio" name="numSystem" value="western" ${formData.numberSystem === 'western' ? 'checked' : ''}>
                Western (Million / Billion — 1,234,567.00)
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px;">
            <button type="button" class="btn btn-secondary" id="btn-back">&larr; Back</button>
            <button type="button" class="btn btn-primary" id="btn-next">Next &rarr;</button>
          </div>
        </div>
      `;
    } else if (currentStep === 4) {
      // Step 4: Admin PIN Setup
      contentHtml = `
        <div class="card" style="max-width: 620px; margin: 40px auto;">
          <div class="card-header">
            <h2 class="card-title">Set Administrator Security PIN</h2>
            <span class="pill pill-primary">Step 4 of 4</span>
          </div>
          <p style="color: var(--muted); margin-bottom: 20px;">
            Set a 4 to 6 digit security PIN for your Administrator account. This PIN is hashed locally using WebCrypto PBKDF2.
          </p>

          <div class="form-group">
            <label class="form-label">Admin Name</label>
            <input type="text" class="form-control" id="inp-admin-name" value="${escapeHTML(formData.adminName)}" required>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Security PIN (4-6 Digits)</label>
              <input type="password" class="form-control" id="inp-pin" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="e.g. 1234" required>
            </div>
            <div class="form-group">
              <label class="form-label">Confirm Security PIN</label>
              <input type="password" class="form-control" id="inp-confirm-pin" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="Re-enter PIN" required>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px;">
            <button type="button" class="btn btn-secondary" id="btn-back">&larr; Back</button>
            <button type="button" class="btn btn-primary" id="btn-finish">Finish Setup & Unlock</button>
          </div>
        </div>
      `;
    }

    mainEl.innerHTML = contentHtml;

    // Attach step actions
    const nextBtn = document.getElementById('btn-next');
    const backBtn = document.getElementById('btn-back');
    const finishBtn = document.getElementById('btn-finish');

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentStep === 2) {
          const selected = document.querySelector('input[name="preset"]:checked');
          if (selected) formData.persona = selected.value;
        } else if (currentStep === 3) {
          const nameInput = document.getElementById('inp-business-name');
          const curInput = document.getElementById('inp-currency');
          const numInput = document.querySelector('input[name="numSystem"]:checked');
          if (nameInput && nameInput.value.trim()) formData.businessName = nameInput.value.trim();
          if (curInput) formData.currency = curInput.value;
          if (numInput) formData.numberSystem = numInput.value;
        }
        currentStep++;
        renderStep();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        currentStep--;
        renderStep();
      });
    }

    if (finishBtn) {
      finishBtn.addEventListener('click', async () => {
        const adminNameInput = document.getElementById('inp-admin-name');
        const pinInput = document.getElementById('inp-pin');
        const confirmPinInput = document.getElementById('inp-confirm-pin');

        const adminName = adminNameInput ? adminNameInput.value.trim() : 'Administrator';
        const pin = pinInput ? pinInput.value.trim() : '';
        const confirmPin = confirmPinInput ? confirmPinInput.value.trim() : '';

        if (!/^\d{4,6}$/.test(pin)) {
          alert('Security PIN must be 4 to 6 numeric digits.');
          return;
        }
        if (pin !== confirmPin) {
          alert('PINs do not match. Please verify and re-enter.');
          return;
        }

        // Create Admin user
        const adminUser = await Auth.createUser({
          name: adminName,
          role: 'admin',
          pin
        });

        // Save initial general settings
        await DB.put('settings', {
          key: 'general',
          value: {
            businessName: formData.businessName,
            currency: formData.currency,
            numberSystem: formData.numberSystem,
            persona: formData.persona,
            deleteConfirmation: true,
            idleTimeoutMinutes: 15
          }
        });

        // Apply module preset
        await applyModulePreset(formData.persona);

        // Auto login as admin
        await Auth.login(adminUser.id, pin);

        await logAction({
          action: 'ONBOARDING_COMPLETED',
          entity: 'users',
          entityId: adminUser.id,
          summary: `System initialized by Administrator "${adminName}" with preset "${formData.persona}".`,
          outcome: 'success'
        });

        toast.success(`Welcome, ${adminName}! Setup completed successfully.`);
        if (typeof onComplete === 'function') {
          onComplete();
        }
      });
    }
  }

  renderStep();
}

/**
 * Enables or disables modules according to chosen persona preset.
 * @param {string} preset 
 */
export async function applyModulePreset(preset) {
  const all = Modules.getAllModules();

  for (const mod of all) {
    if (mod.core) continue;

    if (preset === 'household') {
      // Household preset disables complex B2B modules
      const b2b = ['vendors', 'customers', 'inventory', 'purchaseOrders', 'sales', 'taxReports'];
      if (b2b.includes(mod.id)) {
        await Modules.disableModule(mod.id);
      } else {
        await Modules.enableModule(mod.id);
      }
    } else if (preset === 'professional') {
      const shopOnly = ['inventory', 'purchaseOrders'];
      if (shopOnly.includes(mod.id)) {
        await Modules.disableModule(mod.id);
      } else {
        await Modules.enableModule(mod.id);
      }
    } else {
      // Shop / Business enables all default modules
      await Modules.enableModule(mod.id);
    }
  }

  window.dispatchEvent(new CustomEvent('module-state-changed'));
}
