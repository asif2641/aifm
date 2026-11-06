/**
 * @file config.js
 * @description Application version and build configuration.
 * Bumping APP_VERSION triggers service worker update and cache rotation.
 */

export const APP_VERSION = '1.1.0';

/**
 * Build mode determines access to Demo Loader and Presenter Tools:
 * - 'demo': Demo Loader accessible via topbar badge and Alt+Shift+D for client presentations
 * - 'customer': Clean production build. Demo tab and shortcuts completely excluded.
 */
export const BUILD_MODE = 'demo';

export const APP_NAME = 'Smart Bill Auditor';
export const APP_TAGLINE = 'Intelligent Bill Auditor & Expense Suite';
