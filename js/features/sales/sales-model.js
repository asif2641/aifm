// =========================================================================
// SALES & MARGIN DERIVATION MODEL (PURE FUNCTIONS)
// Quotations, Sales Invoices, COGS, and WAC Margin Calculations
// =========================================================================

import { lineTotal, add, sub } from '../../core/money.js';

/**
 * Calculates COGS, gross profit, and margin percentage for a sales line item.
 *
 * @param {Object} line - Sales line item { qty, unitPriceMinor, wacCostMinor }
 * @returns {Object} { lineTotalMinor, cogsMinor, grossProfitMinor, marginPct }
 */
export function calculateLineMargin(line) {
  const qty = parseFloat(line.qty) || 0;
  const qtyMilli = Math.round(qty * 1000);
  const saleRate = line.unitPriceMinor || 0;
  const costRate = line.wacCostMinor || 0;

  const lineTotalMinor = lineTotal(qtyMilli, saleRate);
  const cogsMinor = lineTotal(qtyMilli, costRate);
  const grossProfitMinor = lineTotalMinor - cogsMinor;

  const marginPct = lineTotalMinor > 0
    ? Math.round(((grossProfitMinor / lineTotalMinor) * 100) * 10) / 10
    : 0;

  return {
    lineTotalMinor,
    cogsMinor,
    grossProfitMinor,
    marginPct
  };
}

/**
 * Derives invoice-level sales totals, overall COGS, and overall Gross Margin.
 *
 * @param {Array<Object>} lines - Array of sales lines
 * @param {Object} adjustments - { discountMinor, taxMinor, freightMinor }
 * @returns {Object} Invoice financial summary
 */
export function calculateSalesInvoiceTotals(lines = [], adjustments = {}) {
  const { discountMinor = 0, taxMinor = 0, freightMinor = 0 } = adjustments;

  let subtotalMinor = 0;
  let totalCogsMinor = 0;

  const enrichedLines = lines.map(l => {
    const marginData = calculateLineMargin(l);
    subtotalMinor = add(subtotalMinor, marginData.lineTotalMinor);
    totalCogsMinor = add(totalCogsMinor, marginData.cogsMinor);
    return {
      ...l,
      ...marginData
    };
  });

  const netRevenueMinor = sub(subtotalMinor, discountMinor);
  const grandTotalMinor = add(add(netRevenueMinor, taxMinor), freightMinor);
  const overallGrossProfitMinor = sub(netRevenueMinor, totalCogsMinor);

  const overallMarginPct = netRevenueMinor > 0
    ? Math.round(((overallGrossProfitMinor / netRevenueMinor) * 100) * 10) / 10
    : 0;

  return {
    lines: enrichedLines,
    subtotalMinor,
    discountMinor,
    netRevenueMinor,
    taxMinor,
    freightMinor,
    grandTotalMinor,
    totalCogsMinor,
    grossProfitMinor: overallGrossProfitMinor,
    marginPct: overallMarginPct
  };
}

/**
 * Converts a Quotation into a Sales Invoice entity.
 *
 * @param {Object} quotation - Quotation entity
 * @param {string} invoiceNumber - Sequential sales invoice number (e.g. INV-2026-0001)
 * @param {string} userId - User creating the invoice
 * @returns {Object} Sales Invoice document ready to post
 */
export function convertQuotationToInvoice(quotation, invoiceNumber, userId = 'admin') {
  if (!quotation) return null;

  return {
    id: 'tx_sale_' + Math.random().toString(36).slice(2, 9),
    type: 'sale',
    quotationId: quotation.id,
    billNumber: invoiceNumber,
    partyId: quotation.partyId,
    customerName: quotation.customerName,
    date: new Date().toISOString().slice(0, 10),
    currency: quotation.currency || 'PKR',
    lines: quotation.lines || [],
    subtotalMinor: quotation.subtotalMinor || 0,
    discountMinor: quotation.discountMinor || 0,
    freightMinor: quotation.freightMinor || 0,
    taxMinor: quotation.taxMinor || 0,
    grandTotalMinor: quotation.grandTotalMinor || 0,
    totalCogsMinor: quotation.totalCogsMinor || 0,
    grossProfitMinor: quotation.grossProfitMinor || 0,
    paymentStatus: 'unpaid', // 'paid' | 'partial' | 'unpaid'
    paymentMode: quotation.paymentMode || 'cash',
    status: 'confirmed',
    createdBy: userId,
    createdAt: new Date().toISOString()
  };
}
