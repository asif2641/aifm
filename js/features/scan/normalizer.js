/**
 * @file normalizer.js
 * @description Normalizes raw AI extraction outputs into clean, type-safe draft transactions.
 * Strict invariant: all monetary values are converted to integer minor units via money.js.
 */

import { parseMoney, lineTotal, add, sub } from '../../core/money.js';
import { escapeHTML } from '../../core/utils.js';

/**
 * Normalizes a date string into YYYY-MM-DD format.
 * Defaults to today's date if missing or unparseable.
 * @param {string} rawDate 
 * @returns {string} ISO Date format YYYY-MM-DD
 */
export function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {}
  return new Date().toISOString().split('T')[0];
}

/**
 * Normalizes payment mode.
 * @param {string} rawMode 
 * @returns {'cash'|'credit'|'bank'|'other'}
 */
export function normalizePaymentMode(rawMode) {
  if (!rawMode) return 'cash';
  const m = String(rawMode).toLowerCase().trim();
  if (m.includes('cash') || m.includes('naqd')) return 'cash';
  if (m.includes('credit') || m.includes('udhaar') || m.includes('due')) return 'credit';
  if (m.includes('bank') || m.includes('card') || m.includes('transfer') || m.includes('cheque') || m.includes('online')) return 'bank';
  return 'other';
}

/**
 * Normalizes a single line item.
 * @param {Object} rawLine 
 * @param {string} currencyCode 
 * @param {number} defaultPageIndex 
 * @returns {Object} Cleaned line item
 */
export function normalizeLineItem(rawLine = {}, currencyCode = 'PKR', defaultPageIndex = 1) {
  const nameRaw = String(rawLine.nameRaw || rawLine.name || rawLine.item || 'Item').trim();
  const nameUrdu = String(rawLine.nameUrdu || '').trim();
  const nameEnglish = String(rawLine.nameEnglish || nameRaw).trim();

  // Quantity: parse numeric float safely, default 1
  let qty = 1;
  if (typeof rawLine.qty === 'number' && Number.isFinite(rawLine.qty) && rawLine.qty > 0) {
    qty = rawLine.qty;
  } else if (rawLine.qty || rawLine.quantity) {
    const parsedQty = parseFloat(String(rawLine.qty || rawLine.quantity).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsedQty) && parsedQty > 0) qty = parsedQty;
  }

  const unit = String(rawLine.unit || 'pcs').toLowerCase().trim();
  const category = String(rawLine.category || 'General').trim();

  // Unit price and printed line total in integer minor units
  const unitPriceMinor = parseMoney(rawLine.unitPrice ?? rawLine.rate ?? 0, currencyCode);
  let printedLineTotalMinor = parseMoney(rawLine.lineTotal ?? rawLine.printedLineTotal ?? 0, currencyCode);

  // If printedLineTotal was missing/0, compute from qty * unitPrice
  if (printedLineTotalMinor === 0 && unitPriceMinor > 0) {
    const qtyMilli = Math.round(qty * 1000);
    printedLineTotalMinor = lineTotal(qtyMilli, unitPriceMinor);
  }

  // Check for carried forward / brought forward summary markers
  const lowerName = nameRaw.toLowerCase();
  const isCarriedForward = lowerName.includes('carried forward') ||
                           lowerName.includes('brought forward') ||
                           lowerName.includes('b/f') ||
                           lowerName.includes('c/f') ||
                           lowerName.includes('baqaya') ||
                           lowerName.includes('total p/f');

  // Confidence score: 0 to 100
  let confidence = 90;
  if (typeof rawLine.confidence === 'number' && Number.isFinite(rawLine.confidence)) {
    confidence = Math.max(0, Math.min(100, Math.round(rawLine.confidence)));
  }

  return {
    id: rawLine.id || ('line_' + Math.random().toString(36).slice(2, 9)),
    nameRaw,
    nameEnglish,
    nameUrdu,
    category,
    qtyBilled: qty,
    qtyReceived: qty, // Default received = billed
    unit,
    unitPriceMinor,
    printedLineTotalMinor,
    taxable: rawLine.taxable !== false,
    confidence,
    pageIndex: rawLine.pageIndex || defaultPageIndex,
    isCarriedForward,
    notes: String(rawLine.notes || '')
  };
}

/**
 * Normalizes the full extraction response into a unified Draft Transaction.
 * @param {Object} rawExtraction 
 * @param {string} defaultCurrency 
 * @param {Array<Object>} pageMeta 
 * @returns {Object} Normalized Draft Transaction
 */
export function normalizeDraftTransaction(rawExtraction = {}, defaultCurrency = 'PKR', pageMeta = []) {
  const currency = rawExtraction.currencyHint || defaultCurrency || 'PKR';
  const vendorObj = rawExtraction.vendor || {};
  const vendorName = String(vendorObj.name || rawExtraction.vendorName || 'Unknown Vendor').trim();
  const vendorTaxId = String(vendorObj.taxId || rawExtraction.vendorTaxId || '').trim();
  const vendorPhone = String(vendorObj.phone || rawExtraction.vendorPhone || '').trim();

  const customerObj = rawExtraction.customer || {};
  const customerName = String(customerObj.name || '').trim();

  const billNumber = String(rawExtraction.billNumber || rawExtraction.invoiceNumber || '').trim();
  const date = normalizeDate(rawExtraction.date);
  const time = String(rawExtraction.time || '').trim();
  const paymentMode = normalizePaymentMode(rawExtraction.paymentMode);

  // Normalize lines
  const rawLines = Array.isArray(rawExtraction.lines) ? rawExtraction.lines : [];
  const lines = rawLines.map((l, idx) => normalizeLineItem(l, currency, (l.pageIndex || 1)));

  // Filter out pure carried forward lines from calculation
  const activeLines = lines.filter(l => !l.isCarriedForward);
  let computedSubtotalMinor = 0;
  for (const l of activeLines) {
    computedSubtotalMinor = add(computedSubtotalMinor, l.printedLineTotalMinor);
  }

  // Discount, Freight, Taxes
  const discountMinor = parseMoney(rawExtraction.discount || 0, currency);
  const freightMinor = parseMoney(rawExtraction.freight || rawExtraction.shipping || 0, currency);
  
  let printedGrandTotalMinor = parseMoney(rawExtraction.printedGrandTotal ?? rawExtraction.grandTotal ?? 0, currency);
  if (printedGrandTotalMinor === 0) {
    // Fallback: computed subtotal minus discount plus freight
    printedGrandTotalMinor = add(sub(computedSubtotalMinor, discountMinor), freightMinor);
  }

  // Taxes array
  const taxes = [];
  if (Array.isArray(rawExtraction.taxes)) {
    for (const t of rawExtraction.taxes) {
      taxes.push({
        name: String(t.name || 'Sales Tax').trim(),
        ratePercent: parseFloat(t.ratePercent || t.rate || 0),
        amountMinor: parseMoney(t.amount || 0, currency)
      });
    }
  }

  return {
    type: 'purchase',
    status: 'draft',
    currency,
    vendorName,
    vendorTaxId,
    vendorPhone,
    customerName,
    billNumber,
    date,
    time,
    paymentMode,
    subtotalMinor: computedSubtotalMinor,
    discountMinor,
    freightMinor,
    taxes,
    printedGrandTotalMinor,
    lines,
    pageCount: pageMeta.length || 1,
    documents: pageMeta.map(p => ({
      id: p.id,
      sha256: p.sha256,
      dHash: p.dHash,
      thumbnailUrl: p.thumbnailUrl,
      pageIndex: p.pageIndex
    }))
  };
}
