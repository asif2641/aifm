// =========================================================================
// FINANCIAL & TAX REPORTS (PURE FUNCTIONS)
// Tax Summary, P&L (Accrual/Cash), Cashflow, and Balance Sheet Summary
// =========================================================================

import { add, sub, formatMoney } from '../../core/money.js';

/**
 * Computes Tax Summary (Output Tax Collected on Sales vs Input Tax Paid on Purchases).
 *
 * @param {Array<Object>} transactions - Transactions array
 * @param {Object} options - { startDate, endDate, currency }
 * @returns {Object} Tax summary data
 */
export function computeTaxSummary(transactions = [], options = {}) {
  const { startDate = null, endDate = null, currency = 'PKR' } = options;

  let taxPaidMinor = 0;      // Input Tax (Purchases)
  let taxCollectedMinor = 0; // Output Tax (Sales)
  let taxablePurchasesMinor = 0;
  let taxableSalesMinor = 0;

  for (const t of transactions) {
    if (t.status !== 'confirmed' && t.status !== 'posted') continue;
    const d = (t.date || '').slice(0, 10);
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;

    const tax = t.taxMinor || 0;
    const subtotal = t.subtotalMinor || 0;

    if (t.type === 'purchase') {
      taxPaidMinor = add(taxPaidMinor, tax);
      taxablePurchasesMinor = add(taxablePurchasesMinor, subtotal);
    } else if (t.type === 'sale') {
      taxCollectedMinor = add(taxCollectedMinor, tax);
      taxableSalesMinor = add(taxableSalesMinor, subtotal);
    }
  }

  const netTaxLiabilityMinor = sub(taxCollectedMinor, taxPaidMinor);

  return {
    startDate,
    endDate,
    currency,
    taxablePurchasesMinor,
    taxPaidMinor,          // Input tax
    taxableSalesMinor,
    taxCollectedMinor,     // Output tax
    netTaxLiabilityMinor,  // Positive = Payable to Govt, Negative = Refundable/Credit
    disclaimer: 'Tax report generated for estimation purposes. Consult your certified tax advisor for official filing.'
  };
}

/**
 * Generates CSV string for Tax Summary.
 */
export function exportTaxCSV(taxData) {
  const lines = [
    `Tax Summary Report (${taxData.startDate || 'All'} to ${taxData.endDate || 'Present'})`,
    `Currency,${taxData.currency}`,
    '',
    'Category,Taxable Base,Tax Amount',
    `Input Tax (Purchases),${(taxData.taxablePurchasesMinor / 100).toFixed(2)},${(taxData.taxPaidMinor / 100).toFixed(2)}`,
    `Output Tax (Sales),${(taxData.taxableSalesMinor / 100).toFixed(2)},${(taxData.taxCollectedMinor / 100).toFixed(2)}`,
    '',
    `Net Tax Payable / (Credit),,${(taxData.netTaxLiabilityMinor / 100).toFixed(2)}`,
    '',
    `"${taxData.disclaimer}"`
  ];
  return lines.join('\n');
}

/**
 * Computes Profit & Loss Statement (Accrual or Cash basis).
 *
 * @param {Array<Object>} transactions - Transactions array
 * @param {Array<Object>} expenses - General business expense records
 * @param {Array<Object>} payments - Payments array (used for Cash basis)
 * @param {Object} options - { basis: 'accrual'|'cash', startDate, endDate, currency }
 * @returns {Object} P&L breakdown
 */
