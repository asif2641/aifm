/**
 * @file math-audit.js
 * @description Pure function for auditing individual line item math (Qty × Rate vs Printed Total).
 * Flags discrepancies exceeding tolerance and generates three distinct one-click fixes.
 */

import { SEVERITY, FINDING_CODES, createFinding } from './finding-model.js';
import { lineTotal, formatMoney } from '../../core/money.js';

/**
 * Audits a single line item's arithmetic.
 * @param {Object} line { id, nameRaw, qtyBilled, unitPriceMinor, printedLineTotalMinor, isCarriedForward }
 * @param {Object} options { toleranceMinor?: number, currency?: string }
 * @returns {Object|null} Finding or null if clean
 */
export function auditRowMath(line, options = {}) {
  if (!line || line.isCarriedForward) return null;

  const tolerance = options.toleranceMinor ?? 1; // 1 minor unit default
  const currency = options.currency || 'PKR';

  const qty = parseFloat(line.qtyBilled) || 0;
  const unitPriceMinor = line.unitPriceMinor || 0;
  const printedTotalMinor = line.printedLineTotalMinor || 0;

  // Qty in milli-units (e.g. 2.5 kg -> 2500 milli-units)
  const qtyMilli = Math.round(qty * 1000);
  const calculatedTotalMinor = lineTotal(qtyMilli, unitPriceMinor);

  const diff = calculatedTotalMinor - printedTotalMinor;
  const absDiff = Math.abs(diff);

  if (absDiff > tolerance) {
    const printedStr = formatMoney(printedTotalMinor, currency);
    const calcStr = formatMoney(calculatedTotalMinor, currency);
    const diffStr = formatMoney(absDiff, currency);

    const message = `Row Math Discrepancy on "${line.nameRaw || 'Item'}": Printed ${printedStr} | Calculated ${calcStr} (Diff: ${diffStr})`;

    const suggestedFixes = [
      {
        id: 'fix_total',
        label: `Fix Total to ${calcStr}`,
        type: 'SET_TOTAL',
        lineId: line.id,
        value: calculatedTotalMinor
      }
    ];

    // Check if adjusting quantity is a clean divisor
    if (unitPriceMinor > 0) {
      const derivedQty = printedTotalMinor / unitPriceMinor;
      // Allow if reasonably clean decimal (up to 3 decimal places)
      const roundedQty = Math.round(derivedQty * 1000) / 1000;
      if (Math.abs(derivedQty - roundedQty) < 0.001) {
        suggestedFixes.push({
          id: 'fix_qty',
          label: `Fix Quantity to ${roundedQty}`,
          type: 'SET_QTY',
          lineId: line.id,
          value: roundedQty
        });
      }
    }

    // Check if adjusting unit price is clean
    if (qty > 0) {
      const derivedPrice = Math.round(printedTotalMinor / qty);
      suggestedFixes.push({
        id: 'fix_price',
        label: `Fix Unit Price to ${formatMoney(derivedPrice, currency)}`,
        type: 'SET_PRICE',
        lineId: line.id,
        value: derivedPrice
      });
    }

    return createFinding({
      severity: SEVERITY.ERROR,
      code: FINDING_CODES.MATH_ROW_MISMATCH,
      lineId: line.id,
      message,
      expected: calculatedTotalMinor,
      actual: printedTotalMinor,
      diff,
      suggestedFixes
    });
  }

  return null;
}
