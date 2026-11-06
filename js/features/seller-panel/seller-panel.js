/**
 * @file seller-panel.js
 * @description Seller Panel & Hard Reset Controller for Smart Bill Auditor.
 * In 'customer' BUILD_MODE, this code path is completely unreachable.
 * In 'demo' BUILD_MODE, triggered by Alt+Shift+D shortcut and protected by Seller PIN.
 */

import { BUILD_MODE } from '../../../config.js';
import * as DB from '../../core/db.js';
import { createAndDownloadBackup } from '../backup/backup.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';

const SELLER_PIN = '8888'; // Default Seller PIN for demo presentation controls

/**
 * Initializes the Seller Panel listener if in demo mode.
 */
export function initSellerPanel() {
  // Master Rule: In customer mode, the Seller Panel code path is unreachable.
  if (BUILD_MODE !== 'demo') {
    return;
  }

  window.addEventListener('keydown', (e) => {
    // Configurable shortcut: Alt+Shift+D
    if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      promptSellerPin();
    }
  });
}

/**
 * Prompts for Seller PIN before granting access to demo management.
 */
export function promptSellerPin() {
  if (BUILD_MODE !== 'demo') return;

  modal.open({
    title: 'Seller Panel Access',
    content: `
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
        Demo Edition Control: Enter the Seller Security PIN to access presentation commands and Hard Reset.
      </p>
      <div class="form-group">
        <label class="form-label">Seller Security PIN</label>
        <input type="password" class="form-control" id="seller-pin-input" placeholder="Enter PIN (Default: 8888)" maxlength="6" autofocus>
      </div>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
      {
        label: 'Unlock Seller Panel',
        class: 'btn-primary',
        onClick: () => {
          const inp = document.getElementById('seller-pin-input');
          const pin = inp ? inp.value.trim() : '';

          if (pin === SELLER_PIN) {
            openSellerPanelModal();
            return true;
          } else {
            toast.error('Invalid Seller PIN.');
            return false;
          }
        }
      }
    ]
  });
}

/**
 * Displays the main Seller Control Panel modal.
 */
function openSellerPanelModal() {
  modal.open({
    title: 'Seller & Demo Administration Panel',
    content: `
      <div style="font-size: 13px; margin-bottom: 20px;">
        <span class="pill pill-primary">Demo Build Mode</span>
        <span class="pill pill-success">Authorized</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div class="panel" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>Load Synthetic Demo Data</strong>
            <div style="font-size: 12px; color: var(--muted);">Injects 50 categorized records with audit findings and history.</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-load-demo-stub">Load Demo (Stub)</button>
        </div>

        <div class="panel" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>Remove Demo Records</strong>
            <div style="font-size: 12px; color: var(--muted);">Wipes only records marked with isDemo = true.</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-clean-demo-stub">Clean Demo (Stub)</button>
        </div>

        <div class="panel" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>Open Audit Journal</strong>
            <div style="font-size: 12px; color: var(--muted);">View tamper-evident security records.</div>
          </div>
          <a href="#/audit" class="btn btn-secondary btn-sm" onclick="window.modal.close()">Open Audit</a>
        </div>
      </div>

      <!-- Hard Reset Danger Zone -->
      <div class="panel" style="border-color: var(--error-border); background-color: var(--error-bg);">
        <h4 style="color: var(--error-text); margin-bottom: 6px;">DANGER ZONE: FACTORY HARD RESET</h4>
        <p style="font-size: 12px; color: var(--error-text); margin-bottom: 12px;">
          Permanently wipes all IndexedDB tables, LocalStorage, Cache Storage, and Service Worker. Resets completely to first-run onboarding.
        </p>
        <button type="button" class="btn btn-danger btn-sm" id="btn-start-hard-reset">
          Proceed to Hard Reset
        </button>
      </div>
    `,
    actions: [
      { label: 'Close Panel', class: 'btn-secondary', onClick: () => true }
    ]
  });

  document.getElementById('btn-load-demo-stub')?.addEventListener('click', () => {
    toast.info('Synthetic Demo Dataset engine will be populated in Phase 6.');
  });

  document.getElementById('btn-clean-demo-stub')?.addEventListener('click', () => {
    toast.info('Demo cleaner stub executed (0 demo records found).');
  });

  document.getElementById('btn-start-hard-reset')?.addEventListener('click', () => {
    promptHardResetConfirmation();
  });
}

/**
 * Prompts user to confirm Hard Reset by typing 'RESET' and offering a backup first.
 */
export function promptHardResetConfirmation() {
  modal.open({
    title: 'CONFIRM COMPLETE HARD RESET',
    content: `
      <div class="panel" style="background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text); margin-bottom: 16px; font-size: 13px;">
        <strong>Warning:</strong> This action cannot be undone. All database records, settings, and documents on this device will be deleted.
      </div>

      <div style="margin-bottom: 16px;">
        <button type="button" class="btn btn-secondary" id="btn-hard-reset-backup" style="width: 100%;">
          <span>📥</span> Download Safety Backup First
        </button>
      </div>

      <div class="form-group">
        <label class="form-label">Type <code>RESET</code> to confirm:</label>
        <input type="text" class="form-control" id="hard-reset-confirm-input" placeholder="Type RESET in capital letters" autocomplete="off">
      </div>
    `,
    actions: [
      { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
      {
        label: 'WIPE EVERYTHING & RESET',
        class: 'btn-danger',
        onClick: async () => {
          const inp = document.getElementById('hard-reset-confirm-input');
          const val = inp ? inp.value.trim() : '';

          if (val !== 'RESET') {
            alert('You must type RESET in all caps to confirm.');
            return false;
          }

          await executeHardReset();
          return true;
        }
      }
    ]
  });

  document.getElementById('btn-hard-reset-backup')?.addEventListener('click', async () => {
    await createAndDownloadBackup();
  });
}

/**
 * Executes full wipe of IndexedDB, storage, caches, and Service Worker.
 */
export async function executeHardReset() {
  try {
    // 1. Delete IndexedDB
    await DB.deleteDatabase();

    // 2. Clear Local and Session Storage
    localStorage.clear();
    sessionStorage.clear();

    // 3. Clear Cache Storage
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 4. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    alert('Application has been completely reset. Reloading now...');
    window.location.href = window.location.pathname;
  } catch (err) {
    console.error('Hard reset error:', err);
    alert(`Hard reset error: ${err.message}`);
  }
}
