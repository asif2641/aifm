/**
 * @file router.js
 * @description Lightweight client-side hash router for Smart Bill Auditor.
 * Routes are registered and cross-checked against enabled modules.
 */

import { store } from './store.js';
import * as Modules from './modules.js';

class Router {
  constructor() {
    this.routes = new Map();
    this.notFoundHandler = null;
    this.currentPath = '';

    window.addEventListener('hashchange', () => this.handleHashChange());
  }

  /**
   * Registers a route path and its handler.
   * @param {string} path E.g. '#/', '#/system-check', '#/scan'
   * @param {Function} handler Function that renders or mounts the view
   * @param {string} [moduleId] Associated module ID for enablement check
   */
  register(path, handler, moduleId = null) {
    this.routes.set(path, { handler, moduleId });
  }

  /**
   * Sets the 404 / route-not-found handler.
   * @param {Function} handler 
   */
  setNotFound(handler) {
    this.notFoundHandler = handler;
  }

  /**
   * Navigates to a specific hash route programmatically.
   * @param {string} path 
   */
  navigate(path) {
    if (window.location.hash !== path) {
      window.location.hash = path;
    } else {
      this.handleHashChange();
    }
  }

  /**
   * Resolves current route and executes matching view handler.
   */
  async handleHashChange() {
    const rawHash = window.location.hash || '#/';
    const [pathPart, queryPart] = rawHash.split('?');
    const path = pathPart || '#/';
    this.currentPath = path;

    // Parse query parameters
    const query = {};
    if (queryPart) {
      const sp = new URLSearchParams(queryPart);
      for (const [k, v] of sp.entries()) {
        query[k] = v;
      }
    }

    // Call store.resetTransientState() on route change to prevent stale drafts
    store.resetTransientState();
    store.setState({ currentRoute: path });

    const routeEntry = this.routes.get(path);

    if (routeEntry) {
      // Check if associated module is enabled
      if (routeEntry.moduleId) {
        const mod = Modules.getModule(routeEntry.moduleId);
        if (mod && !mod.enabled) {
          // Module is disabled; redirect or show disabled message
          this.renderDisabledModule(mod);
          return;
        }
      }

      try {
        await routeEntry.handler({ path, query });
      } catch (err) {
        console.error(`Route handler error for "${path}":`, err);
        this.renderError(err);
      }
    } else if (this.notFoundHandler) {
      this.notFoundHandler({ path, query });
    } else {
      this.renderNotFound(path);
    }
  }

  /**
   * Starts router listening and triggers initial navigation.
   */
  start() {
    this.handleHashChange();
  }

  renderDisabledModule(mod) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    mainEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>Module Disabled</h3>
        <p>The module "${mod.id}" is currently disabled in system settings.</p>
        <div style="margin-top: 16px;">
          <a href="#/system-check" class="btn btn-primary">Open System Check</a>
        </div>
      </div>
    `;
  }

  renderNotFound(path) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    mainEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🧭</div>
        <h3>Page Not Found</h3>
        <p>No route registered for <code>${path}</code>.</p>
        <div style="margin-top: 16px;">
          <a href="#/" class="btn btn-primary">Return to Dashboard</a>
        </div>
      </div>
    `;
  }

  renderError(err) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    mainEl.innerHTML = `
      <div class="empty-state" style="border-color: var(--error-border);">
        <div class="empty-state-icon" style="color: var(--error-text);">⚠️</div>
        <h3 style="color: var(--error-text);">View Render Error</h3>
        <p>${err.message || 'An unexpected error occurred while rendering this page.'}</p>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.location.reload()">Reload Application</button>
        </div>
      </div>
    `;
  }
}

export const router = new Router();
