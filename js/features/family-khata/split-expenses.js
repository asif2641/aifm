// =========================================================================
// SPLIT EXPENSES & MINIMAL SETTLEMENTS (PURE FUNCTIONS)
// Exact Hamilton integer allocation & greedy debt simplification algorithm
// =========================================================================

import { splitEvenly, sum, formatMoney } from '../../core/money.js';

/**
 * Splits an expense among participants and derives net balance per person.
 *
 * @param {number} totalMinor - Total bill in integer minor units
 * @param {Array<string>} participantIds - Array of participant names or IDs
 * @param {Map<string, number>|Object} paidMap - Map of participantId -> amount paid in minor units
 * @returns {Object} Split breakdown { shares: Map, netBalances: Map, totalMinor }
 */
export function calculateSplitShares(totalMinor, participantIds = [], paidMap = {}) {
  const count = participantIds.length;
  if (count === 0) return { shares: new Map(), netBalances: new Map(), totalMinor: 0 };

  // Use exact Hamilton integer split
  const shareAmounts = splitEvenly(totalMinor, count);
  const shares = new Map();
  const netBalances = new Map(); // Positive = owed money (creditor), Negative = owes money (debtor)

  for (let i = 0; i < count; i++) {
    const pId = participantIds[i];
    const share = shareAmounts[i];
    shares.set(pId, share);

    const paid = (paidMap instanceof Map ? paidMap.get(pId) : paidMap[pId]) || 0;
    netBalances.set(pId, paid - share);
  }

  return {
    totalMinor,
    shares,
    netBalances
  };
}

/**
 * Derives the minimal settlement transaction list (Debt Simplification).
 * Solves the group payment problem with the fewest possible transactions.
 *
 * @param {Map<string, number>|Object} netBalances - Map of participantId -> net balance in minor units
 * @returns {Array<Object>} Minimal payments: Array of { from, to, amountMinor }
 */
export function computeMinimalSettlements(netBalances) {
  const debtors = [];  // People who owe money (negative net)
  const creditors = []; // People who are owed money (positive net)

  const entries = netBalances instanceof Map ? netBalances.entries() : Object.entries(netBalances);

  for (const [id, net] of entries) {
    if (net < 0) {
      debtors.push({ id, owesMinor: Math.abs(net) });
    } else if (net > 0) {
      creditors.push({ id, owedMinor: net });
    }
  }

  // Sort descending by amount
  debtors.sort((a, b) => b.owesMinor - a.owesMinor);
  creditors.sort((a, b) => b.owedMinor - a.owedMinor);

  const settlements = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settleAmount = Math.min(debtor.owesMinor, creditor.owedMinor);

    settlements.push({
      from: debtor.id,
      to: creditor.id,
      amountMinor: settleAmount
    });

    debtor.owesMinor -= settleAmount;
    creditor.owedMinor -= settleAmount;

    if (debtor.owesMinor === 0) dIdx++;
    if (creditor.owedMinor === 0) cIdx++;
  }

  return settlements;
}
