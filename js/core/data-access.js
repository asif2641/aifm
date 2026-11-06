/**
 * @file data-access.js
 * @description Central Scoped-Query Data Access Layer for Smart Bill Auditor.
 * Master Rule: Role visibility is strictly enforced here in the data layer; the UI NEVER filters by role itself.
 * - Staff sees ONLY records they created, and their own shifts. Cannot delete.
 * - Admin sees all records and can filter across all users, shifts, and dates.
 * - Viewer has read-only access.
 */

import * as DB from './db.js';
import * as Auth from './auth.js';

/**
 * Checks if current user has permission to mutate data.
 * Throws an error if user is a Viewer or not authenticated.
 */
function assertMutationAllowed() {
  const user = Auth.getCurrentUser();
  if (!user) throw new Error('Authentication required.');
  if (user.role === 'viewer') {
    throw new Error('Permission Denied: Viewer accounts have read-only access.');
  }
}

/**
 * Scoped query to fetch records adhering to role permissions.
 * @param {string} storeName 
 * @param {Object} [filters={}]
 * @param {string} [filters.shiftId]
 * @param {string} [filters.userId]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @param {string} [filters.status]
 * @returns {Promise<Array<Object>>}
 */
export async function queryRecords(storeName, filters = {}) {
  const user = Auth.getCurrentUser();
  const allRecords = await DB.getAll(storeName);

  // If unauthenticated or system context, return records without filtering
  if (!user) return allRecords;

  return allRecords.filter(record => {
    // 1. Staff role scoping: ONLY own records
    if (user.role === 'staff') {
      if (storeName === 'shifts') {
        if (record.userId !== user.id) return false;
      } else if (record.createdBy && record.createdBy !== user.id) {
        return false;
      }
    }

    // 2. Admin / Viewer explicit filters
    if (filters.userId && record.createdBy !== filters.userId && record.userId !== filters.userId) {
      return false;
    }

    if (filters.shiftId && record.shiftId !== filters.shiftId) {
      return false;
    }

    if (filters.status && record.status !== filters.status) {
      return false;
    }

    if (filters.startDate && record.billDate && record.billDate < filters.startDate) {
      return false;
    }

    if (filters.endDate && record.billDate && record.billDate > filters.endDate) {
      return false;
    }

    return true;
  });
}

/**
 * Retrieves a single record by ID, enforcing role access check.
 * @param {string} storeName 
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getRecordById(storeName, id) {
  const record = await DB.get(storeName, id);
  if (!record) return null;

  const user = Auth.getCurrentUser();
  if (user && user.role === 'staff') {
    if (storeName === 'shifts' && record.userId !== user.id) return null;
    if (record.createdBy && record.createdBy !== user.id) return null;
  }

  return record;
}

/**
 * Saves a record (create or update), verifying mutation permissions.
 * @param {string} storeName 
 * @param {Object} item 
 * @returns {Promise<Object>}
 */
export async function saveRecord(storeName, item) {
  assertMutationAllowed();
  return DB.put(storeName, item);
}

/**
 * Checks whether current user is permitted to delete directly.
 * @returns {boolean} True if user is Admin
 */
export function canDelete() {
  const user = Auth.getCurrentUser();
  return user && user.role === 'admin';
}
