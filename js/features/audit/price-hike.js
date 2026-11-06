/**
 * @file price-hike.js
 * @description Pure function for detecting unexpected price increases compared to historical vendor purchases.
 */

import { SEVERITY, FINDING_CODES, createFinding } from './finding-model.js';
import { formatMoney } from '../../core/money.js';
import { normalizeVendorName } from './duplicate-layer3.js';
import { matchItemMaster, convertQuantityAndPrice, normalizeUnit } from './item-master.js';

/**
 * Audits a transaction's line items for price hikes compared to previous purchases from the same vendor.
 * @param {Object} transaction Current transaction
 * @param {Array<Object>} history Historical transactions with their lines
 * @param {Array<Object>} masterItems Item Master catalog
 * @param {Object} options { thresholdPercent?: number }
 * @returns {Array<Object>} Findings
 */
export function auditPriceHikes(transaction, history = [], masterItems = [], options = {}) {
  const findings = [];
  if (!transaction || !Array.isArray(history) || history.length === 0) {
    return findings;
  }

  const thresholdPercent = options.thresholdPercent ?? 5.0; // 5% default
  const currency = transaction.currency || 'PKR';
  const currentVendorNorm = normalizeVendorName(transaction.vendorName);
  const currentLines = Array.isArray(transaction.lines) ? transaction.lines : [];

  // Filter history to purchases from the same vendor, sorted by date descending (most recent first)
  const vendorHistory = history
    .filter(t => normalizeVendorName(t.vendorName) === currentVendorNorm && t.id !== transaction.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (vendorHistory.length === 0) return findings;

  for (const line of currentLines) {
    if (line.isCarriedForward || !line.unitPriceMinor || line.unitPriceMinor <= 0) continue;

    const currentUnit = normalizeUnit(line.unit || 'pcs');
    let prevPurchase = null;

    // Search historical lines for a matching item
    for (const hTx of vendorHistory) {
      const hLines = Array.isArray(hTx.lines) ? hTx.lines : [];
      for (const hLine of hLines) {
        if (!hLine.unitPriceMinor || hLine.unitPriceMinor <= 0) continue;

        // Check if raw names match or resolve to same item master
        const nameMatch = line.nameRaw.toLowerCase().trim() === hLine.nameRaw.toLowerCase().trim();
        let masterMatch = false;
        if (!nameMatch && masterItems.length > 0) {
          const mCurrent = matchItemMaster(line.nameRaw, masterItems);
          const mHist = matchItemMaster(hLine.nameRaw, masterItems);
          if (mCurrent.item && mHist.item && mCurrent.item.id === mHist.item.id) {
            masterMatch = true;
          }
        }

        if (nameMatch || masterMatch) {
          prevPurchase = {
            date: hTx.date,
            unitPriceMinor: hLine.unitPriceMinor,
            unit: normalizeUnit(hLine.unit || 'pcs'),
            txId: hTx.id
          };
          break;
        }
      }
      if (prevPurchase) break;
    }

    if (prevPurchase) {
      let prevPrice = prevPurchase.unitPriceMinor;
      // If units differ (e.g. current is kg, previous was g), convert previous to current unit
      if (prevPurchase.unit !== currentUnit) {
        const conv = convertQuantityAndPrice(1, prevPrice, prevPurchase.unit, currentUnit);
        if (conv) prevPrice = conv.normalizedUnitPriceMinor;
      }

      if (prevPrice > 0 && line.unitPriceMinor > prevPrice) {
        const diffMinor = line.unitPriceMinor - prevPrice;
        const hikePercent = Math.round((diffMinor / prevPrice) * 1000) / 10;

        if (hikePercent >= thresholdPercent) {
          const currStr = formatMoney(line.unitPriceMinor, currency);
          const prevStr = formatMoney(prevPrice, currency);
          findings.push(createFinding({
            severity: SEVERITY.WARNING,
            code: FINDING_CODES.PRICE_HIKE,
            lineId: line.id,
            message: `Price Hike on "${line.nameRaw}": +${hikePercent}% higher than last purchase (${prevStr} on ${prevPurchase.date} &rarr; now ${currStr}).`,
            expected: prevPrice,
            actual: line.unitPriceMinor,
            diff: diffMinor,
            suggestedFixes: [
              {
                id: 'fix_revert_price',
                label: `Revert to previous price (${prevStr})`,
                type: 'SET_PRICE',
                lineId: line.id,
                value: prevPrice
              }
            ]
          }));
        }
      }
    }
  }

  return findings;
}
