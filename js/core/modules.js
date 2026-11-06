/**
 * @file modules.js
 * @description Central module registry for Smart Bill Auditor.
 * Navigation, routes, and dashboard cards are dynamically generated ONLY from this registry.
 * Disabling a module hides it and its routes/widgets without ever deleting underlying data.
 */

import * as DB from './db.js';

export const MODULE_GROUPS = [
  { id: 'overview', nameKey: 'group_overview' },
  { id: 'operations', nameKey: 'group_operations' },
  { id: 'catalog', nameKey: 'group_catalog' },
  { id: 'parties', nameKey: 'group_parties' },
  { id: 'finance', nameKey: 'group_finance' },
  { id: 'reports', nameKey: 'group_reports' },
  { id: 'system', nameKey: 'group_system' }
];

/**
 * All planned application modules across phases 1 to 5.
 */
export const MODULE_DEFINITIONS = [
  // Phase 1A & Core
  {
    id: 'system_check',
    nameKey: 'mod_system_check',
    icon: 'cpu',
    group: 'system',
    route: '#/system-check',
    core: true,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },
  {
    id: 'dashboard',
    nameKey: 'mod_dashboard',
    icon: 'dashboard',
    group: 'overview',
    route: '#/',
    core: true,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },
  {
    id: 'settings',
    nameKey: 'nav_settings',
    icon: 'settings',
    group: 'system',
    route: '#/settings',
    core: true,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },
  {
    id: 'shifts',
    nameKey: 'mod_shifts',
    icon: 'briefcase',
    group: 'operations',
    route: '#/shifts',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },

  // Phase 2
  {
    id: 'scan',
    nameKey: 'mod_scan',
    icon: 'camera',
    group: 'operations',
    route: '#/scan',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'vault',
    nameKey: 'mod_vault',
    icon: 'archive',
    group: 'operations',
    route: '#/vault',
    core: false,
    dependsOn: ['scan'],
    defaultEnabled: true,
    isBuilt: false
  },

  // Phase 3 (Audit Viewer is active in 1B)
  {
    id: 'audit',
    nameKey: 'mod_audit',
    icon: 'shield-alert',
    group: 'reports',
    route: '#/audit',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },
  {
    id: 'items',
    nameKey: 'mod_items',
    icon: 'box',
    group: 'catalog',
    route: '#/items',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },

  // Phase 4
  {
    id: 'parties',
    nameKey: 'mod_parties',
    icon: 'users',
    group: 'parties',
    route: '#/parties',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: true
  },
  {
    id: 'inventory',
    nameKey: 'mod_inventory',
    icon: 'layers',
    group: 'catalog',
    route: '#/inventory',
    core: false,
    dependsOn: ['items'],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'purchaseOrders',
    nameKey: 'mod_purchase_orders',
    icon: 'file-text',
    group: 'operations',
    route: '#/purchase-orders',
    core: false,
    dependsOn: ['parties', 'items'],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'sales',
    nameKey: 'mod_sales',
    icon: 'shopping-cart',
    group: 'operations',
    route: '#/sales',
    core: false,
    dependsOn: ['parties'],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'ledger',
    nameKey: 'mod_ledger',
    icon: 'book',
    group: 'finance',
    route: '#/ledger',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'taxReports',
    nameKey: 'mod_tax_reports',
    icon: 'pie-chart',
    group: 'reports',
    route: '#/tax-reports',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },

  // Phase 5
  {
    id: 'quickAdd',
    nameKey: 'mod_quick_add',
    icon: 'zap',
    group: 'operations',
    route: '#/quick-add',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'budgets',
    nameKey: 'mod_budgets',
    icon: 'trending-up',
    group: 'finance',
    route: '#/budgets',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'recurring',
    nameKey: 'mod_recurring',
    icon: 'repeat',
    group: 'finance',
    route: '#/recurring',
    core: false,
    dependsOn: [],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'barcode',
    nameKey: 'mod_barcode',
    icon: 'maximize',
    group: 'operations',
    route: '#/barcode',
    core: false,
    dependsOn: ['items'],
    defaultEnabled: true,
    isBuilt: false
  },
  {
    id: 'voice',
    nameKey: 'mod_voice',
    icon: 'mic',
    group: 'operations',
    route: '#/voice',
    core: false,
    dependsOn: [],
    defaultEnabled: false,
    isBuilt: false
  }
];

