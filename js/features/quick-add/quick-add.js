// =========================================================================
// QUICK ADD, WALLETS & AUTO-CATEGORIZATION (PURE FUNCTIONS)
// =========================================================================

import { add, sub, parseMoney } from '../../core/money.js';

/**
 * Standard Accounts / Wallets.
 */
export const DEFAULT_ACCOUNTS = [
  { id: 'acc_cash', name: 'Cash in Hand (Naqd)', type: 'cash', icon: '💵' },
  { id: 'acc_bank', name: 'Bank Account', type: 'bank', icon: '🏦' },
  { id: 'acc_easypaisa', name: 'Easypaisa / Wallet', type: 'wallet', icon: '📱' },
  { id: 'acc_jazzcash', name: 'JazzCash / Wallet', type: 'wallet', icon: '📱' }
];

/**
 * Standard Expense Categories.
 */
export const DEFAULT_CATEGORIES = [
  { id: 'cat_raw_materials', name: 'Stock & Inventory', keywords: ['stock', 'items', 'wholesale', 'sugar', 'flour', 'rice'] },
  { id: 'cat_rent', name: 'Shop / Warehouse Rent', keywords: ['rent', 'shop rent', 'godown'] },
  { id: 'cat_utilities', name: 'Utilities & Bills', keywords: ['electricity', 'bijli', 'gas', 'water', 'internet', 'ptcl'] },
  { id: 'cat_salaries', name: 'Staff Salaries', keywords: ['salary', 'wages', 'staff', 'worker', 'tankhwah'] },
  { id: 'cat_logistics', name: 'Freight & Transport', keywords: ['freight', 'delivery', 'cargo', 'transport', 'kiraya'] },
  { id: 'cat_packaging', name: 'Packaging & Bags', keywords: ['shopper', 'packing', 'bags', 'carton', 'boxes'] },
  { id: 'cat_misc', name: 'General & Tea Expenses', keywords: ['tea', 'chai', 'cleaning', 'refreshment', 'misc'] }
];

/**
 * Computes the derived balance for an account/wallet across all transactions.
 * Balance = Opening Balance + Inflows (Receipts, Transfers In) - Outflows (Expenses, Purchases, Transfers Out).
 *
 * @param {string} accountId - Account ID
 * @param {Object} context - { transactions, payments, expenses, transfers }
 * @returns {number} Derived balance in integer minor units
 */
export function computeAccountBalance(accountId, context = {}) {
  const { transactions = [], payments = [], expenses = [], transfers = [] } = context;
  let balanceMinor = 0;

  // Payments / Receipts
  for (const p of payments) {
    if (p.status === 'cancelled') continue;
    if (p.accountId === accountId || p.paymentMode === accountId.replace('acc_', '')) {
      if (p.direction === 'in' || p.type === 'customer_receipt') {
        balanceMinor = add(balanceMinor, p.amountMinor || 0);
      } else {
        balanceMinor = sub(balanceMinor, p.amountMinor || 0);
      }
    }
  }

  // General Expenses
  for (const exp of expenses) {
    if (exp.status === 'cancelled') continue;
    if (exp.accountId === accountId || (!exp.accountId && accountId === 'acc_cash')) {
      balanceMinor = sub(balanceMinor, exp.amountMinor || 0);
    }
  }

  // Inter-account Transfers
  for (const tr of transfers) {
    if (tr.status === 'cancelled') continue;
    if (tr.fromAccountId === accountId) balanceMinor = sub(balanceMinor, tr.amountMinor || 0);
    if (tr.toAccountId === accountId) balanceMinor = add(balanceMinor, tr.amountMinor || 0);
  }

  return balanceMinor;
}

/**
 * Suggests a category based on textual description or payee name.
 *
 * @param {string} text - Description or payee name
 * @param {Array<Object>} categories - Category list
 * @returns {string|null} Suggested category ID or null
 */
export function suggestCategory(text, categories = DEFAULT_CATEGORIES) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  for (const cat of categories) {
    for (const kw of (cat.keywords || [])) {
      if (lower.includes(kw.toLowerCase())) {
        return cat.id;
      }
    }
  }
  return 'cat_misc';
}

/**
 * Validates and creates a Quick Add expense entity.
 *
 * @param {Object} data - { amountStr, categoryId, accountId, date, note, photoUrl, userId }
 * @param {string} currency - Default currency
 * @returns {Object} Validated expense entity
 */
export function createQuickAddExpense(data, currency = 'PKR') {
  const {
    amountStr,
    categoryId = 'cat_misc',
    accountId = 'acc_cash',
    date = new Date().toISOString().slice(0, 10),
    note = '',
    photoUrl = null,
    userId = 'admin'
  } = data;

  const amountMinor = parseMoney(amountStr, currency);
  if (amountMinor <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }

  return {
    id: 'exp_' + Math.random().toString(36).slice(2, 9),
    type: 'expense',
    amountMinor,
    currency,
    categoryId,
    accountId,
    date,
    note: note.trim(),
    photoUrl,
    status: 'posted',
    createdBy: userId,
    createdAt: new Date().toISOString()
  };
}
