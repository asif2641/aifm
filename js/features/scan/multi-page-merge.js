/**
 * @file multi-page-merge.js
 * @description Merges multi-page bill extraction results into a single coherent draft transaction.
 * Merges header from first available page, grand total from final page, and deduplicates junction rows.
 */

import { normalizeDraftTransaction, normalizeLineItem } from './normalizer.js';
import { add, sub } from '../../core/money.js';

/**
 * Checks if two line items appear to be duplicates across page junctions.
 * @param {Object} lineA 
 * @param {Object} lineB 
 * @returns {boolean}
 */
export function isJunctionDuplicate(lineA, lineB) {
  if (!lineA || !lineB) return false;
  // If identical name and identical line total
  const sameName = lineA.nameRaw.toLowerCase().trim() === lineB.nameRaw.toLowerCase().trim();
  const sameTotal = lineA.printedLineTotalMinor === lineB.printedLineTotalMinor;
  const sameQty = lineA.qtyBilled === lineB.qtyBilled;
  return sameName && (sameTotal || sameQty);
}

/**
 * Merges an array of page extractions into one consolidated draft.
 * @param {Array<Object>} pageResults Array of raw extraction JSON objects per page
 * @param {Array<Object>} pageMeta Array of page metadata objects (id, sha256, dHash, preview)
 * @param {string} currencyCode 
 * @returns {{ mergedDraft: Object, deduplicatedCount: number, notes: Array<string> }}
 */
export function mergeMultiPageExtractions(pageResults = [], pageMeta = [], currencyCode = 'PKR') {
  if (pageResults.length === 0) {
    return {
      mergedDraft: normalizeDraftTransaction({}, currencyCode, pageMeta),
      deduplicatedCount: 0,
      notes: []
    };
  }

  if (pageResults.length === 1) {
    const draft = normalizeDraftTransaction(pageResults[0], currencyCode, pageMeta);
    return {
      mergedDraft: draft,
      deduplicatedCount: 0,
      notes: ['Single-page bill processed.']
    };
  }

  const notes = [];
  let mergedVendor = null;
  let mergedCustomer = null;
  let mergedBillNumber = null;
  let mergedDate = null;
  let mergedPaymentMode = null;
  let mergedTaxes = [];
  let mergedDiscount = 0;
  let mergedFreight = 0;
  let mergedGrandTotal = 0;

  const allLines = [];
  let deduplicatedCount = 0;

  // 1. Traverse pages to extract header from first page that has it
  for (let i = 0; i < pageResults.length; i++) {
    const p = pageResults[i];
    const pageNum = i + 1;

    if (!mergedVendor && (p.vendor?.name || p.vendorName)) {
      mergedVendor = p.vendor || { name: p.vendorName, taxId: p.vendorTaxId, phone: p.vendorPhone };
      notes.push(`Vendor details captured from Page ${pageNum}.`);
    }
    if (!mergedCustomer && (p.customer?.name || p.customerName)) {
      mergedCustomer = p.customer || { name: p.customerName };
    }
    if (!mergedBillNumber && (p.billNumber || p.invoiceNumber)) {
      mergedBillNumber = p.billNumber || p.invoiceNumber;
      notes.push(`Bill Number #${mergedBillNumber} captured from Page ${pageNum}.`);
    }
    if (!mergedDate && p.date) {
      mergedDate = p.date;
    }
    if (!mergedPaymentMode && p.paymentMode) {
      mergedPaymentMode = p.paymentMode;
    }

    // Accumulate lines with pageIndex stamped
    const rawLines = Array.isArray(p.lines) ? p.lines : [];
    for (const rawL of rawLines) {
      const line = normalizeLineItem(rawL, currencyCode, pageNum);

      // Check if this line is an exact junction duplicate of the immediately preceding line
      if (allLines.length > 0) {
        const lastLine = allLines[allLines.length - 1];
        if (lastLine.pageIndex !== pageNum && isJunctionDuplicate(lastLine, line)) {
          deduplicatedCount++;
          notes.push(`Deduplicated overlapping item "${line.nameRaw}" between Page ${lastLine.pageIndex} and Page ${pageNum}.`);
          continue; // Skip duplicate junction row
        }
      }

      allLines.push(line);
    }
  }

  // 2. Extract Grand Total and Final Taxes from the LAST page that has them
  for (let i = pageResults.length - 1; i >= 0; i--) {
    const p = pageResults[i];
    if (p.printedGrandTotal || p.grandTotal) {
      mergedGrandTotal = p.printedGrandTotal || p.grandTotal;
      notes.push(`Final grand total captured from Page ${i + 1}.`);
      if (Array.isArray(p.taxes) && p.taxes.length > 0) mergedTaxes = p.taxes;
      if (p.discount) mergedDiscount = p.discount;
      if (p.freight || p.shipping) mergedFreight = p.freight || p.shipping;
      break;
    }
  }

  const consolidatedRaw = {
    vendor: mergedVendor || { name: 'Unknown Vendor' },
    customer: mergedCustomer || {},
    billNumber: mergedBillNumber || '',
    date: mergedDate || new Date().toISOString().split('T')[0],
    paymentMode: mergedPaymentMode || 'cash',
    taxes: mergedTaxes,
    discount: mergedDiscount,
    freight: mergedFreight,
    printedGrandTotal: mergedGrandTotal,
    lines: allLines
  };

  const finalDraft = normalizeDraftTransaction(consolidatedRaw, currencyCode, pageMeta);

  return {
    mergedDraft: finalDraft,
    deduplicatedCount,
    notes
  };
}
