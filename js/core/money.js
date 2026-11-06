/**
 * @file money.js
 * @description Central high-precision integer money calculation engine for Smart Bill Auditor.
 * All monetary calculations across the entire application MUST be performed exclusively through this module.
 * Internally uses BigInt for arbitrary-precision arithmetic to strictly prevent any floating-point errors.
 * 
 * Master Rule: 1 wrong rupee or paisa is unacceptable.
 * All money is represented in integer minor units (e.g. PKR 150.75 = 15075).
 * Quantities are represented in milli-units (e.g. 2.5 kg = 2500 milli).
 * Rates (taxes, discounts) are represented in basis points (e.g. 15% = 1500 bp, 100% = 10000 bp).
 */

// Supported currency configurations with minor unit factors and symbols
export const CURRENCY_CONFIG = {
  PKR: { name: 'Pakistani Rupee', minorUnits: 2, symbol: 'Rs.', subUnit: 'Paisa' },
  INR: { name: 'Indian Rupee', minorUnits: 2, symbol: '₹', subUnit: 'Paisa' },
  USD: { name: 'US Dollar', minorUnits: 2, symbol: '$', subUnit: 'Cent' },
  EUR: { name: 'Euro', minorUnits: 2, symbol: '€', subUnit: 'Cent' },
  GBP: { name: 'British Pound', minorUnits: 2, symbol: '£', subUnit: 'Penny' },
  AED: { name: 'UAE Dirham', minorUnits: 2, symbol: 'AED', subUnit: 'Fils' },
  SAR: { name: 'Saudi Riyal', minorUnits: 2, symbol: 'SAR', subUnit: 'Halala' },
  CAD: { name: 'Canadian Dollar', minorUnits: 2, symbol: 'CA$', subUnit: 'Cent' },
  AUD: { name: 'Australian Dollar', minorUnits: 2, symbol: 'AU$', subUnit: 'Cent' },
  JPY: { name: 'Japanese Yen', minorUnits: 0, symbol: '¥', subUnit: '' },
  KWD: { name: 'Kuwaiti Dinar', minorUnits: 3, symbol: 'KD', subUnit: 'Fils' }
};

/**
 * Validates and converts input value to a BigInt.
 * Throws a TypeError if value cannot be safely represented.
 * @param {number|string|bigint} val 
 * @returns {bigint}
 */
function toBig(val) {
  if (val === null || val === undefined) return 0n;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0n;
    if (!Number.isSafeInteger(val)) return BigInt(Math.round(val));
    return BigInt(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) return 0n;
    return BigInt(trimmed);
  }
  return 0n;
}

/**
 * Converts BigInt back to safe Number, throwing if outside Number.MAX_SAFE_INTEGER.
 * @param {bigint} b 
 * @returns {number}
 */
function toNum(b) {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`BigInt value ${b} exceeds JavaScript safe integer range`);
  }
  return Number(b);
}

/**
 * Single application-wide rounding rule: Round Half Away From Zero.
 * Formula for division: (numerator + sign * (divisor / 2)) / divisor
 * @param {bigint} numerator 
 * @param {bigint} divisor 
 * @returns {bigint}
 */
export function roundHalfUpDiv(numerator, divisor) {
  if (divisor === 0n) throw new RangeError('Division by zero');
  if (divisor < 0n) {
    numerator = -numerator;
    divisor = -divisor;
  }
  const isNegative = numerator < 0n;
  const absNum = isNegative ? -numerator : numerator;
  const half = divisor / 2n;
  const result = (absNum + half) / divisor;
  return isNegative ? -result : result;
}

/**
 * Parses monetary input (string or number) into integer minor units.
 * Supports strings like "150.75", "Rs. 1,500.50", "$ 10.00", " -45.20 ".
 * @param {string|number} input 
 * @param {string} [currencyCode='PKR'] 
 * @returns {number} Minor units as integer
 */
