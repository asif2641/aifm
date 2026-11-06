/**
 * @file modal.js
 * @description Accessible modal dialog component for Smart Bill Auditor.
 * Traps focus inside the modal, listens for Escape key, and restores focus on close.
 */

import { escapeHTML } from '../core/utils.js';

class ModalManager {
  constructor() {
    this.activeModal = null;
    this.previouslyFocused = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Opens a modal dialog.
   * @param {Object} options
   * @param {string} options.title Modal title
   * @param {string} options.content HTML content
   * @param {Array<Object>} [options.actions] Array of action button objects: { label, class, onClick }
   * @param {Function} [options.onClose] Optional close callback
   */
  open({ title, content, actions = [], onClose = null }) {
    this.close(); // Close existing modal if open

    this.previouslyFocused = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');

    const actionsHtml = actions.map((act, idx) => `
      <button type="button" class="btn ${act.class || 'btn-secondary'}" data-action-idx="${idx}">
        ${escapeHTML(act.label)}
      </button>
    `).join('');

    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">${escapeHTML(title)}</h3>
          <button type="button" class="btn btn-secondary btn-sm btn-icon" id="modal-close-btn" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${actions.length > 0 ? `<div class="modal-footer">${actionsHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    this.activeModal = { overlay, onClose };

    // Attach event listeners
    overlay.querySelector('#modal-close-btn').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Attach action button handlers
    const actionButtons = overlay.querySelectorAll('[data-action-idx]');
    actionButtons.forEach(btn => {
      const idx = parseInt(btn.getAttribute('data-action-idx'), 10);
      const act = actions[idx];
      btn.addEventListener('click', async (e) => {
        if (act && typeof act.onClick === 'function') {
          const shouldClose = await act.onClick(e);
          if (shouldClose !== false) this.close();
        } else {
          this.close();
        }
      });
    });

    document.addEventListener('keydown', this.handleKeyDown);

    // Set focus to the first interactive element or close button
    const firstInteractive = overlay.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstInteractive) {
      firstInteractive.focus();
    }
  }

  /**
   * Closes the active modal and restores focus.
   */
  close() {
    if (!this.activeModal) return;
    const { overlay, onClose } = this.activeModal;

    document.removeEventListener('keydown', this.handleKeyDown);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    this.activeModal = null;

    if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
      this.previouslyFocused.focus();
    }

    if (typeof onClose === 'function') {
      onClose();
    }
  }

  /**
   * Keydown handler for Escape key and Tab focus trapping.
   * @param {KeyboardEvent} e 
   */
  handleKeyDown(e) {
    if (!this.activeModal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = this.activeModal.overlay.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  }
}

export const modal = new ModalManager();
