// =========================================================================
// KHATA, COMMITTEE (BC) & ZAKAT CALCULATOR (PURE FUNCTIONS)
// =========================================================================

import { add, sub, formatMoney } from '../../core/money.js';

/**
 * Calculates Committee (BC) pool metrics.
 *
 * @param {Object} committee - { totalMembers, monthlyPerMemberMinor, durationMonths }
 * @returns {Object} { monthlyPoolMinor, totalTurnoverMinor }
 */
export function computeCommitteeMetrics(committee) {
  const members = committee.totalMembers || 1;
  const contribution = committee.monthlyPerMemberMinor || 0;
  const monthlyPoolMinor = members * contribution;
  const totalTurnoverMinor = monthlyPoolMinor * (committee.durationMonths || members);

  return {
    membersCount: members,
    monthlyContributionMinor: contribution,
    monthlyPoolMinor,
    totalTurnoverMinor
  };
}

/**
 * Calculates Zakat on net qualifying wealth (2.5% on surplus above Nisab).
 * Nisab standard (approx. 52.5 tolas / 612g of silver, or 7.5 tolas / 87.48g of gold).
 *
 * @param {Object} wealth - { cashMinor, bankMinor, goldSilverValuationMinor, tradeInventoryMinor, receivablesMinor, debtsPayableMinor, nisabThresholdMinor }
 * @returns {Object} { netZakatableWealthMinor, isNisabReached: boolean, zakatDueMinor, nisabMinor }
 */
export function calculateZakat(wealth) {
  const {
    cashMinor = 0,
    bankMinor = 0,
    goldSilverValuationMinor = 0,
    tradeInventoryMinor = 0,
    receivablesMinor = 0,
    debtsPayableMinor = 0,
    nisabThresholdMinor = 15000000 // Default ~Rs. 150,000 for Silver Nisab
  } = wealth;

  const totalAssets = cashMinor + bankMinor + goldSilverValuationMinor + tradeInventoryMinor + receivablesMinor;
  const netWealthMinor = Math.max(0, totalAssets - debtsPayableMinor);
  const isNisabReached = netWealthMinor >= nisabThresholdMinor;

  // Zakat rate is 2.5% (250 basis points)
  const zakatDueMinor = isNisabReached ? Math.round((netWealthMinor * 25) / 1000) : 0;

  return {
    totalGrossAssetsMinor: totalAssets,
    deductibleLiabilitiesMinor: debtsPayableMinor,
    netZakatableWealthMinor: netWealthMinor,
    nisabThresholdMinor,
    isNisabReached,
    zakatDueMinor,
    disclaimer: 'This calculator is a financial aid for estimation. Consult a qualified Islamic scholar for specific legal rulings.'
  };
}