export function parseMoney(input, currencyCode = 'PKR') {
  if (input === null || input === undefined || input === '') return 0;
  
  const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.PKR;
  const decimals = cfg.minorUnits;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TypeError('Non-finite number provided to parseMoney');
    // Convert to fixed string to prevent binary float inaccuracies before parsing
    input = input.toFixed(decimals + 2);
  }

  let str = String(input).trim();
  if (str === '') return 0;

  const isNegative = str.startsWith('-') || /^\(.*\)$/.test(str);

  // Check if string contains any digits at all
  if (!/\d/.test(str)) {
    throw new TypeError(`Invalid non-numeric money string: "${input}"`);
  }

  // Remove currency words, codes and symbols like "Rs.", "PKR", "USD", "$", "€", "(", ")"
  // But preserve digits, commas, and decimal separator
  str = str.replace(/[a-zA-Z()]/g, '').trim();

  // Remove commas used as thousand separators (e.g., 1,500.50 -> 1500.50)
  str = str.replace(/,/g, '');

  // Strip any characters other than digits and '.'
  let clean = str.replace(/[^0-9.]/g, '');

  // Handle multiple dots if any (e.g. from an abbreviation dot like in "Rs.")
  // The last dot is the decimal separator, any earlier dots are stripped
  const dotCount = (clean.match(/\./g) || []).length;
  if (dotCount > 1) {
    const lastDotIdx = clean.lastIndexOf('.');
    clean = clean.slice(0, lastDotIdx).replace(/\./g, '') + clean.slice(lastDotIdx);
  }

  if (clean === '' || clean === '.') return 0;

  const parts = clean.split('.');
  if (parts.length > 2) throw new TypeError(`Malformed money string: ${input}`);

  let wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (decimals === 0) {
    const minorBig = BigInt(wholePart);
    return toNum(isNegative ? -minorBig : minorBig);
  }

  // Pad or truncate fraction to match decimals with half-up rounding on discarded digits
  if (fracPart.length > decimals) {
    const kept = fracPart.slice(0, decimals);
    const extra = fracPart.slice(decimals);
    let roundNum = BigInt(wholePart + kept);
    const firstExtra = parseInt(extra[0], 10);
    if (firstExtra >= 5) {
      roundNum += 1n;
    }
    return toNum(isNegative ? -roundNum : roundNum);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
    const minorBig = BigInt(wholePart + fracPart);
    return toNum(isNegative ? -minorBig : minorBig);
  }
}

/**
 * Formats minor units into a human-readable display string.
 * @param {number|bigint} minorUnits 
 * @param {string} [currencyCode='PKR'] 
 * @param {Object} [options={}]
 * @param {boolean} [options.showSymbol=true] 
 * @param {boolean} [options.useIndianSystem=false] Lakh/Crore grouping
 * @param {boolean} [options.showCode=false] Include currency code
 * @returns {string} Formatted currency string
 */
