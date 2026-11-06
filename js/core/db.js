/**
 * @file db.js
 * @description Central IndexedDB promise wrapper for Smart Bill Auditor.
 * IndexedDB is the single source of truth for all persistent application data.
 * No other file in the application is permitted to access indexedDB directly.
 */

import { generateUUID } from './utils.js';

export const DB_NAME = 'smart_bill_auditor_db';
export const DB_VERSION = 1;

/**
 * Current runtime context for user and shift stamping.
 */
let currentContext = {
  userId: 'system',
  shiftId: 'none'
};

/**
 * Updates the user and shift context used for automatic record stamping.
 * @param {string} userId 
 * @param {string} shiftId 
 */
export function setContext(userId = 'system', shiftId = 'none') {
  currentContext.userId = userId || 'system';
  currentContext.shiftId = shiftId || 'none';
}

/**
 * Opens or initializes the database with ordered schema migrations.
 * @returns {Promise<IDBDatabase>}
 */
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported by this browser.'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // Migration to Version 1: Setup all 17 initial stores and indexes
      if (oldVersion < 1) {
        // 1. meta
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }

        // 2. settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 3. users
        if (!db.objectStoreNames.contains('users')) {
          const sUsers = db.createObjectStore('users', { keyPath: 'id' });
          sUsers.createIndex('role', 'role', { unique: false });
          sUsers.createIndex('active', 'active', { unique: false });
        }

        // 4. shifts
        if (!db.objectStoreNames.contains('shifts')) {
          const sShifts = db.createObjectStore('shifts', { keyPath: 'id' });
          sShifts.createIndex('userId', 'userId', { unique: false });
          sShifts.createIndex('status', 'status', { unique: false });
          sShifts.createIndex('openedAt', 'openedAt', { unique: false });
          sShifts.createIndex('compound_user_status', ['userId', 'status'], { unique: false });
        }

        // 5. accounts
        if (!db.objectStoreNames.contains('accounts')) {
          const sAccounts = db.createObjectStore('accounts', { keyPath: 'id' });
          sAccounts.createIndex('type', 'type', { unique: false });
          sAccounts.createIndex('archived', 'archived', { unique: false });
        }

        // 6. categories
        if (!db.objectStoreNames.contains('categories')) {
          const sCats = db.createObjectStore('categories', { keyPath: 'id' });
          sCats.createIndex('type', 'type', { unique: false });
          sCats.createIndex('parentId', 'parentId', { unique: false });
          sCats.createIndex('archived', 'archived', { unique: false });
        }

        // 7. parties
        if (!db.objectStoreNames.contains('parties')) {
          const sParties = db.createObjectStore('parties', { keyPath: 'id' });
          sParties.createIndex('type', 'type', { unique: false });
          sParties.createIndex('normalizedName', 'normalizedName', { unique: false });
          sParties.createIndex('archived', 'archived', { unique: false });
          sParties.createIndex('taxId', 'taxId', { unique: false });
        }

        // 8. items
        if (!db.objectStoreNames.contains('items')) {
          const sItems = db.createObjectStore('items', { keyPath: 'id' });
          sItems.createIndex('canonicalName', 'canonicalName', { unique: false });
          sItems.createIndex('sku', 'sku', { unique: false });
          sItems.createIndex('barcode', 'barcode', { unique: false });
          sItems.createIndex('category', 'category', { unique: false });
          sItems.createIndex('archived', 'archived', { unique: false });
        }

        // 9. transactions
        if (!db.objectStoreNames.contains('transactions')) {
          const sTx = db.createObjectStore('transactions', { keyPath: 'id' });
          sTx.createIndex('billDate', 'billDate', { unique: false });
          sTx.createIndex('partyId', 'partyId', { unique: false });
          sTx.createIndex('accountId', 'accountId', { unique: false });
          sTx.createIndex('billNumber', 'billNumber', { unique: false });
          sTx.createIndex('type', 'type', { unique: false });
          sTx.createIndex('status', 'status', { unique: false });
          sTx.createIndex('compound_party_bill_date', ['partyId', 'billNumber', 'billDate'], { unique: false });
          sTx.createIndex('compound_createdBy_shiftId', ['createdBy', 'shiftId'], { unique: false });
        }

        // 10. transactionLines
        if (!db.objectStoreNames.contains('transactionLines')) {
          const sLines = db.createObjectStore('transactionLines', { keyPath: 'id' });
          sLines.createIndex('transactionId', 'transactionId', { unique: false });
          sLines.createIndex('itemId', 'itemId', { unique: false });
          sLines.createIndex('pageIndex', 'pageIndex', { unique: false });
        }

        // 11. documents
        if (!db.objectStoreNames.contains('documents')) {
          const sDocs = db.createObjectStore('documents', { keyPath: 'id' });
          sDocs.createIndex('sha256', 'sha256', { unique: false });
          sDocs.createIndex('groupId', 'groupId', { unique: false });
          sDocs.createIndex('pageIndex', 'pageIndex', { unique: false });
        }

        // 12. stockMovements
        if (!db.objectStoreNames.contains('stockMovements')) {
          const sStock = db.createObjectStore('stockMovements', { keyPath: 'id' });
          sStock.createIndex('itemId', 'itemId', { unique: false });
          sStock.createIndex('transactionId', 'transactionId', { unique: false });
          sStock.createIndex('createdAt', 'createdAt', { unique: false });
          sStock.createIndex('compound_item_date', ['itemId', 'createdAt'], { unique: false });
        }

        // 13. payments
        if (!db.objectStoreNames.contains('payments')) {
          const sPay = db.createObjectStore('payments', { keyPath: 'id' });
          sPay.createIndex('partyId', 'partyId', { unique: false });
          sPay.createIndex('transactionId', 'transactionId', { unique: false });
          sPay.createIndex('accountId', 'accountId', { unique: false });
          sPay.createIndex('paymentDate', 'paymentDate', { unique: false });
        }

        // 14. recurringRules
        if (!db.objectStoreNames.contains('recurringRules')) {
          const sRec = db.createObjectStore('recurringRules', { keyPath: 'id' });
          sRec.createIndex('active', 'active', { unique: false });
          sRec.createIndex('frequency', 'frequency', { unique: false });
        }

        // 15. budgets
        if (!db.objectStoreNames.contains('budgets')) {
          const sBudgets = db.createObjectStore('budgets', { keyPath: 'id' });
          sBudgets.createIndex('categoryId', 'categoryId', { unique: false });
          sBudgets.createIndex('period', 'period', { unique: false });
          sBudgets.createIndex('compound_category_period', ['categoryId', 'period'], { unique: false });
        }

        // 16. apiUsage
        if (!db.objectStoreNames.contains('apiUsage')) {
          const sUsage = db.createObjectStore('apiUsage', { keyPath: 'id' });
          sUsage.createIndex('month', 'month', { unique: false });
          sUsage.createIndex('date', 'date', { unique: false });
          sUsage.createIndex('provider', 'provider', { unique: false });
        }

        // 17. auditLog
        if (!db.objectStoreNames.contains('auditLog')) {
          const sAudit = db.createObjectStore('auditLog', { keyPath: 'id' });
          sAudit.createIndex('timestamp', 'timestamp', { unique: false });
          sAudit.createIndex('userId', 'userId', { unique: false });
          sAudit.createIndex('action', 'action', { unique: false });
          sAudit.createIndex('compound_user_timestamp', ['userId', 'timestamp'], { unique: false });
        }
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      
      // Attempt persistent storage grant on initial opening
      requestStoragePersistence().catch(() => {});

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        console.warn('Database version changed in another tab. Reloading may be required.');
      };

      resolve(db);
    };

    req.onerror = () => {
      dbPromise = null;
      const err = req.error;
      if (err && err.name === 'QuotaExceededError') {
        reject(new Error('Storage quota exceeded. Please free up disk space.'));
      } else {
        reject(new Error(`Failed to open IndexedDB: ${err ? err.message : 'Unknown error'}`));
      }
    };

    req.onblocked = () => {
      console.warn('Database upgrade is blocked by another open tab.');
    };
  });

  return dbPromise;
}