// In-memory module status cache
let moduleStateMap = new Map();
let isInitialized = false;

/**
 * Initializes the module registry, loading persisted enable/disable states from settings store.
 * @returns {Promise<void>}
 */
export async function initModules() {
  if (isInitialized) return;

  // Load defaults first
  for (const mod of MODULE_DEFINITIONS) {
    moduleStateMap.set(mod.id, mod.core ? true : mod.defaultEnabled);
  }

  try {
    const savedRecord = await DB.get('settings', 'modules_enabled');
    if (savedRecord && savedRecord.value && typeof savedRecord.value === 'object') {
      for (const [id, enabled] of Object.entries(savedRecord.value)) {
        const mod = MODULE_DEFINITIONS.find(m => m.id === id);
        if (mod && !mod.core) {
          moduleStateMap.set(id, Boolean(enabled));
        }
      }
    }
  } catch (err) {
    console.warn('Could not read module settings from DB, using defaults:', err);
  }

  isInitialized = true;
}

/**
 * Persists current module enablement states to IndexedDB settings.
 * @returns {Promise<void>}
 */
async function persistModuleStates() {
  const obj = {};
  for (const [id, enabled] of moduleStateMap.entries()) {
    obj[id] = enabled;
  }
  await DB.put('settings', { key: 'modules_enabled', value: obj });
}

/**
 * Returns all module definitions with current enabled status.
 * @returns {Array<Object>}
 */
export function getAllModules() {
  return MODULE_DEFINITIONS.map(mod => ({
    ...mod,
    enabled: mod.core ? true : (moduleStateMap.get(mod.id) ?? mod.defaultEnabled)
  }));
}

/**
 * Returns only the currently enabled modules.
 * @returns {Array<Object>}
 */
export function getEnabledModules() {
  return getAllModules().filter(m => m.enabled);
}

/**
 * Finds a module definition by ID.
 * @param {string} id 
 * @returns {Object|null}
 */
export function getModule(id) {
  const mod = MODULE_DEFINITIONS.find(m => m.id === id);
  if (!mod) return null;
  return {
    ...mod,
    enabled: mod.core ? true : (moduleStateMap.get(mod.id) ?? mod.defaultEnabled)
  };
}

/**
 * Enables a module, ensuring its dependencies are also enabled.
 * @param {string} id 
 * @returns {Promise<{ success: boolean, activatedDependencies: string[], message: string }>}
 */
export async function enableModule(id) {
  const mod = MODULE_DEFINITIONS.find(m => m.id === id);
  if (!mod) return { success: false, activatedDependencies: [], message: `Module '${id}' not found` };

  const activatedDeps = [];

  // Enable all dependencies recursively
  for (const depId of mod.dependsOn) {
    if (!moduleStateMap.get(depId)) {
      moduleStateMap.set(depId, true);
      activatedDeps.push(depId);
    }
  }

  moduleStateMap.set(id, true);
  await persistModuleStates();

  return {
    success: true,
    activatedDependencies: activatedDeps,
    message: activatedDeps.length > 0
      ? `Enabled module '${id}' and required dependencies: ${activatedDeps.join(', ')}`
      : `Enabled module '${id}'`
  };
}

/**
 * Disables a module, ensuring dependent modules are also handled.
 * Core modules cannot be disabled.
 * @param {string} id 
 * @returns {Promise<{ success: boolean, disabledDependents: string[], message: string }>}
 */
export async function disableModule(id) {
  const mod = MODULE_DEFINITIONS.find(m => m.id === id);
  if (!mod) return { success: false, disabledDependents: [], message: `Module '${id}' not found` };
  if (mod.core) return { success: false, disabledDependents: [], message: `Cannot disable core module '${id}'` };

  // Find all modules that depend on this one
  const disabledDeps = [];
  for (const other of MODULE_DEFINITIONS) {
    if (other.dependsOn.includes(id) && moduleStateMap.get(other.id)) {
      moduleStateMap.set(other.id, false);
      disabledDeps.push(other.id);
    }
  }

  moduleStateMap.set(id, false);
  await persistModuleStates();

  return {
    success: true,
    disabledDependents: disabledDeps,
    message: disabledDeps.length > 0
      ? `Disabled module '${id}' and dependent modules: ${disabledDeps.join(', ')}`
      : `Disabled module '${id}'`
  };
}
