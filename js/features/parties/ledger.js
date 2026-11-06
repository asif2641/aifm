// =========================================================================
// RUNNING LEDGER, AGING BUCKETS & WHATSAPP REMINDER (PURE FUNCTIONS)
// =========================================================================

import { formatMoney } from '../../core/money.js';

/**
 * Builds a chronological running ledger statement for a party.
 *
 * @param {string} partyId - Party ID
 * @param {Object} context - { transactions, payments, debitNotes, startDate, endDate, currency }
 * @returns {Object} { openingBalanceMinor, closingBalanceMinor, entries: Array<Object> }
 */
export function buildRunningLedger(partyId, context = {}) {
  const {
    transactions = [],
    payments = [],
    debitNotes = [],
    startDate = null,
    endDate = null,
    currency = 'PKR',
    isVendor = true
  } = context;

  const inDate = (d) => (d ? d.slice(0, 10) : '');

  // 1. Gather all events
  const allEvents = [];

  // Invoices (Purchases or Sales)
  for (const t of transactions) {
    if ((t.partyId === partyId || t.vendorName === partyId || t.customerName === partyId) &&
        (t.status === 'confirmed' || t.status === 'posted')) {
      allEvents.push({
        id: t.id,
        date: inDate(t.date),
        type: 'INVOICE',
        ref: t.billNumber || t.id,
        description: isVendor ? `Purchase Bill #${t.billNumber || t.id}` : `Sales Invoice #${t.billNumber || t.id}`,
        // For vendor: Invoice increases payable (Credit)
        // For customer: Invoice increases receivable (Debit)
        amountMinor: t.grandTotalMinor || 0,
        sign: isVendor ? 1 : 1 // Positive increases party balance owed
      });
    }
  }

  // Payments
  for (const p of payments) {
    if (p.partyId === partyId && p.status !== 'cancelled') {
      allEvents.push({
        id: p.id,
        date: inDate(p.date),
        type: 'PAYMENT',
        ref: p.ref || p.id,
        description: `Payment (${p.paymentMode || 'cash'}) - Ref: ${p.ref || '-'}`,
        amountMinor: p.amountMinor || 0,
        sign: -1 // Decreases balance owed
      });
    }
  }

  // Debit Notes / Shortages
  for (const d of debitNotes) {
    if ((d.partyId === partyId || d.vendorName === partyId) && d.status !== 'cancelled') {
      allEvents.push({
        id: d.id,
        date: inDate(d.date),
        type: 'DEBIT_NOTE',
        ref: d.noteNumber || d.id,
        description: `Debit Note / Shortage Claim #${d.noteNumber || d.id}`,
        amountMinor: d.totalMinor || 0,
        sign: -1 // Reduces vendor payable
      });
    }
  }

  // Sort events chronologically (date, then id)
  allEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });

  // Calculate opening balance before startDate
  let running = 0;
  let openingBalanceMinor = 0;
  const filteredEntries = [];

  for (const ev of allEvents) {
    const delta = ev.amountMinor * ev.sign;
    if (startDate && ev.date < startDate) {
      running += delta;
      openingBalanceMinor = running;
    } else if (!endDate || ev.date <= endDate) {
      running += delta;
      filteredEntries.push({
        ...ev,
        debitMinor: ev.sign > 0 ? ev.amountMinor : 0,
        creditMinor: ev.sign < 0 ? ev.amountMinor : 0,
        runningBalanceMinor: running
      });
    }
  }

  return {
    partyId,
    startDate,
    endDate,
    openingBalanceMinor,
    closingBalanceMinor: running,
    entries: filteredEntries
  };
}

/**
 * Computes receivables or payables aging buckets:
 * [0-30, 31-60, 61-90, 90+] days
 * Uses FIFO allocation of total payments + debit notes against invoices.
 *
 * @param {string} partyId - Party ID
 * @param {Object} context - { transactions, payments, debitNotes, asOfDate }
 * @returns {Object} { totalOwedMinor, buckets: { current_0_30, past_31_60, past_61_90, past_90_plus }, invoices: Array }
 */
