/**
 * @file finding-model.js
 * @description Standardized data model and codes for Audit Engine findings.
 */

export const SEVERITY = {
  ERROR: 'error',       // Coral/Red: Math discrepancy, missing required data, critical mismatch
  WARNING: 'warning',   // Amber: Price hike, low confidence, possible duplicate, missing optional fields
  INFO: 'info'          // Blue: Educational tip, carried forward note, unit auto-conversion
};

export const FINDING_CODES = {
  MATH_ROW_MISMATCH: 'MATH_ROW_MISMATCH',
  INVOICE_TOTAL_MISMATCH: 'INVOICE_TOTAL_MISMATCH',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  MISSING_OPTIONAL_FIELD: 'MISSING_OPTIONAL_FIELD',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  UNREADABLE_FIELD: 'UNREADABLE_FIELD',
  PRICE_OUTLIER: 'PRICE_OUTLIER',
  INVALID_DATE: 'INVALID_DATE',
  DUPLICATE_LAYER3: 'DUPLICATE_LAYER3',
  DUPLICATE_POSSIBLE: 'DUPLICATE_POSSIBLE',
  PRICE_HIKE: 'PRICE_HIKE',
  ITEM_UNRECOGNIZED: 'ITEM_UNRECOGNIZED'
};

/**
 * Creates a normalized finding object.
 * @param {Object} params 
 * @returns {Object} Finding
 */
export function createFinding({
  severity = SEVERITY.WARNING,
  code,
  lineId = null,
  message,
  expected = null,
  actual = null,
  diff = null,
  suggestedFixes = []
}) {
  return {
    id: 'fnd_' + Math.random().toString(36).slice(2, 9),
    severity,
    code,
    lineId,
    message,
    expected,
    actual,
    diff,
    suggestedFixes: Array.isArray(suggestedFixes) ? suggestedFixes : [],
    reviewed: false,
    reviewNote: ''
  };
}
