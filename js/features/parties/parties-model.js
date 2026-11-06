// =========================================================================
// PARTIES MODEL (PURE FUNCTIONS)
// Vendor & Customer balances, 360 analytics, and top item badges
// =========================================================================

/**
 * Derives the running closing balance for a party.
 * For Vendors:
 *   Payable = Purchases (invoices) - Debit Notes (shortages/returns) - Payments Made
 * For Customers:
 *   Receivable = Sales (invoices) - Credit Notes (returns) - Payments Received
 *
 * @param {string} partyId - Party ID
 * @param {string} partyType - 'vendor' | 'customer'
 * @param {Array<Object>} transactions - Transactions array
 * @param {Array<Object>} payments - Payments array
 * @param {Array<Object>} debitNotes - Debit/credit notes array
 * @returns {number} Balance in integer minor units
 */
export function computePartyBalance(partyId, partyType, transactions = [], payments = [], debitNotes = []) {
  if (!partyId) return 0;

  // Filter transactions for this party
  const partyTxs = transactions.filter(t => t.partyId === partyId || t.vendorName === partyId);
  const partyPayments = payments.filter(p => p.partyId === partyId);
  const partyNotes = debitNotes.filter(d => d.partyId === partyId || d.vendorName === partyId);

  let totalBilled = 0;
  for (const t of partyTxs) {
    if (t.status === 'confirmed' || t.status === 'posted') {
      totalBilled += (t.grandTotalMinor || 0);
    }
  }

  let totalPaid = 0;
  for (const p of partyPayments) {
    totalPaid += (p.amountMinor || 0);
  }

  let totalNotes = 0;
  for (const d of partyNotes) {
    if (d.status !== 'cancelled') {
      totalNotes += (d.totalMinor || 0);
    }
  }

  // Balance = Billed - Notes (shortages) - Payments
  return totalBilled - totalNotes - totalPaid;
}

/**
 * Computes 360 analytics for a party across a given date range.
 *
 * @param {Object} party - Party object { id, name, type, ... }
 * @param {Object} context - { transactions, transactionLines, payments, debitNotes, dateRange: { start, end } }
 * @returns {Object} 360 Analytics profile
 */
export function computeParty360(party, context = {}) {
  const {
    transactions = [],
    transactionLines = [],
    payments = [],
    debitNotes = [],
    dateRange = null
  } = context;

  const partyId = party.id || party.name;
  const isVendor = party.type !== 'customer';

  // Date filtering helper
  const inRange = (dateStr) => {
    if (!dateRange || (!dateRange.start && !dateRange.end)) return true;
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    return true;
  };

  // Filter party transactions
  const pTxs = transactions.filter(t => 
    (t.partyId === party.id || t.vendorName === party.name || t.customerName === party.name) &&
    (t.status === 'confirmed' || t.status === 'posted') &&
    inRange(t.date)
  );

  const txIds = new Set(pTxs.map(t => t.id));

  // Filter lines
  const pLines = transactionLines.filter(l => txIds.has(l.transactionId));

  // Filter payments
  const pPayments = payments.filter(p => 
    p.partyId === party.id && inRange(p.date)
  );

  // Filter debit notes
  const pNotes = debitNotes.filter(d => 
    (d.partyId === party.id || d.vendorName === party.name) &&
    d.status !== 'cancelled' &&
    inRange(d.date)
  );

  let totalPurchasedOrSoldMinor = 0;
  for (const t of pTxs) {
    totalPurchasedOrSoldMinor += (t.grandTotalMinor || 0);
  }

  let totalPaymentsMinor = 0;
  for (const p of pPayments) {
    totalPaymentsMinor += (p.amountMinor || 0);
  }

  let totalNotesMinor = 0;
  for (const n of pNotes) {
    totalNotesMinor += (n.totalMinor || 0);
  }

  // Aggregate items purchased / sold
  const itemMap = new Map();
  for (const l of pLines) {
    const rawName = (l.nameRaw || l.nameEnglish || 'Unknown Item').trim();
    const qty = parseFloat(l.qtyBilled) || 0;
    const val = l.lineTotalMinor || 0;

    if (!itemMap.has(rawName)) {
      itemMap.set(rawName, {
        name: rawName,
        totalQty: 0,
        totalValueMinor: 0,
        unit: l.unit || 'pcs',
        purchaseCount: 0
      });
    }
    const stat = itemMap.get(rawName);
    stat.totalQty += qty;
    stat.totalValueMinor += val;
    stat.purchaseCount++;
  }

  const itemsList = Array.from(itemMap.values());

  // Derive average price and % share for each item
  for (const it of itemsList) {
    it.avgPriceMinor = it.totalQty > 0 ? Math.round(it.totalValueMinor / it.totalQty) : 0;
    it.spendSharePct = totalPurchasedOrSoldMinor > 0 
      ? Math.round((it.totalValueMinor / totalPurchasedOrSoldMinor) * 1000) / 10 
      : 0;
  }

  // Sort by value descending
  itemsList.sort((a, b) => b.totalValueMinor - a.totalValueMinor);

  // Determine #1 top item by value and by quantity
  const topByValue = itemsList.length > 0 ? itemsList[0] : null;
  const topByQty = itemsList.length > 0 ? [...itemsList].sort((a, b) => b.totalQty - a.totalQty)[0] : null;

  // Closing balance across all time (not just date range)
  const allTimeBalanceMinor = computePartyBalance(party.id, party.type, transactions, payments, debitNotes);

  return {
    partyId: party.id,
    partyName: party.name,
    partyType: party.type || 'vendor',
    totalPurchasedOrSoldMinor,
    totalPaymentsMinor,
    totalNotesMinor,
    closingBalanceMinor: allTimeBalanceMinor,
    billCount: pTxs.length,
    topItemByValue: topByValue,
    topItemByQty: topByQty,
    itemizedBreakdown: itemsList,
    recentTransactions: pTxs.slice(0, 20)
  };
}