export function computeAgingBuckets(partyId, context = {}) {
  const {
    transactions = [],
    payments = [],
    debitNotes = [],
    asOfDate = new Date().toISOString().slice(0, 10)
  } = context;

  // Filter confirmed invoices up to asOfDate
  const invoices = transactions
    .filter(t => 
      (t.partyId === partyId || t.vendorName === partyId || t.customerName === partyId) &&
      (t.status === 'confirmed' || t.status === 'posted') &&
      (!t.date || t.date.slice(0, 10) <= asOfDate)
    )
    .map(t => ({
      id: t.id,
      billNumber: t.billNumber || t.id,
      date: t.date ? t.date.slice(0, 10) : asOfDate,
      dueDate: t.dueDate ? t.dueDate.slice(0, 10) : (t.date ? t.date.slice(0, 10) : asOfDate),
      grandTotalMinor: t.grandTotalMinor || 0,
      unpaidMinor: t.grandTotalMinor || 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first (FIFO)

  // Sum payments and debit notes up to asOfDate
  let totalCredits = 0;
  for (const p of payments) {
    if (p.partyId === partyId && p.status !== 'cancelled' && (!p.date || p.date.slice(0, 10) <= asOfDate)) {
      totalCredits += (p.amountMinor || 0);
    }
  }
  for (const d of debitNotes) {
    if ((d.partyId === partyId || d.vendorName === partyId) && d.status !== 'cancelled' && (!d.date || d.date.slice(0, 10) <= asOfDate)) {
      totalCredits += (d.totalMinor || 0);
    }
  }

  // Allocate credits to oldest invoices first (FIFO)
  let remainingCredit = totalCredits;
  for (const inv of invoices) {
    if (remainingCredit >= inv.unpaidMinor) {
      remainingCredit -= inv.unpaidMinor;
      inv.unpaidMinor = 0;
    } else {
      inv.unpaidMinor -= remainingCredit;
      remainingCredit = 0;
    }
  }

  // Calculate age for remaining unpaid invoices
  const asOfTime = new Date(asOfDate).getTime();
  const buckets = {
    current_0_30: 0,
    past_31_60: 0,
    past_61_90: 0,
    past_90_plus: 0
  };

  let totalOwedMinor = 0;

  for (const inv of invoices) {
    if (inv.unpaidMinor > 0) {
      totalOwedMinor += inv.unpaidMinor;
      const invTime = new Date(inv.date).getTime();
      const diffDays = Math.max(0, Math.floor((asOfTime - invTime) / (1000 * 60 * 60 * 24)));
      inv.daysOld = diffDays;

      if (diffDays <= 30) {
        buckets.current_0_30 += inv.unpaidMinor;
      } else if (diffDays <= 60) {
        buckets.past_31_60 += inv.unpaidMinor;
      } else if (diffDays <= 90) {
        buckets.past_61_90 += inv.unpaidMinor;
      } else {
        buckets.past_90_plus += inv.unpaidMinor;
      }
    }
  }

  return {
    asOfDate,
    totalOwedMinor,
    unallocatedCreditsMinor: remainingCredit,
    buckets,
    unpaidInvoices: invoices.filter(inv => inv.unpaidMinor > 0)
  };
}

/**
 * Generates copy-ready WhatsApp reminder text for overdue accounts.
 *
 * @param {Object} party - Party object { name, phone, ... }
 * @param {Object} agingData - Result from computeAgingBuckets
 * @param {Object} business - Business info { name, phone, bankDetails }
 * @param {string} currency - 'PKR' | 'USD' etc.
 * @returns {string} Ready-to-send text
 */
export function formatWhatsAppReminder(party, agingData, business = {}, currency = 'PKR') {
  const amountStr = formatMoney(agingData.totalOwedMinor, currency);
  const bizName = business.name || 'Our Company';
  const bizBank = business.bankDetails ? `\nBank Details: ${business.bankDetails}` : '';

  let breakdownStr = '';
  if (agingData.buckets.past_90_plus > 0) {
    breakdownStr += `\n- Over 90 Days: ${formatMoney(agingData.buckets.past_90_plus, currency)}`;
  }
  if (agingData.buckets.past_61_90 > 0) {
    breakdownStr += `\n- 61-90 Days: ${formatMoney(agingData.buckets.past_61_90, currency)}`;
  }
  if (agingData.buckets.past_31_60 > 0) {
    breakdownStr += `\n- 31-60 Days: ${formatMoney(agingData.buckets.past_31_60, currency)}`;
  }
  if (agingData.buckets.current_0_30 > 0) {
    breakdownStr += `\n- Current (0-30 Days): ${formatMoney(agingData.buckets.current_0_30, currency)}`;
  }

  return (
    `Assalam-o-Alaikum / Dear ${party.name},\n\n` +
    `This is a gentle payment reminder from *${bizName}*.\n\n` +
    `Your outstanding balance as of ${agingData.asOfDate} is *${amountStr}*.\n` +
    `Aging Summary:${breakdownStr}\n\n` +
    `Kindly arrange payment at your earliest convenience.${bizBank}\n\n` +
    `If you have already processed this payment, please disregard this reminder.\n` +
    `Thank you for your business!`
  );
}
