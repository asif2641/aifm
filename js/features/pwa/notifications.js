// =========================================================================
// NOTIFICATION CENTER (PURE AGGREGATOR)
// Gathers due bills, low stock alerts, budget warnings, and backup reminders
// =========================================================================

import { isLowStock } from '../inventory/inventory-model.js';
import { computeBudgetStatus, evaluateBudgetAlert } from '../budgets-recurring/budgets.js';
import { formatMoney } from '../../core/money.js';

/**
 * Gathers all active system notifications.
 *
 * @param {Object} context - { items, stockMovements, transactions, budgets, expenses, lastBackupDate, asOfDate }
 * @returns {Array<Object>} List of notification items { id, title, message, severity: 'warning'|'error'|'info', link }
 */
export function aggregateNotifications(context = {}) {
  const {
    items = [],
    stockMovements = [],
    transactions = [],
    budgets = [],
    expenses = [],
    lastBackupDate = null,
    asOfDate = new Date().toISOString().slice(0, 10)
  } = context;

  const notifications = [];

  // 1. Low Stock Alerts
  for (const it of items) {
    let curStockMilli = 0;
    for (const m of stockMovements) {
      if (m.itemId === it.id && m.status !== 'cancelled') curStockMilli += (m.qtyChangeMilli || 0);
    }
    if (isLowStock(it, curStockMilli)) {
      notifications.push({
        id: `stock_${it.id}`,
        title: 'Low Stock Alert',
        message: `Item "${it.name}" stock is at ${(curStockMilli / 1000).toFixed(1)} ${it.unit || 'pcs'} (below reorder level).`,
        severity: curStockMilli <= 0 ? 'error' : 'warning',
        link: '#/inventory'
      });
    }
  }

  // 2. Upcoming & Due Bills
  for (const t of transactions) {
    if (t.status === 'confirmed' && t.dueDate) {
      const due = t.dueDate.slice(0, 10);
      if (due <= asOfDate) {
        notifications.push({
          id: `due_${t.id}`,
          title: 'Bill Past Due',
          message: `Bill #${t.billNumber || t.id} from "${t.vendorName}" was due on ${due}.`,
          severity: 'error',
          link: '#/vault'
        });
      }
    }
  }

  // 3. Budget Alerts (80% / 100%)
  for (const b of budgets) {
    const status = computeBudgetStatus(b, expenses, transactions);
    const alert = evaluateBudgetAlert(status, new Set());
    if (alert) {
      notifications.push({
        id: alert.key,
        title: 'Budget Alert',
        message: alert.message,
        severity: alert.severity,
        link: '#/budgets'
      });
    }
  }

  // 4. Backup Reminder
  if (!lastBackupDate) {
    notifications.push({
      id: 'backup_needed',
      title: 'Backup Recommended',
      message: 'You have not exported an encrypted backup of your database yet.',
      severity: 'info',
      link: '#/settings'
    });
  } else {
    const diffDays = Math.floor((new Date(asOfDate).getTime() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 7) {
      notifications.push({
        id: 'backup_old',
        title: 'Weekly Backup Reminder',
        message: `Last database backup was ${diffDays} days ago. Create a backup to keep your offline data safe.`,
        severity: 'warning',
        link: '#/settings'
      });
    }
  }

  return notifications;
}
