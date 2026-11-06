/**
 * @file invoice-audit.js
 * @description Pure function for auditing bill grand totals, tax reconciliation, and multi-page integrity.
 */

import { SEVERITY, FINDING_CODES, createFinding } from './finding-model.js';
import { add, sub, formatMoney } from '../../core/money.js';

/**
 * Audits the invoice grand total and reconciles lines, taxes, discount, and freight.
 * @param {Object} transaction 
 * @param {Object} options { toleranceMinor?: number }
 * @returns {Array<Object>} List of invoice-level findings
 */
export function auditInvoiceTotals(transaction, options = {}) {
  const findings = [];
  if (!transaction) return findings;

  const tolerance = options.toleranceMinor ?? 1;
  const currency = transaction.currency || 'PKR';
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];

  // Filter out carried-forward lines
  const activeLines = lines.filter(l => !l.isCarriedForward);

  let computedLinesSubtotal = 0;
  for (const l of activeLines) {
    computedLinesSubtotal = add(computedLinesSubtotal, l.printedLineTotalMinor || 0);
  }

  const discountMinor = transaction.discountMinor || 0;
  const freightMinor = transaction.freightMinor || 0;
  const printedGrandTotalMinor = transaction.printedGrandTotalMinor || 0;

  // Calculate tax totals
  let taxSumMinor = 0;
  const taxes = Array.isArray(transaction.taxes) ? transaction.taxes : [];
  for (const t of taxes) {
    taxSumMinor = add(taxSumMinor, t.amountMinor || 0);
  }

  // Calculate net grand total: Subtotal - Discount + Freight + Taxes
  let netAfterDiscount = sub(computedLinesSubtotal, discountMinor);
  let expectedGrandTotal = add(add(netAfterDiscount, freightMinor), taxSumMinor);

  const diff = expectedGrandTotal - printedGrandTotalMinor;
  const absDiff = Math.abs(diff);

  if (absDiff > tolerance) {
    const subStr = formatMoney(computedLinesSubtotal, currency);
    const discStr = formatMoney(discountMinor, currency);
    const frtStr = formatMoney(freightMinor, currency);
    const taxStr = formatMoney(taxSumMinor, currency);
    const expectedStr = formatMoney(expectedGrandTotal, currency);
    const printedStr = formatMoney(printedGrandTotalMinor, currency);
    const diffStr = formatMoney(absDiff, currency);

    let explanation = `Invoice Total Discrepancy: Lines sum (${subStr})`;
    if (discountMinor > 0) explanation += ` - Discount (${discStr})`;
    if (freightMinor > 0) explanation += ` + Freight (${frtStr})`;
    if (taxSumMinor > 0) explanation += ` + Tax (${taxStr})`;
    explanation += ` equals ${expectedStr}, but printed grand total is ${printedStr} (Difference: ${diffStr}).`;

    findings.push(createFinding({
      severity: SEVERITY.ERROR,
      code: FINDING_CODES.INVOICE_TOTAL_MISMATCH,
      message: explanation,
      expected: expectedGrandTotal,
      actual: printedGrandTotalMinor,
      diff,
      suggestedFixes: [
        {
          id: 'fix_grand_total',
          label: `Fix Grand Total to ${expectedStr}`,
          type: 'SET_GRAND_TOTAL',
          value: expectedGrandTotal
        }
      ]
    }));
  }

  return findings;
}