export function computeProfitAndLoss(transactions = [], expenses = [], payments = [], options = {}) {
  const { basis = 'accrual', startDate = null, endDate = null, currency = 'PKR' } = options;

  let totalSalesRevenueMinor = 0;
  let totalCogsMinor = 0;
  let totalOperatingExpensesMinor = 0;

  if (basis === 'accrual') {
    // Accrual basis: recognized when invoices are confirmed
    for (const t of transactions) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      const d = (t.date || '').slice(0, 10);
      if (startDate && d < startDate) continue;
      if (endDate && d > endDate) continue;

      if (t.type === 'sale') {
        const netRev = sub(t.subtotalMinor || 0, t.discountMinor || 0);
        totalSalesRevenueMinor = add(totalSalesRevenueMinor, netRev);
        totalCogsMinor = add(totalCogsMinor, t.totalCogsMinor || 0);
      }
    }
  } else {
    // Cash basis: recognized when cash/payments are received/paid
    for (const p of payments) {
      if (p.status === 'cancelled') continue;
      const d = (p.date || '').slice(0, 10);
      if (startDate && d < startDate) continue;
      if (endDate && d > endDate) continue;

      if (p.type === 'customer_receipt' || p.direction === 'in') {
        totalSalesRevenueMinor = add(totalSalesRevenueMinor, p.amountMinor || 0);
      } else if (p.type === 'vendor_payment' || p.direction === 'out') {
        totalCogsMinor = add(totalCogsMinor, p.amountMinor || 0);
      }
    }
  }

  // General expenses (rent, utilities, salaries, etc.)
  for (const exp of expenses) {
    if (exp.status === 'cancelled') continue;
    const d = (exp.date || '').slice(0, 10);
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;

    totalOperatingExpensesMinor = add(totalOperatingExpensesMinor, exp.amountMinor || 0);
  }

  const grossProfitMinor = sub(totalSalesRevenueMinor, totalCogsMinor);
  const netProfitMinor = sub(grossProfitMinor, totalOperatingExpensesMinor);

  const grossMarginPct = totalSalesRevenueMinor > 0
    ? Math.round(((grossProfitMinor / totalSalesRevenueMinor) * 100) * 10) / 10
    : 0;

  const netMarginPct = totalSalesRevenueMinor > 0
    ? Math.round(((netProfitMinor / totalSalesRevenueMinor) * 100) * 10) / 10
    : 0;

  return {
    basis,
    startDate,
    endDate,
    currency,
    salesRevenueMinor: totalSalesRevenueMinor,
    cogsMinor: totalCogsMinor,
    grossProfitMinor,
    grossMarginPct,
    operatingExpensesMinor: totalOperatingExpensesMinor,
    netProfitMinor,
    netMarginPct,
    disclaimer: `Statement prepared on a ${basis.toUpperCase()} basis. Derived automatically from primary ledger transactions.`
  };
}

/**
 * Computes Simple Cashflow Statement (Inflows, Outflows, Net Flow).
 */
export function computeCashflow(payments = [], expenses = [], options = {}) {
  const { startDate = null, endDate = null, currency = 'PKR' } = options;

  let totalInflowMinor = 0;
  let vendorOutflowMinor = 0;
  let expenseOutflowMinor = 0;

  for (const p of payments) {
    if (p.status === 'cancelled') continue;
    const d = (p.date || '').slice(0, 10);
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;

    if (p.direction === 'in' || p.type === 'customer_receipt') {
      totalInflowMinor = add(totalInflowMinor, p.amountMinor || 0);
    } else if (p.direction === 'out' || p.type === 'vendor_payment') {
      vendorOutflowMinor = add(vendorOutflowMinor, p.amountMinor || 0);
    }
  }

  for (const e of expenses) {
    if (e.status === 'cancelled') continue;
    const d = (e.date || '').slice(0, 10);
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;

    expenseOutflowMinor = add(expenseOutflowMinor, e.amountMinor || 0);
  }

  const totalOutflowMinor = add(vendorOutflowMinor, expenseOutflowMinor);
  const netCashflowMinor = sub(totalInflowMinor, totalOutflowMinor);

  return {
    startDate,
    endDate,
    currency,
    inflowsMinor: totalInflowMinor,
    vendorOutflowsMinor: vendorOutflowMinor,
    expenseOutflowsMinor: expenseOutflowMinor,
    totalOutflowsMinor: totalOutflowMinor,
    netCashflowMinor,
    disclaimer: 'Cashflow represents direct movements recorded in cash, bank, and wallet accounts.'
  };
}

/**
 * Computes Balance-Sheet-style summary (Assets vs Liabilities).
 */
export function computeBalanceSheetSummary(context = {}) {
  const {
    cashBalanceMinor = 0,
    bankBalanceMinor = 0,
    totalReceivablesMinor = 0,
    inventoryValuationMinor = 0,
    totalPayablesMinor = 0,
    currency = 'PKR'
  } = context;

  const currentAssetsMinor = cashBalanceMinor + bankBalanceMinor + totalReceivablesMinor + inventoryValuationMinor;
  const currentLiabilitiesMinor = totalPayablesMinor;
  const netWorkingCapitalMinor = currentAssetsMinor - currentLiabilitiesMinor;

  return {
    currency,
    assets: {
      cashMinor: cashBalanceMinor,
      bankMinor: bankBalanceMinor,
      receivablesMinor: totalReceivablesMinor,
      inventoryMinor: inventoryValuationMinor,
      totalCurrentAssetsMinor: currentAssetsMinor
    },
    liabilities: {
      payablesMinor: totalPayablesMinor,
      totalCurrentLiabilitiesMinor: currentLiabilitiesMinor
    },
    netWorkingCapitalMinor,
    disclaimer: 'Summary statement showing working capital balances based on derived ledger figures.'
  };
}
