/**
 * @file toast.js
 * @description Toast notification manager for Smart Bill Auditor.
 * Displays ephemeral messages, error notifications, and action prompts (e.g. Undo).
 */

import { escapeHTML } from '../core/utils.js';

class ToastManager {
  constructor() {
    this.container = null;
    this.ensureContainer();
  }

  ensureContainer() {
    if (!this.container && typeof document !== 'undefined') {
      let el = document.getElementById('toast-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast-container';
        el.className = 'toast-container';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
      }
      this.container = el;
    }
  }

  /**
   * Shows a toast notification.
   * @param {Object} options
   * @param {string} options.message
   * @param {'info'|'success'|'warning'|'error'} [options.type='info']
   * @param {number} [options.duration=4000] Milliseconds before auto-dismiss (0 for permanent)
   * @param {Object} [options.action] Optional action button: { label, onClick }
   * @returns {Function} Dismiss function
   */
  show({ message, type = 'info', duration = 4000, action = null }) {
    this.ensureContainer();

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;

    let actionBtnHtml = '';
    if (action) {
      actionBtnHtml = `<button type="button" class="btn btn-secondary btn-sm" id="toast-action-btn">${escapeHTML(action.label)}</button>`;
    }

    toastEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span>${escapeHTML(message)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        ${actionBtnHtml}
        <button type="button" class="btn btn-secondary btn-sm btn-icon" id="toast-dismiss-btn" aria-label="Dismiss">✕</button>
      </div>
    `;

    this.container.appendChild(toastEl);

    let dismissTimer = null;

    const dismiss = () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    };

    toastEl.querySelector('#toast-dismiss-btn').addEventListener('click', dismiss);

    if (action) {
      const actBtn = toastEl.querySelector('#toast-action-btn');
      actBtn.addEventListener('click', () => {
        if (typeof action.onClick === 'function') {
          action.onClick();
        }
        dismiss();
      });
    }

    if (duration > 0) {
      dismissTimer = setTimeout(dismiss, duration);
    }

    return dismiss;
  }

  success(message, duration = 4000) {
    return this.show({ message, type: 'success', duration });
  }

  error(message, duration = 6000) {
    return this.show({ message, type: 'error', duration });
  }

  warning(message, duration = 5000) {
    return this.show({ message, type: 'warning', duration });
  }

  info(message, duration = 4000) {
    return this.show({ message, type: 'info', duration });
  }
}

export const toast = new ToastManager();
