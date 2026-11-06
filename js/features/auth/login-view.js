/**
 * @file login-view.js
 * @description Clean, accessible PIN login keypad and user switch view.
 * Displays lockout countdown and masked security feedback.
 */

import * as Auth from '../../core/auth.js';
import { toast } from '../../ui/toast.js';
import { escapeHTML } from '../../core/utils.js';

export async function renderLogin(onSuccess) {
  const mainEl = document.getElementById('main-content');
  if (!mainEl) return;

  const users = await Auth.getActiveUsers();
  let selectedUserId = users.length > 0 ? users[0].id : '';
  let pinBuffer = '';
  let countdownInterval = null;

  function render() {
    const lockout = Auth.getLockoutStatus();

    const userOptions = users.map(u => `
      <option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>
        ${escapeHTML(u.name)} (${u.role.toUpperCase()})
      </option>
    `).join('');

    const lockoutBanner = lockout.locked ? `
      <div class="notice-banner" style="margin-bottom: 20px; background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text);">
        <div class="notice-banner-content">
          <span>🔒</span>
          <div>
            <strong>Security Lockout:</strong>
            <span>Too many incorrect attempts. Try again in <span id="lockout-timer">${lockout.remainingSeconds}</span>s.</span>
          </div>
        </div>
      </div>
    ` : '';

    const bullets = Array(6).fill(0).map((_, i) => `
      <div style="width: 14px; height: 14px; border: 2px solid ${i < pinBuffer.length ? 'var(--primary)' : 'var(--border-strong)'}; background-color: ${i < pinBuffer.length ? 'var(--primary)' : 'transparent'};"></div>
    `).join('');

    mainEl.innerHTML = `
      <div class="card" style="max-width: 420px; margin: 40px auto; text-align: center;">
        <div style="margin-bottom: 20px;">
          <span class="brand-badge">Authentication</span>
          <h2 style="font-size: 20px; margin: 8px 0 4px 0;">Enter Security PIN</h2>
          <p style="color: var(--muted); font-size: 13px; margin: 0;">Access your local session</p>
        </div>

        ${lockoutBanner}

        <div class="form-group" style="text-align: left; margin-bottom: 24px;">
          <label class="form-label">User Account</label>
          <select class="form-control" id="login-user-select" ${lockout.locked ? 'disabled' : ''}>
            ${userOptions}
          </select>
        </div>

        <!-- Masked Bullets Display -->
        <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 28px;">
          ${bullets}
        </div>

        <!-- Numeric On-Screen Keypad -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 280px; margin: 0 auto 20px auto;">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
            <button type="button" class="btn btn-secondary keypad-btn" data-digit="${n}" style="font-size: 18px; font-weight: 700; height: 52px;" ${lockout.locked ? 'disabled' : ''}>${n}</button>
          `).join('')}
          <button type="button" class="btn btn-secondary keypad-btn" id="btn-clear" style="font-size: 12px; height: 52px;" ${lockout.locked ? 'disabled' : ''}>CLEAR</button>
          <button type="button" class="btn btn-secondary keypad-btn" data-digit="0" style="font-size: 18px; font-weight: 700; height: 52px;" ${lockout.locked ? 'disabled' : ''}>0</button>
          <button type="button" class="btn btn-secondary keypad-btn" id="btn-backspace" style="font-size: 16px; height: 52px;" ${lockout.locked ? 'disabled' : ''}>⌫</button>
        </div>

        <div>
          <button type="button" class="btn btn-primary" id="btn-submit-pin" style="width: 100%; max-width: 280px;" ${lockout.locked || pinBuffer.length < 4 ? 'disabled' : ''}>
            Unlock Session
          </button>
        </div>
      </div>
    `;

    // Handle user switch
    const selectEl = document.getElementById('login-user-select');
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        selectedUserId = e.target.value;
      });
    }

    // Keypad button listeners
    mainEl.querySelectorAll('[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (pinBuffer.length < 6) {
          pinBuffer += btn.getAttribute('data-digit');
          render();
        }
      });
    });

    const clearBtn = document.getElementById('btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        pinBuffer = '';
        render();
      });
    }

    const backBtn = document.getElementById('btn-backspace');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        pinBuffer = pinBuffer.slice(0, -1);
        render();
      });
    }

    const submitBtn = document.getElementById('btn-submit-pin');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        await executeLogin();
      });
    }

    // Lockout countdown timer
    if (lockout.locked) {
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        const curLockout = Auth.getLockoutStatus();
        if (curLockout.locked) {
          const timerEl = document.getElementById('lockout-timer');
          if (timerEl) timerEl.textContent = curLockout.remainingSeconds;
        } else {
          clearInterval(countdownInterval);
          render();
        }
      }, 1000);
    }
  }

  async function executeLogin() {
    if (!selectedUserId || pinBuffer.length < 4) return;
    const result = await Auth.login(selectedUserId, pinBuffer);

    if (result.success) {
      pinBuffer = '';
      if (countdownInterval) clearInterval(countdownInterval);
      toast.success('Security PIN verified. Welcome back.');
      if (typeof onSuccess === 'function') onSuccess();
    } else {
      pinBuffer = '';
      toast.error(result.message || 'Login failed.');
      render();
    }
  }

  // Allow physical keyboard entry
  const keydownListener = (e) => {
    if (e.key >= '0' && e.key <= '9') {
      if (pinBuffer.length < 6) {
        pinBuffer += e.key;
        render();
      }
    } else if (e.key === 'Backspace') {
      pinBuffer = pinBuffer.slice(0, -1);
      render();
    } else if (e.key === 'Enter') {
      if (pinBuffer.length >= 4) {
        executeLogin();
      }
    }
  };

  window.addEventListener('keydown', keydownListener);
  render();
}
