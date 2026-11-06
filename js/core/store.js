/**
 * @file store.js
 * @description Lightweight reactive UI state store for Smart Bill Auditor.
 * Strictly holds transient UI state (navigation, open drawers, active modals, form drafts).
 * Business data is NEVER stored here; IndexedDB is the single source of truth.
 */

// Initial transient UI state
const initialTransientState = {
  scanDraft: null,
  activeModal: null,
  mobileNavOpen: false,
  formDirty: false
};

class UIStore {
  constructor() {
    this.state = {
      ...initialTransientState,
      currentRoute: '#/',
      currentUser: null,
      activeShift: null,
      serviceWorkerWaiting: false,
      isOffline: !navigator.onLine,
      toasts: []
    };
    this.listeners = new Set();
  }

  /**
   * Returns current snapshot of UI state.
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Updates UI state and notifies registered listeners.
   * @param {Object} partialState 
   */
  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.notify();
  }

  /**
   * Resets all transient and draft states.
   * MUST be called whenever entering any "new entry", "scan", or "create" screen
   * to guarantee that drafts or previous user sessions do not leak.
   */
  resetTransientState() {
    this.setState({
      ...initialTransientState
    });
  }

  /**
   * Subscribes a listener callback to state changes.
   * @param {Function} listener 
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies all subscribers of state mutation.
   */
  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in UIStore listener:', err);
      }
    }
  }

  /**
   * Adds a toast notification.
   * @param {Object} toast 
   */
  addToast(toast) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const item = { id, duration: 4000, type: 'info', ...toast };
    const toasts = [...this.state.toasts, item];
    this.setState({ toasts });

    if (item.duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, item.duration);
    }
    return id;
  }

  /**
   * Removes a toast by id.
   * @param {string} id 
   */
  removeToast(id) {
    const toasts = this.state.toasts.filter(t => t.id !== id);
    this.setState({ toasts });
  }
}

export const store = new UIStore();

// Attach online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => store.setState({ isOffline: false }));
  window.addEventListener('offline', () => store.setState({ isOffline: true }));
}
