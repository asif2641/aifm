/**
 * @file i18n.js
 * @description Central localization wrapper for Smart Bill Auditor.
 * Resolves translation keys, interpolates variables, and supports future language switching.
 */

import en from '../../i18n/en.js';

let currentLocale = 'en';
const dictionaries = {
  en
};

/**
 * Translates a key using the active dictionary with optional interpolation.
 * @param {string} key 
 * @param {Object} [params={}] 
 * @returns {string}
 */
export function t(key, params = {}) {
  const dict = dictionaries[currentLocale] || dictionaries.en;
  let text = dict[key] || dictionaries.en[key] || key;

  if (params && typeof params === 'object') {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${pKey}}`, 'g'), String(pVal));
    }
  }

  return text;
}

/**
 * Gets the current active language code.
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Sets the active language code.
 * @param {string} locale 
 */
export function setLocale(locale) {
  if (dictionaries[locale]) {
    currentLocale = locale;
  }
}