export function formatMoney(minorUnits, currencyCode = 'PKR', options = {}) {
  if (minorUnits === null || minorUnits === undefined || isNaN(minorUnits)) {
    minorUnits = 0;
  }
  const { showSymbol = true, useIndianSystem = false, showCode = false } = options;
  const cfg = CURRENCY_CONFIG[currencyCode] || { name: currencyCode, minorUnits: 2, symbol: currencyCode };
  const minorBig = toBig(minorUnits);
  const isNegative = minorBig < 0n;
  const absMinor = isNegative ? -minorBig : minorBig;
  const decimals = cfg.minorUnits;

  let wholeStr = '';
  let fracStr = '';

  if (decimals === 0) {
    wholeStr = absMinor.toString();
  } else {
    const divisor = 10n ** BigInt(decimals);
    const whole = absMinor / divisor;
    const frac = absMinor % divisor;
    wholeStr = whole.toString();
    fracStr = '.' + frac.toString().padStart(decimals, '0');
  }

  // Grouping formatting
  let formattedWhole = '';
  if (useIndianSystem || currencyCode === 'PKR' || currencyCode === 'INR') {
    // Indian grouping: last 3 digits, then groups of 2 (e.g. 12,34,567)
    if (wholeStr.length <= 3) {
      formattedWhole = wholeStr;
    } else {
      const last3 = wholeStr.slice(-3);
      const rest = wholeStr.slice(0, -3);
      const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      formattedWhole = groupedRest + ',' + last3;
    }
  } else {
    // Western standard grouping: groups of 3 (e.g. 1,234,567)
    formattedWhole = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const sign = isNegative ? '-' : '';
  const needsSpace = !['$', '€', '£'].includes(cfg.symbol);
  const symbol = showSymbol ? (cfg.symbol + (needsSpace ? ' ' : '')) : '';
  const code = showCode ? ` ${currencyCode}` : '';

  return `${sign}${symbol}${formattedWhole}${fracStr}${code}`.trim();
}

/**
 * Adds two minor unit amounts.
 * @param {number|bigint} aMinor 
 * @param {number|bigint} bMinor 
 * @returns {number}
 */
export function add(aMinor, bMinor) {
  return toNum(toBig(aMinor) + toBig(bMinor));
}

/**
 * Subtracts bMinor from aMinor.
 * @param {number|bigint} aMinor 
 * @param {number|bigint} bMinor 
 * @returns {number}
 */
export function sub(aMinor, bMinor) {
  return toNum(toBig(aMinor) - toBig(bMinor));
}

/**
 * Sums an array of minor unit amounts.
 * @param {Array<number|bigint>} arrMinor 
 * @returns {number}
 */
export function sum(arrMinor) {
  if (!Array.isArray(arrMinor)) throw new TypeError('Expected array of numbers for sum');
  let total = 0n;
  for (let i = 0; i < arrMinor.length; i++) {
    total += toBig(arrMinor[i]);
  }
  return toNum(total);
}

/**
 * Negates a minor unit amount.
 * @param {number|bigint} minor 
 * @returns {number}
 */
export function negate(minor) {
  return toNum(-toBig(minor));
}

/**
 * Computes line total from quantity in milli-units and unit price in minor units.
 * Formula: roundHalfUp(qtyMilli * unitPriceMinor / 1000)
 * @param {number|bigint} qtyMilli e.g. 2500 milli = 2.5
 * @param {number|bigint} unitPriceMinor Price per 1.000 unit
 * @returns {number} Line total in minor units
 */
export function lineTotal(qtyMilli, unitPriceMinor) {
  const num = toBig(qtyMilli) * toBig(unitPriceMinor);
  return toNum(roundHalfUpDiv(num, 1000n));
}

/**
 * Calculates a percentage of a base amount in basis points (1% = 100 bp).
 * Formula: roundHalfUp(baseMinor * rateBp / 10000)
 * @param {number|bigint} baseMinor 
 * @param {number|bigint} rateBp 
 * @returns {number}
 */
export function percentOf(baseMinor, rateBp) {
  const num = toBig(baseMinor) * toBig(rateBp);
  return toNum(roundHalfUpDiv(num, 10000n));
}

/**
 * Calculates tax on exclusive subtotal.
 * @param {number|bigint} subtotalMinor 
 * @param {number|bigint} taxRateBp 
 * @returns {number} Tax in minor units
 */
export function taxFromExclusive(subtotalMinor, taxRateBp) {
  return percentOf(subtotalMinor, taxRateBp);
}

/**
 * Extracts tax included in a gross total.
 * Formula: roundHalfUp(grossMinor * taxRateBp / (10000 + taxRateBp))
 * @param {number|bigint} grossMinor 
 * @param {number|bigint} taxRateBp 
 * @returns {number} Tax component in minor units
 */
export function taxFromInclusive(grossMinor, taxRateBp) {
  const bGross = toBig(grossMinor);
  const bRate = toBig(taxRateBp);
  const divisor = 10000n + bRate;
  if (divisor === 0n) return 0;
  return toNum(roundHalfUpDiv(bGross * bRate, divisor));
}

/**
 * Applies a discount to a subtotal.
 * @param {number|bigint} subtotalMinor 
 * @param {number|bigint} discountVal In bp if percentage, or minor units if fixed
 * @param {'percentage'|'fixed'} [type='fixed'] 
 * @returns {{ discountMinor: number, netMinor: number }}
 */
export function applyDiscount(subtotalMinor, discountVal, type = 'fixed') {
  const bSub = toBig(subtotalMinor);
  let bDisc = 0n;
  if (type === 'percentage') {
    bDisc = toBig(percentOf(bSub, discountVal));
  } else {
    bDisc = toBig(discountVal);
  }
  // Discount cannot exceed subtotal or be negative
  if (bDisc < 0n) bDisc = 0n;
  if (bDisc > bSub) bDisc = bSub;

  return {
    discountMinor: toNum(bDisc),
    netMinor: toNum(bSub - bDisc)
  };
}

/**
 * Computes full invoice totals following canonical audit order:
 * Line Totals -> Subtotal -> Invoice Discount -> Tax -> Freight -> Grand Total.
 * @param {Array<Object>} lines Array of line item objects: { qtyMilli, unitPriceMinor, taxRateBp, taxable }
 * @param {Object} [options={}]
 * @param {number} [options.discountVal=0]
 * @param {'percentage'|'fixed'} [options.discountType='fixed']
 * @param {boolean} [options.taxInclusive=false]
 * @param {number} [options.freightMinor=0]
 * @returns {Object} Full breakdown of totals in minor units
 */
export function invoiceTotals(lines = [], options = {}) {
  const { discountVal = 0, discountType = 'fixed', taxInclusive = false, freightMinor = 0 } = options;

  let computedLines = [];
  let subtotalMinor = 0n;
  let taxableSubtotalMinor = 0n;

  for (const line of lines) {
    const lTotal = toBig(lineTotal(line.qtyMilli, line.unitPriceMinor));
    computedLines.push({
      ...line,
      lineTotalMinor: toNum(lTotal)
    });
    subtotalMinor += lTotal;
    if (line.taxable !== false) {
      taxableSubtotalMinor += lTotal;
    }
  }

  // Invoice discount
  let invoiceDiscountMinor = 0n;
  if (discountType === 'percentage') {
    invoiceDiscountMinor = toBig(percentOf(subtotalMinor, discountVal));
  } else {
    invoiceDiscountMinor = toBig(discountVal);
  }
  if (invoiceDiscountMinor > subtotalMinor) invoiceDiscountMinor = subtotalMinor;
  if (invoiceDiscountMinor < 0n) invoiceDiscountMinor = 0n;

  const netSubtotalMinor = subtotalMinor - invoiceDiscountMinor;

  // Proportionally adjust taxable base after invoice-level discount
  let effectiveTaxableBase = taxableSubtotalMinor;
  if (subtotalMinor > 0n && taxableSubtotalMinor > 0n && invoiceDiscountMinor > 0n) {
    const ratioBp = toNum(roundHalfUpDiv(taxableSubtotalMinor * 10000n, subtotalMinor));
    const taxableDisc = toBig(percentOf(invoiceDiscountMinor, ratioBp));
    effectiveTaxableBase = taxableSubtotalMinor - taxableDisc;
  }

  // Tax calculation
  let taxMinor = 0n;
  for (const line of lines) {
    if (line.taxable === false || !line.taxRateBp) continue;
    const lTotal = toBig(lineTotal(line.qtyMilli, line.unitPriceMinor));
    // Factor in line share of discount if any
    let lNet = lTotal;
    if (subtotalMinor > 0n && invoiceDiscountMinor > 0n) {
      const lDisc = roundHalfUpDiv(lTotal * invoiceDiscountMinor, subtotalMinor);
      lNet = lTotal - lDisc;
    }

    if (taxInclusive) {
      taxMinor += toBig(taxFromInclusive(lNet, line.taxRateBp));
    } else {
      taxMinor += toBig(taxFromExclusive(lNet, line.taxRateBp));
    }
  }

  const bFreight = toBig(freightMinor);
  let grandTotalMinor = 0n;

  if (taxInclusive) {
    // Tax already in subtotal
    grandTotalMinor = netSubtotalMinor + bFreight;
  } else {
    grandTotalMinor = netSubtotalMinor + taxMinor + bFreight;
  }

  return {
    lines: computedLines,
    subtotalMinor: toNum(subtotalMinor),
    discountMinor: toNum(invoiceDiscountMinor),
    netSubtotalMinor: toNum(netSubtotalMinor),
    taxMinor: toNum(taxMinor),
    freightMinor: toNum(bFreight),
    grandTotalMinor: toNum(grandTotalMinor),
    taxInclusive
  };
}

/**
 * Evenly splits totalMinor into partsCount integer chunks such that sum(parts) === totalMinor exactly.
 * Remainders are allocated 1-by-1 to the first remainder units.
 * @param {number|bigint} totalMinor 
 * @param {number} partsCount 
 * @returns {Array<number>} Array of minor units
 */
export function splitEvenly(totalMinor, partsCount) {
  if (!Number.isInteger(partsCount) || partsCount <= 0) {
    throw new RangeError(`partsCount must be a positive integer, got ${partsCount}`);
  }
  const total = toBig(totalMinor);
  const count = BigInt(partsCount);
  const base = total / count;
  const remainder = total % count;

  const result = [];
  const absRem = remainder < 0n ? -remainder : remainder;
  const remSign = total < 0n ? -1n : 1n;

  for (let i = 0n; i < count; i++) {
    if (i < absRem) {
      result.push(toNum(base + remSign));
    } else {
      result.push(toNum(base));
    }
  }
  return result;
}

/**
 * Proportionally allocates totalMinor among weighted ratios using the Hamilton/Hare-Niemeyer method.
 * Guarantees that the sum of allocated parts ALWAYS equals totalMinor exactly.
 * @param {number|bigint} totalMinor 
 * @param {Array<number>} ratios 
 * @returns {Array<number>}
 */
export function allocate(totalMinor, ratios) {
  if (!Array.isArray(ratios) || ratios.length === 0) return [];
  const bTotal = toBig(totalMinor);
  let sumRatios = 0n;
  for (const r of ratios) {
    const br = toBig(r);
    if (br < 0n) throw new RangeError('Allocation ratio cannot be negative');
    sumRatios += br;
  }
  if (sumRatios === 0n) {
    return splitEvenly(totalMinor, ratios.length);
  }

  const parts = [];
  const remainders = [];
  let allocatedSum = 0n;

  for (let i = 0; i < ratios.length; i++) {
    const br = toBig(ratios[i]);
    const numerator = bTotal * br;
    const base = numerator / sumRatios;
    const rem = numerator % sumRatios;
    parts.push(base);
    remainders.push({ index: i, rem: rem < 0n ? -rem : rem });
    allocatedSum += base;
  }

  let shortfall = bTotal - allocatedSum;
  // Sort descending by largest remainder
  remainders.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0));

  const step = shortfall > 0n ? 1n : -1n;
  let idx = 0;
  while (shortfall !== 0n && idx < remainders.length) {
    const targetIdx = remainders[idx].index;
    parts[targetIdx] += step;
    shortfall -= step;
    idx = (idx + 1) % remainders.length;
  }

  return parts.map(toNum);
}

