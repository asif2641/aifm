/**
 * @file audit-log.js
 * @description Append-only tamper-evident audit journal for Smart Bill Auditor.
 * Logs all authentication events, shift events, data mutations, deletion requests, and backups.
 * Master Rule: NEVER store the raw contents of deleted records in the audit log.
 */

import * as DB from './db.js';
import * as Auth from './auth.js';
import { generateUUID } from './utils.js';

/**
 * Appends a new immutable audit record to the auditLog store.
 * @param {Object} entry
 * @param {string} entry.action E.g. 'LOGIN', 'DELETE_RECORD', 'SHIFT_OPEN', 'SETTINGS_CHANGE'
 * @param {string} entry.entity E.g. 'transactions', 'users', 'shifts', 'settings'
 * @param {string} [entry.entityId]
 * @param {string} entry.summary Concise descriptive summary (no confidential payloads)
 * @param {'success'|'failure'|'rejected'} [entry.outcome='success']
 * @param {Object} [entry.context]
 * @returns {Promise<Object>}
 */
export async function logAction({ action, entity, entityId = null, summary, outcome = 'success', context = null }) {
  const user = Auth.getCurrentUser();
  const now = new Date().toISOString();

  const auditEntry = {
    id: generateUUID(),
    timestamp: now,
    userId: user ? user.id : 'system',
    userName: user ? user.name : 'System',
    userRole: user ? user.role : 'system',
    action,
    entity,
    entityId,
    summary,
    outcome,
    context,
    schemaVersion: 1
  };

  try {
    await DB.add('auditLog', auditEntry);
    return auditEntry;
  } catch (err) {
    console.error('CRITICAL: Failed to write to audit log:', err);
    return null;
  }
}

/**
 * Retrieves audit log entries with optional filters, sorted newest to oldest.
 * @param {Object} [filters={}]
 * @param {string} [filters.action]
 * @param {string} [filters.userId]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @param {string} [filters.outcome]
 * @returns {Promise<Array<Object>>}
 */
export async function getAuditLogs(filters = {}) {
  const all = await DB.getAll('auditLog');

  let filtered = all.filter(entry => {
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.userId && entry.userId !== filters.userId) return false;
    if (filters.outcome && entry.outcome !== filters.outcome) return false;
    if (filters.startDate && entry.timestamp < filters.startDate) return false;
    if (filters.endDate && entry.timestamp > filters.endDate) return false;
    return true;
  });

  // Sort descending (newest first)
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return filtered;
}

/**
 * Formats an array of audit log entries into CSV string format.
 * @param {Array<Object>} logs 
 * @returns {string} CSV formatted string
 */
export function formatAuditLogsAsCSV(logs) {
  const headers = ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Summary', 'Outcome'];

  const rows = logs.map(l => {
    const sanitize = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    return [
      sanitize(l.timestamp),
      sanitize(l.userName || l.userId),
      sanitize(l.userRole),
      sanitize(l.action),
      sanitize(l.entity),
      sanitize(l.summary),
      sanitize(l.outcome)
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Triggers a browser download of the audit log CSV.
 * @param {Array<Object>} logs 
 */
export function downloadAuditLogsCSV(logs) {
  const csvContent = formatAuditLogsAsCSV(logs);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
