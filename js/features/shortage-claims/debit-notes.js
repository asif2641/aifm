// =========================================================================
// DEBIT NOTES & SHORTAGE CLAIMS (PURE FUNCTIONS)
// Billed vs Received shortage value calculation & Debit Note generation
// =========================================================================

import { lineTotal, add, sub } from '../../core/money.js';

/**
 * Evaluates line items for shortages between Billed and Received quantities.
 *
 * @param {Array<Object>} lines - Bill line items with qtyBilled, qtyReceived, unitPriceMinor, taxRateBp
 * @param {Object} options - { currency, taxExclusive }
 * @returns {Object|null} Shortage report or null if no shortage exists
 */
export function detectBillShortages(lines = [], options = {}) {
  const shortageLines = [];
  let subtotalShortageMinor = 0;
  let taxShortageMinor = 0;

  for (const l of lines) {
    const billed = parseFloat(l.qtyBilled) || 0;
    const received = l.qtyReceived != null ? parseFloat(l.qtyReceived) : billed;

    if (billed > received) {
      const diffQty = billed - received;
      const diffMilli = Math.round(diffQty * 1000);
      const unitPrice = l.unitPriceMinor || 0;
      const shortageLineVal = lineTotal(diffMilli, unitPrice);

      let lineTaxShortage = 0;
      if (l.taxRateBp && l.taxRateBp > 0) {
        lineTaxShortage = Math.round((shortageLineVal * l.taxRateBp) / 10000);
      }

      subtotalShortageMinor = add(subtotalShortageMinor, shortageLineVal);
      taxShortageMinor = add(taxShortageMinor, lineTaxShortage);

      shortageLines.push({
        lineId: l.id,
        nameRaw: l.nameRaw || l.nameEnglish || 'Item',
        unit: l.unit || 'pcs',
        qtyBilled: billed,
        qtyReceived: received,
        shortageQty: diffQty,
        shortageQtyMilli: diffMilli,
        unitPriceMinor: unitPrice,
        shortageValueMinor: shortageLineVal,
        taxRateBp: l.taxRateBp || 0,
        taxMinor: lineTaxShortage,
        totalShortageMinor: add(shortageLineVal, lineTaxShortage)
      });
    }
  }

  if (shortageLines.length === 0) return null;

  const grandShortageTotalMinor = add(subtotalShortageMinor, taxShortageMinor);

  return {
    hasShortage: true,
    lines: shortageLines,
    subtotalMinor: subtotalShortageMinor,
    taxMinor: taxShortageMinor,
    totalMinor: grandShortageTotalMinor
  };
}

/**
 * Creates a normalized Debit Note / Shortage Claim document from a bill's shortages.
 *
 * @param {Object} bill - The original purchase bill transaction
 * @param {Object} shortageReport - Output from detectBillShortages
 * @param {string} noteNumber - Gap-free sequential note number (e.g. DN-2026-0001)
 * @param {string} userId - User creating the claim
 * @returns {Object} Debit note entity
 */
export function createDebitNote(bill, shortageReport, noteNumber, userId = 'admin') {
  if (!shortageReport || !shortageReport.hasShortage) return null;

  return {
    id: 'dn_' + Math.random().toString(36).slice(2, 9),
    noteNumber,
    type: 'vendor_shortage',
    transactionId: bill.id,
    billNumber: bill.billNumber || '',
    partyId: bill.partyId || bill.vendorName,
    vendorName: bill.vendorName,
    date: new Date().toISOString().slice(0, 10),
    currency: bill.currency || 'PKR',
    lines: shortageReport.lines,
    subtotalMinor: shortageReport.subtotalMinor,
    taxMinor: shortageReport.taxMinor,
    totalMinor: shortageReport.totalMinor,
    status: 'open', // 'open' | 'resolved' | 'written_off'
    notes: `Shortage claim generated automatically from Bill #${bill.billNumber || bill.id}.`,
    createdBy: userId,
    createdAt: new Date().toISOString()
  };
}
