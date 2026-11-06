/**
 * @file duplicate-layer3.js
 * @description Layer 3 Business Duplicate Detector using vendor normalization and fuzzy matching.
 * Identifies duplicate bills even with vendor spelling differences or invoice numbering variances.
 */

import { SEVERITY, FINDING_CODES, createFinding } from './finding-model.js';
import { formatMoney } from '../../core/money.js';

/**
 * Normalizes vendor name by removing common business suffixes, punctuation, and extra whitespace.
 * @param {string} rawName 
 * @returns {string} Clean normalized string
 */
export function normalizeVendorName(rawName) {
  if (!rawName) return '';
  let str = String(rawName).toLowerCase().trim();

  // Normalize '&' to 'and' before stripping punctuation
  str = str.replace(/&/g, ' and ');

  // Strip punctuation
  str = str.replace(/[.,\-:;'"\/\\()\[\]{}!@#$%^*+=?<>_]/g, ' ');
  str = str.replace(/\s+/g, ' ').trim();

  // Strip common South Asian and English trading suffixes
  const suffixes = [
    'cash and carry', 'traders', 'trader', 'stores', 'store',
    'enterprises', 'enterprise', 'general store', 'super store', 'mart',
    'pvt ltd', 'pvt', 'ltd', 'limited', 'co', 'company', 'agency', 'agencies',
    'suppliers', 'distributors', 'distributor', 'shop', 'karyana'
  ];

  for (const suf of suffixes) {
    const reg = new RegExp(`\\b${suf}\\b`, 'gi');
    str = str.replace(reg, ' ');
  }

  // Collapse consecutive whitespace
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Calculates Bigram (Dice's Coefficient) similarity between two strings (0.0 to 1.0).
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
export function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().replace(/\s+/g, '');
  const s2 = b.toLowerCase().replace(/\s+/g, '');
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Set();
  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.add(s1.substring(i, i + 2));
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bi = s2.substring(i, i + 2);
    if (bigrams1.has(bi)) intersection++;
  }

  return (2 * intersection) / (s1.length - 1 + s2.length - 1);
}

/**
 * Checks if two dates are within maxDays of each other.
 * @param {string} dateA YYYY-MM-DD
 * @param {string} dateB YYYY-MM-DD
 * @param {number} maxDays (default 1)
 * @returns {boolean}
 */
export function isDateWithinDays(dateA, dateB, maxDays = 1) {
  if (!dateA || !dateB) return false;
  try {
    const tA = new Date(dateA).getTime();
    const tB = new Date(dateB).getTime();
    if (isNaN(tA) || isNaN(tB)) return false;
    const diffDays = Math.abs(tA - tB) / (1000 * 60 * 60 * 24);
    return diffDays <= maxDays;
  } catch {
    return false;
  }
}

/**
 * Audits a transaction against historical transactions for Layer 3 business duplicates.
 * @param {Object} transaction Current transaction being edited/audited
 * @param {Array<Object>} history List of confirmed/historical transactions
 * @param {Object} options { vendorFuzzyThreshold?: number }
 * @returns {Array<Object>} Findings
 */
export function auditLayer3Duplicate(transaction, history = [], options = {}) {
  const findings = [];
  if (!transaction || !Array.isArray(history) || history.length === 0) {
    return findings;
  }

  const fuzzyThreshold = options.vendorFuzzyThreshold ?? 0.70;
  const currentVendorNorm = normalizeVendorName(transaction.vendorName);
  const currentBillNo = String(transaction.billNumber || '').trim();
  const currentTotal = transaction.printedGrandTotalMinor || transaction.grandTotalMinor || 0;
  const currentDate = transaction.date;
  const currentLineCount = Array.isArray(transaction.lines) ? transaction.lines.length : (transaction.lineCount || 0);

  for (const prev of history) {
    // Skip comparing against self if editing existing transaction
    if (transaction.id && prev.id === transaction.id) continue;

    const prevVendorNorm = normalizeVendorName(prev.vendorName);
    const prevBillNo = String(prev.billNumber || '').trim();
    const prevTotal = prev.grandTotalMinor || prev.printedGrandTotalMinor || 0;
    const prevDate = prev.date;
    const prevLineCount = prev.lineCount || (Array.isArray(prev.lines) ? prev.lines.length : 0);

    const vendorSimilarity = stringSimilarity(currentVendorNorm, prevVendorNorm);
    const sameVendor = currentVendorNorm === prevVendorNorm || vendorSimilarity >= fuzzyThreshold;
    const sameBillNo = currentBillNo && prevBillNo && currentBillNo === prevBillNo;
    const sameTotal = currentTotal > 0 && currentTotal === prevTotal;

    // 1. Exact Layer 3 Duplicate: Same Vendor + Same Bill # + Same Grand Total
    if (sameVendor && sameBillNo && sameTotal) {
      findings.push(createFinding({
        severity: SEVERITY.ERROR,
        code: FINDING_CODES.DUPLICATE_LAYER3,
        message: `Exact Business Duplicate: Invoice #${currentBillNo} for ${formatMoney(currentTotal, transaction.currency)} from "${prev.vendorName}" was already recorded on ${prevDate}.`,
        expected: null,
        actual: prev.id,
        suggestedFixes: [
          { label: 'View Existing Bill', type: 'VIEW_EXISTING', value: prev.id }
        ]
      }));
      return findings; // Found exact match, no need to check looser rule
    }

    // 2. Looser "Possible Duplicate": Same Vendor + Same Total + Date within ±1 day + Similar line count (±1)
    if (sameVendor && sameTotal && isDateWithinDays(currentDate, prevDate, 1)) {
      const lineCountDiff = Math.abs(currentLineCount - prevLineCount);
      if (lineCountDiff <= 1) {
        findings.push(createFinding({
          severity: SEVERITY.WARNING,
          code: FINDING_CODES.DUPLICATE_POSSIBLE,
          message: `Possible Duplicate Bill: Similar transaction of ${formatMoney(currentTotal, transaction.currency)} with ${prevLineCount} items recorded on ${prevDate} for "${prev.vendorName}".`,
          expected: null,
          actual: prev.id,
          suggestedFixes: [
            { label: 'Compare Side-by-Side', type: 'COMPARE_BILL', value: prev.id }
          ]
        }));
      }
    }
  }

  return findings;
}
