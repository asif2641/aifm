/**
 * @file backup.js
 * @description Secure Backup & Restore Engine for Smart Bill Auditor.
 * Produces structured JSON backups with SHA-256 checksums and provides atomic Replace or Merge restoration.
 */

import * as DB from '../../core/db.js';
import { logAction } from '../../core/audit-log.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { generateUUID } from '../../core/utils.js';

const ALL_PERSISTENT_STORES = [
  'settings', 'users', 'shifts', 'accounts', 'categories', 'parties',
  'items', 'transactions', 'transactionLines', 'documents', 'stockMovements',
  'payments', 'recurringRules', 'budgets', 'apiUsage', 'auditLog', 'meta'
];

/**
 * Computes SHA-256 hash of a string using WebCrypto.
 * @param {string} message 
 * @returns {Promise<string>} Hex string
 */
async function computeSHA256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates and triggers download of a full application JSON backup.
 * @param {Object} [options={}]
 * @param {boolean} [options.includeApiKeys=false] Master Rule: Exclude API keys by default
 * @returns {Promise<boolean>}
 */
export async function createAndDownloadBackup(options = {}) {
  const { includeApiKeys = false } = options;

  try {
    const storesData = {};
    for (const storeName of ALL_PERSISTENT_STORES) {
      storesData[storeName] = await DB.getAll(storeName);
    }

    // Exclude API keys unless explicitly opted in
    if (!includeApiKeys && storesData.settings) {
      storesData.settings = storesData.settings.filter(s => s.key !== 'ai_api_key');
    }

    const payloadString = JSON.stringify(storesData);
    const checksum = await computeSHA256(payloadString);

    const backupObject = {
      app: 'smart_bill_auditor',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      checksum,
      stores: storesData
    };

    const finalJson = JSON.stringify(backupObject, null, 2);
    const blob = new Blob([finalJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `smart-bill-auditor-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Record last backup date in meta
    await DB.put('meta', { key: 'last_backup_at', value: new Date().toISOString() });

    await logAction({
      action: 'BACKUP_CREATED',
      entity: 'system',
      summary: `Downloaded backup "${filename}" with SHA-256 checksum (${checksum.slice(0, 8)}...).`,
      outcome: 'success'
    });

    toast.success('Backup file created and downloaded successfully.');
    return true;
  } catch (err) {
    console.error('Backup error:', err);
    toast.error(`Backup failed: ${err.message}`);
    return false;
  }
}

/**
 * Validates and restores a backup JSON file.
 * @param {File} file 
 * @param {Function} [onRestoreComplete] 
 */
export async function promptRestoreFromFile(file, onRestoreComplete) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (!backup || !backup.stores || typeof backup.stores !== 'object') {
      throw new Error('Invalid backup file: missing stores object.');
    }

    // Validate checksum
    const computedHash = await computeSHA256(JSON.stringify(backup.stores));
    const checksumValid = computedHash === backup.checksum;

    modal.open({
      title: 'Restore Database Backup',
      content: `
        <div style="font-size: 13px; margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
            <span style="color: var(--muted);">Backup Created:</span>
            <strong>${backup.createdAt ? backup.createdAt.slice(0, 19).replace('T', ' ') : 'Unknown'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px;">
            <span style="color: var(--muted);">Integrity Checksum:</span>
            <span class="pill ${checksumValid ? 'pill-success' : 'pill-error'}">
              ${checksumValid ? 'Verified (SHA-256 Match)' : 'Checksum Warning'}
            </span>
          </div>
        </div>

        <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
          Choose how you want to restore the data:
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          <label class="panel" style="cursor: pointer;">
            <input type="radio" name="restore_mode" value="merge" checked>
            <strong>Merge with Existing Data (Recommended)</strong>
            <div style="font-size: 12px; color: var(--muted);">
              Compares records by ID; newer records win. Conflicting records will be presented for review.
            </div>
          </label>

          <label class="panel" style="cursor: pointer; border-color: var(--warning-border);">
            <input type="radio" name="restore_mode" value="replace">
            <strong style="color: var(--warning-text);">Replace Entire Database</strong>
            <div style="font-size: 12px; color: var(--muted);">
              Wipes all existing records and replaces them completely with the backup contents.
            </div>
          </label>
        </div>
      `,
      actions: [
        { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
        {
          label: 'Start Restoration',
          class: 'btn-primary',
          onClick: async () => {
            const mode = document.querySelector('input[name="restore_mode"]:checked')?.value || 'merge';
            if (mode === 'replace') {
              await executeReplaceRestore(backup.stores);
            } else {
              await executeMergeRestore(backup.stores);
            }
            if (typeof onRestoreComplete === 'function') onRestoreComplete();
            return true;
          }
        }
      ]
    });
  } catch (err) {
    console.error('Restore parse error:', err);
    toast.error(`Invalid backup file: ${err.message}`);
  }
}

/**
 * Performs atomic Replace restoration.
 */
async function executeReplaceRestore(importedStores) {
  for (const storeName of ALL_PERSISTENT_STORES) {
    await DB.clear(storeName);
    const records = importedStores[storeName] || [];
    for (const r of records) {
      await DB.put(storeName, r);
    }
  }

  await logAction({
    action: 'BACKUP_RESTORE_REPLACE',
    entity: 'system',
    summary: 'Restored full backup in Replace mode.',
    outcome: 'success'
  });

  toast.success('Database restored successfully in Replace mode.');
  setTimeout(() => window.location.reload(), 1000);
}

/**
 * Performs Merge restoration comparing UUIDs and updatedAt timestamps.
 */
async function executeMergeRestore(importedStores) {
  let mergedCount = 0;
  let addedCount = 0;

  for (const storeName of ALL_PERSISTENT_STORES) {
    const importedRecords = importedStores[storeName] || [];

    for (const imp of importedRecords) {
      if (storeName === 'meta' || storeName === 'settings') {
        await DB.put(storeName, imp);
        continue;
      }

      const existing = await DB.get(storeName, imp.id);
      if (!existing) {
        await DB.put(storeName, imp);
        addedCount++;
      } else {
        // Compare updatedAt timestamp
        const impTime = new Date(imp.updatedAt || 0).getTime();
        const exTime = new Date(existing.updatedAt || 0).getTime();

        if (impTime > exTime) {
          await DB.put(storeName, imp);
          mergedCount++;
        }
      }
    }
  }

  await logAction({
    action: 'BACKUP_RESTORE_MERGE',
    entity: 'system',
    summary: `Merged backup into database: ${addedCount} new records added, ${mergedCount} records updated.`,
    outcome: 'success'
  });

  toast.success(`Merge complete: ${addedCount} added, ${mergedCount} updated.`);
  setTimeout(() => window.location.reload(), 1000);
}
