/**
 * @file missing-detector.js
 * @description Pure function for detecting missing fields, unreadable entries, low confidence, and date anomalies.
 */

import { SEVERITY, FINDING_CODES, createFinding } from './finding-model.js';
import { formatMoney } from '../../core/money.js';

/**
 * Computes median value of an array of positive numbers.
 * @param {Array<number>} numbers 
 * @returns {number}
 */
function getMedian(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Audits a transaction for missing fields, confidence drops, and confusion.
 * @param {Object} transaction 
 * @param {Object} options { minConfidence?: number, todayDate?: string }
 * @returns {Array<Object>} List of findings
 */
export function auditMissingAndConfusion(transaction, options = {}) {
  const findings = [];
  if (!transaction) return findings;

  const minConfidence = options.minConfidence ?? 80;
  const today = options.todayDate || new Date().toISOString().split('T')[0];
  const currency = transaction.currency || 'PKR';

  // 1. Vendor Name
  if (!transaction.vendorName || transaction.vendorName.trim() === '' || transaction.vendorName.toLowerCase() === 'unknown vendor') {
    findings.push(createFinding({
      severity: SEVERITY.ERROR,
      code: FINDING_CODES.MISSING_REQUIRED_FIELD,
      message: 'Vendor name is missing or unrecognized. A valid vendor is required.'
    }));
  }

  // 2. Bill Number
  if (!transaction.billNumber || transaction.billNumber.trim() === '') {
    findings.push(createFinding({
      severity: SEVERITY.WARNING,
      code: FINDING_CODES.MISSING_OPTIONAL_FIELD,
      message: 'Bill / Invoice number is missing. It is strongly recommended for audit tracking.'
    }));
  }

  // 3. Date Validations
  if (transaction.date) {
    if (transaction.date > today) {
      findings.push(createFinding({
        severity: SEVERITY.WARNING,
        code: FINDING_CODES.INVALID_DATE,
        message: `Bill date (${transaction.date}) is in the future. Today is ${today}.`
      }));
    }
    if (transaction.dueDate && transaction.dueDate < transaction.date) {
      findings.push(createFinding({
        severity: SEVERITY.ERROR,
        code: FINDING_CODES.INVALID_DATE,
        message: `Due date (${transaction.dueDate}) cannot be earlier than bill date (${transaction.date}).`
      }));
    }
  }

  // 4. Line Items Validations
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  if (lines.length === 0) {
    findings.push(createFinding({
      severity: SEVERITY.ERROR,
      code: FINDING_CODES.MISSING_REQUIRED_FIELD,
      message: 'Transaction has no line items.'
    }));
    return findings;
  }

  // Collect unit prices to evaluate price outliers
  const positivePrices = lines
    .filter(l => !l.isCarriedForward && l.unitPriceMinor > 0)
    .map(l => l.unitPriceMinor);
  const medianPrice = getMedian(positivePrices);

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const name = (line.nameRaw || '').trim();

    // Missing Name
    if (!name || name === 'Item' || name === '...') {
      findings.push(createFinding({
        severity: SEVERITY.ERROR,
        code: FINDING_CODES.MISSING_REQUIRED_FIELD,
        lineId: line.id,
        message: `Line #${lineNum} is missing an item description.`
      }));
    }

    // Zero or Negative Quantity
    if (!line.qtyBilled || line.qtyBilled <= 0) {
      findings.push(createFinding({
        severity: SEVERITY.ERROR,
        code: FINDING_CODES.MISSING_REQUIRED_FIELD,
        lineId: line.id,
        message: `Line #${lineNum} ("${name}") has an invalid quantity (${line.qtyBilled}). Must be greater than 0.`
      }));
    }

    // Zero or Negative Unit Price on active lines
    if (!line.isCarriedForward && line.unitPriceMinor <= 0) {
      findings.push(createFinding({
        severity: SEVERITY.WARNING,
        code: FINDING_CODES.MISSING_REQUIRED_FIELD,
        lineId: line.id,
        message: `Line #${lineNum} ("${name}") has a zero or negative unit price.`
      }));
    }

    // Low Confidence
    if (typeof line.confidence === 'number' && line.confidence < minConfidence) {
      findings.push(createFinding({
        severity: SEVERITY.WARNING,
        code: FINDING_CODES.LOW_CONFIDENCE,
        lineId: line.id,
        message: `Line #${lineNum} ("${name}") was extracted with low confidence (${line.confidence}%). Please double-check accuracy.`
      }));
    }

    // Unreadable / smudged text indicator
    if (name.includes('???') || name.includes('[unreadable]') || name.includes('[smudged]')) {
      findings.push(createFinding({
        severity: SEVERITY.WARNING,
        code: FINDING_CODES.UNREADABLE_FIELD,
        lineId: line.id,
        message: `Line #${lineNum} has unreadable or smudged text.`
      }));
    }

    // Price Outlier (> 10x median price of bill items)
    if (!line.isCarriedForward && medianPrice > 0 && line.unitPriceMinor > medianPrice * 10) {
      findings.push(createFinding({
        severity: SEVERITY.WARNING,
        code: FINDING_CODES.PRICE_OUTLIER,
        lineId: line.id,
        message: `Line #${lineNum} ("${name}") rate ${formatMoney(line.unitPriceMinor, currency)} is unusually high (> 10× bill median of ${formatMoney(medianPrice, currency)}).`
      }));
    }
  });

  return findings;
}