/**
 * Compares two monetary figures within a specified tolerance in minor units.
 * @param {number|bigint} amountA 
 * @param {number|bigint} amountB 
 * @param {number|bigint} [toleranceMinor=0] 
 * @returns {{ matches: boolean, diff: number }}
 */
export function compareWithTolerance(amountA, amountB, toleranceMinor = 0) {
  const bA = toBig(amountA);
  const bB = toBig(amountB);
  const bTol = toBig(toleranceMinor);
  const diff = bA - bB;
  const absDiff = diff < 0n ? -diff : diff;
  return {
    matches: absDiff <= bTol,
    diff: toNum(diff)
  };
}

// Word maps for number-to-words conversion
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertUnderThousand(num) {
  let s = '';
  if (num >= 100) {
    s += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 20) {
    s += TENS[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ONES[num % 10] : '');
  } else if (num > 0) {
    s += ONES[num];
  }
  return s.trim();
}

/**
 * Converts integer monetary amount to spelled-out English words.
 * Supports Western (Million, Billion) and Indian (Lakh, Crore, Arab) systems.
 * @param {number|bigint} minorUnits 
 * @param {string} [currency='PKR'] 
 * @param {Object} [options={}]
 * @param {'western'|'indian'} [options.system='indian']
 * @returns {string} E.g. "One Lakh Twenty-Five Thousand Rupees and Fifty Paisas Only"
 */
