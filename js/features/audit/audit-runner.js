/**
 * @file audit-runner.js
 * @description Central pure orchestrator for the Audit Engine.
 * Evaluates row math, invoice reconciliation, missing data, business duplicates, and price hikes.
 */

import { SEVERITY } from './finding-model.js';
import { auditRowMath } from './math-audit.js';
import { auditInvoiceTotals } from './invoice-audit.js';
import { auditMissingAndConfusion } from './missing-detector.js';
import { auditLayer3Duplicate } from './duplicate-layer3.js';
import { auditPriceHikes } from './price-hike.js';

/**
 * Runs a complete audit on a bill transaction.
 * @param {Object} transaction Current transaction being reviewed
 * @param {Object} context { historicalTransactions?: Array, itemMaster?: Array, options?: Object }
 * @returns {{ findings: Array<Object>, summary: { errorCount: number, warningCount: number, infoCount: number, pass: boolean } }}
 */
export function runCompleteAudit(transaction, context = {}) {
  const { historicalTransactions = [], itemMaster = [], options = {} } = context;
  const findings = [];

  if (!transaction) {
    return {
      findings: [],
      summary: { errorCount: 0, warningCount: 0, infoCount: 0, pass: true }
    };
  }

  // 1. Line-by-Line Row Math Audit
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  for (const line of lines) {
    const mathFinding = auditRowMath(line, {
      toleranceMinor: options.mathToleranceMinor ?? 1,
      currency: transaction.currency
    });
    if (mathFinding) findings.push(mathFinding);
  }

  // 2. Invoice Grand Total & Tax Audit
  const invoiceFindings = auditInvoiceTotals(transaction, {
    toleranceMinor: options.mathToleranceMinor ?? 1
  });
  findings.push(...invoiceFindings);

  // 3. Missing Fields & Confidence Confusion Detector
  const missingFindings = auditMissingAndConfusion(transaction, {
    minConfidence: options.minConfidence ?? 80,
    todayDate: options.todayDate
  });
  findings.push(...missingFindings);

  // 4. Layer 3 Business Duplicate Detection
  const duplicateFindings = auditLayer3Duplicate(transaction, historicalTransactions, {
    vendorFuzzyThreshold: options.vendorFuzzyThreshold ?? 0.70
  });
  findings.push(...duplicateFindings);

  // 5. Price Hike Detector
  const hikeFindings = auditPriceHikes(transaction, historicalTransactions, itemMaster, {
    thresholdPercent: options.priceHikeThresholdPercent ?? 5.0
  });
  findings.push(...hikeFindings);

  // Calculate Summary
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const f of findings) {
    if (f.severity === SEVERITY.ERROR) errorCount++;
    else if (f.severity === SEVERITY.WARNING) warningCount++;
    else if (f.severity === SEVERITY.INFO) infoCount++;
  }

  return {
    findings,
    summary: {
      errorCount,
      warningCount,
      infoCount,
      pass: errorCount === 0 && warningCount === 0
    }
  };
}