/**
 * Requests browser persistent storage permission so data is not evicted automatically.
 * @returns {Promise<boolean>}
 */
export async function requestStoragePersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Checks storage quota and current usage.
 * @returns {Promise<{ quotaBytes: number, usageBytes: number, percentUsed: number }>}
 */
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota || 0;
      const usage = estimate.usage || 0;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
      return { quotaBytes: quota, usageBytes: usage, percentUsed };
    } catch {
      return { quotaBytes: 0, usageBytes: 0, percentUsed: 0 };
    }
  }
  return { quotaBytes: 0, usageBytes: 0, percentUsed: 0 };
}

/**
 * Helper to auto-stamp common entity fields before write.
 * @param {string} storeName 
 * @param {Object} item 
 * @returns {Object} Stamped item
 */
function stampRecord(storeName, item) {
  // meta and settings stores use simple key-value format without full entity metadata
  if (storeName === 'meta' || storeName === 'settings') {
    return {
      ...item,
      updatedAt: new Date().toISOString()
    };
  }

  const now = new Date().toISOString();
  const stamped = { ...item };

  if (!stamped.id) {
    stamped.id = generateUUID();
  }
  if (!stamped.createdAt) {
    stamped.createdAt = now;
  }
  stamped.updatedAt = now;

  if (!stamped.createdBy) {
    stamped.createdBy = currentContext.userId;
  }
  stamped.updatedBy = currentContext.userId;

  if (stamped.shiftId === undefined) {
    stamped.shiftId = currentContext.shiftId;
  }
  if (stamped.isDemo === undefined) {
    stamped.isDemo = false;
  }
  if (!stamped.schemaVersion) {
    stamped.schemaVersion = 1;
  }

  return stamped;
}

