// =========================================================================
// BUDGETS & ALERT RULES (PURE FUNCTIONS)
// Alerts fire once per threshold (80% & 100%). Zero duplicate notifications.
// =========================================================================

import { add, sub, formatMoney } from '../../core/money.js';

/**
 * Calculates current consumption for a category budget in a given month.
 *
 * @param {Object} budget - Budget definition { id, categoryId, limitMinor, month: 'YYYY-MM' }
 * @param {Array<Object>} expenses - Expense records
 * @param {Array<Object>} transactions - Transactions array
 * @returns {Object} Consumption metrics { spentMinor, limitMinor, remainingMinor, pctUsed }
 */
export function computeBudgetStatus(budget, expenses = [], transactions = []) {
  const month = budget.month || new Date().toISOString().slice(0, 7);
  let spentMinor = 0;

  for (const exp of expenses) {
    if (exp.status === 'cancelled') continue;
    if (exp.categoryId === budget.categoryId && (exp.date || '').startsWith(month)) {
      spentMinor = add(spentMinor, exp.amountMinor || 0);
    }
  }

  for (const tx of transactions) {
    if (tx.status !== 'confirmed' && tx.status !== 'posted') continue;
    if (tx.categoryId === budget.categoryId && (tx.date || '').startsWith(month)) {
      spentMinor = add(spentMinor, tx.grandTotalMinor || 0);
    }
  }

  const limitMinor = budget.limitMinor || 1;
  const remainingMinor = sub(limitMinor, spentMinor);
  const pctUsed = Math.round(((spentMinor / limitMinor) * 100) * 10) / 10;

  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    month,
    limitMinor,
    spentMinor,
    remainingMinor,
    pctUsed,
    isOverBudget: spentMinor > limitMinor
  };
}

/**
 * Evaluates budget alerts and fires notifications at 80% and 100% thresholds.
 * Strictly guarantees that each threshold alert fires ONLY ONCE per budget period.
 *
 * @param {Object} budgetStatus - Output from computeBudgetStatus
 * @param {Set<string>|Array<string>} firedAlertIds - History of previously fired alert keys
 * @returns {Object|null} New alert object or null if none to fire
 */
export function evaluateBudgetAlert(budgetStatus, firedAlertIds = new Set()) {
  const { budgetId, month, categoryId, pctUsed, limitMinor, spentMinor } = budgetStatus;
  const firedSet = firedAlertIds instanceof Set ? firedAlertIds : new Set(firedAlertIds);

  const alert80Key = `${budgetId}_${month}_80`;
  const alert100Key = `${budgetId}_${month}_100`;

  if (pctUsed >= 100) {
    if (!firedSet.has(alert100Key)) {
      return {
        key: alert100Key,
        budgetId,
        month,
        categoryId,
        threshold: 100,
        severity: 'error',
        message: `Budget Exceeded (100%): Spending for category is at ${pctUsed}% (${formatMoney(spentMinor)} of ${formatMoney(limitMinor)} limit).`
      };
    }
  } else if (pctUsed >= 80) {
    if (!firedSet.has(alert80Key)) {
      return {
        key: alert80Key,
        budgetId,
        month,
        categoryId,
        threshold: 80,
        severity: 'warning',
        message: `Budget Warning (80%): Spending has reached ${pctUsed}% of monthly limit (${formatMoney(spentMinor)} of ${formatMoney(limitMinor)}).`
      };
    }
  }

  return null;
}