export function amountInWords(minorUnits, currency = 'PKR', options = {}) {
  const { system = 'indian' } = options;
  const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.PKR;
  const minorBig = toBig(minorUnits);

  if (minorBig === 0n) {
    return `Zero ${cfg.name}s Only`;
  }

  const isNegative = minorBig < 0n;
  const absMinor = isNegative ? -minorBig : minorBig;
  const decimals = cfg.minorUnits;

  let wholePart = 0n;
  let fracPart = 0n;

  if (decimals === 0) {
    wholePart = absMinor;
  } else {
    const div = 10n ** BigInt(decimals);
    wholePart = absMinor / div;
    fracPart = absMinor % div;
  }

  let words = '';

  if (wholePart === 0n) {
    words = 'Zero';
  } else if (system === 'indian') {
    // Indian system: Crore (1,00,00,000), Lakh (1,00,000), Thousand (1,000), Hundred (100)
    let n = wholePart;
    const arab = n / 1000000000n;
    n %= 1000000000n;
    const crore = n / 10000000n;
    n %= 10000000n;
    const lakh = n / 100000n;
    n %= 100000n;
    const thousand = n / 1000n;
    n %= 1000n;
    const remainder = Number(n);

    let parts = [];
    if (arab > 0n) parts.push(`${convertUnderThousand(Number(arab))} Arab`);
    if (crore > 0n) parts.push(`${convertUnderThousand(Number(crore))} Crore`);
    if (lakh > 0n) parts.push(`${convertUnderThousand(Number(lakh))} Lakh`);
    if (thousand > 0n) parts.push(`${convertUnderThousand(Number(thousand))} Thousand`);
    if (remainder > 0) parts.push(convertUnderThousand(remainder));

    words = parts.join(' ');
  } else {
    // Western system: Billion, Million, Thousand
    let n = wholePart;
    const billion = n / 1000000000n;
    n %= 1000000000n;
    const million = n / 1000000n;
    n %= 1000000n;
    const thousand = n / 1000n;
    n %= 1000n;
    const remainder = Number(n);

    let parts = [];
    if (billion > 0n) parts.push(`${convertUnderThousand(Number(billion))} Billion`);
    if (million > 0n) parts.push(`${convertUnderThousand(Number(million))} Million`);
    if (thousand > 0n) parts.push(`${convertUnderThousand(Number(thousand))} Thousand`);
    if (remainder > 0) parts.push(convertUnderThousand(remainder));

    words = parts.join(' ');
  }

  words = words.trim();
  const majorName = wholePart === 1n ? cfg.name : `${cfg.name}s`;
  let result = `${isNegative ? 'Minus ' : ''}${words} ${majorName}`;

  if (fracPart > 0n && cfg.subUnit) {
    const fracNum = Number(fracPart);
    const fracWord = convertUnderThousand(fracNum);
    const subName = fracNum === 1 ? cfg.subUnit : `${cfg.subUnit}s`;
    result += ` and ${fracWord} ${subName}`;
  }

  return `${result} Only`.replace(/\s+/g, ' ');
}
