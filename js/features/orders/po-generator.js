// =========================================================================
// PURCHASE ORDER AUTO-GENERATOR & NUMBERING (PURE FUNCTIONS)
// Auto-fills low stock items, suggested reorder quantities & gap-free numbering
// =========================================================================

import { lineTotal, add } from '../../core/money.js';

/**
 * Generates replenishment suggestions for a vendor's items.
 * Finds all items supplied by this vendor where derived stock <= reorder level.
 *
 * @param {string} vendorName - Vendor name or party ID
 * @param {Array<Object>} items - Item Master records
 * @param {Map<string, number>} stockMap - Map of itemId -> stock in milli-units
 * @param {Array<Object>} pastTransactions - Historical transactions to fetch last rates
 * @param {Array<Object>} openDebitNotes - Open shortages that need replacement
 * @returns {Array<Object>} Suggested PO line items
 */
export function generatePOSuggestions(vendorName, items = [], stockMap = new Map(), pastTransactions = [], openDebitNotes = []) {
  if (!vendorName) return [];

  // Find unfulfilled shortage quantities per item for this vendor
  const shortageQtyMap = new Map();
  for (const dn of openDebitNotes) {
    if ((dn.vendorName === vendorName || dn.partyId === vendorName) && dn.status === 'open') {
      for (const l of (dn.lines || [])) {
        const key = (l.nameRaw || '').toLowerCase().trim();
        const cur = shortageQtyMap.get(key) || 0;
        shortageQtyMap.set(key, cur + (l.shortageQtyMilli || 0));
      }
    }
  }

  // Find last purchase price per item from this vendor
  const lastPriceMap = new Map();
  const sortedTxs = [...pastTransactions]
    .filter(t => (t.vendorName === vendorName || t.partyId === vendorName) && (t.status === 'confirmed' || t.status === 'posted'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const t of sortedTxs) {
    for (const l of (t.lines || [])) {
      const key = (l.nameRaw || l.nameEnglish || '').toLowerCase().trim();
      if (!lastPriceMap.has(key) && l.unitPriceMinor > 0) {
        lastPriceMap.set(key, l.unitPriceMinor);
      }
    }
  }

  const suggestions = [];

  for (const item of items) {
    // Check if item is supplied by this vendor (or has history with this vendor)
    const normName = (item.name || item.nameRaw || '').toLowerCase().trim();
    const isVendorItem = item.defaultVendor === vendorName || lastPriceMap.has(normName);

    if (!isVendorItem) continue;

    const curStockMilli = stockMap.get(item.id) || 0;
    const reorderMilli = item.reorderLevelMilli != null ? item.reorderLevelMilli : 10000; // default 10 units
    const shortageMilli = shortageQtyMap.get(normName) || 0;

    // Trigger if stock <= reorder level OR there are pending shortages
    if (curStockMilli <= reorderMilli || shortageMilli > 0) {
      // Suggested replenishment = (reorderTarget - curStock) + shortage
      const deficitMilli = Math.max(0, (item.targetStockMilli || (reorderMilli * 2)) - curStockMilli);
      const suggestedMilli = deficitMilli + shortageMilli;
      const suggestedQty = Math.max(1, Math.round(suggestedMilli / 1000));

      const lastRate = lastPriceMap.get(normName) || item.defaultPurchasePriceMinor || 0;
      const lineTot = lineTotal(suggestedQty * 1000, lastRate);

      suggestions.push({
        itemId: item.id,
        nameRaw: item.name || normName,
        unit: item.unit || 'pcs',
        currentStockMilli: curStockMilli,
        reorderLevelMilli: reorderMilli,
        shortageMilli,
        suggestedQty,
        unitPriceMinor: lastRate,
        lineTotalMinor: lineTot
      });
    }
  }

  return suggestions;
}

/**
 * Builds a Purchase Order entity with auto-calculated totals.
 *
 * @param {Object} data - { poNumber, vendorName, partyId, date, lines, currency, notes, userId }
 * @returns {Object} Complete PO document
 */
export function buildPurchaseOrder(data) {
  const {
    poNumber,
    vendorName,
    partyId = null,
    date = new Date().toISOString().slice(0, 10),
    lines = [],
    currency = 'PKR',
    notes = '',
    userId = 'admin'
  } = data;

  let subtotalMinor = 0;
  for (const l of lines) {
    const qty = parseFloat(l.qty) || 0;
    const rate = l.unitPriceMinor || 0;
    const tot = lineTotal(Math.round(qty * 1000), rate);
    l.lineTotalMinor = tot;
    subtotalMinor = add(subtotalMinor, tot);
  }

  return {
    id: 'po_' + Math.random().toString(36).slice(2, 9),
    poNumber,
    type: 'purchase_order',
    vendorName,
    partyId,
    date,
    currency,
    lines,
    subtotalMinor,
    grandTotalMinor: subtotalMinor,
    status: 'draft', // 'draft' | 'issued' | 'received' | 'cancelled'
    notes,
    createdBy: userId,
    createdAt: new Date().toISOString()
  };
}

/**
 * Generates gap-free sequential document number.
 * Formats: PO-2026-0001, DN-2026-0001, PV-2026-0001, INV-2026-0001
 *
 * @param {Object} counterRecord - { id: prefix_year, nextSeq: number }
 * @param {string} prefix - 'PO' | 'DN' | 'PV' | 'INV'
 * @param {number} year - Defaults to current calendar year
 * @returns {{ documentNumber: string, updatedRecord: Object }}
 */
export function formatSequentialNumber(counterRecord, prefix = 'PO', year = new Date().getFullYear()) {
  const seq = (counterRecord && counterRecord.nextSeq) ? counterRecord.nextSeq : 1;
  const pad = String(seq).padStart(4, '0');
  const documentNumber = `${prefix}-${year}-${pad}`;

  return {
    documentNumber,
    updatedRecord: {
      id: `${prefix}_${year}`,
      prefix,
      year,
      nextSeq: seq + 1,
      lastAssigned: documentNumber,
      updatedAt: new Date().toISOString()
    }
  };
}