/**
 * Executes an atomic transaction across one or more object stores.
 * If any error occurs or is thrown within the transaction callback, the entire transaction is aborted.
 * @param {string|string[]} storeNames 
 * @param {'readonly'|'readwrite'} mode 
 * @param {function(Object): Promise<any>|any} callback 
 * @returns {Promise<any>}
 */
export async function tx(storeNames, mode, callback) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise((resolve, reject) => {
    let idbTx;
    try {
      idbTx = db.transaction(names, mode);
    } catch (err) {
      reject(err);
      return;
    }

    const stores = {};
    for (const name of names) {
      stores[name] = idbTx.objectStore(name);
    }

    let resultValue;
    let callbackCompleted = false;

    idbTx.oncomplete = () => {
      resolve(resultValue);
    };

    idbTx.onerror = (e) => {
      reject(idbTx.error || new Error('Transaction failed'));
    };

    idbTx.onabort = (e) => {
      reject(idbTx.error || new Error('Transaction aborted'));
    };

    try {
      const res = callback(stores, idbTx);
      if (res && typeof res.then === 'function') {
        res.then(val => {
          resultValue = val;
          callbackCompleted = true;
        }).catch(err => {
          try { idbTx.abort(); } catch {}
          reject(err);
        });
      } else {
        resultValue = res;
        callbackCompleted = true;
      }
    } catch (err) {
      try { idbTx.abort(); } catch {}
      reject(err);
    }
  });
}

/**
 * Retrieves a single record by primary key.
 * @param {string} storeName 
 * @param {IDBValidKey} key 
 * @returns {Promise<any|null>}
 */
export async function get(storeName, key) {
  return tx(storeName, 'readonly', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Retrieves all records from a store, optionally matching a key or IDBKeyRange.
 * @param {string} storeName 
 * @param {IDBKeyRange|IDBValidKey} [query] 
 * @param {number} [count] 
 * @returns {Promise<Array<any>>}
 */
export async function getAll(storeName, query, count) {
  return tx(storeName, 'readonly', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].getAll(query, count);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Retrieves a single record by an indexed key.
 * @param {string} storeName 
 * @param {string} indexName 
 * @param {IDBValidKey} key 
 * @returns {Promise<any|null>}
 */
export async function getByIndex(storeName, indexName, key) {
  return tx(storeName, 'readonly', (stores) => {
    return new Promise((resolve, reject) => {
      const idx = stores[storeName].index(indexName);
      const req = idx.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Retrieves all records matching an indexed key.
 * @param {string} storeName 
 * @param {string} indexName 
 * @param {IDBValidKey|IDBKeyRange} key 
 * @param {number} [count] 
 * @returns {Promise<Array<any>>}
 */
export async function getAllByIndex(storeName, indexName, key, count) {
  return tx(storeName, 'readonly', (stores) => {
    return new Promise((resolve, reject) => {
      const idx = stores[storeName].index(indexName);
      const req = idx.getAll(key, count);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Adds or updates a record, automatically stamping common tracking fields.
 * @param {string} storeName 
 * @param {Object} item 
 * @returns {Promise<Object>} The stamped saved record
 */
export async function put(storeName, item) {
  const stamped = stampRecord(storeName, item);
  return tx(storeName, 'readwrite', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].put(stamped);
      req.onsuccess = () => resolve(stamped);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Adds a new record, throwing an error if the primary key already exists.
 * @param {string} storeName 
 * @param {Object} item 
 * @returns {Promise<Object>} The stamped saved record
 */
export async function add(storeName, item) {
  const stamped = stampRecord(storeName, item);
  return tx(storeName, 'readwrite', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].add(stamped);
      req.onsuccess = () => resolve(stamped);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Deletes a record by primary key.
 * @param {string} storeName 
 * @param {IDBValidKey} key 
 * @returns {Promise<boolean>}
 */
export async function remove(storeName, key) {
  return tx(storeName, 'readwrite', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Counts records in a store or index.
 * @param {string} storeName 
 * @param {IDBValidKey|IDBKeyRange} [query] 
 * @returns {Promise<number>}
 */
export async function count(storeName, query) {
  return tx(storeName, 'readonly', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].count(query);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Clears all records from a given store.
 * @param {string} storeName 
 * @returns {Promise<boolean>}
 */
export async function clear(storeName) {
  return tx(storeName, 'readwrite', (stores) => {
    return new Promise((resolve, reject) => {
      const req = stores[storeName].clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Permanently deletes the entire IndexedDB database (used for Hard Reset / Factory Reset).
 * @returns {Promise<boolean>}
 */
export async function deleteDatabase() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {}
    dbPromise = null;
  }

  return new Promise((resolve, reject) => {
    const req = window.indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn('Database deletion is blocked by another open connection.');
    };
  });
}
