// =========================================================================
// RECURRING RULES & MONTH-END DATE CALCULATION (PURE FUNCTIONS)
// Exact month-end logic: Jan 31 -> Feb 28/29, Apr 30. Zero date overflow.
// =========================================================================

/**
 * Returns the maximum days in a given year and month (1-based).
 * Accounts for leap years (Feb 29).
 *
 * @param {number} year
 * @param {number} month - 1 to 12
 * @returns {number} Days count (28, 29, 30, or 31)
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Calculates the next occurrence date for a recurring monthly bill.
 * Accurately caps to the last day of the target month when target month has fewer days.
 *
 * @param {string} currentDateStr - 'YYYY-MM-DD'
 * @param {number} intervalMonths - Default 1
 * @param {number} preferredDay - Original target day (e.g. 31)
 * @returns {string} Next date 'YYYY-MM-DD'
 */
export function computeNextRecurringDate(currentDateStr, intervalMonths = 1, preferredDay = null) {
  const [yStr, mStr, dStr] = currentDateStr.split('-');
  let year = parseInt(yStr, 10);
  let month = parseInt(mStr, 10); // 1-12
  const day = preferredDay != null ? preferredDay : parseInt(dStr, 10);

  // Advance month
  month += intervalMonths;
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  // Cap day to the max days in target month
  const maxDays = getDaysInMonth(year, month);
  const actualDay = Math.min(day, maxDays);

  const mm = String(month).padStart(2, '0');
  const dd = String(actualDay).padStart(2, '0');

  return `${year}-${mm}-${dd}`;
}

/**
 * Identifies missed recurring bill dates between the last execution and asOfDate.
 *
 * @param {Object} rule - { id, title, amountMinor, lastRunDate, preferredDay, intervalMonths }
 * @param {string} asOfDate - 'YYYY-MM-DD'
 * @returns {Array<string>} Array of missed occurrence dates
 */
export function findMissedRecurringDates(rule, asOfDate = new Date().toISOString().slice(0, 10)) {
  const missed = [];
  let curDate = rule.lastRunDate || rule.startDate;
  if (!curDate) return [];

  const prefDay = rule.preferredDay != null ? rule.preferredDay : parseInt(curDate.split('-')[2], 10);
  const interval = rule.intervalMonths || 1;

  let next = computeNextRecurringDate(curDate, interval, prefDay);
  while (next <= asOfDate) {
    missed.push(next);
    curDate = next;
    next = computeNextRecurringDate(curDate, interval, prefDay);
  }

  return missed;
}
