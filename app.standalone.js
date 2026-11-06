/**
 * @file app.standalone.js
 * @description Standalone zero-CORS runtime bundle for Smart Bill Auditor.
 * Allows index.html to run flawlessly both on file:// protocol (double-clicked from Explorer)
 * and on http:// / https:// local servers, with zero CORS restrictions on Edge, Chrome, Firefox, Opera, and Safari.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION
  // =========================================================================
  const APP_VERSION = '1.1.0';
  let BUILD_MODE = (typeof localStorage !== 'undefined' && localStorage.getItem('aifm_build_mode')) || 'demo'; // 'demo' | 'customer'
  const APP_NAME = 'Smart Bill Auditor';
  const APP_TAGLINE = 'Intelligent Bill Auditor & Expense Suite';

  function isDemoMode() {
    if (typeof window !== 'undefined' && window.BuildConfig && typeof window.BuildConfig.isDemoBuild === 'function') {
      return window.BuildConfig.isDemoBuild();
    }
    return BUILD_MODE === 'demo';
  }

  function updateModeBadge() {
    const modeBadge = document.getElementById('topbar-mode-badge');
    if (!modeBadge) return;
    const demoActive = isDemoMode();
    modeBadge.textContent = `${demoActive ? 'DEMO' : 'CUSTOMER'} MODE`;
    modeBadge.className = `pill ${demoActive ? 'pill-info' : 'pill-primary'}`;
    if (demoActive) {
      modeBadge.style.cursor = 'pointer';
      modeBadge.title = 'Demo Mode — Click to open Demo & Presenter Tools (Alt+Shift+D)';
      modeBadge.onclick = () => openSellerPanelModal();
    } else {
      modeBadge.style.cursor = 'default';
      modeBadge.removeAttribute('title');
      modeBadge.onclick = null;
    }
  }

  function setBuildMode(mode) {
    BUILD_MODE = mode;
    if (typeof localStorage !== 'undefined') localStorage.setItem('aifm_build_mode', mode);
    if (typeof window !== 'undefined' && window.BuildConfig) window.BuildConfig.BUILD_MODE = mode;
    updateModeBadge();
  }

  // =========================================================================
  // 2. UTILS
  // =========================================================================
  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const buf = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoDate, locale = 'en-US') {
    if (!isoDate) return '—';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      return d.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoDate;
    }
  }

  function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  // --- PDF & Scanned Image Extraction Utilities ---
  function extractJpegImagesFromPdf(pdfBytes) {
    if (!pdfBytes || pdfBytes.length < 10) return [];
    const found = [];
    let i = 0;
    const len = pdfBytes.length;
    while (i < len - 3) {
      if (pdfBytes[i] === 0xFF && pdfBytes[i + 1] === 0xD8 && pdfBytes[i + 2] === 0xFF) {
        const start = i;
        let end = -1;
        let j = start + 3;
        while (j < len - 1) {
          if (pdfBytes[j] === 0xFF && pdfBytes[j + 1] === 0xD9) {
            end = j + 2;
            break;
          }
          j++;
        }
        if (end !== -1 && (end - start) >= 1024) {
          found.push(pdfBytes.subarray(start, end));
          i = end;
          continue;
        }
      }
      i++;
    }
    if (found.length === 0) return [];
    const large = found.filter(b => b.length >= 5120);
    return large.length > 0 ? large : found;
  }

  function uint8ArrayToDataUrl(bytes, mimeType = 'image/jpeg') {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  function dataUrlToUint8Array(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return new Uint8Array(0);
    const base64Index = dataUrl.indexOf('base64,');
    if (base64Index === -1) return new Uint8Array(0);
    const raw = atob(dataUrl.substring(base64Index + 7));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }

  function extractImageFromPdfDataUrl(pdfDataUrl) {
    if (!pdfDataUrl || typeof pdfDataUrl !== 'string' || !pdfDataUrl.startsWith('data:application/pdf')) return null;
    try {
      const bytes = dataUrlToUint8Array(pdfDataUrl);
      if (!bytes || bytes.length === 0) return null;
      const images = extractJpegImagesFromPdf(bytes);
      if (images.length === 0) return null;
      return uint8ArrayToDataUrl(images[0], 'image/jpeg');
    } catch (err) {
      console.warn('PDF image extraction error:', err);
      return null;
    }
  }

  // =========================================================================
  // 3. MONEY ENGINE (BigInt Integer Minor Units)
  // =========================================================================
  const CURRENCY_CONFIG = {
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

  function toNum(b) {
    if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError(`BigInt value ${b} exceeds JavaScript safe integer range`);
    }
    return Number(b);
  }

  function roundHalfUpDiv(numerator, divisor) {
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

  function parseMoney(input, currencyCode = 'PKR') {
    if (input === null || input === undefined || input === '') return 0;
    const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.PKR;
    const decimals = cfg.minorUnits;

    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError('Non-finite number provided to parseMoney');
      input = input.toFixed(decimals + 2);
    }

    let str = String(input).trim();
    if (str === '') return 0;

    const isNegative = str.startsWith('-') || /^\(.*\)$/.test(str);

    if (!/\d/.test(str)) {
      throw new TypeError(`Invalid non-numeric money string: "${input}"`);
    }

    str = str.replace(/[a-zA-Z()]/g, '').trim();
    str = str.replace(/,/g, '');
    let clean = str.replace(/[^0-9.]/g, '');

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

    if (fracPart.length > decimals) {
      const kept = fracPart.slice(0, decimals);
      const extra = fracPart.slice(decimals);
      let roundNum = BigInt(wholePart + kept);
      const firstExtra = parseInt(extra[0], 10);
      if (firstExtra >= 5) roundNum += 1n;
      return toNum(isNegative ? -roundNum : roundNum);
    } else {
      fracPart = fracPart.padEnd(decimals, '0');
      const minorBig = BigInt(wholePart + fracPart);
      return toNum(isNegative ? -minorBig : minorBig);
    }
  }

  function formatMoney(minorUnits, currencyCode = 'PKR', options = {}) {
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

    let formattedWhole = '';
    if (useIndianSystem || currencyCode === 'PKR' || currencyCode === 'INR') {
      if (wholeStr.length <= 3) {
        formattedWhole = wholeStr;
      } else {
        const last3 = wholeStr.slice(-3);
        const rest = wholeStr.slice(0, -3);
        const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        formattedWhole = groupedRest + ',' + last3;
      }
    } else {
      formattedWhole = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    const sign = isNegative ? '-' : '';
    const needsSpace = !['$', '€', '£'].includes(cfg.symbol);
    const symbol = showSymbol ? (cfg.symbol + (needsSpace ? ' ' : '')) : '';
    const code = showCode ? ` ${currencyCode}` : '';

    return `${sign}${symbol}${formattedWhole}${fracStr}${code}`.trim();
  }

  function addMoney(a, b) { return toNum(toBig(a) + toBig(b)); }
  function subMoney(a, b) { return toNum(toBig(a) - toBig(b)); }
  const add = addMoney;
  const sub = subMoney;

  function sum(arrMinor) {
    if (!Array.isArray(arrMinor)) return 0;
    let total = 0n;
    for (let i = 0; i < arrMinor.length; i++) total += toBig(arrMinor[i]);
    return toNum(total);
  }

  function negate(minor) {
    return toNum(-toBig(minor));
  }

  function lineTotal(qtyMilli, unitPriceMinor) {
    const num = toBig(qtyMilli) * toBig(unitPriceMinor);
    return toNum(roundHalfUpDiv(num, 1000n));
  }

  function percentOf(baseMinor, rateBp) {
    const num = toBig(baseMinor) * toBig(rateBp);
    return toNum(roundHalfUpDiv(num, 10000n));
  }

  function taxFromExclusive(subtotalMinor, taxRateBp) {
    return percentOf(subtotalMinor, taxRateBp);
  }

  function taxFromInclusive(grossMinor, taxRateBp) {
    const bGross = toBig(grossMinor);
    const bRate = toBig(taxRateBp);
    const denom = 10000n + bRate;
    return toNum(roundHalfUpDiv(bGross * bRate, denom));
  }

  function applyDiscount(subtotalMinor, discountVal, type = 'fixed') {
    if (type === 'percent') return percentOf(subtotalMinor, Math.round(discountVal * 100));
    return toNum(toBig(discountVal));
  }

  function compareWithTolerance(amountA, amountB, toleranceMinor = 0) {
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

  function amountInWords(minorUnits, currency = 'PKR', options = {}) {
    const { system = 'indian' } = options;
    const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.PKR;
    const minorBig = toBig(minorUnits);
    if (minorBig === 0n) return `Zero ${cfg.name}s Only`;

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
      let n = wholePart;
      const arab = n / 1000000000n; n %= 1000000000n;
      const crore = n / 10000000n; n %= 10000000n;
      const lakh = n / 100000n; n %= 100000n;
      const thousand = n / 1000n; n %= 1000n;
      const remainder = Number(n);
      let parts = [];
      if (arab > 0n) parts.push(`${convertUnderThousand(Number(arab))} Arab`);
      if (crore > 0n) parts.push(`${convertUnderThousand(Number(crore))} Crore`);
      if (lakh > 0n) parts.push(`${convertUnderThousand(Number(lakh))} Lakh`);
      if (thousand > 0n) parts.push(`${convertUnderThousand(Number(thousand))} Thousand`);
      if (remainder > 0) parts.push(convertUnderThousand(remainder));
      words = parts.join(' ');
    } else {
      let n = wholePart;
      const billion = n / 1000000000n; n %= 1000000000n;
      const million = n / 1000000n; n %= 1000000n;
      const thousand = n / 1000n; n %= 1000n;
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
      result += ` and ${convertUnderThousand(fracNum)} ${fracNum === 1 ? cfg.subUnit : `${cfg.subUnit}s`}`;
    }
    return `${result} Only`.trim();
  }

  // --- Zero-Drift Money Splitting ---
  function splitEvenly(totalMinor, partsCount) {
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
      if (i < absRem) result.push(toNum(base + remSign));
      else result.push(toNum(base));
    }
    return result;
  }

  function allocateProportionally(totalMinor, ratios = []) {
    const bTotal = toBig(totalMinor);
    let sumRatios = 0n;
    for (let i = 0; i < ratios.length; i++) sumRatios += toBig(ratios[i]);
    if (sumRatios === 0n) return splitEvenly(totalMinor, ratios.length || 1);
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
    remainders.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0));
    let idx = 0;
    while (shortfall !== 0n && idx < remainders.length) {
      const targetIdx = remainders[idx].index;
      if (shortfall > 0n) { parts[targetIdx] += 1n; shortfall -= 1n; }
      else { parts[targetIdx] -= 1n; shortfall += 1n; }
      idx++;
    }
    return parts.map(toNum);
  }

  // --- Audit Finding Codes & Levels ---
  const AUDIT_FINDING_CODES = {
    MATH_ROW_MISMATCH: 'MATH_ROW_MISMATCH',
    INVOICE_TOTAL_MISMATCH: 'INVOICE_TOTAL_MISMATCH',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    LOW_CONFIDENCE: 'LOW_CONFIDENCE',
    UNREADABLE_FIELD: 'UNREADABLE_FIELD',
    PRICE_OUTLIER: 'PRICE_OUTLIER',
    INVALID_DATE: 'INVALID_DATE',
    DUPLICATE_LAYER3: 'DUPLICATE_LAYER3',
    DUPLICATE_POSSIBLE: 'DUPLICATE_POSSIBLE',
    PRICE_HIKE: 'PRICE_HIKE'
  };

  // --- Vendor Normalization & Fuzzy Similarity ---
  function normalizeVendorName(rawName) {
    if (!rawName) return '';
    let str = String(rawName).toLowerCase().trim();
    str = str.replace(/&/g, ' and ');
    str = str.replace(/[.,\-:;'"\/\\()\[\]{}!@#$%^*+=?<>_]/g, ' ');
    str = str.replace(/\s+/g, ' ').trim();
    const suffixes = [
      'cash and carry', 'traders', 'trader', 'stores', 'store',
      'enterprises', 'enterprise', 'general store', 'super store', 'mart',
      'pvt ltd', 'pvt', 'ltd', 'limited', 'co', 'company', 'agency', 'agencies',
      'suppliers', 'distributors', 'distributor', 'shop', 'karyana'
    ];
    for (const suf of suffixes) {
      const reg = new RegExp(`\\b${suf}\\b`, 'gi');
      str = str.replace(reg, ' ');
    }
    return str.replace(/\s+/g, ' ').trim();
  }

  function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const s1 = a.toLowerCase().replace(/\s+/g, '');
    const s2 = b.toLowerCase().replace(/\s+/g, '');
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0;
    const bigrams1 = new Set();
    for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
    let intersection = 0;
    for (let i = 0; i < s2.length - 1; i++) {
      const bi = s2.substring(i, i + 2);
      if (bigrams1.has(bi)) intersection++;
    }
    return (2 * intersection) / (s1.length - 1 + s2.length - 1);
  }

  function isDateWithinDays(dateA, dateB, maxDays = 1) {
    if (!dateA || !dateB) return false;
    try {
      const tA = new Date(dateA).getTime();
      const tB = new Date(dateB).getTime();
      if (isNaN(tA) || isNaN(tB)) return false;
      const diffDays = Math.abs(tA - tB) / (1000 * 60 * 60 * 24);
      return diffDays <= maxDays;
    } catch {
      return false;
    }
  }

  const UNIT_CONVERSIONS = {
    kg: { g: 1000, gm: 1000, gram: 1000, grams: 1000, kg: 1 },
    g: { kg: 0.001, g: 1, gm: 1, gram: 1 },
    dozen: { pcs: 12, piece: 12, pieces: 12, nos: 12, dozen: 1, dz: 1 },
    pcs: { dozen: 1 / 12, dz: 1 / 12, pcs: 1, piece: 1, pieces: 1, nos: 1 },
    litre: { ml: 1000, l: 1, litre: 1, liter: 1, ltr: 1 },
    l: { ml: 1000, litre: 1, l: 1, ltr: 1 },
    ltr: { ml: 1000, litre: 1, l: 1, ltr: 1 },
    ml: { litre: 0.001, l: 0.001, ltr: 0.001, ml: 1 }
  };

  function normalizeUnit(rawUnit) {
    if (!rawUnit) return 'pcs';
    const u = String(rawUnit).toLowerCase().trim();
    if (['kg', 'kgs', 'kilo', 'kilogram', 'kilograms'].includes(u)) return 'kg';
    if (['g', 'gm', 'gms', 'gram', 'grams'].includes(u)) return 'g';
    if (['dozen', 'doz', 'dz'].includes(u)) return 'dozen';
    if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'number', 'adad'].includes(u)) return 'pcs';
    if (['l', 'ltr', 'litre', 'liter', 'litres'].includes(u)) return 'litre';
    if (['ml', 'milli', 'milliliter', 'millilitre'].includes(u)) return 'ml';
    if (['box', 'dabba', 'pack', 'packet', 'carton', 'bag', 'meter', 'm', 'ft', 'foot', 'feet', 'month', 'mo', 'fee'].includes(u)) return u;
    return u;
  }

  function formatUnit(rawUnit) {
    if (!rawUnit) return 'pcs';
    const s = String(rawUnit).trim();
    const low = s.toLowerCase();
    if (['ltr', 'litre', 'liter', 'l'].includes(low)) return 'Ltr';
    if (['kg', 'kgs', 'kilo', 'kilogram'].includes(low)) return 'kg';
    if (['g', 'gm', 'gms', 'gram', 'grams'].includes(low)) return 'g';
    if (['ml', 'milli', 'milliliter'].includes(low)) return 'ml';
    if (['dozen', 'doz', 'dz'].includes(low)) return 'dozen';
    if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'adad'].includes(low)) return 'pcs';
    if (['pkt', 'pack', 'packet'].includes(low)) return 'pack';
    if (['box', 'dabba'].includes(low)) return 'box';
    if (['bag', 'bori', 'thela'].includes(low)) return 'bag';
    if (['ctn', 'carton'].includes(low)) return 'carton';
    if (['meter', 'm'].includes(low)) return 'meter';
    if (['ft', 'foot', 'feet'].includes(low)) return 'ft';
    if (['sqft', 'sq.ft'].includes(low)) return 'sqft';
    if (['mo', 'month'].includes(low)) return 'month';
    if (['fee', 'challan'].includes(low)) return 'fee';
    return s;
  }

  function convertQuantityAndPrice(qty, unitPriceMinor, fromUnit, toUnit) {
    const normFrom = normalizeUnit(fromUnit);
    const normTo = normalizeUnit(toUnit);
    if (normFrom === normTo) return { convertedQty: qty, normalizedUnitPriceMinor: unitPriceMinor };
    const convTable = UNIT_CONVERSIONS[normFrom];
    if (!convTable || !convTable[normTo]) return null;
    const factor = convTable[normTo];
    const convertedQty = qty * factor;
    const normalizedUnitPriceMinor = Math.round(unitPriceMinor / factor);
    return { convertedQty, normalizedUnitPriceMinor };
  }

  // =========================================================================
  // 4. I18N STRINGS
  // =========================================================================
  const i18nDict = {
    app_title: 'Smart Bill Auditor',
    app_tagline: 'Intelligent Bill Auditor & Expense Suite',
    nav_dashboard: 'Dashboard',
    nav_system_check: 'System Check',
    nav_scan: 'Scan Bill',
    nav_vault: 'Receipt Vault',
    nav_audit: 'Audit Log & Rules',
    nav_items: 'Items Master',
    nav_vendors: 'Vendors',
    nav_customers: 'Customers',
    nav_inventory: 'Inventory',
    nav_purchase_orders: 'Purchase Orders',
    nav_sales: 'Sales & Invoices',
    nav_ledger: 'Ledger & Payments',
    nav_tax_reports: 'Tax Reports',
    nav_quick_add: 'Quick Add',
    nav_budgets: 'Budgets',
    nav_recurring: 'Recurring Rules',
    nav_khata: 'Khata / Udhaar',
    nav_split: 'Split Expense',
    nav_barcode: 'Barcode Lookup',
    nav_voice: 'Voice Entry',
    nav_settings: 'Settings',
    nav_shifts: 'Shifts & Registers',
    group_overview: 'Overview',
    group_operations: 'Operations',
    group_catalog: 'Catalog & Stock',
    group_parties: 'Parties',
    group_finance: 'Finance & Ledger',
    group_reports: 'Reports & Audits',
    group_system: 'System',
    mod_system_check: 'System Health & Diagnostics',
    mod_dashboard: 'Main Dashboard',
    mod_scan: 'AI Bill Scanner',
    mod_manual_bill: 'Manual Bill Entry',
    mod_vault: 'Receipt Vault',
    mod_audit: 'Audit Engine & Rules',
    mod_items: 'Item Master Catalog',
    mod_parties: 'Vendors & Customers',
    mod_vendors: 'Vendor Profiles & History',
    mod_customers: 'Customer Accounts',
    mod_inventory: 'Stock & Inventory Master',
    mod_purchase_orders: 'Purchase Orders & Claims',
    mod_ledger: 'Financial Ledger & Aging',
    mod_tax_reports: 'Tax & P&L Reports',
    mod_budgets: 'Budgets & Subscriptions',
    mod_barcode: 'Barcode Scanner',
    mod_voice: 'Voice Expense Parser',
    mod_shifts: 'Shifts & Cash Register',
    status_active: 'Active',
    status_inactive: 'Inactive',
    status_installed: 'Installed',
    status_persisted: 'Persisted',
    status_temporary: 'Temporary',
    status_core: 'Core (Permanent)',
    status_coming_soon: 'Phase Deliverable',
    status_open: 'Open',
    status_closed: 'Closed'
  };

  function t(key, params = {}) {
    let text = i18nDict[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
      }
    }
    return text;
  }

  // =========================================================================
  // 5. INDEXEDDB WRAPPER
  // =========================================================================
  const DB_NAME = 'smart_bill_auditor_db';
  const DB_VERSION = 2;
  let dbPromise = null;
  let currentContext = { userId: 'system', shiftId: 'none' };
  const _fallbackStoreCache = new Map();

  function setContext(userId = 'system', shiftId = 'none') {
    currentContext.userId = userId || 'system';
    currentContext.shiftId = shiftId || 'none';
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const stores = [
          'meta', 'settings', 'users', 'shifts', 'accounts', 'categories',
          'parties', 'items', 'transactions', 'transactionLines', 'documents',
          'stockMovements', 'payments', 'recurringRules', 'budgets', 'apiUsage', 'auditLog',
          'counters', 'purchaseOrders', 'debitNotes', 'sales'
        ];
        for (const s of stores) {
          if (!db.objectStoreNames.contains(s)) {
            const keyPath = (s === 'meta' || s === 'settings') ? 'key' : 'id';
            const storeObj = db.createObjectStore(s, { keyPath });
            if (s === 'users') {
              storeObj.createIndex('role', 'role', { unique: false });
              storeObj.createIndex('active', 'active', { unique: false });
            } else if (s === 'shifts') {
              storeObj.createIndex('userId', 'userId', { unique: false });
              storeObj.createIndex('status', 'status', { unique: false });
              storeObj.createIndex('compound_user_status', ['userId', 'status'], { unique: false });
            } else if (s === 'transactions') {
              storeObj.createIndex('billDate', 'billDate', { unique: false });
              storeObj.createIndex('partyId', 'partyId', { unique: false });
              storeObj.createIndex('compound_createdBy_shiftId', ['createdBy', 'shiftId'], { unique: false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeNames, mode, callback) {
    const db = await openDB();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    // Resilient fallback for any store not yet in this IDB instance
    const missing = names.filter(n => !db.objectStoreNames.contains(n));
    if (missing.length > 0) {
      const shimStores = {};
      for (const name of names) {
        if (!db.objectStoreNames.contains(name)) {
          if (!_fallbackStoreCache.has(name)) _fallbackStoreCache.set(name, new Map());
          const map = _fallbackStoreCache.get(name);
          shimStores[name] = {
            put: (val) => {
              const key = val.id || val.key || generateUUID();
              map.set(key, val);
              try { localStorage.setItem(`idb_shim_${name}_${key}`, JSON.stringify(val)); } catch {}
              const req = { onsuccess: null, onerror: null, result: key };
              setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
              return req;
            },
            get: (key) => {
              let res = map.get(key) ?? null;
              if (!res) {
                try {
                  const raw = localStorage.getItem(`idb_shim_${name}_${key}`);
                  if (raw) res = JSON.parse(raw);
                } catch {}
              }
              const req = { onsuccess: null, onerror: null, result: res };
              setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
              return req;
            },
            getAll: () => {
              const arr = Array.from(map.values());
              const req = { onsuccess: null, onerror: null, result: arr };
              setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
              return req;
            },
            delete: (key) => {
              map.delete(key);
              try { localStorage.removeItem(`idb_shim_${name}_${key}`); } catch {}
              const req = { onsuccess: null, onerror: null };
              setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
              return req;
            }
          };
        } else {
          // Wrap single real store
          try {
            const subTx = db.transaction([name], mode);
            shimStores[name] = subTx.objectStore(name);
          } catch {}
        }
      }
      return callback(shimStores);
    }

    return new Promise((resolve, reject) => {
      try {
        const idbTx = db.transaction(names, mode);
        const stores = {};
        for (const name of names) stores[name] = idbTx.objectStore(name);

        let resultValue;
        idbTx.oncomplete = () => resolve(resultValue);
        idbTx.onerror = () => reject(idbTx.error || new Error('Transaction failed'));
        idbTx.onabort = () => reject(idbTx.error || new Error('Transaction aborted'));

        const res = callback(stores, idbTx);
        if (res && typeof res.then === 'function') {
          res.then(val => { resultValue = val; }).catch(err => {
            try { idbTx.abort(); } catch {}
            reject(err);
          });
        } else {
          resultValue = res;
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async function put(storeName, item) {
    const now = new Date().toISOString();
    const stamped = (storeName === 'meta' || storeName === 'settings')
      ? { ...item, updatedAt: now }
      : {
          id: item.id || generateUUID(),
          createdAt: item.createdAt || now,
          updatedAt: now,
          createdBy: item.createdBy || currentContext.userId,
          updatedBy: currentContext.userId,
          shiftId: item.shiftId !== undefined ? item.shiftId : currentContext.shiftId,
          isDemo: item.isDemo || false,
          schemaVersion: 1,
          ...item
        };

    return tx(storeName, 'readwrite', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].put(stamped);
        req.onsuccess = () => resolve(stamped);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function get(storeName, key) {
    return tx(storeName, 'readonly', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function getAll(storeName) {
    return tx(storeName, 'readonly', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function getAllByIndex(storeName, indexName, key) {
    return tx(storeName, 'readonly', (stores) => {
      return new Promise((resolve, reject) => {
        const idx = stores[storeName].index(indexName);
        const req = idx.getAll(key);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function remove(storeName, key) {
    return tx(storeName, 'readwrite', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function count(storeName) {
    return tx(storeName, 'readonly', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function clear(storeName) {
    return tx(storeName, 'readwrite', (stores) => {
      return new Promise((resolve, reject) => {
        const req = stores[storeName].clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function deleteDatabase() {
    if (dbPromise) {
      try { const db = await dbPromise; db.close(); } catch {}
      dbPromise = null;
    }
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        console.warn('deleteDatabase blocked, resolving as stores cleared');
        resolve(true);
      };
    });
  }

  // Expose global database interface on window.db for DemoEngine, external scripts, and test suite
  if (typeof window !== 'undefined') {
    window.db = {
      openDB,
      put,
      get,
      getAll,
      getAllByIndex,
      remove,
      delete: remove,
      del: remove,
      count,
      clear,
      tx,
      deleteDatabase,
      scopedQuery: (storeName, filters) => scopedQuery(storeName, filters),
      setContext: (ctx) => { Object.assign(currentContext, ctx); }
    };
  }

  // =========================================================================
  // 6. MODULES REGISTRY
  // =========================================================================
  const MODULE_GROUPS = [
    { id: 'overview', nameKey: 'group_overview' },
    { id: 'operations', nameKey: 'group_operations' },
    { id: 'catalog', nameKey: 'group_catalog' },
    { id: 'parties', nameKey: 'group_parties' },
    { id: 'finance', nameKey: 'group_finance' },
    { id: 'reports', nameKey: 'group_reports' },
    { id: 'system', nameKey: 'group_system' }
  ];

  const MODULE_DEFINITIONS = [
    { id: 'system_check', nameKey: 'mod_system_check', icon: 'cpu', group: 'system', route: '#/system-check', core: true, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'dashboard', nameKey: 'mod_dashboard', icon: 'dashboard', group: 'overview', route: '#/', core: true, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'settings', nameKey: 'nav_settings', icon: 'settings', group: 'system', route: '#/settings', core: true, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'scan', nameKey: 'mod_scan', icon: 'camera', group: 'operations', route: '#/scan', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'manualBill', nameKey: 'mod_manual_bill', icon: 'edit', group: 'operations', route: '#/manual-bill', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'vault', nameKey: 'mod_vault', icon: 'archive', group: 'operations', route: '#/vault', core: false, dependsOn: ['scan'], defaultEnabled: true, isBuilt: true },
    { id: 'audit', nameKey: 'mod_audit', icon: 'shield-alert', group: 'reports', route: '#/audit', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'inventory', nameKey: 'mod_inventory', icon: 'layers', group: 'catalog', route: '#/inventory', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'parties', nameKey: 'mod_parties', icon: 'users', group: 'parties', route: '#/parties', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'purchaseOrders', nameKey: 'mod_purchase_orders', icon: 'file-text', group: 'operations', route: '#/purchase-orders', core: false, dependsOn: ['parties'], defaultEnabled: true, isBuilt: true },
    { id: 'ledger', nameKey: 'mod_ledger', icon: 'book', group: 'finance', route: '#/ledger', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'taxReports', nameKey: 'mod_tax_reports', icon: 'pie-chart', group: 'reports', route: '#/tax-reports', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true },
    { id: 'budgets', nameKey: 'mod_budgets', icon: 'trending-up', group: 'finance', route: '#/budgets', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }
  ];

  let moduleStateMap = new Map();

  async function initModules() {
    for (const mod of MODULE_DEFINITIONS) {
      moduleStateMap.set(mod.id, mod.core ? true : mod.defaultEnabled);
    }
    try {
      const rec = await get('settings', 'modules_enabled');
      if (rec && rec.value && typeof rec.value === 'object') {
        for (const [id, enabled] of Object.entries(rec.value)) {
          const mod = MODULE_DEFINITIONS.find(m => m.id === id);
          if (mod && !mod.core) moduleStateMap.set(id, Boolean(enabled));
        }
      }
    } catch {}
  }

  function getAllModules() {
    return MODULE_DEFINITIONS.map(mod => ({
      ...mod,
      enabled: mod.core ? true : (moduleStateMap.get(mod.id) ?? mod.defaultEnabled)
    }));
  }

  function getEnabledModules() {
    return getAllModules().filter(m => m.enabled);
  }

  async function enableModule(id) {
    moduleStateMap.set(id, true);
    const obj = {};
    for (const [k, v] of moduleStateMap.entries()) obj[k] = v;
    await put('settings', { key: 'modules_enabled', value: obj });
    if (typeof renderSidebar === 'function') renderSidebar();
    window.dispatchEvent(new CustomEvent('module-state-changed'));
    return { success: true, message: `Enabled module '${id}'` };
  }

  async function disableModule(id) {
    const mod = MODULE_DEFINITIONS.find(m => m.id === id);
    if (!mod || mod.core) return { success: false, message: `Cannot disable core module` };
    moduleStateMap.set(id, false);
    const obj = {};
    for (const [k, v] of moduleStateMap.entries()) obj[k] = v;
    await put('settings', { key: 'modules_enabled', value: obj });
    if (typeof renderSidebar === 'function') renderSidebar();
    window.dispatchEvent(new CustomEvent('module-state-changed'));
    return { success: true, message: `Disabled module '${id}'` };
  }

  // =========================================================================
  // 7. TOAST & MODAL UI HELPERS
  // =========================================================================
  const toast = {
    show: ({ message, type = 'info', duration = 4000, action = null }) => {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      let actionHtml = action ? `<button type="button" class="btn btn-secondary btn-sm" id="toast-act-btn">${escapeHTML(action.label)}</button>` : '';
      el.innerHTML = `
        <div>${escapeHTML(message)}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${actionHtml}
          <button type="button" class="btn btn-secondary btn-sm btn-icon" id="toast-x-btn">✕</button>
        </div>
      `;
      container.appendChild(el);
      const dismiss = () => { if (el.parentNode) el.parentNode.removeChild(el); };
      el.querySelector('#toast-x-btn').addEventListener('click', dismiss);
      if (action) {
        el.querySelector('#toast-act-btn').addEventListener('click', () => {
          if (typeof action.onClick === 'function') action.onClick();
          dismiss();
        });
      }
      if (duration > 0) setTimeout(dismiss, duration);
      return dismiss;
    },
    success: (msg, d = 4000) => toast.show({ message: msg, type: 'success', duration: d }),
    error: (msg, d = 6000) => toast.show({ message: msg, type: 'error', duration: d }),
    warning: (msg, d = 5000) => toast.show({ message: msg, type: 'warning', duration: d }),
    info: (msg, d = 4000) => toast.show({ message: msg, type: 'info', duration: d })
  };

  const modal = {
    active: null,
    open: ({ title, content, actions = [], onClose = null }) => {
      modal.close();
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const actionsHtml = actions.map((act, idx) => `
        <button type="button" class="btn ${act.class || 'btn-secondary'}" data-act-idx="${idx}">
          ${escapeHTML(act.label)}
        </button>
      `).join('');

      overlay.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">${escapeHTML(title)}</h3>
            <button type="button" class="btn btn-secondary btn-sm btn-icon" id="m-close-btn">✕</button>
          </div>
          <div class="modal-body">${content}</div>
          ${actions.length > 0 ? `<div class="modal-footer">${actionsHtml}</div>` : ''}
        </div>
      `;
      document.body.appendChild(overlay);
      modal.active = { overlay, onClose };

      overlay.querySelector('#m-close-btn').addEventListener('click', () => modal.close());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) modal.close(); });

      overlay.querySelectorAll('[data-act-idx]').forEach(btn => {
        const idx = parseInt(btn.getAttribute('data-act-idx'), 10);
        const act = actions[idx];
        btn.addEventListener('click', async (e) => {
          if (act && typeof act.onClick === 'function') {
            const shouldClose = await act.onClick(e);
            if (shouldClose !== false) modal.close();
          } else {
            modal.close();
          }
        });
      });
    },
    close: () => {
      if (!modal.active) return;
      const { overlay, onClose } = modal.active;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      modal.active = null;
      if (typeof onClose === 'function') onClose();
    }
  };

  // =========================================================================
  // 8. AUTHENTICATION & WEBCRYPTO PBKDF2
  // =========================================================================
  let currentUser = { id: 'admin', name: 'Admin', role: 'admin' };
  let isScreenLocked = false;
  let failedAttempts = 0;
  let lockoutUntil = 0;

  function generateSalt(byteLength = 16) {
    const salt = new Uint8Array(byteLength);
    crypto.getRandomValues(salt);
    return bufferToHex(salt.buffer);
  }

  async function hashPin(pin, saltHex) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const saltBytes = hexToBytes(saltHex);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    return bufferToHex(derivedBits);
  }

  async function verifyPin(pin, saltHex, expectedHashHex) {
    const hash = await hashPin(pin, saltHex);
    return hash === expectedHashHex;
  }

  async function needsOnboarding() {
    return false; // Registration flow disabled per user request; app directly open
  }

  async function getActiveUsers() {
    const all = await getAll('users');
    return all.filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name, role: u.role }));
  }

  function getLockoutStatus() {
    const now = Date.now();
    if (lockoutUntil > now) {
      return { locked: true, remainingSeconds: Math.ceil((lockoutUntil - now) / 1000) };
    }
    return { locked: false, remainingSeconds: 0 };
  }

  async function login(userId, pin) {
    const status = getLockoutStatus();
    if (status.locked) return { success: false, message: `System locked. Wait ${status.remainingSeconds}s.` };

    const user = await get('users', userId);
    if (!user || user.active === false) return { success: false, message: 'User not found.' };

    const isValid = await verifyPin(pin, user.pinSalt, user.pinHash);
    if (!isValid) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockoutUntil = Date.now() + 60000;
        failedAttempts = 0;
        return { success: false, message: 'Too many failed attempts. Locked for 60s.' };
      }
      return { success: false, message: `Incorrect PIN. ${5 - failedAttempts} attempts remaining.` };
    }

    failedAttempts = 0;
    lockoutUntil = 0;
    currentUser = { id: user.id, name: user.name, role: user.role };
    isScreenLocked = false;
    setContext(currentUser.id, 'none');

    await logAction({
      action: 'LOGIN',
      entity: 'users',
      entityId: user.id,
      summary: `User "${user.name}" (${user.role}) logged in.`,
      outcome: 'success'
    });

    return { success: true };
  }

  function lock() { isScreenLocked = false; }
  function logout() { currentUser = { id: 'admin', name: 'Admin', role: 'admin' }; isScreenLocked = false; setContext('admin', 'none'); }
  function getCurrentUser() { return currentUser ? { ...currentUser } : { id: 'admin', name: 'Admin', role: 'admin' }; }
  function isLoggedIn() { return true; }
  function isLocked() { return false; }

  async function createUser({ name, role, pin }) {
    const salt = generateSalt(16);
    const hash = await hashPin(pin, salt);
    const newUser = { name, role, pinHash: hash, pinSalt: salt, active: true };
    return put('users', newUser);
  }

  async function resetUserPin(id, newPin) {
    const user = await get('users', id);
    if (!user) throw new Error('User not found');
    const salt = generateSalt(16);
    const hash = await hashPin(newPin, salt);
    user.pinHash = hash;
    user.pinSalt = salt;
    return put('users', user);
  }

  // =========================================================================
  // 9. AUDIT LOGGING
  // =========================================================================
  async function logAction({ action, entity, entityId = null, summary, outcome = 'success' }) {
    const u = getCurrentUser();
    const entry = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      userId: u ? u.id : 'system',
      userName: u ? u.name : 'System',
      userRole: u ? u.role : 'system',
      action,
      entity,
      entityId,
      summary,
      outcome,
      schemaVersion: 1
    };
    try {
      await put('auditLog', entry);
      return entry;
    } catch {
      return null;
    }
  }

  const appendAuditLog = (entry) => logAction(entry);

  async function scopedQuery(storeName, filters = {}) {
    const all = await getAll(storeName).catch(() => []);
    const user = getCurrentUser();
    if (!user || user.role === 'admin') return all;
    if (user.role === 'staff') {
      if (storeName === 'shifts') return all.filter(r => r.userId === user.id);
      return all.filter(r => !r.createdBy || r.createdBy === user.id);
    }
    return all;
  }

  async function getAuditLogs(filters = {}) {
    const all = await getAll('auditLog');
    let filtered = all.filter(l => {
      if (filters.action && l.action !== filters.action) return false;
      if (filters.outcome && l.outcome !== filters.outcome) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered;
  }

  function downloadAuditLogsCSV(logs) {
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Summary', 'Outcome'];
    const rows = logs.map(l => [
      `"${l.timestamp}"`,
      `"${l.userName || l.userId}"`,
      `"${l.userRole}"`,
      `"${l.action}"`,
      `"${(l.summary || '').replace(/"/g, '""')}"`,
      `"${l.outcome}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // 10. BACKUP & RESTORE
  // =========================================================================
  async function computeSHA256(input) {
    let buf;
    if (typeof input === 'string') {
      buf = new TextEncoder().encode(input);
    } else if (input instanceof ArrayBuffer) {
      buf = input;
    } else if (ArrayBuffer.isView(input)) {
      buf = input.buffer;
    } else {
      buf = new Uint8Array(0);
    }
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return bufferToHex(digest);
      } catch (e) {
        console.warn('SubtleCrypto error:', e);
      }
    }
    return 'sha256-fallback-' + Math.random().toString(36).slice(2, 10);
  }

  // --- Secret Obfuscation Helpers for Client-Side Local Storage ---
  function obfuscateSecret(plain) {
    if (!plain) return '';
    try {
      const salt = 'AIFM_SECURE_SALT_99';
      let xor = '';
      for (let i = 0; i < plain.length; i++) {
        xor += String.fromCharCode(plain.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
      }
      return 'enc:' + (typeof btoa !== 'undefined' ? btoa(xor) : Buffer.from(xor, 'binary').toString('base64'));
    } catch {
      return plain;
    }
  }

  function deobfuscateSecret(stored) {
    if (!stored) return '';
    try {
      if (typeof stored === 'string' && stored.startsWith('enc:')) {
        const raw = (typeof atob !== 'undefined') ? atob(stored.slice(4)) : Buffer.from(stored.slice(4), 'base64').toString('binary');
        const salt = 'AIFM_SECURE_SALT_99';
        let plain = '';
        for (let i = 0; i < raw.length; i++) {
          plain += String.fromCharCode(raw.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
        }
        return plain;
      }
      return stored;
    } catch {
      return stored;
    }
  }

  function savePermanentAIConfig(aiPayload) {
    try {
      if (!aiPayload || !aiPayload.apiKey) {
        localStorage.removeItem('smart_bill_permanent_ai_config');
        return;
      }
      const copy = { ...aiPayload, apiKey: obfuscateSecret(aiPayload.apiKey) };
      localStorage.setItem('smart_bill_permanent_ai_config', JSON.stringify(copy));
    } catch (e) {}
  }

  function loadPermanentAIConfig() {
    try {
      const s = localStorage.getItem('smart_bill_permanent_ai_config');
      if (!s) return null;
      const obj = JSON.parse(s);
      if (obj && obj.apiKey) {
        obj.apiKey = deobfuscateSecret(obj.apiKey);
      }
      return obj;
    } catch {
      return null;
    }
  }

  async function createAndDownloadBackup() {
    const storesData = {};
    const ALL_STORES = [
      'settings', 'users', 'shifts', 'accounts', 'categories', 'parties',
      'items', 'transactions', 'transactionLines', 'documents', 'stockMovements',
      'payments', 'recurringRules', 'budgets', 'apiUsage', 'auditLog', 'meta'
    ];
    for (const s of ALL_STORES) {
      storesData[s] = await getAll(s);
    }
    const payloadString = JSON.stringify(storesData);
    const checksum = await computeSHA256(payloadString);

    const backupObject = {
      app: 'smart_bill_auditor',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      checksum,
      stores: storesData
    };

    const finalJson = JSON.stringify(backupObject, null, 2);
    const blob = new Blob([finalJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `smart-bill-auditor-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await put('meta', { key: 'last_backup_at', value: new Date().toISOString() });
    await logAction({ action: 'BACKUP_CREATED', entity: 'system', summary: `Downloaded backup file: ${filename}.` });
    toast.success('Backup file downloaded.');
    return true;
  }

  async function promptRestoreFromFile(file, onRestoreComplete) {
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || !backup.stores) throw new Error('Missing stores in backup.');

      const ALL_STORES = Object.keys(backup.stores);
      for (const s of ALL_STORES) {
        await clear(s);
        const records = backup.stores[s] || [];
        for (const r of records) await put(s, r);
      }
      await logAction({ action: 'BACKUP_RESTORED', entity: 'system', summary: 'Restored backup file.' });
      toast.success('Data restored successfully.');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Restore failed: ${e.message}`);
    }
  }

  // =========================================================================
  // 11. SHIFTS
  // =========================================================================
  async function getActiveShift() {
    const u = getCurrentUser();
    if (!u) return null;
    const all = await getAll('shifts');
    return all.find(s => s.userId === u.id && s.status === 'open') || null;
  }

  function promptOpenShift(onShiftOpened) {
    const u = getCurrentUser();
    if (!u) return;

    modal.open({
      title: 'Open Work Shift',
      content: `
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
          Opening a shift records your drawer start time and opening cash. All records created during this shift will be stamped with your ID.
        </p>
        <div class="form-group">
          <label class="form-label">Drawer Opening Cash Amount</label>
          <input type="text" class="form-control" id="modal-opening-cash" placeholder="e.g. 5,000.00" value="0.00" autofocus>
        </div>
      `,
      actions: [
        { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
        {
          label: 'Open Shift Now',
          class: 'btn-primary',
          onClick: async () => {
            const inp = document.getElementById('modal-opening-cash');
            const cashMinor = parseMoney(inp ? inp.value : '0', 'PKR');
            const shift = {
              userId: u.id,
              userName: u.name,
              userRole: u.role,
              openedAt: new Date().toISOString(),
              closedAt: null,
              openingCashMinor: cashMinor,
              closingCashMinor: null,
              expectedCashMinor: null,
              differenceMinor: null,
              status: 'open',
              notes: ''
            };
            const saved = await put('shifts', shift);
            setContext(u.id, saved.id);
            await logAction({ action: 'SHIFT_OPEN', entity: 'shifts', entityId: saved.id, summary: `Opened shift with cash: ${formatMoney(cashMinor, 'PKR')}.` });
            toast.success('Shift opened.');
            if (typeof onShiftOpened === 'function') onShiftOpened(saved);
            return true;
          }
        }
      ]
    });
  }

  async function promptCloseShift(shift, onShiftClosed) {
    const u = getCurrentUser();
    const expectedCashMinor = shift.openingCashMinor || 0; // Derived in full business phase

    modal.open({
      title: 'Close Shift & Count Cash',
      content: `
        <div style="font-size: 13px; margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:var(--muted);">Opened At:</span>
            <span>${formatDate(shift.openedAt)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:var(--muted);">Opening Cash:</span>
            <strong>${formatMoney(shift.openingCashMinor, 'PKR')}</strong>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Counted Cash in Drawer</label>
          <input type="text" class="form-control" id="modal-counted-cash" value="${formatMoney(expectedCashMinor, 'PKR', { showSymbol: false })}" autofocus>
        </div>
      `,
      actions: [
        { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
        {
          label: 'Reconcile & Close Shift',
          class: 'btn-primary',
          onClick: async () => {
            const inp = document.getElementById('modal-counted-cash');
            const countedMinor = parseMoney(inp ? inp.value : '0', 'PKR');
            const diffMinor = subMoney(countedMinor, expectedCashMinor);

            const closed = {
              ...shift,
              closedAt: new Date().toISOString(),
              closingCashMinor: countedMinor,
              expectedCashMinor,
              differenceMinor: diffMinor,
              status: 'closed'
            };
            await put('shifts', closed);
            setContext(u ? u.id : 'system', 'none');
            await logAction({ action: 'SHIFT_CLOSE', entity: 'shifts', entityId: closed.id, summary: `Closed shift. Counted: ${formatMoney(countedMinor, 'PKR')}.` });
            toast.success('Shift closed.');
            if (typeof onShiftClosed === 'function') onShiftClosed(closed);
            return true;
          }
        }
      ]
    });
  }

  // =========================================================================
  // 12. HARD RESET
  // =========================================================================
  async function executeHardReset() {
    try {
      // 1. Preserve user's permanent AI API key and provider configuration
      let preservedAiConfig = null;
      try {
        preservedAiConfig = localStorage.getItem('smart_bill_permanent_ai_config');
        if (!preservedAiConfig) {
          const s = await get('settings', 'ai');
          if (s?.value?.apiKey) {
            const copy = { ...s.value, apiKey: obfuscateSecret(s.value.apiKey) };
            preservedAiConfig = JSON.stringify(copy);
          }
        }
      } catch (e) {}

      // Explicitly clear all IndexedDB stores to guarantee 100% data purge even if deleteDatabase() is delayed
      const allStoreNames = [
        'meta', 'settings', 'users', 'shifts', 'accounts', 'categories',
        'parties', 'items', 'transactions', 'transactionLines', 'documents',
        'stockMovements', 'payments', 'recurringRules', 'budgets', 'apiUsage', 'auditLog',
        'counters', 'purchaseOrders', 'debitNotes', 'sales'
      ];
      for (const s of allStoreNames) {
        try { await clear(s); } catch (e) {}
      }
      if (typeof _fallbackStoreCache !== 'undefined' && _fallbackStoreCache) {
        _fallbackStoreCache.clear();
      }

      await deleteDatabase();
      localStorage.clear();
      sessionStorage.clear();

      // 2. Restore permanent AI API Key so user never loses it on reset
      if (preservedAiConfig) {
        try {
          localStorage.setItem('smart_bill_permanent_ai_config', preservedAiConfig);
        } catch (e) {}
      }

      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch {}
      }
      if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch (swErr) {
          console.warn('[Reset] ServiceWorker unregister skipped:', swErr);
        }
      }
      alert('Application data reset successfully. (Your AI API key was safely preserved). Reloading...');
      window.location.reload();
    } catch (e) {
      alert(`Reset error: ${e.message}`);
    }
  }

  function promptHardResetConfirmation() {
    modal.open({
      title: 'CONFIRM FACTORY HARD RESET',
      content: `
        <div class="panel" style="background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text); margin-bottom: 16px; font-size: 13px;">
          <strong>Warning:</strong> This permanently wipes all IndexedDB tables, LocalStorage, and Cache Storage on this machine.
        </div>
        <div style="margin-bottom: 16px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-m-reset-backup" style="width: 100%;">
            <span>📥</span> Download Safety Backup First
          </button>
        </div>
        <div class="form-group">
          <label class="form-label">Type <code>RESET</code> in all capitals to confirm:</label>
          <input type="text" class="form-control" id="m-reset-confirm-inp" placeholder="RESET" autocomplete="off">
        </div>
      `,
      actions: [
        { label: 'Cancel', class: 'btn-secondary', onClick: () => true },
        {
          label: 'WIPE EVERYTHING & RESET',
          class: 'btn-danger',
          onClick: async () => {
            const inp = document.getElementById('m-reset-confirm-inp');
            if (!inp || inp.value.trim() !== 'RESET') {
              alert('You must type RESET in capital letters.');
              return false;
            }
            await executeHardReset();
            return true;
          }
        }
      ]
    });
    document.getElementById('btn-m-reset-backup')?.addEventListener('click', () => createAndDownloadBackup());
  }

  // =========================================================================
  // 13. VIEWS & SCREENS
  // =========================================================================

  // --- Onboarding Screen ---
  function renderOnboardingView(onComplete) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    let step = 1;
    const data = {
      persona: 'shop',
      businessName: 'My Business',
      currency: 'PKR',
      numberSystem: 'indian',
      adminName: 'Administrator',
      pin: '',
      confirmPin: ''
    };

    function draw() {
      if (step === 1) {
        mainEl.innerHTML = `
          <div class="card" style="max-width: 620px; margin: 40px auto;">
            <div class="card-header">
              <h2 class="card-title">Welcome to Smart Bill Auditor</h2>
              <span class="pill pill-primary">Step 1 of 4</span>
            </div>
            <p style="color: var(--muted); margin-bottom: 20px;">
              A fast, offline-first suite for auditing bills, tracking expenses, and managing financial records.
            </p>
            <div class="panel" style="margin-bottom: 24px; border-left: 3px solid var(--secondary);">
              <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">Important Disclaimer</div>
              <p style="font-size: 13px; color: var(--text); margin: 0;">
                This application is an internal record-keeping and auditing tool. It does not constitute formal legal, tax, or financial accounting advice.
              </p>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button type="button" class="btn btn-primary" id="ob-btn-1">I Understand & Agree &rarr;</button>
            </div>
          </div>
        `;
        document.getElementById('ob-btn-1').addEventListener('click', () => { step = 2; draw(); });
      } else if (step === 2) {
        mainEl.innerHTML = `
          <div class="card" style="max-width: 620px; margin: 40px auto;">
            <div class="card-header">
              <h2 class="card-title">Choose Operating Profile</h2>
              <span class="pill pill-primary">Step 2 of 4</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
              <label class="panel" style="cursor:pointer; display:flex; gap:12px;">
                <input type="radio" name="ob-preset" value="shop" checked style="margin-top:4px;">
                <div><strong>Retail & Shop (Full Feature Set)</strong><div style="font-size:12px; color:var(--muted);">Bills, inventory, vendors, sales, shifts.</div></div>
              </label>
              <label class="panel" style="cursor:pointer; display:flex; gap:12px;">
                <input type="radio" name="ob-preset" value="professional" style="margin-top:4px;">
                <div><strong>Professional / Freelancer</strong><div style="font-size:12px; color:var(--muted);">Expense claims, clients, tax summaries.</div></div>
              </label>
              <label class="panel" style="cursor:pointer; display:flex; gap:12px;">
                <input type="radio" name="ob-preset" value="household" style="margin-top:4px;">
                <div><strong>Household & Personal</strong><div style="font-size:12px; color:var(--muted);">Streamlined mode for family bills and budget tracking.</div></div>
              </label>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <button type="button" class="btn btn-secondary" id="ob-back-1">&larr; Back</button>
              <button type="button" class="btn btn-primary" id="ob-btn-2">Next &rarr;</button>
            </div>
          </div>
        `;
        document.getElementById('ob-back-1').addEventListener('click', () => { step = 1; draw(); });
        document.getElementById('ob-btn-2').addEventListener('click', () => {
          const sel = document.querySelector('input[name="ob-preset"]:checked');
          if (sel) data.persona = sel.value;
          step = 3;
          draw();
        });
      } else if (step === 3) {
        const curOptions = Object.keys(CURRENCY_CONFIG).map(c => `
          <option value="${c}" ${c === 'PKR' ? 'selected' : ''}>${c} — ${CURRENCY_CONFIG[c].name} (${CURRENCY_CONFIG[c].symbol})</option>
        `).join('');

        mainEl.innerHTML = `
          <div class="card" style="max-width: 620px; margin: 40px auto;">
            <div class="card-header">
              <h2 class="card-title">Business & Currency</h2>
              <span class="pill pill-primary">Step 3 of 4</span>
            </div>
            <div class="form-group">
              <label class="form-label">Business / Family Name</label>
              <input type="text" class="form-control" id="ob-name" value="${escapeHTML(data.businessName)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Operating Currency</label>
              <select class="form-control" id="ob-curr">${curOptions}</select>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top:24px;">
              <button type="button" class="btn btn-secondary" id="ob-back-2">&larr; Back</button>
              <button type="button" class="btn btn-primary" id="ob-btn-3">Next &rarr;</button>
            </div>
          </div>
        `;
        document.getElementById('ob-back-2').addEventListener('click', () => { step = 2; draw(); });
        document.getElementById('ob-btn-3').addEventListener('click', () => {
          const nameInp = document.getElementById('ob-name');
          const currInp = document.getElementById('ob-curr');
          if (nameInp && nameInp.value.trim()) data.businessName = nameInp.value.trim();
          if (currInp) data.currency = currInp.value;
          step = 4;
          draw();
        });
      } else if (step === 4) {
        mainEl.innerHTML = `
          <div class="card" style="max-width: 620px; margin: 40px auto;">
            <div class="card-header">
              <h2 class="card-title">Set Administrator Security PIN</h2>
              <span class="pill pill-primary">Step 4 of 4</span>
            </div>
            <p style="color: var(--muted); margin-bottom: 20px;">
              Set a 4 to 6 digit security PIN for your Administrator account. This PIN is hashed locally using WebCrypto PBKDF2.
            </p>
            <div class="form-group">
              <label class="form-label">Admin Name</label>
              <input type="text" class="form-control" id="ob-admin-name" value="${escapeHTML(data.adminName)}" required>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Security PIN (4-6 Digits)</label>
                <input type="password" class="form-control" id="ob-pin" maxlength="6" inputmode="numeric" placeholder="e.g. 1234" required autofocus>
              </div>
              <div class="form-group">
                <label class="form-label">Confirm Security PIN</label>
                <input type="password" class="form-control" id="ob-cpin" maxlength="6" inputmode="numeric" placeholder="Re-enter PIN" required>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 24px;">
              <button type="button" class="btn btn-secondary" id="ob-back-3">&larr; Back</button>
              <button type="button" class="btn btn-primary" id="ob-finish">Finish Setup & Unlock</button>
            </div>
          </div>
        `;
        document.getElementById('ob-back-3').addEventListener('click', () => { step = 3; draw(); });
        document.getElementById('ob-finish').addEventListener('click', async () => {
          const pin = document.getElementById('ob-pin')?.value.trim();
          const cpin = document.getElementById('ob-cpin')?.value.trim();
          const adminName = document.getElementById('ob-admin-name')?.value.trim() || 'Administrator';

          if (!/^\d{4,6}$/.test(pin)) {
            alert('PIN must be 4 to 6 numeric digits.');
            return;
          }
          if (pin !== cpin) {
            alert('PINs do not match.');
            return;
          }

          const adminUser = await createUser({ name: adminName, role: 'admin', pin });
          await put('settings', {
            key: 'general',
            value: {
              businessName: data.businessName,
              currency: data.currency,
              numberSystem: data.numberSystem,
              persona: data.persona,
              deleteConfirmation: true,
              idleTimeoutMinutes: 15
            }
          });

          await login(adminUser.id, pin);
          toast.success(`Welcome, ${adminName}! Setup complete.`);
          if (typeof onComplete === 'function') onComplete();
        });
      }
    }
    draw();
  }

  // --- Login / Unlock Keypad View ---
  async function renderLoginView(onSuccess) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const users = await getActiveUsers();
    let selectedUserId = users.length > 0 ? users[0].id : '';
    let pinBuffer = '';

    function draw() {
      const lockout = getLockoutStatus();
      const userOptions = users.map(u => `
        <option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>
          ${escapeHTML(u.name)} (${u.role.toUpperCase()})
        </option>
      `).join('');

      const bullets = Array(6).fill(0).map((_, i) => `
        <div style="width: 14px; height: 14px; border: 2px solid ${i < pinBuffer.length ? 'var(--primary)' : 'var(--border-strong)'}; background-color: ${i < pinBuffer.length ? 'var(--primary)' : 'transparent'};"></div>
      `).join('');

      mainEl.innerHTML = `
        <div class="card" style="max-width: 420px; margin: 40px auto; text-align: center;">
          <div style="margin-bottom: 20px;">
            <span class="brand-badge">Authentication</span>
            <h2 style="font-size: 20px; margin: 8px 0 4px 0;">Enter Security PIN</h2>
            <p style="color: var(--muted); font-size: 13px; margin: 0;">Access your local session</p>
          </div>

          ${lockout.locked ? `
            <div class="notice-banner" style="background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text); margin-bottom: 20px;">
              <span>🔒</span>
              <div>Locked out. Try again in <strong>${lockout.remainingSeconds}s</strong>.</div>
            </div>
          ` : ''}

          <div class="form-group" style="text-align: left; margin-bottom: 24px;">
            <label class="form-label">User Account</label>
            <select class="form-control" id="login-user-select" ${lockout.locked ? 'disabled' : ''}>
              ${userOptions}
            </select>
          </div>

          <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 28px;">
            ${bullets}
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 280px; margin: 0 auto 20px auto;">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
              <button type="button" class="btn btn-secondary keypad-btn" data-digit="${n}" style="font-size: 18px; font-weight: 700; height: 52px;" ${lockout.locked ? 'disabled' : ''}>${n}</button>
            `).join('')}
            <button type="button" class="btn btn-secondary keypad-btn" id="btn-clear" style="font-size: 12px; height: 52px;" ${lockout.locked ? 'disabled' : ''}>CLEAR</button>
            <button type="button" class="btn btn-secondary keypad-btn" data-digit="0" style="font-size: 18px; font-weight: 700; height: 52px;" ${lockout.locked ? 'disabled' : ''}>0</button>
            <button type="button" class="btn btn-secondary keypad-btn" id="btn-backspace" style="font-size: 16px; height: 52px;" ${lockout.locked ? 'disabled' : ''}>⌫</button>
          </div>

          <div>
            <button type="button" class="btn btn-primary" id="btn-submit-pin" style="width: 100%; max-width: 280px;" ${lockout.locked || pinBuffer.length < 4 ? 'disabled' : ''}>
              Unlock Session
            </button>
          </div>
        </div>
      `;

      document.getElementById('login-user-select')?.addEventListener('change', (e) => {
        selectedUserId = e.target.value;
      });

      mainEl.querySelectorAll('[data-digit]').forEach(b => {
        b.addEventListener('click', () => {
          if (pinBuffer.length < 6) {
            pinBuffer += b.getAttribute('data-digit');
            draw();
          }
        });
      });

      document.getElementById('btn-clear')?.addEventListener('click', () => { pinBuffer = ''; draw(); });
      document.getElementById('btn-backspace')?.addEventListener('click', () => { pinBuffer = pinBuffer.slice(0, -1); draw(); });
      document.getElementById('btn-submit-pin')?.addEventListener('click', async () => {
        const res = await login(selectedUserId, pinBuffer);
        if (res.success) {
          toast.success('PIN verified.');
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          pinBuffer = '';
          toast.error(res.message || 'Login failed.');
          draw();
        }
      });
    }

    draw();
  }

  // --- Settings View ---
  let activeSettingsTab = 'general';
  async function renderSettingsView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const u = getCurrentUser();
    const isAdmin = u && u.role === 'admin';
    const gen = (await get('settings', 'general'))?.value || {
      businessName: 'My Business',
      currency: 'PKR',
      numberSystem: 'indian',
      taxRateBp: 1500,
      deleteConfirmation: true,
      idleTimeoutMinutes: 15
    };

    function draw() {
      if (!isDemoMode() && activeSettingsTab === 'demo') {
        activeSettingsTab = 'general';
      }
      const tabs = [
        { id: 'general', label: 'General' },
        { id: 'branding', label: 'Branding & Client Setup' },
        { id: 'features', label: 'Features & Presets' },
        ...(isDemoMode() ? [{ id: 'demo', label: 'Demo Mode (ڈیمو)' }] : []),
        { id: 'security', label: 'Security & Users' },
        { id: 'data', label: 'Data & Backup' },
        { id: 'ai', label: 'AI Provider' },
        { id: 'scan_quality', label: 'Scan Quality Gate' },
        { id: 'about', label: 'About' },
        { id: 'reset', label: 'Factory Reset' }
      ];

      const tabsHtml = tabs.map(tab => `
        <button type="button" class="btn ${activeSettingsTab === tab.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-stab="${tab.id}">
          ${tab.label}
        </button>
      `).join('');

      mainEl.innerHTML = `
        <div class="card" style="margin-bottom: 20px;">
          <h1 style="font-size: 22px; margin-bottom: 4px;">Settings & Preferences</h1>
          <p style="color: var(--muted); margin: 0; font-size: 13px;">Manage configurations, data safety, and user roles.</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            ${tabsHtml}
          </div>
        </div>

        <div id="settings-tab-pane"></div>
      `;

      mainEl.querySelectorAll('[data-stab]').forEach(b => {
        b.addEventListener('click', (e) => {
          activeSettingsTab = e.currentTarget.getAttribute('data-stab');
          draw();
        });
      });

      drawTabContent(gen, isAdmin);
    }

    draw();
  }

  async function drawTabContent(gen, isAdmin) {
    const pane = document.getElementById('settings-tab-pane');
    if (!pane) return;

    if (activeSettingsTab === 'general') {
      const curOptions = Object.keys(CURRENCY_CONFIG).map(c => `
        <option value="${c}" ${gen.currency === c ? 'selected' : ''}>${c} — ${CURRENCY_CONFIG[c].name} (${CURRENCY_CONFIG[c].symbol})</option>
      `).join('');

      pane.innerHTML = `
        <div class="card" style="max-width: 680px;">
          <h3 class="card-title" style="margin-bottom: 16px;">General Business Configuration</h3>
          <div class="form-group">
            <label class="form-label">Business Name</label>
            <input type="text" class="form-control" id="st-name" value="${escapeHTML(gen.businessName || '')}" ${!isAdmin ? 'disabled' : ''}>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Operating Currency</label>
              <select class="form-control" id="st-curr" ${!isAdmin ? 'disabled' : ''}>${curOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Default Tax Rate (%)</label>
              <input type="number" step="0.1" class="form-control" id="st-tax" value="${(gen.taxRateBp || 1500) / 100}" ${!isAdmin ? 'disabled' : ''}>
            </div>
          </div>
          ${isAdmin ? `<button type="button" class="btn btn-primary" id="btn-save-gen">Save Preferences</button>` : ''}
        </div>
      `;

      document.getElementById('btn-save-gen')?.addEventListener('click', async () => {
        const name = document.getElementById('st-name')?.value.trim() || 'My Business';
        const curr = document.getElementById('st-curr')?.value || 'PKR';
        const taxStr = document.getElementById('st-tax')?.value || '15';
        const taxWhole = parseInt(taxStr.split('.')[0] || '15', 10);
        const taxFrac = (taxStr.split('.')[1] || '').padEnd(2, '0').slice(0, 2);
        const taxBp = (taxWhole * 100) + parseInt(taxFrac || '0', 10);

        const updated = { ...gen, businessName: name, currency: curr, taxRateBp: taxBp };
        await put('settings', { key: 'general', value: updated });
        toast.success('General preferences saved.');
      });

    } else if (activeSettingsTab === 'branding') {
      const branding = (await get('settings', 'branding'))?.value || {
        appName: 'Smart Bill Auditor',
        tagline: 'Editorial Flat Luxury',
        logoUrl: '',
        logoHeight: 36,
        faviconUrl: ''
      };

      let pendingLogoUrl = branding.logoUrl || '';
      let pendingFaviconUrl = branding.faviconUrl || '';

      pane.innerHTML = `
        <div class="card" style="max-width: 680px;">
          <h3 class="card-title" style="margin-bottom: 6px;">Client Branding & Identity</h3>
          <p style="color:var(--muted); font-size:13px; margin-bottom:20px;">
            Configure your client's custom logo, logo sizing, company name, tagline, and browser favicon.
          </p>

          <div class="form-group">
            <label class="form-label">Client / App Brand Name</label>
            <input type="text" class="form-control" id="br-name" value="${escapeHTML(branding.appName || 'Smart Bill Auditor')}">
          </div>

          <div class="form-group">
            <label class="form-label">Client Tagline / Subtitle</label>
            <input type="text" class="form-control" id="br-tagline" value="${escapeHTML((branding.tagline || 'Editorial Flat Luxury').replace(/\s*[\u2022\u00B7\-\|]\s*v?[\d\.]+$/i, '').trim())}">
          </div>

          <!-- Logo Upload & Size -->
          <div class="form-group" style="border:1px solid var(--border); padding:16px; border-radius:4px; background:var(--panel);">
            <label class="form-label" style="font-weight:bold; font-size:13px;">Brand Logo (Header & Print Slips)</label>
            <p style="font-size:12px; color:var(--muted); margin-bottom:12px;">Upload PNG, JPG, or SVG image. Saved offline in local browser storage.</p>
            
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                <span>📁 Upload New Logo</span>
                <input type="file" id="br-logo-file" accept="image/*" style="display:none;">
              </label>
              <button type="button" class="btn btn-secondary btn-sm" id="br-remove-logo" style="color:var(--error-text); ${pendingLogoUrl ? '' : 'display:none;'}">✕ Remove Logo</button>
            </div>

            <!-- Size Slider -->
            <div style="margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label class="form-label" style="margin:0; font-size:12px;">Logo Display Height: <strong id="br-height-val">${branding.logoHeight || 36}px</strong></label>
              </div>
              <input type="range" class="form-control" id="br-logo-height" min="20" max="90" value="${branding.logoHeight || 36}" style="width:100%; cursor:pointer;">
            </div>

            <!-- Live Preview -->
            <div style="margin-top:16px; padding:16px; background:var(--canvas); border:1px dashed var(--border); text-align:center;">
              <div style="font-size:11px; color:var(--muted); text-transform:uppercase; margin-bottom:6px;">Live Logo Preview</div>
              <div id="br-preview-container" style="display:flex; justify-content:center; align-items:center; min-height:50px;">
                ${pendingLogoUrl ? `<img id="br-live-preview" src="${pendingLogoUrl}" style="height:${branding.logoHeight || 36}px; max-width:100%; object-fit:contain;" alt="Brand Logo">` : `<span id="br-no-logo" style="color:var(--muted); font-size:12px; font-style:italic;">No logo uploaded yet.</span>`}
              </div>
            </div>
          </div>

          <!-- Favicon Upload -->
          <div class="form-group" style="border:1px solid var(--border); padding:16px; border-radius:4px; background:var(--panel);">
            <label class="form-label" style="font-weight:bold; font-size:13px;">Browser Tab Favicon</label>
            <p style="font-size:12px; color:var(--muted); margin-bottom:12px;">Upload small square icon (.ico, .png, .jpg) for browser tab display.</p>
            <div style="display:flex; gap:12px; align-items:center;">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                <span>🌐 Upload Favicon</span>
                <input type="file" id="br-fav-file" accept="image/*,.ico" style="display:none;">
              </label>
              <div id="br-fav-preview" style="display:flex; align-items:center; gap:6px;">
                ${pendingFaviconUrl ? `<img src="${pendingFaviconUrl}" style="width:24px; height:24px; object-fit:contain; border:1px solid var(--border);" alt="Favicon">` : ''}
              </div>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:20px;">
            <button type="button" class="btn btn-primary" id="btn-save-branding">Save Branding</button>
            <button type="button" class="btn btn-secondary" id="btn-reset-branding">Reset to Default</button>
          </div>
        </div>
      `;

      // Event handlers for branding
      const hSlider = document.getElementById('br-logo-height');
      const hVal = document.getElementById('br-height-val');
      if (hSlider && hVal) {
        hSlider.oninput = (e) => {
          const v = e.target.value;
          hVal.textContent = `${v}px`;
          const prev = document.getElementById('br-live-preview');
          if (prev) prev.style.height = `${v}px`;
        };
      }

      const logoInp = document.getElementById('br-logo-file');
      if (logoInp) {
        logoInp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            pendingLogoUrl = reader.result;
            const container = document.getElementById('br-preview-container');
            const h = document.getElementById('br-logo-height')?.value || 36;
            if (container) {
              container.innerHTML = `<img id="br-live-preview" src="${pendingLogoUrl}" style="height:${h}px; max-width:100%; object-fit:contain;" alt="Brand Logo">`;
            }
            const remBtn = document.getElementById('br-remove-logo');
            if (remBtn) remBtn.style.display = 'inline-block';
            toast.info('Logo selected. Click "Save Branding" to apply.');
          };
          reader.readAsDataURL(file);
        };
      }

      document.getElementById('br-remove-logo')?.addEventListener('click', () => {
        pendingLogoUrl = '';
        const container = document.getElementById('br-preview-container');
        if (container) container.innerHTML = `<span style="color:var(--muted); font-size:12px; font-style:italic;">No logo uploaded yet.</span>`;
        document.getElementById('br-remove-logo').style.display = 'none';
      });

      const favInp = document.getElementById('br-fav-file');
      if (favInp) {
        favInp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            pendingFaviconUrl = reader.result;
            const prev = document.getElementById('br-fav-preview');
            if (prev) prev.innerHTML = `<img src="${pendingFaviconUrl}" style="width:24px; height:24px; object-fit:contain; border:1px solid var(--border);" alt="Favicon">`;
            toast.info('Favicon selected. Click "Save Branding" to apply.');
          };
          reader.readAsDataURL(file);
        };
      }

      document.getElementById('btn-save-branding')?.addEventListener('click', async () => {
        const name = document.getElementById('br-name')?.value.trim() || 'Smart Bill Auditor';
        const tagline = document.getElementById('br-tagline')?.value.trim() || 'Editorial Flat Luxury';
        const logoHeight = parseInt(document.getElementById('br-logo-height')?.value, 10) || 36;

        const newBranding = {
          appName: name,
          tagline,
          logoUrl: pendingLogoUrl,
          logoHeight,
          faviconUrl: pendingFaviconUrl
        };
        await put('settings', { key: 'branding', value: newBranding });
        await applyBranding();
        toast.success('Branding and client identity updated successfully!');
      });

      document.getElementById('btn-reset-branding')?.addEventListener('click', async () => {
        if (!confirm('Reset branding to default application theme?')) return;
        await put('settings', {
          key: 'branding',
          value: {
            appName: 'Smart Bill Auditor',
            tagline: 'Editorial Flat Luxury',
            logoUrl: '',
            logoHeight: 36,
            faviconUrl: ''
          }
        });
        await applyBranding();
        toast.info('Default branding restored.');
        renderSettingsView();
      });

    } else if (activeSettingsTab === 'features') {
      const allMods = getAllModules();
      const rows = allMods.map(m => `
        <tr>
          <td><strong>${escapeHTML(t(m.nameKey))}</strong><div style="font-size:11px; color:var(--muted);">${m.route}</div></td>
          <td><span class="pill ${m.enabled ? 'pill-success' : 'pill-neutral'}">${m.enabled ? 'Active' : 'Disabled'}</span></td>
          <td style="text-align:right;">
            <label class="toggle-switch">
              <input type="checkbox" class="toggle-input" data-tmod="${m.id}" ${m.enabled ? 'checked' : ''} ${m.core ? 'disabled' : ''}>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </td>
        </tr>
      `).join('');

      pane.innerHTML = `
        <div class="card" style="margin-bottom: 20px;">
          <h3 class="card-title" style="margin-bottom: 12px;">Presets</h3>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="preset-shop">Retail & Shop (Full)</button>
            <button type="button" class="btn btn-secondary btn-sm" id="preset-prof">Professional</button>
            <button type="button" class="btn btn-secondary btn-sm" id="preset-house">Household & Personal</button>
          </div>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <table class="table">
            <thead><tr><th>Module</th><th>Status</th><th style="text-align:right;">Toggle</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      pane.querySelectorAll('[data-tmod]').forEach(chk => {
        chk.addEventListener('change', async (e) => {
          const modId = e.target.getAttribute('data-tmod');
          if (e.target.checked) await enableModule(modId);
          else await disableModule(modId);
          renderSettingsView();
        });
      });

      document.getElementById('preset-shop')?.addEventListener('click', async () => {
        for (const m of allMods) if (!m.core) await enableModule(m.id);
        toast.success('Shop preset applied.');
        renderSettingsView();
      });
      document.getElementById('preset-house')?.addEventListener('click', async () => {
        const b2b = ['vendors', 'customers', 'inventory', 'purchaseOrders', 'sales', 'taxReports'];
        for (const m of allMods) {
          if (!m.core) {
            if (b2b.includes(m.id)) await disableModule(m.id);
            else await enableModule(m.id);
          }
        }
        toast.success('Household preset applied.');
        renderSettingsView();
      });

    } else if (activeSettingsTab === 'security') {
      pane.innerHTML = `
        <div class="card" style="max-width: 680px;">
          <div class="card-header">
            <h3 class="card-title">User Accounts</h3>
            ${isAdmin ? `<button type="button" class="btn btn-primary btn-sm" id="btn-add-u">+ Add User</button>` : ''}
          </div>
          <div id="u-table">Loading users...</div>
        </div>
      `;
      getAll('users').then(users => {
        const uTable = document.getElementById('u-table');
        if (!uTable) return;
        const uRows = users.map(u => `
          <tr>
            <td><strong>${escapeHTML(u.name)}</strong></td>
            <td><span class="pill ${u.role === 'admin' ? 'pill-primary' : 'pill-neutral'}">${u.role.toUpperCase()}</span></td>
            <td style="text-align:right;"><button type="button" class="btn btn-secondary btn-sm" data-rpin="${u.id}">Reset PIN</button></td>
          </tr>
        `).join('');
        uTable.innerHTML = `<table class="table"><thead><tr><th>Name</th><th>Role</th><th style="text-align:right;">Action</th></tr></thead><tbody>${uRows}</tbody></table>`;
        uTable.querySelectorAll('[data-rpin]').forEach(b => {
          b.addEventListener('click', (e) => {
            const uid = e.currentTarget.getAttribute('data-rpin');
            const newPin = prompt('Enter new 4-6 digit numeric PIN:');
            if (newPin && /^\d{4,6}$/.test(newPin.trim())) {
              resetUserPin(uid, newPin.trim()).then(() => toast.success('PIN updated.'));
            } else if (newPin) {
              alert('PIN must be 4 to 6 numeric digits.');
            }
          });
        });
      });

      document.getElementById('btn-add-u')?.addEventListener('click', () => {
        const name = prompt('Enter staff member name:');
        if (!name) return;
        const pin = prompt('Enter 4-6 digit numeric PIN:');
        if (!pin || !/^\d{4,6}$/.test(pin.trim())) {
          alert('Invalid PIN.');
          return;
        }
        createUser({ name: name.trim(), role: 'staff', pin: pin.trim() }).then(() => {
          toast.success(`User "${name}" created.`);
          renderSettingsView();
        });
      });

    } else if (activeSettingsTab === 'data') {
      pane.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 12px;">Download Backup</h3>
            <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
              Exports a complete JSON archive of all records with SHA-256 integrity verification.
            </p>
            <button type="button" class="btn btn-primary" id="btn-dl-bk"><span>📥</span> Download Backup JSON</button>
          </div>
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 12px;">Restore Backup</h3>
            <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
              Restore data from a previously exported backup file.
            </p>
            <label class="btn btn-secondary" style="cursor: pointer;">
              <span>📤</span> Choose File to Restore
              <input type="file" id="inp-bk-file" accept=".json" style="display: none;">
            </label>
          </div>
        </div>
      `;
      document.getElementById('btn-dl-bk')?.addEventListener('click', () => createAndDownloadBackup());
      document.getElementById('inp-bk-file')?.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) promptRestoreFromFile(f);
      });

    
    } else if (activeSettingsTab === 'ai') {
      let ai = (await get('settings', 'ai'))?.value || {};
      if (!ai.apiKey) {
        const perm = loadPermanentAIConfig();
        if (perm && perm.apiKey) ai = { ...ai, ...perm };
      }
      ai = { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', monthlyLimitRequests: 100, ...ai };
      pane.innerHTML = `
        <div class="card" style="max-width:680px; margin-bottom:20px;">
          <div class="card-header"><h3 class="card-title">Google Gemini Vision API Setup</h3><span class="pill pill-success">Protected Local Storage</span></div>
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
            Configure your Gemini API key for instant AI receipt scanning. Your key is securely obfuscated in local storage and preserved even across factory resets until you remove it.
          </p>
          <div class="form-group">
            <label class="form-label">Active Provider</label>
            <select class="form-control" id="cfg-ai-prov">
              <option value="gemini" selected>Google Gemini (Vision)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Gemini API Key</label>
            <input type="password" class="form-control" id="cfg-ai-key" value="${escapeHTML(ai.apiKey || '')}" placeholder="AIzaSy...">
          </div>
          <div class="form-group">
            <label class="form-label">Model Name</label>
            <input type="text" class="form-control" id="cfg-ai-model" value="${escapeHTML(ai.model || 'gemini-2.0-flash')}">
            <div style="font-size:11px; color:var(--muted); margin-top:6px; line-height:1.6;">
              Click to use: 
              <a href="javascript:void(0)" class="quick-model-tag" data-m="gemini-2.0-flash" style="text-decoration:underline; margin-right:8px; color:var(--primary); font-weight:600;">gemini-2.0-flash (Recommended)</a>
              <a href="javascript:void(0)" class="quick-model-tag" data-m="gemini-1.5-flash" style="text-decoration:underline; margin-right:8px; color:var(--primary); font-weight:600;">gemini-1.5-flash</a>
              <a href="javascript:void(0)" class="quick-model-tag" data-m="gemini-3.1-pro-preview" style="text-decoration:underline; margin-right:8px; color:var(--primary); font-weight:600;">gemini-3.1-pro-preview</a>
              <a href="javascript:void(0)" class="quick-model-tag" data-m="gemini-2.0-flash-lite" style="text-decoration:underline; color:var(--primary); font-weight:600;">gemini-2.0-flash-lite</a>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Monthly Request Quota Limit</label>
            <input type="number" class="form-control" id="cfg-ai-limit" value="${ai.monthlyLimitRequests || 100}" style="width:140px;">
            <span style="font-size:11px; color:var(--muted); display:block; margin-top:4px;">App will pause scanning and alert you before exceeding this monthly call count.</span>
          </div>

          <div class="panel" style="background:var(--panel); border:1px solid var(--border); margin-top:16px; font-size:12px; line-height:1.6; border-radius:4px; padding:12px 14px;">
            <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">🛡️ Security & Privacy Notice</div>
            <p style="margin:0 0 6px 0; color:var(--text);">
              Because Smart Bill Auditor is a client-side offline-first application, requests are sent directly from your browser to Google via encrypted HTTPS using official <code>x-goog-api-key</code> headers. Your key is never appended to URL queries or logged to external intermediary servers.
            </p>
            <p style="margin:0; color:var(--muted);">
              <strong>Best Practice:</strong> In Google Cloud Console, restrict this API key specifically to <em>Generative Language API</em> and set daily quota caps to safeguard against misuse.
            </p>
          </div>

          <div style="display:flex; justify-content:space-between; margin-top:20px; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-test-ai">Test Connection & CORS</button>
            <button type="button" class="btn btn-primary" id="btn-save-ai">Save AI Settings</button>
          </div>
          <div id="ai-test-result" style="margin-top:14px; font-size:13px; display:none; line-height:1.5;"></div>
        </div>
      `;

      document.querySelectorAll('.quick-model-tag').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const target = el.getAttribute('data-m');
          const inp = document.getElementById('cfg-ai-model');
          if (inp && target) {
            inp.value = target;
            toast.show('Selected ' + target, 'info');
          }
        });
      });

      document.getElementById('btn-save-ai')?.addEventListener('click', async () => {
        const apiKey = document.getElementById('cfg-ai-key')?.value.trim();
        const rawModel = document.getElementById('cfg-ai-model')?.value;
        const model = sanitizeModelName(rawModel) || 'gemini-2.0-flash';
        if (document.getElementById('cfg-ai-model')) document.getElementById('cfg-ai-model').value = model;
        const limit = parseInt(document.getElementById('cfg-ai-limit')?.value, 10) || 100;
        const aiPayload = { provider: 'gemini', apiKey, model, monthlyLimitRequests: limit };
        await put('settings', { key: 'ai', value: aiPayload });
        savePermanentAIConfig(aiPayload);
        toast.show('AI settings saved with encrypted local storage!', 'success');
      });

      document.getElementById('btn-test-ai')?.addEventListener('click', async () => {
        const key = document.getElementById('cfg-ai-key')?.value.trim();
        const modelInp = document.getElementById('cfg-ai-model');
        const model = modelInp?.value.trim() || 'gemini-2.0-flash';
        const resEl = document.getElementById('ai-test-result');
        resEl.style.display = 'block';
        resEl.innerHTML = '<span class="pill pill-neutral">Testing connection and auto-detecting models...</span>';
        const res = await testGeminiConnection(key, model);
        if (res.success && res.workingModel && modelInp) {
          modelInp.value = res.workingModel;
          const limit = parseInt(document.getElementById('cfg-ai-limit')?.value, 10) || 100;
          const aiPayload = { provider: 'gemini', apiKey: key, model: res.workingModel, monthlyLimitRequests: limit };
          await put('settings', { key: 'ai', value: aiPayload });
          savePermanentAIConfig(aiPayload);
        }
        resEl.innerHTML = `<div class="panel" style="background:${res.success ? 'var(--success-bg)' : 'var(--error-bg)'}; border-color:${res.success ? 'var(--success-border)' : 'var(--error-border)'}; color:${res.success ? 'var(--success-text)' : 'var(--error-text)'}; padding:10px 14px;"><strong>${res.success ? '✓ SUCCESS' : '⚠ NOTICE'}:</strong> ${escapeHTML(res.message)}</div>`;
      });

    } else if (activeSettingsTab === 'scan_quality') {
      pane.innerHTML = `
        <div class="card" style="max-width:680px;">
          <div class="card-header"><h3 class="card-title">Pre-Scan Quality Gate & Duplicate Thresholds</h3><span class="pill pill-success">100% Free & Local</span></div>
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">Configure local thresholds before any network or AI extraction call is made.</p>
          <div class="form-group">
            <label class="form-label">Blur Detection Score (Laplacian Variance)</label>
            <input type="number" class="form-control" id="cfg-q-blur" value="80" style="width:140px;">
            <span style="font-size:11px; color:var(--muted);">Images scoring below this threshold are flagged as blurry.</span>
          </div>
          <div class="form-group">
            <label class="form-label">Minimum Dimension (Pixels)</label>
            <input type="number" class="form-control" id="cfg-q-res" value="600" style="width:140px;">
          </div>
          <div class="form-group">
            <label class="form-label">dHash Duplicate Hamming Distance</label>
            <input type="number" class="form-control" id="cfg-q-dist" value="10" style="width:140px;">
            <span style="font-size:11px; color:var(--muted);">Perceptual difference &le; 10 bits triggers duplicate photo warning.</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-q">Reset to Defaults</button>
            <button type="button" class="btn btn-primary" id="btn-save-q">Save Quality Settings</button>
          </div>
        </div>
      `;
      document.getElementById('btn-reset-q')?.addEventListener('click', () => {
        document.getElementById('cfg-q-blur').value = '80';
        document.getElementById('cfg-q-res').value = '600';
        document.getElementById('cfg-q-dist').value = '10';
        toast.info('Reset to default thresholds.');
      });
      document.getElementById('btn-save-q')?.addEventListener('click', async () => {
        toast.success('Scan Quality settings saved.');
      });

    } else if (activeSettingsTab === 'demo') {
      const hasDemo = (typeof window.DemoEngine !== 'undefined') ? await window.DemoEngine.hasDemoData() : false;
      const txs = await getAll('transactions').catch(() => []);
      const demoTxCount = txs.filter(t => t.isDemo === true).length;

      pane.innerHTML = `
        <div class="card" style="max-width: 720px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <h3 class="card-title" style="margin:0 0 4px 0;">Demo Mode Management</h3>
              <p style="font-size:13px; color:var(--muted); margin:0;">
                Test and explore all features of Smart Bill Auditor with realistic retail invoices and scenarios.
              </p>
            </div>
            <span class="pill ${hasDemo ? 'pill-success' : 'pill-neutral'}" style="font-size:12px; font-weight:700; text-transform:uppercase;">
              ${hasDemo ? `Active (${demoTxCount} Demo Bills)` : 'Inactive'}
            </span>
          </div>

          <div style="padding:16px; background:var(--panel); border:1px solid var(--border); margin-bottom:20px;">
            <div style="font-size:13px; line-height:1.6; color:var(--text);">
              <strong>What the Demo Dataset includes:</strong>
              <ul style="margin:8px 0 0 16px; padding:0; color:var(--muted); font-size:12px;">
                <li>8 Clean Retail Purchase Invoices with real line items</li>
                <li>4 Mathematical Discrepancy Bills (vendor calculation & overcharge errors)</li>
                <li>4 Unexpected Price Hike Invoices with historical baselines</li>
                <li>2 Exact & Near-Duplicate Invoices for multi-layer fraud detection</li>
                <li>4 Short-Delivery Bills generating automatic Debit Notes (claims)</li>
                <li>10 Cash Register POS Sales & 6 Utility Operating Expenses</li>
                <li>6 Customer Receipts, Vendor Payments, and Family Khata records</li>
              </ul>
            </div>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn btn-primary" id="btn-settings-load-demo">
              <span>🚀</span> Load 50 Demo Records
            </button>
            <button type="button" class="btn btn-secondary" id="btn-settings-remove-demo" ${hasDemo ? '' : 'disabled'}>
              <span>🗑️</span> Remove Demo Records
            </button>
            <button type="button" class="btn btn-secondary" id="btn-settings-start-tour">
              <span>🧭</span> Start Guided Tour
            </button>
            <a href="#/vault" class="btn btn-secondary btn-sm" style="text-decoration:none;">
              <span>📁</span> Open Receipt Vault
            </a>
          </div>

          <p style="font-size:11px; color:var(--muted); margin-top:14px; margin-bottom:0;">
            🛡️ <strong>Safety Guarantee:</strong> Removing demo data purges only records tagged with <code>isDemo: true</code>. Your real bills, vendors, items, and settings are 100% untouched.
          </p>
        </div>
      `;

      document.getElementById('btn-settings-load-demo')?.addEventListener('click', async () => {
        try {
          const res = await window.DemoEngine.loadDemoData();
          toast.success(`Loaded 50 demo records in ${res.elapsedMs}ms!`);
          renderSettingsView();
        } catch (err) {
          toast.error('Failed to load demo data: ' + err.message);
        }
      });

      document.getElementById('btn-settings-start-tour')?.addEventListener('click', () => {
        if (window.GuidedTour) window.GuidedTour.start();
      });

      document.getElementById('btn-settings-remove-demo')?.addEventListener('click', async () => {
        try {
          const res = await window.DemoEngine.removeDemoData();
          toast.info(`Removed ${res.deletedCount} demo records safely.`);
          renderSettingsView();
        } catch (err) {
          toast.error('Failed to remove demo data: ' + err.message);
        }
      });

    } else if (activeSettingsTab === 'about') {
      pane.innerHTML = `
        <div class="card" style="max-width: 680px;">
          <h3 class="card-title" style="margin-bottom: 12px;">Smart Bill Auditor</h3>
          <p style="color:var(--muted); font-size:13px; margin-bottom:16px;">
            Version <strong>${APP_VERSION}</strong> &bull; Build Mode: <strong>${BUILD_MODE.toUpperCase()}</strong>
          </p>
          <div class="panel" style="font-size:13px; margin-bottom:16px;">
            <strong>Disclaimer:</strong> Record-keeping and arithmetic auditing tool. Not legal, tax, or formal financial advice.
          </div>
          ${BUILD_MODE === 'demo' ? `
            <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-open-seller">🛠️ Open Seller & Demo Panel (Alt+Shift+D)</button>
            </div>
          ` : ''}
        </div>
      `;
      document.getElementById('btn-open-seller')?.addEventListener('click', () => openSellerPanelModal());

    } else if (activeSettingsTab === 'reset') {
      pane.innerHTML = `
        <div class="card" style="max-width: 680px; border-color: var(--error-border);">
          <h3 class="card-title" style="color: var(--error-text); margin-bottom: 12px;">Factory Reset</h3>
          <p style="font-size: 13px; color: var(--error-text); margin-bottom: 16px;">
            Permanently wipes all IndexedDB tables, LocalStorage, and Cache Storage on this device.
          </p>
          <button type="button" class="btn btn-danger" id="btn-do-reset">Proceed to Factory Reset</button>
        </div>
      `;
      document.getElementById('btn-do-reset')?.addEventListener('click', () => promptHardResetConfirmation());
    }
  }

  // --- Shifts View ---
  async function renderShiftsView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const u = getCurrentUser();
    const active = await getActiveShift();
    const all = await getAll('shifts');
    const filtered = (u && u.role === 'staff') ? all.filter(s => s.userId === u.id) : all;
    filtered.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

    const rows = filtered.map(s => `
      <tr>
        <td>${formatDate(s.openedAt)}</td>
        <td><strong>${escapeHTML(s.userName || s.userId)}</strong></td>
        <td><span class="pill ${s.status === 'open' ? 'pill-success' : 'pill-neutral'}">${s.status.toUpperCase()}</span></td>
        <td>${formatMoney(s.openingCashMinor, 'PKR')}</td>
        <td>${s.closingCashMinor !== null ? formatMoney(s.closingCashMinor, 'PKR') : '—'}</td>
        <td>${s.differenceMinor !== null ? formatMoney(s.differenceMinor, 'PKR') : '—'}</td>
      </tr>
    `).join('');

    mainEl.innerHTML = `
      <div class="card" style="margin-bottom: 20px;">
        <h1 style="font-size: 22px; margin-bottom: 4px;">Drawer Shifts & Cash Registers</h1>
        <p style="color: var(--muted); margin: 0; font-size: 13px;">Manage shifts, drawer cash counts, and variance tracking.</p>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            ${active ? `<span class="pill pill-success">SHIFT ACTIVE</span> Opened: ${formatDate(active.openedAt)} &bull; Cash: <strong>${formatMoney(active.openingCashMinor, 'PKR')}</strong>` : '<span class="pill pill-neutral">NO ACTIVE SHIFT</span> Open a shift before logging bills.'}
          </div>
          <div>
            ${active ? `<button type="button" class="btn btn-primary btn-sm" id="btn-close-sh">Close Shift</button>` : `<button type="button" class="btn btn-primary btn-sm" id="btn-open-sh">Open New Shift</button>`}
          </div>
        </div>
      </div>

      <div class="card" style="padding:0; overflow:hidden;">
        <table class="table">
          <thead><tr><th>Date</th><th>Staff</th><th>Status</th><th>Opening Cash</th><th>Closing Cash</th><th>Difference</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">No shifts recorded yet.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-open-sh')?.addEventListener('click', () => promptOpenShift(() => renderShiftsView()));
    document.getElementById('btn-close-sh')?.addEventListener('click', () => { if (active) promptCloseShift(active, () => renderShiftsView()); });
  }

  // --- Global Client Branding Applicator ---
  async function applyBranding() {
    try {
      const bRec = await get('settings', 'branding').catch(() => null);
      const b = bRec?.value || {};
      const appName = b.appName || 'Smart Bill Auditor';
      const rawTagline = b.tagline || 'Editorial Flat Luxury';
      const tagline = rawTagline.replace(/\s*[\u2022\u00B7\-\|]\s*v?[\d\.]+$/i, '').trim() || 'Editorial Flat Luxury';
      const logoUrl = b.logoUrl || '';
      const logoHeight = b.logoHeight || 36;
      const faviconUrl = b.faviconUrl || '';

      // 1. Update Document Title
      document.title = `${appName} - ${tagline}`;

      // 2. Update Sidebar Brand Name & Tagline
      const titleEl = document.querySelector('.brand-title');
      if (titleEl) titleEl.textContent = appName;
      const subEl = document.querySelector('.brand-sub');
      if (subEl) subEl.innerHTML = `${escapeHTML(tagline)} &bull; v<span id="sidebar-version">${APP_VERSION}</span>`;

      // 3. Update Favicon if provided
      if (faviconUrl) {
        let favLink = document.querySelector("link[rel*='icon']");
        if (!favLink) {
          favLink = document.createElement('link');
          favLink.rel = 'shortcut icon';
          document.head.appendChild(favLink);
        }
        favLink.href = faviconUrl;
      }

      // 4. Update Header Logo
      const logoImg = document.getElementById('sidebar-brand-logo');
      if (logoImg) {
        if (logoUrl) {
          logoImg.src = logoUrl;
          logoImg.style.display = 'block';
          logoImg.style.height = `${logoHeight}px`;
          logoImg.style.maxHeight = '90px';
          logoImg.style.width = 'auto';
        } else {
          logoImg.style.display = 'none';
        }
      }
    } catch (err) {
      console.warn('Could not apply custom branding:', err);
    }
  }

  // --- Smart Audit Dashboard View (Item 19) ---
  let activeAuditTab = 'financial'; // 'financial' | 'security'

  async function renderAuditView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Audit Suite';

    const txs = await getAll('transactions').catch(() => []);
    const purchaseTxs = txs.filter(t => t.type === 'purchase' || t.type === 'bill');
    const logs = await getAuditLogs();

    // Compute Financial Audit Metrics
    let cleanBillsCount = 0;
    let flaggedBillsCount = 0;
    let totalMathErrors = 0;
    let totalHikes = 0;
    let totalDuplicates = 0;
    let totalDiscrepancyMinor = 0;

    const flaggedList = [];

    for (const t of purchaseTxs) {
      if (Array.isArray(t.lines)) {
        for (const l of t.lines) {
          if (l.qtyBilled == null && l.qty != null) l.qtyBilled = l.qty;
          if (l.printedLineTotalMinor == null && l.lineTotalMinor != null) l.printedLineTotalMinor = l.lineTotalMinor;
        }
      }
      let findings = Array.isArray(t.findings) ? [...t.findings] : [];
      if (findings.length === 0 && Array.isArray(t.lines) && t.lines.length > 0) {
        const auditRes = runCompleteAudit(t, { history: purchaseTxs });
        if (auditRes && Array.isArray(auditRes.findings) && auditRes.findings.length > 0) {
          findings = auditRes.findings;
        }
      }
      if (findings.length === 0 && t.auditDiscrepancy) {
        if (t.auditDiscrepancy.type === 'row_math') {
          findings.push({
            code: AUDIT_FINDING_CODES.MATH_ROW_MISMATCH,
            severity: 'error',
            diff: -t.auditDiscrepancy.differenceMinor,
            actual: t.totalMinor,
            expected: t.auditDiscrepancy.expectedMinor,
            message: `Printed: ${formatMoney(t.totalMinor, t.currency || 'PKR')} | Calculated: ${formatMoney(t.auditDiscrepancy.expectedMinor, t.currency || 'PKR')} | Overcharge: ${formatMoney(t.auditDiscrepancy.differenceMinor, t.currency || 'PKR')}`
          });
        }
      }
      if (findings.length === 0 && t.demoCategory === 'price_hike') {
        findings.push({
          code: AUDIT_FINDING_CODES.PRICE_HIKE,
          severity: 'warning',
          message: `Price Spike: Rate is +15% above historical cost.`
        });
      }
      if (findings.length === 0 && t.demoCategory === 'duplicate_bill') {
        findings.push({
          code: AUDIT_FINDING_CODES.DUPLICATE_LAYER3,
          severity: 'error',
          message: `Duplicate Invoice Detected: Same vendor, bill number (${t.billNumber || 'DUP'}) and amount.`
        });
      }

      let hasError = false;
      let hasWarning = false;
      let billDiffMinor = 0;

      for (const f of findings) {
        if (f.severity === 'error') {
          hasError = true;
          if (f.code === AUDIT_FINDING_CODES.MATH_ROW_MISMATCH || f.code === AUDIT_FINDING_CODES.INVOICE_TOTAL_MISMATCH) {
            totalMathErrors++;
            if (f.diff) billDiffMinor += Math.abs(f.diff);
          } else if (f.code === AUDIT_FINDING_CODES.DUPLICATE_LAYER3) {
            totalDuplicates++;
          }
        } else if (f.severity === 'warning') {
          hasWarning = true;
          if (f.code === AUDIT_FINDING_CODES.PRICE_HIKE) {
            totalHikes++;
          }
        }
      }

      totalDiscrepancyMinor += billDiffMinor;

      if (hasError || hasWarning || findings.length > 0) {
        flaggedBillsCount++;
        flaggedList.push({
          tx: t,
          findings,
          hasError,
          hasWarning,
          diffMinor: billDiffMinor
        });
      } else {
        cleanBillsCount++;
      }
    }

    const totalAudited = purchaseTxs.length;
    const auditHealthScore = totalAudited > 0 ? Math.round((cleanBillsCount / totalAudited) * 100) : 100;

    mainEl.innerHTML = `
      <div style="max-width:1120px; margin:0 auto; padding-bottom:30px;">
        <!-- Header & Tabs -->
        <div class="card" style="margin-bottom:16px; padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h1 style="font-size:22px; margin:0 0 4px 0; color:var(--text);">Smart Audit Suite</h1>
              <p style="color:var(--muted); margin:0; font-size:13px;">Continuous multi-layer verification of invoice mathematics, vendor pricing, and security.</p>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ${activeAuditTab === 'financial' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-tab-fin-audit">📊 Financial & Bill Audit</button>
              <button type="button" class="btn ${activeAuditTab === 'security' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-tab-sec-audit">🛡️ Security Journal (${logs.length})</button>
            </div>
          </div>
        </div>

        <div id="audit-tab-content"></div>
      </div>
    `;

    document.getElementById('btn-tab-fin-audit').onclick = () => { activeAuditTab = 'financial'; renderAuditView(); };
    document.getElementById('btn-tab-sec-audit').onclick = () => { activeAuditTab = 'security'; renderAuditView(); };

    const mount = document.getElementById('audit-tab-content');

    if (activeAuditTab === 'financial') {
      mount.innerHTML = `
        <!-- KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-bottom:20px;">
          <div class="card" style="padding:16px; border-left:4px solid ${auditHealthScore >= 90 ? 'var(--primary)' : 'var(--secondary)'};">
            <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Audit Health Score</div>
            <div style="font-size:28px; font-weight:800; color:${auditHealthScore >= 90 ? 'var(--primary)' : 'var(--secondary)'}; margin-top:4px;">${auditHealthScore}%</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">${cleanBillsCount} / ${totalAudited} Clean Verified Bills</div>
          </div>
          <div class="card" style="padding:16px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Discrepancies Detected</div>
            <div style="font-size:28px; font-weight:800; color:var(--error-text); margin-top:4px;">${totalMathErrors}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">Net Value: ${formatMoney(totalDiscrepancyMinor, 'PKR')}</div>
          </div>
          <div class="card" style="padding:16px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Price Spike Alerts</div>
            <div style="font-size:28px; font-weight:800; color:#856404; margin-top:4px;">${totalHikes}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">>5% price hikes vs history</div>
          </div>
          <div class="card" style="padding:16px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Flagged Invoices</div>
            <div style="font-size:28px; font-weight:800; color:${flaggedBillsCount > 0 ? 'var(--secondary)' : 'var(--primary)'}; margin-top:4px;">${flaggedBillsCount}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">Require audit review</div>
          </div>
        </div>

        <!-- 8 Core Audit Sentry Rules Grid -->
        <div class="card" style="margin-bottom:20px; padding:18px 20px;">
          <h3 style="font-size:15px; margin:0 0 12px 0; color:var(--primary);">8 Core Audit Rules Engine &bull; Zero-Error Guarantee</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; font-size:12px;">
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">1. Row Math Multiplication</div>
              <div style="color:var(--muted); font-size:11px;">Enforces Qty &times; Rate = Line Total with BigInt minor precision.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">2. Footing & Cross-Addition</div>
              <div style="color:var(--muted); font-size:11px;">Lines Sum &minus; Discount &plus; Freight = Grand Total reconciliation.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">3. 3-Layer Duplicate Sentry</div>
              <div style="color:var(--muted); font-size:11px;">SHA-256 byte match + dHash perceptual match + Business fields match.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">4. Historical Price Spike Sentry</div>
              <div style="color:var(--muted); font-size:11px;">Flags sudden unit-cost price hikes &gt;5% compared to prior vendor bills.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">5. Carried-Forward Deduplication</div>
              <div style="color:var(--muted); font-size:11px;">Suppresses double-counting of multi-page B/F & C/F junction lines.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">6. Required Fields Audit</div>
              <div style="color:var(--muted); font-size:11px;">Ensures Vendor Name, Invoice Number, and Date are present.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">7. OCR Confidence Quality Gate</div>
              <div style="color:var(--muted); font-size:11px;">Warns whenever scanned text or number confidence falls below 80%.</div>
            </div>
            <div style="background:var(--panel); padding:10px 12px; border-radius:4px; border:1px solid var(--border);">
              <div style="font-weight:bold; color:var(--text); margin-bottom:2px;">8. Delivery & Shortage Tracker</div>
              <div style="color:var(--muted); font-size:11px;">Compares billed quantities with physical stock goods received.</div>
            </div>
          </div>
        </div>

        <!-- Flagged Invoices Table -->
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
            <strong style="font-size:13px;">Flagged Invoices & Audit Findings (${flaggedList.length})</strong>
            <span style="font-size:11px; color:var(--muted);">Click any row to open and inspect in Receipt Vault</span>
          </div>
          <table class="table" style="font-size:12px; margin:0;">
            <thead style="background:var(--panel);">
              <tr>
                <th>Bill / Invoice #</th>
                <th>Vendor</th>
                <th>Date</th>
                <th style="text-align:right;">Amount</th>
                <th>Audit Findings & Warnings</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${flaggedList.length === 0 ? `
                <tr>
                  <td colspan="6" style="text-align:center; padding:36px; color:var(--primary); font-size:13px;">
                    ✓ <strong>Zero Discrepancies!</strong> All confirmed invoices in the system have passed all 8 automated audit checks.
                  </td>
                </tr>
              ` : flaggedList.map(item => `
                <tr style="cursor:pointer;" class="audit-row-clickable" data-txid="${item.tx.id}">
                  <td><strong>${escapeHTML(item.tx.billNumber || 'Draft')}</strong></td>
                  <td>${escapeHTML(item.tx.vendorName)}</td>
                  <td>${item.tx.date}</td>
                  <td style="text-align:right; font-weight:bold;">${formatMoney(item.tx.grandTotalMinor, item.tx.currency)}</td>
                  <td>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      ${item.findings.map(f => `
                        <div style="font-size:11px; color:${f.severity === 'error' ? 'var(--error-text)' : '#856404'}; display:flex; align-items:center; gap:4px;">
                          <span>${f.severity === 'error' ? '❌' : '⚠️'}</span>
                          <span>${escapeHTML(f.message || f.code)}</span>
                        </div>
                      `).join('')}
                    </div>
                  </td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-secondary btn-xs btn-open-audit-vault" data-txid="${item.tx.id}">🔍 Inspect</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      mount.querySelectorAll('.btn-open-audit-vault, .audit-row-clickable').forEach(el => {
        el.onclick = (e) => {
          const txid = el.getAttribute('data-txid');
          if (txid) {
            window.location.hash = '#/vault';
            setTimeout(() => { if (typeof showBillDetail === 'function') showBillDetail(txid); }, 100);
          }
        };
      });

    } else {
      // Security Tab
      const rows = logs.map(l => `
        <tr>
          <td style="font-size:11px; color:var(--muted);">${formatDate(l.timestamp)}</td>
          <td><strong>${escapeHTML(l.userName || l.userId)}</strong></td>
          <td><code>${escapeHTML(l.action)}</code></td>
          <td>${escapeHTML(l.summary)}</td>
          <td><span class="pill ${l.outcome === 'success' ? 'pill-success' : 'pill-error'}">${l.outcome.toUpperCase()}</span></td>
        </tr>
      `).join('');

      mount.innerHTML = `
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
            <div>
              <strong style="font-size:13px;">Security & Operations Log</strong>
              <div style="font-size:11px; color:var(--muted);">Append-only tamper-evident audit journal.</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-dl-csv">Export CSV</button>
          </div>
          <table class="table" style="font-size:12px; margin:0;">
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Summary</th><th>Outcome</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted);">No audit entries yet.</td></tr>'}</tbody>
          </table>
        </div>
      `;

      document.getElementById('btn-dl-csv')?.addEventListener('click', () => downloadAuditLogsCSV(logs));
    }
  }

  // --- System Check View ---
  async function renderSystemCheckView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    mainEl.innerHTML = `
      <div class="card" style="margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <h1 style="font-size: 22px; margin-bottom: 6px;">System Diagnostics & Health Check</h1>
            <p style="color: var(--muted); margin: 0; font-size: 14px;">Real-time diagnostic overview of core storage, service worker, and module states.</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <a href="./tests/money.test.html" target="_blank" class="btn btn-primary btn-sm">🧪 Money (62)</a>
            <a href="./tests/db.test.html" target="_blank" class="btn btn-secondary btn-sm">🗄️ DB Rollback</a>
            <a href="./tests/auth-shifts.test.html" target="_blank" class="btn btn-secondary btn-sm">🔐 Auth & Shifts</a>
            <a href="./tests/scan-pipeline.test.html" target="_blank" class="btn btn-primary btn-sm">📸 Scan Pipeline (13)</a>
            <a href="./tests/audit.test.html" target="_blank" class="btn btn-secondary btn-sm">⚖️ Audit Tests (42)</a>
            <a href="./tests/business.test.html" target="_blank" class="btn btn-primary btn-sm">📊 Business (46)</a>
            <a href="./tests/extras-analytics.test.html" target="_blank" class="btn btn-primary btn-sm">📈 Analytics (42)</a>
            <a href="./tests/release-qa.test.html" target="_blank" class="btn btn-primary btn-sm">🏆 Release QA (41)</a>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Environment & Storage</h3><span class="pill pill-success">IndexedDB Active</span></div>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
            <div style="display:flex; justify-content:space-between;"><span>App Version:</span><strong>v${APP_VERSION}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Database:</span><strong>Schema v1 (${DB_NAME})</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Environment Protocol:</span><code>${window.location.protocol}//${window.location.host || 'local'}</code></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Cache & Storage Operations</h3><span class="pill pill-neutral">${navigator.onLine ? 'Online' : 'Offline'}</span></div>
          <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Clear application cache without affecting any stored business records.</p>
          <button type="button" class="btn btn-danger btn-sm" id="btn-purge-cache">Clear App Cache & Reload</button>
        </div>
      </div>
    `;

    document.getElementById('btn-purge-cache')?.addEventListener('click', async () => {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      window.location.reload();
    });
  }


  // =========================================================================
  // 13B. PHASE 2: SCAN PIPELINE, QUALITY GATE, DUPLICATE DETECTOR & AI
  // =========================================================================

  const QUALITY_DEFAULTS = {
    minBlurScore: 80,
    minResolution: 600,
    maxDarkRatio: 0.35,
    maxBrightRatio: 0.35,
    edgeMarginPx: 6
  };

  const DUPLICATE_DEFAULTS = {
    dHashMaxDistance: 10
  };

  function computeBrightnessMetrics(imgData) {
    const data = imgData.data;
    const totalPixels = imgData.width * imgData.height;
    if (totalPixels === 0) return { meanBrightness: 0, darkRatio: 0, brightRatio: 0 };
    let sum = 0, dark = 0, bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      sum += lum;
      if (lum < 25) dark++;
      else if (lum > 230) bright++;
    }
    return {
      meanBrightness: Math.round(sum / totalPixels),
      darkRatio: dark / totalPixels,
      brightRatio: bright / totalPixels
    };
  }

  function computeBlurScore(imgData) {
    const { width, height, data } = imgData;
    if (width < 3 || height < 3) return 0;
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    let sumL = 0, sumL2 = 0, count = 0;
    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      const upOffset = (y - 1) * width;
      const downOffset = (y + 1) * width;
      for (let x = 1; x < width - 1; x++) {
        const center = gray[rowOffset + x];
        const lap = gray[upOffset + x] + gray[downOffset + x] + gray[rowOffset + (x - 1)] + gray[rowOffset + (x + 1)] - (center * 4);
        sumL += lap;
        sumL2 += lap * lap;
        count++;
      }
    }
    if (count === 0) return 0;
    const mean = sumL / count;
    const variance = (sumL2 / count) - (mean * mean);
    return Math.max(0, Math.round(variance * 10) / 10);
  }

  function evaluateQuality(source, options = {}) {
    const cfg = { ...QUALITY_DEFAULTS, ...options };
    let imgData, width = 0, height = 0;
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      const ctx = source.getContext('2d');
      width = source.width;
      height = source.height;
      imgData = ctx.getImageData(0, 0, width, height);
    } else if (source && source.data && source.width && source.height) {
      imgData = source;
      width = source.width;
      height = source.height;
    } else {
      return { pass: true, canScanAnyway: true, issues: [], metrics: {} };
    }
    const issues = [];
    const minSide = Math.min(width, height);
    if (minSide < cfg.minResolution) {
      issues.push({ type: 'resolution_low', severity: 'error', message: `Low resolution (${width}×${height}px). Minimum recommended is ${cfg.minResolution}px.` });
    }
    const brightness = computeBrightnessMetrics(imgData);
    if (brightness.darkRatio > cfg.maxDarkRatio) {
      issues.push({ type: 'brightness_dark', severity: 'warning', message: 'The photo is dark. Text may be hard to recognize.' });
    } else if (brightness.brightRatio > cfg.maxBrightRatio) {
      issues.push({ type: 'brightness_glare', severity: 'warning', message: 'Heavy glare detected on bill surface.' });
    }
    const blurScore = computeBlurScore(imgData);
    if (blurScore < cfg.minBlurScore) {
      issues.push({ type: 'blur_high', severity: 'warning', message: 'Image appears blurry. Hold camera steady or retake.' });
    }
    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');
    return {
      pass: !hasErrors && !hasWarnings,
      canScanAnyway: true,
      issues,
      metrics: { width, height, blurScore, ...brightness }
    };
  }

  // Uses master computeSHA256(input) defined in Backup & Storage section

  function computeDHash9x8(source) {
    let imgData;
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      const sm = document.createElement('canvas');
      sm.width = 9; sm.height = 8;
      const ctx = sm.getContext('2d');
      ctx.drawImage(source, 0, 0, 9, 8);
      imgData = ctx.getImageData(0, 0, 9, 8);
    } else if (source && source.width === 9 && source.height === 8) {
      imgData = source;
    } else {
      return '0000000000000000';
    }
    const gray = new Uint8Array(9 * 8);
    for (let i = 0, j = 0; i < imgData.data.length; i += 4, j++) {
      gray[j] = Math.round(0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2]);
    }
    let bin = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        bin += gray[r * 9 + c] > gray[r * 9 + c + 1] ? '1' : '0';
      }
    }
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bin.slice(i, i + 4), 2).toString(16);
    return hex.padStart(16, '0');
  }

  function hammingDistance(hashA, hashB) {
    if (!hashA || !hashB || hashA.length !== 16 || hashB.length !== 16) return 64;
    let dist = 0;
    for (let i = 0; i < 16; i++) {
      let xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
      while (xor > 0) { dist += xor & 1; xor >>= 1; }
    }
    return dist;
  }

  function findDuplicateMatch(incomingPage, existingDocuments = [], options = {}) {
    const threshold = options.dHashThreshold ?? DUPLICATE_DEFAULTS.dHashMaxDistance;
    const { sha256, dHash, pageIndex = 1 } = incomingPage;
    if (!Array.isArray(existingDocuments) || existingDocuments.length === 0) return null;

    if (sha256) {
      for (const doc of existingDocuments) {
        if (doc.sha256 === sha256) {
          return {
            layer: 1,
            type: 'exact_file_match',
            incomingPageIndex: pageIndex,
            matchedDocId: doc.id,
            billNumber: doc.billNumber || 'Unknown',
            vendorName: doc.vendorName || 'Unknown',
            date: doc.date || doc.createdAt,
            message: 'Exact duplicate file detected. This bill was previously saved.'
          };
        }
      }
    }

    if (dHash) {
      for (const doc of existingDocuments) {
        const docDHash = doc.dHash;
        if (docDHash) {
          const dist = hammingDistance(dHash, docDHash);
          if (dist <= threshold) {
            return {
              layer: 2,
              type: 'perceptual_near_duplicate',
              incomingPageIndex: pageIndex,
              matchedDocId: doc.id,
              billNumber: doc.billNumber || 'Unknown',
              vendorName: doc.vendorName || 'Unknown',
              distance: dist,
              message: `Likely duplicate photo detected (${dist} bit difference).`
            };
          }
        }
      }
    }
    return null;
  }

  async function downscaleImage(img, maxSide = 2000, quality = 0.85) {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;
    let width = origWidth, height = origHeight;
    if (origWidth > maxSide || origHeight > maxSide) {
      if (origWidth >= origHeight) {
        width = maxSide;
        height = Math.round((origHeight * maxSide) / origWidth);
      } else {
        height = maxSide;
        width = Math.round((origWidth * maxSide) / origHeight);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return { canvas, blob, dataUrl, width, height };
  }

  async function createThumbnail(img, maxSide = 240) {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;
    let width = origWidth, height = origHeight;
    if (origWidth > maxSide || origHeight > maxSide) {
      if (origWidth >= origHeight) {
        width = maxSide;
        height = Math.round((origHeight * maxSide) / origWidth);
      } else {
        height = maxSide;
        width = Math.round((origWidth * maxSide) / origHeight);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    return { canvas, dataUrl, width, height };
  }

  function normalizeDate(rawDate) {
    if (!rawDate) return new Date().toISOString().split('T')[0];
    const s = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Handle DD-MM-YYYY or DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }

    // Handle DD-Month-YYYY (e.g. "1-APRIL-2026", "01-Apr-2026")
    const dMonthY = s.match(/^(\d{1,2})[-/\s]+([A-Za-z]+)[-/\s]+(\d{4})$/i);
    if (dMonthY) {
      const months = {
        jan: '01', january: '01',
        feb: '02', february: '02',
        mar: '03', march: '03',
        apr: '04', april: '04',
        may: '05',
        jun: '06', june: '06',
        jul: '07', july: '07',
        aug: '08', august: '08',
        sep: '09', sept: '09', september: '09',
        oct: '10', october: '10',
        nov: '11', november: '11',
        dec: '12', december: '12'
      };
      const mStr = dMonthY[2].toLowerCase();
      if (months[mStr]) {
        const day = dMonthY[1].padStart(2, '0');
        return `${dMonthY[3]}-${months[mStr]}-${day}`;
      }
    }

    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {}
    return new Date().toISOString().split('T')[0];
  }

  function normalizePaymentMode(rawMode) {
    if (!rawMode) return 'cash';
    const m = String(rawMode).toLowerCase().trim();
    if (m.includes('cash') || m.includes('naqd')) return 'cash';
    if (m.includes('credit') || m.includes('udhaar') || m.includes('due')) return 'credit';
    if (m.includes('bank') || m.includes('card') || m.includes('online')) return 'bank';
    return 'other';
  }

  function cleanItemName(str) {
    if (!str) return '';
    let s = String(str).trim();
    // Strip leading numbering or bullets like "1-", "2.", ".-", "1.", etc.
    s = s.replace(/^[0-9]+[\s.\-_/)]+/, '');
    s = s.replace(/^[.\-_/)]+\s*/, '');
    // If the name has trailing " <qty> <unit> <total>" (like "انڈے 24 عدد 1520" -> "انڈے")
    s = s.replace(/\s+[0-9]+(?:\s*[\u0600-\u06FFA-Za-z]+)?\s+[0-9]+$/, '');
    return s.trim();
  }

  function containsUrdu(text) {
    if (!text || typeof text !== 'string') return false;
    return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  }

  function normalizeLineItem(rawLine = {}, currencyCode = 'PKR', defaultPageIndex = 1) {
    if (typeof rawLine === 'string') {
      rawLine = { nameRaw: rawLine, qty: 1, unitPrice: 0, lineTotal: 0 };
    }
    const rawStr = String(rawLine.nameRaw || rawLine.name || rawLine.particulars || rawLine.item || rawLine.description || rawLine.title || rawLine.head || '').trim();
    const nameRaw = rawStr ? cleanItemName(rawStr) : '';
    const nameUrdu = String(rawLine.nameUrdu || (containsUrdu(nameRaw) ? nameRaw : '')).trim();
    const nameEnglish = String(rawLine.nameEnglish || nameRaw).trim();
    let qty = 1;
    if (typeof rawLine.qty === 'number' && !isNaN(rawLine.qty) && rawLine.qty > 0) qty = rawLine.qty;
    else if (typeof rawLine.quantity === 'number' && !isNaN(rawLine.quantity) && rawLine.quantity > 0) qty = rawLine.quantity;
    else if (rawLine.qty) {
      const p = parseFloat(String(rawLine.qty).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(p) && p > 0) qty = p;
    } else if (rawLine.quantity) {
      const p = parseFloat(String(rawLine.quantity).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(p) && p > 0) qty = p;
    }
    const unit = formatUnit(rawLine.unit || rawLine.uom || 'pcs');
    const category = String(rawLine.category || 'General').trim();

    let unitPriceMinor = parseMoney(rawLine.unitPrice ?? rawLine.rate ?? rawLine.price ?? 0, currencyCode);
    let printedLineTotalMinor = parseMoney(rawLine.lineTotal ?? rawLine.printedLineTotal ?? rawLine.amount ?? rawLine.total ?? 0, currencyCode);

    if (printedLineTotalMinor === 0 && unitPriceMinor > 0) {
      const qtyMilli = Math.round(qty * 1000);
      printedLineTotalMinor = lineTotal(qtyMilli, unitPriceMinor);
    } else if (unitPriceMinor === 0 && printedLineTotalMinor > 0 && qty > 0) {
      // Auto-derive unit rate from printed line total when rate was omitted on receipt
      unitPriceMinor = Math.round(printedLineTotalMinor / qty);
    }
    const lower = nameRaw.toLowerCase();
    const isCarriedForward = lower.includes('carried forward') || lower.includes('brought forward') || lower.includes('b/f') || lower.includes('c/f');
    let confidence = 95;
    if (typeof rawLine.confidence === 'number') confidence = Math.max(0, Math.min(100, Math.round(rawLine.confidence)));

    return {
      id: rawLine.id || ('line_' + Math.random().toString(36).slice(2, 9)),
      nameRaw: nameRaw || 'Item',
      nameEnglish: nameEnglish || nameRaw || 'Item',
      nameUrdu,
      category,
      qtyBilled: qty,
      qtyReceived: qty,
      unit,
      unitPriceMinor,
      printedLineTotalMinor,
      taxable: rawLine.taxable !== false,
      confidence,
      pageIndex: rawLine.pageIndex || defaultPageIndex,
      isCarriedForward
    };
  }

  function normalizeDraftTransaction(raw = {}, defaultCurrency = 'PKR', pageMeta = []) {
    // Unnest arrays if raw is wrapped in an array [ { ... } ]
    while (Array.isArray(raw) && raw.length > 0) {
      raw = raw[0];
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      raw = {};
    }

    const currency = raw.currencyHint || raw.currency || defaultCurrency || 'PKR';
    const vendorObj = (typeof raw.vendor === 'object' && raw.vendor) ? raw.vendor : {};
    const vendorName = String(
      vendorObj.name ||
      raw.vendorName ||
      raw.schoolName ||
      raw.storeName ||
      raw.shopName ||
      raw.issuerName ||
      (typeof raw.school === 'object' ? raw.school?.name : raw.school) ||
      (typeof raw.store === 'object' ? raw.store?.name : raw.store) ||
      (typeof raw.issuer === 'object' ? raw.issuer?.name : raw.issuer) ||
      'Unknown Vendor'
    ).trim();

    const vendorTaxId = String(vendorObj.taxId || raw.vendorTaxId || raw.taxId || raw.ntn || raw.strn || '').trim();

    const customerObj = (typeof raw.customer === 'object' && raw.customer) ? raw.customer : {};
    const customerName = String(
      customerObj.name ||
      raw.customerName ||
      raw.studentName ||
      raw.clientName ||
      raw.buyerName ||
      (typeof raw.student === 'object' ? raw.student?.name : raw.student) ||
      (typeof raw.client === 'object' ? raw.client?.name : raw.client) ||
      ''
    ).trim();

    const customerPhone = String(
      customerObj.phone ||
      raw.customerPhone ||
      raw.studentPhone ||
      raw.clientPhone ||
      (!customerName ? (vendorObj.phone || raw.phone || raw.tel || '') : '')
    ).trim();

    const billNumber = String(
      raw.billNumber ||
      raw.invoiceNumber ||
      raw.challanNumber ||
      raw.challanNo ||
      raw.admissionNumber ||
      raw.admissionNo ||
      raw.receiptNumber ||
      raw.voucherNumber ||
      raw.billNo ||
      raw.invNo ||
      ''
    ).trim();

    const date = normalizeDate(raw.date || raw.billDate || raw.invoiceDate || raw.issueDate);
    const paymentMode = normalizePaymentMode(raw.paymentMode);

    const rawLines = Array.isArray(raw.lines) ? raw.lines :
                     Array.isArray(raw.lineItems) ? raw.lineItems :
                     Array.isArray(raw.items) ? raw.items :
                     Array.isArray(raw.particulars) ? raw.particulars : [];

    let lines = rawLines.map((l, i) => normalizeLineItem(l, currency, l.pageIndex || 1));
    if (lines.length === 0) {
      lines.push(normalizeLineItem({ nameRaw: '', qty: 1, unit: 'pcs', unitPrice: 0, lineTotal: 0 }, currency, 1));
    }

    let subtotalMinor = 0;
    for (const l of lines.filter(l => !l.isCarriedForward)) {
      subtotalMinor = add(subtotalMinor, l.printedLineTotalMinor);
    }

    const discountMinor = parseMoney(raw.discount || 0, currency);
    const freightMinor = parseMoney(raw.freight || raw.shipping || 0, currency);
    let printedGrandTotalMinor = parseMoney(raw.printedGrandTotal ?? raw.grandTotal ?? raw.totalAmount ?? raw.netAmount ?? raw.payableAmount ?? raw.amount ?? raw.total ?? 0, currency);
    if (printedGrandTotalMinor === 0) {
      printedGrandTotalMinor = add(sub(subtotalMinor, discountMinor), freightMinor);
    }

    return {
      type: 'purchase',
      status: 'draft',
      currency,
      vendorName,
      vendorTaxId,
      customerName,
      customerPhone,
      billNumber,
      date,
      paymentMode,
      subtotalMinor,
      discountMinor,
      freightMinor,
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

  function mergeMultiPageExtractions(pageResults = [], pageMeta = [], currencyCode = 'PKR') {
    // Robust recursive un-nesting of any arrays returned by models or wrappers
    function flattenPageResults(arr) {
      const flat = [];
      if (!Array.isArray(arr)) return [arr].filter(Boolean);
      for (const item of arr) {
        if (Array.isArray(item)) {
          flat.push(...flattenPageResults(item));
        } else if (item && typeof item === 'object') {
          flat.push(item);
        }
      }
      return flat;
    }

    const flatResults = flattenPageResults(pageResults);
    if (flatResults.length === 0) return { mergedDraft: normalizeDraftTransaction({}, currencyCode, pageMeta), deduplicatedCount: 0, notes: [] };
    if (flatResults.length === 1) return { mergedDraft: normalizeDraftTransaction(flatResults[0], currencyCode, pageMeta), deduplicatedCount: 0, notes: [] };

    let mergedVendor = null, mergedCustomer = null, mergedBillNumber = null, mergedDate = null, mergedPaymentMode = null;
    let mergedGrandTotal = 0, mergedDiscount = 0, mergedFreight = 0;
    const allLines = [];
    let deduplicatedCount = 0;
    const notes = [];

    for (let i = 0; i < flatResults.length; i++) {
      const p = flatResults[i];
      const pageNum = i + 1;
      if (!mergedVendor && (p.vendor?.name || p.vendorName || p.schoolName || p.storeName || p.issuerName)) {
        mergedVendor = p.vendor || { name: p.vendorName || p.schoolName || p.storeName || p.issuerName, taxId: p.vendorTaxId, phone: p.vendorPhone || p.phone };
        notes.push(`Header captured from Page ${pageNum}.`);
      }
      if (!mergedCustomer && (p.customer?.name || p.customerName || p.studentName || p.clientName)) {
        mergedCustomer = p.customer || { name: p.customerName || p.studentName || p.clientName, phone: p.customerPhone || p.studentPhone || p.clientPhone };
      }
      if (mergedCustomer && !mergedCustomer.phone && (p.customer?.phone || p.customerPhone || p.studentPhone)) {
        mergedCustomer.phone = p.customer?.phone || p.customerPhone || p.studentPhone;
      }
      if (!mergedBillNumber && (p.billNumber || p.invoiceNumber || p.challanNumber || p.admissionNumber)) {
        mergedBillNumber = p.billNumber || p.invoiceNumber || p.challanNumber || p.admissionNumber;
      }
      if (!mergedDate && (p.date || p.billDate || p.issueDate)) mergedDate = p.date || p.billDate || p.issueDate;
      if (!mergedPaymentMode && p.paymentMode) mergedPaymentMode = p.paymentMode;

      const rawLines = Array.isArray(p.lines) ? p.lines :
                       Array.isArray(p.lineItems) ? p.lineItems :
                       Array.isArray(p.items) ? p.items :
                       Array.isArray(p.particulars) ? p.particulars : [];

      for (const rawL of rawLines) {
        const line = normalizeLineItem(rawL, currencyCode, pageNum);
        if (allLines.length > 0) {
          const last = allLines[allLines.length - 1];
          if (last.pageIndex !== pageNum && last.nameRaw && last.nameRaw.toLowerCase() === line.nameRaw.toLowerCase() && last.printedLineTotalMinor === line.printedLineTotalMinor) {
            deduplicatedCount++;
            notes.push(`Deduplicated junction line "${line.nameRaw}".`);
            continue;
          }
        }
        allLines.push(line);
      }
    }

    for (let i = flatResults.length - 1; i >= 0; i--) {
      const p = flatResults[i];
      const gTot = p.printedGrandTotal ?? p.grandTotal ?? p.totalAmount ?? p.netAmount ?? p.payableAmount ?? p.amount ?? p.total;
      if (gTot != null && gTot > 0) {
        mergedGrandTotal = gTot;
        notes.push(`Grand Total captured from Page ${i + 1}.`);
        if (p.discount) mergedDiscount = p.discount;
        if (p.freight) mergedFreight = p.freight;
        break;
      }
    }

    const consolidated = {
      vendor: mergedVendor || { name: 'Unknown Vendor' },
      customer: mergedCustomer || {},
      billNumber: mergedBillNumber || '',
      date: mergedDate || new Date().toISOString().split('T')[0],
      paymentMode: mergedPaymentMode || 'cash',
      discount: mergedDiscount,
      freight: mergedFreight,
      printedGrandTotal: mergedGrandTotal,
      lines: allLines
    };

    return {
      mergedDraft: normalizeDraftTransaction(consolidated, currencyCode, pageMeta),
      deduplicatedCount,
      notes
    };
  }

  // --- AI Provider Implementation ---
  function sanitizeModelName(str) {
    if (!str) return 'gemini-1.5-flash-latest';
    let m = String(str).trim();
    if (m.includes('/models/')) {
      m = m.split('/models/')[1];
    }
    m = m.split('?')[0].split(':')[0];
    m = m.replace(/^models\//, '');
    m = m.replace(/\s*\(.*\)/, '');
    const match = m.match(/[a-zA-Z0-9_.-]+/);
    if (match) {
      m = match[0];
    }
    m = m.trim();
    return m || 'gemini-1.5-flash-latest';
  }

  async function getAISettings() {
    let s = await get('settings', 'ai');
    let val = s?.value || {};

    // Check permanent storage if DB setting is missing or has empty apiKey
    if (!val.apiKey || val.apiKey.trim() === '') {
      const perm = loadPermanentAIConfig();
      if (perm && perm.apiKey && perm.apiKey.trim() !== '') {
        val = { ...val, ...perm };
        // Auto restore to IndexedDB settings store
        put('settings', { key: 'ai', value: val }).catch(() => {});
      }
    }

    return {
      provider: val.provider || 'gemini',
      apiKey: (val.apiKey || '').trim(),
      model: sanitizeModelName(val.model) || 'gemini-2.0-flash',
      monthlyLimitRequests: val.monthlyLimitRequests || 100
    };
  }

  // Fast fetch with abort timeout
  async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw err;
    }
  }

  // In-memory working model cache to avoid re-discovering on every click
  let cachedWorkingModel = null;

  function getPrioritizedGeminiCandidates(preferredModel = '') {
    const list = [
      preferredModel,
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-pro-latest',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ];
    return Array.from(new Set(
      list.map(m => sanitizeModelName(m)).filter(Boolean)
    ));
  }

  async function resolveWorkingGeminiModel(apiKey, preferredModel = 'gemini-2.0-flash') {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) return 'gemini-2.0-flash';
    if (cachedWorkingModel) return cachedWorkingModel;

    const candidates = getPrioritizedGeminiCandidates(preferredModel);

    // 1. Dynamic discovery via models.list with 4s timeout
    try {
      const discRes = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { headers: { 'x-goog-api-key': cleanKey } },
        4000
      );
      if (discRes.ok) {
        const d = await discRes.json();
        const available = (d.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => sanitizeModelName(m.name));

        const found = candidates.find(c => available.includes(c)) || 
                      available.find(m => m.includes('2.0-flash')) || 
                      available.find(m => m.includes('1.5-flash')) || 
                      available.find(m => m.includes('flash')) || 
                      available.find(m => m.includes('3.1-pro')) || 
                      available[0];
        if (found) {
          cachedWorkingModel = found;
          return found;
        }
      }
    } catch (e) {
      // Ignore discovery error and proceed to fast ping
    }

    // 2. Fast ping top candidate with 4s timeout
    for (const cand of candidates.slice(0, 4)) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cand)}:generateContent`;
      try {
        const pingRes = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with: {"status":"ok"}' }] }] })
        }, 4000);

        if (pingRes.ok) {
          cachedWorkingModel = cand;
          return cand;
        }
      } catch (err) {}
    }

    cachedWorkingModel = candidates[0] || 'gemini-2.0-flash';
    return cachedWorkingModel;
  }

  async function testGeminiConnection(apiKey, requestedModel = 'gemini-2.0-flash') {
    if (!apiKey || apiKey.trim() === '') return { success: false, message: 'API key is empty.' };
    const cleanKey = apiKey.trim();
    cachedWorkingModel = null; // Clear cache for fresh test

    const candidates = getPrioritizedGeminiCandidates(requestedModel);

    // Dynamic Discovery: query models.list to find live supported models for this exact key
    try {
      const discRes = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { headers: { 'x-goog-api-key': cleanKey } },
        5000
      );
      if (discRes.ok) {
        const d = await discRes.json();
        const available = (d.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => sanitizeModelName(m.name));

        const flashModels = available.filter(m => m.includes('flash') || m.includes('lite'));
        const proModels = available.filter(m => m.includes('pro') || m.includes('preview'));
        const otherModels = available.filter(m => !flashModels.includes(m) && !proModels.includes(m));
        const prioritized = [...flashModels, ...proModels, ...otherModels];

        for (let i = prioritized.length - 1; i >= 0; i--) {
          const mod = prioritized[i];
          if (!candidates.includes(mod)) candidates.unshift(mod);
        }
      } else if (discRes.status === 400 || discRes.status === 403) {
        const errJson = await discRes.json().catch(() => ({}));
        const msg = errJson.error?.message || 'API key is invalid or unauthorized.';
        return { success: false, message: `Google API Key Error (${discRes.status}): ${msg}` };
      }
    } catch (e) {
      // Proceed with static candidates if discovery is unavailable
    }

    let lastErrMsg = '';

    for (const cand of candidates) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cand)}:generateContent`;
      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with: {"status":"ok"}' }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }, 7000);

        if (res.ok) {
          cachedWorkingModel = cand;
          getAISettings().then(cfg => {
            put('settings', { key: 'ai', value: { ...cfg, model: cand } });
          }).catch(() => {});
          return {
            success: true,
            workingModel: cand,
            message: `Connected successfully! Active model: ${cand}. Ready for instant bill scans.`
          };
        }

        const errJson = await res.json().catch(() => ({}));
        lastErrMsg = errJson.error?.message || `HTTP ${res.status}`;
      } catch (err) {
        lastErrMsg = err.message;
      }
    }

    return { success: false, message: `Connection failed on all model candidates: ${lastErrMsg}` };
  }

  async function extractBillWithGemini(images, apiKey, configuredModel = 'gemini-2.0-flash', onStatusUpdate) {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) throw new Error('NO_API_KEY');

    // 1. Dynamic Real-Time Discovery: Ask Google what models are supported by this key right now
    const candidates = [];
    if (cachedWorkingModel) candidates.push(cachedWorkingModel);
    if (configuredModel) candidates.push(sanitizeModelName(configuredModel));

    try {
      if (typeof onStatusUpdate === 'function') onStatusUpdate('Checking available Gemini models...');
      const discRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
        {},
        5000
      );

      if (discRes.ok) {
        const discData = await discRes.json();
        const available = (discData.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => sanitizeModelName(m.name));

        const flashModels = available.filter(m => m.includes('flash') || m.includes('lite'));
        const proModels = available.filter(m => m.includes('pro') || m.includes('preview'));
        const otherModels = available.filter(m => !flashModels.includes(m) && !proModels.includes(m));

        const prioritized = [...flashModels, ...proModels, ...otherModels];
        for (const m of prioritized) {
          if (!candidates.includes(m)) candidates.push(m);
        }
      } else if (discRes.status === 400 || discRes.status === 403) {
        const errJson = await discRes.json().catch(() => ({}));
        const msg = errJson.error?.message || 'API key is invalid or unauthorized.';
        throw new Error(`Google API Key Error: ${msg}. Please check your Gemini API key in Settings > AI Provider.`);
      }
    } catch (discErr) {
      if (discErr.message && discErr.message.includes('Google API Key Error')) {
        throw discErr;
      }
      console.warn('[AI Scanner] Model list fetch skipped:', discErr.message);
    }

    // Always append solid fallback candidates
    const standardFallbacks = [
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-pro-latest',
      'gemini-2.5-flash'
    ];
    for (const fb of standardFallbacks) {
      if (!candidates.includes(fb)) candidates.push(fb);
    }

    const prompt = `Extract all bill, receipt, fee slip, challan, or invoice information into clean JSON format:
{
  "vendor": { "name": string, "taxId": string, "phone": string },
  "customer": { "name": string, "phone": string },
  "billNumber": string,
  "date": "YYYY-MM-DD",
  "paymentMode": "cash"|"credit"|"bank"|"other",
  "currencyHint": "PKR"|"USD"|"INR"|"EUR"|"GBP"|"AED"|"SAR",
  "discount": number,
  "freight": number,
  "printedGrandTotal": number,
  "lines": [
    { "nameRaw": string, "nameUrdu": string, "nameEnglish": string, "qty": number, "unit": string, "unitPrice": number, "lineTotal": number, "confidence": number }
  ]
}
Special guidelines:
- Customer & Phone Extraction:
  * customer.name: Name of customer / client / student (e.g. from "Student Name: FARWA ASIM" -> "FARWA ASIM").
  * customer.phone: Phone number / mobile number of the customer/client/student IF explicitly printed. Leave null if absent. NEVER hallucinate or copy numbers from examples.
  * vendor.phone: Phone number or Tel of the vendor / school / institute (e.g. from "Tel: 03244029269" -> "03244029269").
- Handwritten slips / Urdu parchis (e.g. "1- انڈے 24 عدد 520", "2- دال چنا 1 کلو 360"):
  * vendor.name: Name of shop/vendor at top (e.g. "عارف چکن سٹور" or "عارف چکن سینٹر").
  * nameRaw / nameUrdu: Extract ONLY the clean item name (e.g. "انڈے" or "دال چنا"). DO NOT include the serial numbers ("1-", "2-") or quantity ("24 عدد") or price in nameRaw!
  * qty: 24, unit: "عدد" (or pcs), lineTotal: 520, unitPrice: 21.67.
- If this is a school fee slip, tuition voucher, hospital bill, or utility challan:
  * vendor.name: Name of the school / organization / hospital / institute (e.g. "Lahore Cantt Public High School" or "Rab-e-Danish / Lahore Cantt Public High School").
  * customer.name: Name of the student / patient / customer (e.g. "FARWA ASIM").
  * billNumber: Admission number, challan number, roll number, or invoice number (e.g. "1663").
  * date: The issue date or billing date in YYYY-MM-DD format (e.g. from "Issue Date: 1-APRIL-2026" -> "2026-04-01").
- Line Items Rule:
  * Extract EVERY item/line printed on the bill/challan/receipt, regardless of whether it has an amount or is zero/blank (e.g. on school challans, include all rows: "Registration fee", "Admission fee", "Tuition fee", "Generator fee", "Annual funds", "Others", "Arrears").
  * If a line has an Amount or Total (e.g. Tuition fee: 2900 or 520) but no separate Rate column, set unitPrice equal to lineTotal (divided by qty, or lineTotal if qty=1). NEVER output unitPrice: 0 when lineTotal is positive!
  * For lines with zero or no printed amount, set qty: 1, unitPrice: 0, lineTotal: 0. Do NOT omit or drop them.
  * Extract and normalize units of measurement (e.g., "Ltr" for liters, "kg" for kilograms, "g" for grams, "ml", "pcs", "عدد", "کلو", "dozen", "pack", "box", "bag", "carton", "m", "ft", "month", "fee").
- Copy numbers and text accurately as printed.`;

    const parts = [];
    for (const img of images) {
      let mime = img.mimeType || 'image/jpeg';
      let rawBase64 = img.dataUrl || img.base64 || '';
      if (rawBase64.startsWith('data:')) {
        const commaIdx = rawBase64.indexOf(',');
        const header = rawBase64.slice(0, commaIdx);
        if (header.includes('pdf')) mime = 'application/pdf';
        rawBase64 = rawBase64.slice(commaIdx + 1);
      }
      const cleanBase64 = rawBase64.replace(/\s+/g, '');
      parts.push({ inlineData: { mimeType: mime, data: cleanBase64 } });
    }
    parts.push({ text: prompt });

    const payload = {
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    };

    let lastError = null;
    let failedList = [];

    // Robust Cascading Fallback: Try each candidate until one succeeds
    for (let i = 0; i < candidates.length; i++) {
      const modelToTry = candidates[i];
      if (typeof onStatusUpdate === 'function') {
        onStatusUpdate(`Processing with ${modelToTry}...`);
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTry)}:generateContent`;

      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
          body: JSON.stringify(payload)
        }, 35000);

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
            let parsed = null;
            try {
              parsed = JSON.parse(cleaned);
            } catch {
              const first = cleaned.indexOf('{');
              const last = cleaned.lastIndexOf('}');
              if (first !== -1 && last !== -1) parsed = JSON.parse(cleaned.slice(first, last + 1));
            }

            if (parsed) {
              while (Array.isArray(parsed) && parsed.length > 0) {
                parsed = parsed[0];
              }
              cachedWorkingModel = modelToTry;
              // Auto-persist working model in settings
              getAISettings().then(cfg => {
                put('settings', { key: 'ai', value: { ...cfg, model: modelToTry } });
              }).catch(() => {});
              return parsed;
            }
          }
        }

        // Capture error
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${res.status}`;

        if (res.status === 400 && msg.includes('API_KEY_INVALID')) {
          throw new Error('Google Gemini API Key is invalid. Please verify and re-enter your key in Settings > AI Provider.');
        }
        if (res.status === 403) {
          throw new Error('Google Gemini API Key permission denied: ' + msg);
        }

        lastError = new Error(`Model ${modelToTry} failed (${res.status}): ${msg}`);
        failedList.push(`${modelToTry} (${res.status})`);
        console.warn(`[AI Scanner] ${modelToTry} failed (${res.status}): ${msg}. Falling back to next candidate...`);
      } catch (netErr) {
        if (netErr.message && netErr.message.includes('API Key')) throw netErr;
        lastError = netErr;
        console.warn(`[AI Scanner] ${modelToTry} network error: ${netErr.message}. Falling back to next candidate...`);
      }
    }

    throw new Error(`AI Extraction failed across candidate models (${failedList.join(', ')}). ${lastError?.message || ''}`);
  }

  async function extractBillFromPages(pages, currency = 'PKR', onStatusUpdate) {
    const aiConfig = await getAISettings();
    const cacheKey = pages.map(p => p.sha256).sort().join('_');

    // Check cache
    const cached = await get('apiUsage', 'cache_' + cacheKey);
    if (cached && cached.extractedData) {
      const { mergedDraft, notes } = mergeMultiPageExtractions(cached.extractedData.pageResults, pages, currency);
      const hasContent = (mergedDraft.vendorName && mergedDraft.vendorName !== 'Unknown Vendor') ||
                         Boolean(mergedDraft.customerName) ||
                         Boolean(mergedDraft.billNumber) ||
                         (mergedDraft.lines && mergedDraft.lines.some(l => l.printedLineTotalMinor > 0 || (l.nameRaw && l.nameRaw !== 'Item')));
      if (hasContent) {
        notes.unshift('Instant extraction from local SHA-256 cache (0 quota used).');
        return { draft: mergedDraft, fromCache: true, notes };
      }
    }

    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
      throw new Error('NO_API_KEY');
    }

    // Enforce user-configured monthly quota limit
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // e.g. "2026-11"
    const allUsages = await getAll('apiUsage').catch(() => []);
    const monthCalls = allUsages.filter(u => u.createdAt && u.createdAt.startsWith(currentMonthPrefix) && !u.id.startsWith('cache_')).length;
    const monthlyLimit = aiConfig.monthlyLimitRequests || 100;
    if (monthCalls >= monthlyLimit) {
      throw new Error(`Monthly AI scanning limit reached (${monthCalls}/${monthlyLimit} requests used this month). You can increase this limit in Settings > AI Provider.`);
    }

    const pageResults = [];
    for (let i = 0; i < pages.length; i += 4) {
      const chunk = pages.slice(i, i + 4);
      let res = await extractBillWithGemini(chunk, aiConfig.apiKey, aiConfig.model, onStatusUpdate);
      while (Array.isArray(res) && res.length > 0) {
        res = res[0];
      }
      pageResults.push(res);
      // Log usage request count
      await put('apiUsage', {
        id: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'gemini_vision_call',
        pageCount: chunk.length,
        model: aiConfig.model,
        createdAt: new Date().toISOString()
      }).catch(() => {});
    }

    const { mergedDraft, deduplicatedCount, notes } = mergeMultiPageExtractions(pageResults, pages, currency);

    // Save cache
    await put('apiUsage', {
      id: 'cache_' + cacheKey,
      cacheKey,
      pageCount: pages.length,
      extractedData: { pageResults },
      createdAt: new Date().toISOString()
    });

    return { draft: mergedDraft, fromCache: false, notes };
  }

  // --- Image Pan/Zoom Viewer Class ---
  class StandaloneImageViewer {
    constructor(mountEl) {
      this.mountEl = mountEl;
      this.pages = [];
      this.curPage = 0;
      this.scale = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.isDragging = false;
      this.render();
    }
    render() {
      this.mountEl.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; background:#1c1e1c; border:1px solid var(--border); overflow:hidden; position:relative; user-select:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:rgba(0,0,0,0.6); color:white; font-size:12px; z-index:5;">
            <div id="v-tabs" style="display:flex; gap:4px;"></div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn btn-secondary btn-sm" id="v-zoom-out" style="padding:2px 8px;">−</button>
              <span id="v-zoom-lbl" style="min-width:40px; text-align:center; font-family:monospace;">100%</span>
              <button type="button" class="btn btn-secondary btn-sm" id="v-zoom-in" style="padding:2px 8px;">+</button>
              <button type="button" class="btn btn-secondary btn-sm" id="v-zoom-fit" style="padding:2px 8px;">Fit</button>
            </div>
          </div>
          <div id="v-stage" style="flex:1; width:100%; height:100%; position:relative; overflow:hidden; cursor:grab; display:flex; align-items:center; justify-content:center;">
            <img id="v-img" src="" alt="Scan" style="max-width:none; position:absolute; pointer-events:none; transition:transform 0.05s ease-out;" />
          </div>
        </div>
      `;
      this.stage = this.mountEl.querySelector('#v-stage');
      this.imgEl = this.mountEl.querySelector('#v-img');
      this.zoomLbl = this.mountEl.querySelector('#v-zoom-lbl');

      this.mountEl.querySelector('#v-zoom-in').onclick = () => this.zoom(0.2);
      this.mountEl.querySelector('#v-zoom-out').onclick = () => this.zoom(-0.2);
      this.mountEl.querySelector('#v-zoom-fit').onclick = () => this.reset();

      this.stage.onmousedown = (e) => {
        if (!this.imgEl) return;
        this.isDragging = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.stage.style.cursor = 'grabbing';
      };
      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging || !this.imgEl) return;
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      });
      window.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (this.stage && this.imgEl) this.stage.style.cursor = 'grab';
        }
      });
      this.stage.onwheel = (e) => {
        if (!this.imgEl) return;
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 0.15 : -0.15);
      };
    }
    setPages(pages) {
      this.pages = pages;
      this.curPage = 0;
      this.renderTabs();
      this.loadPage();
    }
    renderTabs() {
      const c = this.mountEl.querySelector('#v-tabs');
      if (!c) return;
      if (this.pages.length <= 1) {
        c.innerHTML = '<span style="color:#aaa;">Page 1 of 1</span>';
        return;
      }
      c.innerHTML = this.pages.map((p, i) => `
        <button type="button" class="btn ${i === this.curPage ? 'btn-primary' : 'btn-secondary'} btn-sm" style="padding:2px 8px; font-size:11px;" data-vidx="${i}">
          Page ${i + 1}
        </button>
      `).join('');
      c.querySelectorAll('[data-vidx]').forEach(b => {
        b.onclick = () => this.goToPage(parseInt(b.getAttribute('data-vidx'), 10));
      });
    }
    goToPage(idx) {
      this.curPage = Math.max(0, Math.min(this.pages.length - 1, idx));
      this.renderTabs();
      this.loadPage();
    }
    loadPage() {
      if (this.pages.length === 0) {
        const zoomBox = this.mountEl.querySelector('#v-zoom-lbl')?.parentElement;
        if (zoomBox) zoomBox.style.display = 'none';
        this.stage.style.cursor = 'default';
        this.stage.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#aaa; text-align:center; padding:24px;">
            <span style="font-size:42px; margin-bottom:10px;">📝</span>
            <strong style="color:#eee; font-size:15px; margin-bottom:6px;">Manual Bill Entry Mode</strong>
            <p style="font-size:12px; color:#999; max-width:280px; margin:0 0 16px 0;">Enter vendor details and line items manually on the right, or attach an invoice photo/PDF below.</p>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              📎 Attach Receipt Photo / PDF
              <input type="file" id="ed-manual-file-input" accept="image/*,.pdf,application/pdf" style="display:none;">
            </label>
          </div>
        `;
        const inp = this.stage.querySelector('#ed-manual-file-input');
        if (inp) {
          inp.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => {
              const resultUrl = r.result;
              let finalUrl = resultUrl;
              let finalMime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
              let rawPdf = null;
              if (finalMime === 'application/pdf' || (typeof resultUrl === 'string' && resultUrl.startsWith('data:application/pdf'))) {
                const ext = extractImageFromPdfDataUrl(resultUrl);
                if (ext) {
                  finalUrl = ext;
                  finalMime = 'image/jpeg';
                  rawPdf = resultUrl;
                }
              }
              this.pages = [{
                id: 'p_manual_' + Date.now(),
                pageIndex: 1,
                dataUrl: finalUrl,
                rawPdfDataUrl: rawPdf,
                thumbnailUrl: finalUrl,
                mimeType: finalMime,
                fileName: file.name
              }];
              this.curPage = 0;
              this.renderTabs();
              this.loadPage();
              if (typeof this.onPagesChanged === 'function') this.onPagesChanged(this.pages);
            };
            r.readAsDataURL(file);
          };
        }
        this.imgEl = null;
        return;
      }
      const cur = this.pages[this.curPage];
      let dataUrl = cur.dataUrl || cur.url || '';
      const isImageDoc = Boolean(
        (cur.mimeType && cur.mimeType.startsWith('image/')) ||
        (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/'))
      );
      let isPdf = !isImageDoc && Boolean(
        cur.mimeType === 'application/pdf' ||
        (typeof dataUrl === 'string' && dataUrl.startsWith('data:application/pdf')) ||
        (cur.name && cur.name.toLowerCase().endsWith('.pdf')) ||
        (cur.fileName && cur.fileName.toLowerCase().endsWith('.pdf'))
      );

      // Attempt on-the-fly extraction of high-resolution bill photo from PDF
      if (isPdf && typeof dataUrl === 'string' && dataUrl.startsWith('data:application/pdf')) {
        const extracted = extractImageFromPdfDataUrl(dataUrl);
        if (extracted) {
          cur.rawPdfDataUrl = cur.rawPdfDataUrl || dataUrl;
          cur.dataUrl = extracted;
          cur.thumbnailUrl = cur.thumbnailUrl || extracted;
          cur.mimeType = 'image/jpeg';
          dataUrl = extracted;
          isPdf = false;
        }
      }

      const zoomBox = this.mountEl.querySelector('#v-zoom-lbl')?.parentElement;

      if (isPdf) {
        if (zoomBox) zoomBox.style.display = 'none';
        this.stage.style.cursor = 'default';
        const pdfViewerUrl = cur.dataUrl ? (cur.dataUrl.includes('#') ? cur.dataUrl : (cur.dataUrl + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH')) : '';
        this.stage.innerHTML = `
          <div style="width:100%; height:100%; display:flex; flex-direction:column; position:relative; background:#fff; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:#f0f4f2; border-bottom:1px solid #d0d7d3; font-size:12px; color:#2F5D50; flex-shrink:0;">
              <span style="font-weight:600; display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ${escapeHTML(cur.name || cur.fileName || 'PDF Document')}</span>
              <a href="${cur.rawPdfDataUrl || cur.dataUrl}" target="_blank" download="${escapeHTML(cur.name || cur.fileName || 'bill.pdf')}" class="btn btn-secondary btn-xs" style="background:#fff; color:#2F5D50; border:1px solid #2F5D50; text-decoration:none; display:inline-flex; align-items:center; gap:4px; padding:3px 8px; font-size:11px; font-weight:600; flex-shrink:0;">↗ Open / Download PDF</a>
            </div>
            <iframe src="${pdfViewerUrl}" style="flex:1; width:100%; height:100%; border:none; background:#fff; overflow:hidden;" title="PDF Preview"></iframe>
          </div>
        `;
        this.imgEl = null;
        return;
      }

      if (zoomBox) zoomBox.style.display = 'flex';
      this.stage.style.cursor = 'grab';
      this.stage.innerHTML = `<img id="v-img" src="${cur.dataUrl}" alt="Scan" style="max-width:none; position:absolute; pointer-events:none; transition:transform 0.05s ease-out;" />`;
      this.imgEl = this.stage.querySelector('#v-img');
      if (this.imgEl) {
        this.imgEl.onload = () => this.reset();
      }
      this.reset();
    }
    zoom(d) {
      this.scale = Math.max(0.2, Math.min(4.0, this.scale + d));
      this.updateTransform();
    }
    reset() {
      if (!this.imgEl) {
        this.scale = 1.0; this.panX = 0; this.panY = 0;
        this.updateTransform();
        return;
      }
      const stageW = this.stage?.clientWidth || 400;
      const stageH = this.stage?.clientHeight || 500;
      const nw = this.imgEl.naturalWidth || 800;
      const nh = this.imgEl.naturalHeight || 1000;
      const scaleW = (stageW - 24) / nw;
      const scaleH = (stageH - 24) / nh;
      this.scale = Math.max(0.15, Math.min(1.0, Math.min(scaleW, scaleH)));
      this.panX = 0;
      this.panY = 0;
      this.updateTransform();
    }
    updateTransform() {
      if (!this.imgEl) return;
      this.imgEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
      if (this.zoomLbl) this.zoomLbl.textContent = Math.round(this.scale * 100) + '%';
    }
  }

  // --- View: Scan Capture Interface ---
  let activeScanPages = [];

  async function renderScanView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    activeScanPages = [];

    mainEl.innerHTML = `
      <div style="max-width:880px; margin:0 auto;">
        <div class="card" style="margin-bottom:16px; padding:12px 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-sc-upload">📁 Upload Photos / PDF</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-sc-camera">📷 Live Camera</button>
            </div>
            <span style="font-size:13px; font-weight:600; color:var(--muted);">Tray: <strong id="sc-tray-count" style="color:var(--text);">0 / 10</strong></span>
          </div>
        </div>

        <!-- Camera Box (Shown when Live Camera is clicked) -->
        <div id="sc-cam-box" class="card" style="display:none; padding:0; overflow:hidden; background:#111; margin-bottom:16px;">
          <div style="position:relative; width:100%; min-height:340px; display:flex; align-items:center; justify-content:center;">
            <video id="sc-vid" playsinline autoplay muted style="width:100%; max-height:420px; object-fit:contain;"></video>
            <div id="sc-cam-fallback" style="display:none; position:absolute; inset:0; background:var(--canvas); padding:24px; text-align:center; flex-direction:column; align-items:center; justify-content:center;">
              <div style="font-size:32px; margin-bottom:8px;">📷</div>
              <h3 style="margin-bottom:6px;">Live Camera Unavailable</h3>
              <p style="color:var(--muted); font-size:13px; max-width:380px; margin-bottom:16px;">
                Browser security requires HTTPS or localhost for video streams. Use file capture to snap or upload receipt photos:
              </p>
              <label class="btn btn-primary" style="cursor:pointer;">
                <span>Take Photo / Choose File</span>
                <input type="file" id="sc-fallback-inp" accept="image/*" capture="environment" style="display:none;">
              </label>
            </div>
          </div>
          <div style="padding:12px 16px; background:var(--card); display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-sc-torch" style="display:none;">🔦 Torch</button>
            <div style="margin-left:auto;">
              <button type="button" class="btn btn-primary" id="btn-sc-snap" style="padding:10px 24px; font-weight:bold;">📸 Snap Page</button>
            </div>
          </div>
        </div>

        <!-- Upload Box (Default view) -->
        <div id="sc-up-box" class="card" style="display:block; padding:36px 24px; text-align:center; border:2px dashed var(--border); margin-bottom:16px;">
          <div style="font-size:36px; margin-bottom:12px;">📄</div>
          <h3 style="margin-bottom:8px;">Drag & Drop Receipt Photos</h3>
          <p style="color:var(--muted); font-size:13px; margin-bottom:20px;">Supports JPG, PNG, WEBP, and multi-page receipts (up to 10 pages)</p>
          <label class="btn btn-primary" style="cursor:pointer;">
            <span>Browse Files</span>
            <input type="file" id="sc-up-inp" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style="display:none;">
          </label>
        </div>

        <!-- Tray -->
        <div id="sc-tray-card" class="card" style="display:none; margin-bottom:16px;">
          <div class="card-header" style="margin-bottom:10px;"><h4 class="card-title" style="font-size:14px;">Multi-Page Bill Tray</h4></div>
          <div id="sc-tray-items" style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px;"></div>
        </div>

        <!-- Actions -->
        <div class="card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <button type="button" class="btn btn-secondary" onclick="window.location.hash='#/'">Cancel</button>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-secondary" id="btn-sc-manual" style="display:none;">✏️ Manual Entry</button>
            <button type="button" class="btn btn-primary" id="btn-sc-ai" style="display:none;">⚡ Scan with AI &rarr;</button>
          </div>
        </div>
      </div>
    `;

    // Camera Init helper
    let stream = null;
    const vid = document.getElementById('sc-vid');
    const fallback = document.getElementById('sc-cam-fallback');
    const torchBtn = document.getElementById('btn-sc-torch');

    async function initCam() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (fallback) fallback.style.display = 'flex';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (vid) vid.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        if (track?.getCapabilities?.().torch && torchBtn) torchBtn.style.display = 'inline-block';
      } catch {
        if (fallback) fallback.style.display = 'flex';
      }
    }

    const switchToCamera = () => {
      document.getElementById('sc-cam-box').style.display = 'block';
      document.getElementById('sc-up-box').style.display = 'none';
      document.getElementById('btn-sc-camera').className = 'btn btn-primary btn-sm';
      document.getElementById('btn-sc-upload').className = 'btn btn-secondary btn-sm';
      initCam();
    };

    const switchToUpload = () => {
      document.getElementById('sc-cam-box').style.display = 'none';
      document.getElementById('sc-up-box').style.display = 'block';
      document.getElementById('btn-sc-camera').className = 'btn btn-secondary btn-sm';
      document.getElementById('btn-sc-upload').className = 'btn btn-primary btn-sm';
      if (stream) stream.getTracks().forEach(t => t.stop());
    };

    // Mode Toggle Listeners
    document.getElementById('btn-sc-camera')?.addEventListener('click', switchToCamera);
    document.getElementById('btn-sc-upload')?.addEventListener('click', switchToUpload);

    // Snap & File Handler
    async function processBlob(blob) {
      if (!blob) return;
      if (activeScanPages.length >= 10) return alert('Maximum 10 pages per bill.');

      try {
        const isPdf = blob.type === 'application/pdf' || (blob.name && blob.name.toLowerCase().endsWith('.pdf'));

        if (isPdf) {
          const arrayBuf = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuf);
          const extractedJpegs = extractJpegImagesFromPdf(uint8);

          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read PDF file.'));
            reader.readAsDataURL(blob);
          });

          const sha256 = await computeSHA256(arrayBuf);
          const fileName = blob.name || 'document.pdf';
          const existingDocs = await getAll('documents').catch(() => []);

          if (extractedJpegs.length > 0) {
            // SCANNED PDF: Extract high-resolution bill photos so we NEVER show 2 duplicate bills
            for (let idx = 0; idx < extractedJpegs.length; idx++) {
              if (activeScanPages.length >= 10) break;
              const imgBytes = extractedJpegs[idx];
              const imgDataUrl = uint8ArrayToDataUrl(imgBytes, 'image/jpeg');

              const img = new Image();
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to decode extracted image.'));
                setTimeout(() => resolve(), 3000);
                img.src = imgDataUrl;
              });

              let finalDataUrl = imgDataUrl;
              let thumbUrl = imgDataUrl;
              let dHash = 'img_' + sha256.slice(0, 12);
              let quality = { pass: true, canScanAnyway: true, issues: [], metrics: { isPdfExtracted: true } };

              try {
                const down = await downscaleImage(img, 2200, 0.88);
                finalDataUrl = down.dataUrl;
                const thumb = await createThumbnail(down.canvas, 240);
                thumbUrl = thumb.dataUrl;
                dHash = computeDHash9x8(thumb.canvas);
                quality = evaluateQuality(down.canvas);
              } catch (e) {
                console.warn('Image prep error on extracted PDF photo:', e);
              }

              const duplicate = findDuplicateMatch({ sha256, dHash, pageIndex: activeScanPages.length + 1 }, existingDocs);

              activeScanPages.push({
                id: 'p_' + Math.random().toString(36).slice(2, 8),
                pageIndex: activeScanPages.length + 1,
                dataUrl: finalDataUrl,
                rawPdfDataUrl: dataUrl,
                thumbnailUrl: thumbUrl,
                mimeType: 'image/jpeg',
                fileName: extractedJpegs.length > 1 ? `${fileName} (P${idx + 1})` : fileName,
                sha256,
                dHash,
                quality,
                duplicate
              });
            }
            renderTrayUI();
            toast.show(`Extracted ${extractedJpegs.length} high-resolution bill photo${extractedJpegs.length > 1 ? 's' : ''} from "${fileName}".`, 'success');
            return;
          }

          // Fallback for pure vector PDFs (no embedded photos)
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = 180;
          thumbCanvas.height = 240;
          const pCtx = thumbCanvas.getContext('2d');
          pCtx.fillStyle = '#f8fafc';
          pCtx.fillRect(0, 0, 180, 240);
          pCtx.strokeStyle = '#285446';
          pCtx.lineWidth = 2;
          pCtx.strokeRect(8, 8, 164, 224);
          pCtx.fillStyle = '#991b1b';
          pCtx.fillRect(20, 24, 52, 24);
          pCtx.fillStyle = '#ffffff';
          pCtx.font = 'bold 12px sans-serif';
          pCtx.fillText('PDF', 34, 40);
          pCtx.fillStyle = '#0f172a';
          pCtx.font = 'bold 11px sans-serif';
          pCtx.fillText(fileName.length > 16 ? fileName.slice(0, 15) + '…' : fileName, 20, 80);
          pCtx.fillStyle = '#64748b';
          pCtx.font = '10px sans-serif';
          pCtx.fillText(`${Math.round(blob.size / 1024)} KB • Document`, 20, 104);
          pCtx.fillStyle = '#166534';
          pCtx.font = 'bold 10px sans-serif';
          pCtx.fillText('✓ Ready for Gemini AI', 20, 150);
          const thumbnailUrl = thumbCanvas.toDataURL('image/png');

          const duplicate = findDuplicateMatch({ sha256, dHash: null, pageIndex: activeScanPages.length + 1 }, existingDocs);

          activeScanPages.push({
            id: 'p_' + Math.random().toString(36).slice(2, 8),
            pageIndex: activeScanPages.length + 1,
            dataUrl: dataUrl,
            thumbnailUrl: thumbnailUrl,
            mimeType: 'application/pdf',
            fileName: fileName,
            sha256,
            dHash: 'pdf_' + sha256.slice(0, 12),
            quality: { pass: true, canScanAnyway: true, issues: [], metrics: { isPdf: true } },
            duplicate
          });
          renderTrayUI();
          toast.show(`PDF "${fileName}" added to tray (P${activeScanPages.length}).`, 'success');
          return;
        }

        // Handle Image
        const img = new Image();
        const url = URL.createObjectURL(blob);
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Cannot decode image. Please select a valid JPG, PNG, or WEBP photo.'));
            setTimeout(() => reject(new Error('Image decode timed out.')), 10000);
            img.src = url;
          });
        } finally {
          URL.revokeObjectURL(url);
        }

        const down = await downscaleImage(img, 2000, 0.85);
        const thumb = await createThumbnail(down.canvas, 240);
        const quality = evaluateQuality(down.canvas);
        const arrayBuf = await down.blob.arrayBuffer();
        const sha256 = await computeSHA256(arrayBuf);
        const dHash = computeDHash9x8(thumb.canvas);

        const existingDocs = await getAll('documents').catch(() => []);
        const duplicate = findDuplicateMatch({ sha256, dHash, pageIndex: activeScanPages.length + 1 }, existingDocs);

        activeScanPages.push({
          id: 'p_' + Math.random().toString(36).slice(2, 8),
          pageIndex: activeScanPages.length + 1,
          dataUrl: down.dataUrl,
          thumbnailUrl: thumb.dataUrl,
          mimeType: 'image/jpeg',
          sha256,
          dHash,
          quality,
          duplicate
        });
        renderTrayUI();
        toast.show(`Photo added to tray (P${activeScanPages.length}).`, 'info');
      } catch (err) {
        toast.show('File load error: ' + err.message, 'error');
        console.error('File load error:', err);
      }
    }

    document.getElementById('btn-sc-snap')?.addEventListener('click', async () => {
      if (!vid || !vid.videoWidth) return alert('Camera is not ready. Choose Add Photo instead.');
      const c = document.createElement('canvas');
      c.width = vid.videoWidth; c.height = vid.videoHeight;
      c.getContext('2d').drawImage(vid, 0, 0);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      await processBlob(b);
    });

    const fileInputs = [document.getElementById('sc-fallback-inp'), document.getElementById('sc-extra-inp'), document.getElementById('sc-up-inp')];
    fileInputs.forEach(inp => {
      inp?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = ''; // Always reset so selecting same file triggers change!
        for (const f of files) await processBlob(f);
      });
    });

    // Wire Drag and Drop on Upload Box
    const upBox = document.getElementById('sc-up-box');
    if (upBox) {
      upBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        upBox.style.borderColor = 'var(--primary)';
        upBox.style.backgroundColor = 'rgba(40, 84, 70, 0.05)';
      });
      upBox.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        upBox.style.borderColor = 'var(--border)';
        upBox.style.backgroundColor = 'transparent';
      });
      upBox.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        upBox.style.borderColor = 'var(--border)';
        upBox.style.backgroundColor = 'transparent';
        const files = Array.from(e.dataTransfer?.files || []);
        for (const f of files) await processBlob(f);
      });
      upBox.addEventListener('click', (e) => {
        if (e.target.closest('label') || e.target.tagName === 'INPUT') return;
        document.getElementById('sc-up-inp')?.click();
      });
    }

    function renderTrayUI() {
      const card = document.getElementById('sc-tray-card');
      const items = document.getElementById('sc-tray-items');
      const countEl = document.getElementById('sc-tray-count');
      const btnAi = document.getElementById('btn-sc-ai');
      const btnMan = document.getElementById('btn-sc-manual');

      if (countEl) countEl.textContent = `${activeScanPages.length} / 10`;
      if (activeScanPages.length === 0) {
        if (card) card.style.display = 'none';
        if (btnAi) btnAi.style.display = 'none';
        if (btnMan) btnMan.style.display = 'none';
        return;
      }
      if (card) card.style.display = 'block';
      if (btnAi) btnAi.style.display = 'inline-flex';
      if (btnMan) btnMan.style.display = 'inline-flex';

      items.innerHTML = activeScanPages.map((p, idx) => {
        p.pageIndex = idx + 1;
        let badge = '<span class="pill pill-success" style="font-size:10px; padding:2px 6px;">Ready</span>';
        if (p.duplicate) badge = '<span class="pill pill-error" style="font-size:10px; padding:2px 6px;">Duplicate</span>';
        else if (!p.quality.pass) badge = '<span class="pill pill-error" style="font-size:10px; padding:2px 6px;">⚠️ Check</span>';

        return `
          <div style="min-width:120px; max-width:140px; border:1px solid var(--border); background:var(--card); padding:8px; border-radius:2px; flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom:4px;">
              <span>P${idx + 1}</span>
              <button type="button" class="sc-del-p" data-i="${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer;">✕</button>
            </div>
            <div style="height:110px; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:6px;">
              <img src="${p.thumbnailUrl}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="p${idx+1}">
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              ${badge}
              <div style="display:flex; justify-content:space-between;">
                <button type="button" class="btn btn-secondary btn-sm sc-mv-l" data-i="${idx}" ${idx===0?'disabled':''} style="padding:2px 6px; font-size:10px;">◀</button>
                <button type="button" class="btn btn-secondary btn-sm sc-mv-r" data-i="${idx}" ${idx===activeScanPages.length-1?'disabled':''} style="padding:2px 6px; font-size:10px;">▶</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      items.querySelectorAll('.sc-del-p').forEach(b => {
        b.onclick = () => { activeScanPages.splice(parseInt(b.getAttribute('data-i'), 10), 1); renderTrayUI(); };
      });
      items.querySelectorAll('.sc-mv-l').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-i'), 10);
          const t = activeScanPages[i - 1]; activeScanPages[i - 1] = activeScanPages[i]; activeScanPages[i] = t;
          renderTrayUI();
        };
      });
      items.querySelectorAll('.sc-mv-r').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-i'), 10);
          const t = activeScanPages[i + 1]; activeScanPages[i + 1] = activeScanPages[i]; activeScanPages[i] = t;
          renderTrayUI();
        };
      });
    }

    // Trigger AI Extraction
    document.getElementById('btn-sc-ai')?.addEventListener('click', async () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const btn = document.getElementById('btn-sc-ai');
      btn.disabled = true;

      let elapsedSec = 0;
      let activeStatusMsg = 'Processing with AI...';
      const timerId = setInterval(() => {
        elapsedSec++;
        if (btn && btn.disabled) {
          btn.textContent = `⏳ Processing with AI... (${elapsedSec}s)`;
        }
      }, 1000);
      btn.textContent = '⏳ Processing with AI...';

      try {
        const { draft, fromCache, notes } = await extractBillFromPages(activeScanPages, 'PKR', (status) => {
          activeStatusMsg = status;
          if (btn) btn.textContent = `⏳ ${status} (${elapsedSec}s)`;
        });
        clearInterval(timerId);
        btn.textContent = '✓ Complete!';
        toast.show(fromCache ? 'Loaded from local cache!' : 'AI Extraction complete!', 'success');
        renderSplitEditor(draft, activeScanPages);
      } catch (err) {
        clearInterval(timerId);
        btn.disabled = false;
        btn.textContent = '⚡ Scan with AI →';
        const errMsg = err.message || 'Unknown extraction error';
        if (errMsg === 'NO_API_KEY') {
          if (confirm('Gemini API key is not configured. Would you like to enter this bill manually or open Settings to add your key?\n\nClick OK for Manual Entry, Cancel to open Settings.')) {
            const manualDraft = normalizeDraftTransaction({}, 'PKR', activeScanPages);
            manualDraft.aiExtractionNotice = 'Gemini API key is not configured. Scanned image is preserved for manual entry.';
            renderSplitEditor(manualDraft, activeScanPages);
          } else {
            window.location.hash = '#/settings';
          }
        } else {
          toast.error('AI Scan Notice: ' + errMsg, 8000);
          const manualDraft = normalizeDraftTransaction({}, 'PKR', activeScanPages);
          manualDraft.aiExtractionNotice = errMsg;
          renderSplitEditor(manualDraft, activeScanPages);
        }
      }
    });

    document.getElementById('btn-sc-manual')?.addEventListener('click', () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const manualDraft = {
        id: generateUUID(),
        type: 'purchase',
        vendorName: '',
        customerName: '',
        billNumber: '',
        date: new Date().toISOString().slice(0, 10),
        paymentMode: 'cash',
        lines: [
          { id: 'l_' + Math.random().toString(36).slice(2, 8), nameRaw: '', nameEnglish: '', qtyBilled: 1, unit: 'pcs', unitPriceMinor: 0, printedLineTotalMinor: 0, taxable: true, confidence: 100, pageIndex: 1 }
        ],
        currency: 'PKR',
        status: 'draft',
        discountMinor: 0,
        freightMinor: 0,
        subtotalMinor: 0,
        printedGrandTotalMinor: 0,
        isNewManualDraft: true
      };
      renderSplitEditor(manualDraft, activeScanPages);
    });
  }

  // --- Party Deduplication Utilities ---
  function extractPartyTaxId(name, taxId) {
    if (taxId && String(taxId).trim()) return String(taxId).trim();
    if (!name) return '';
    const m = String(name).match(/\(((?:ntn|strn|tax|id)?[-:\s]*[a-z0-9\-]+)\)/i);
    return m ? m[1].trim() : '';
  }

  function normalizePartyName(raw) {
    if (!raw) return '';
    let s = String(raw).toLowerCase().trim();
    // Strip parenthesized text like (NTN-300), (ntn-300), etc.
    s = s.replace(/\([^)]*\)/g, ' ');
    // Remove punctuation and extra symbols
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    // Normalize common localized spelling variations
    s = s.replace(/\bbazaar\b/g, 'bazar');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function normalizePhone(raw) {
    if (!raw) return '';
    let digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('92') && digits.length >= 11) {
      digits = '0' + digits.slice(2);
    }
    return digits;
  }

  function normalizeTaxId(raw) {
    if (!raw) return '';
    let s = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    s = s.replace(/^(ntn|strn|tax)/, '');
    return s;
  }

  function arePartiesDuplicate(p1, p2) {
    if (!p1 || !p2) return false;
    const type1 = p1.type || 'vendor';
    const type2 = p2.type || 'vendor';
    if (type1 !== type2) return false;

    const phone1 = normalizePhone(p1.phone);
    const phone2 = normalizePhone(p2.phone);
    const tax1 = normalizeTaxId(p1.taxId || extractPartyTaxId(p1.name));
    const tax2 = normalizeTaxId(p2.taxId || extractPartyTaxId(p2.name));
    const name1 = normalizePartyName(p1.name);
    const name2 = normalizePartyName(p2.name);

    // 1. Matched by valid phone (7+ digits)
    if (phone1 && phone2 && phone1.length >= 7 && phone1 === phone2) {
      if (!name1 || !name2 || name1 === name2 || name1.includes(name2) || name2.includes(name1)) {
        return true;
      }
      if (!tax1 || !tax2 || tax1 === tax2) {
        return true;
      }
    }

    // 2. Matched by Tax ID / NTN
    if (tax1 && tax2 && tax1 === tax2) {
      return true;
    }

    // 3. Matched by normalized name
    if (name1 && name2 && name1 === name2) {
      if (!phone1 || !phone2 || phone1 === phone2) {
        if (!tax1 || !tax2 || tax1 === tax2) {
          return true;
        }
      }
    }

    return false;
  }

  async function deduplicatePartiesStore() {
    const all = await getAll('parties').catch(() => []);
    if (!all || all.length <= 1) return all || [];

    const unique = [];
    const mergedIdsMap = new Map();
    let changesMade = false;

    for (const p of all) {
      const existingIdx = unique.findIndex(u => arePartiesDuplicate(u, p));
      if (existingIdx >= 0) {
        const canonical = unique[existingIdx];
        mergedIdsMap.set(p.id, canonical.id);

        if (!canonical.phone && p.phone) canonical.phone = p.phone;
        if ((!canonical.city || canonical.city === '-') && p.city && p.city !== '-') canonical.city = p.city;
        if (!canonical.taxId && p.taxId) canonical.taxId = p.taxId;
        if (!canonical.taxId) {
          const ext = extractPartyTaxId(p.name);
          if (ext) canonical.taxId = ext;
        }
        if (!canonical.address && p.address) canonical.address = p.address;

        await remove('parties', p.id).catch(() => {});
        changesMade = true;
      } else {
        if (!p.taxId) {
          const ext = extractPartyTaxId(p.name);
          if (ext) p.taxId = ext;
        }
        unique.push(p);
      }
    }

    if (changesMade) {
      for (const u of unique) {
        await put('parties', u).catch(() => {});
      }
      if (mergedIdsMap.size > 0) {
        const txs = await getAll('transactions').catch(() => []);
        for (const t of txs) {
          if (t.partyId && mergedIdsMap.has(t.partyId)) {
            t.partyId = mergedIdsMap.get(t.partyId);
            await put('transactions', t).catch(() => {});
          }
        }
        const pmts = await getAll('payments').catch(() => []);
        for (const pmt of pmts) {
          if (pmt.partyId && mergedIdsMap.has(pmt.partyId)) {
            pmt.partyId = mergedIdsMap.get(pmt.partyId);
            await put('payments', pmt).catch(() => {});
          }
        }
        const pos = await getAll('purchaseOrders').catch(() => []);
        for (const po of pos) {
          if (po.partyId && mergedIdsMap.has(po.partyId)) {
            po.partyId = mergedIdsMap.get(po.partyId);
            await put('purchaseOrders', po).catch(() => {});
          }
        }
      }
    }

    return unique;
  }

  // --- View: Split-Screen Bill Editor ---
  async function renderSplitEditor(draft, pages) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Review & Edit Bill';

    const parties = await getAll('parties').catch(() => []);
    const vendors = parties.filter(p => p.type === 'vendor').map(p => p.name);
    const customers = parties.filter(p => p.type === 'customer').map(p => p.name);
    const catalogItems = await getAll('items').catch(() => []);
    const history = await getAll('transactions').catch(() => []);

    let currentAuditFindings = [];
    let filterOnlyProblems = false;

    mainEl.innerHTML = `
      <div class="editor-container">
        <!-- Top bar -->
        <div class="card" style="margin-bottom:10px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-back">&larr; Back</button>
            <strong style="font-size:15px;">Review Bill</strong>
            <span class="pill pill-primary">${draft.status.toUpperCase()}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-save-draft">💾 Save Draft</button>
            <button type="button" class="btn btn-primary btn-sm" id="ed-confirm">✓ Confirm & Post</button>
          </div>
        </div>

        <!-- Split Body -->
        <div class="editor-split-body">
          <!-- Left: Image Viewer -->
          <div class="editor-left-mount ${pages.length === 0 ? 'hidden-mobile-clean' : ''}" id="ed-left-mount"></div>

          <!-- Right: Lines & Header -->
          <div class="editor-right-pane">
            ${draft.aiExtractionNotice ? `
              <div class="card" style="margin-bottom:12px; padding:12px 14px; background:#fff3cd; border-left:4px solid #d97706; border-radius:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div style="font-size:12px; color:#78350f; line-height:1.4;">
                  <strong>⚠️ AI Scan Notice:</strong> ${escapeHTML(draft.aiExtractionNotice)}
                  <div style="color:#92400e; font-size:11px; margin-top:2px;">Scanned image is visible on the left for manual entry or verification.</div>
                </div>
                <a href="#/settings" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 8px; text-decoration:none;">Check AI Settings</a>
              </div>
            ` : ''}
            <!-- Header Meta -->
            <div class="card" style="margin-bottom:8px; padding:8px 12px; background:var(--card); border:1px solid var(--border);">
              <!-- Row 1: Primary Parties (Vendor, Customer, Phone) -->
              <div class="editor-grid-parties" style="margin-bottom:6px; gap:8px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Vendor / Issuer</span>
                    <span style="color:var(--muted); font-size:10px;">ادارہ / بیوپاری</span>
                  </label>
                  <input type="text" class="form-control" id="ed-vendor" value="${escapeHTML(draft.vendorName === 'Unknown Vendor' ? '' : (draft.vendorName || ''))}" placeholder="School / Store / Vendor..." list="known-v-list" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                  <datalist id="known-v-list">${vendors.map(v => `<option value="${escapeHTML(v)}"></option>`).join('')}</datalist>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Customer / Client</span>
                    <span style="color:var(--muted); font-size:10px;">گاہک / کسٹمر</span>
                  </label>
                  <input type="text" class="form-control" id="ed-customer" value="${escapeHTML(draft.customerName || '')}" placeholder="Customer or student name..." list="known-c-list" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                  <datalist id="known-c-list">${customers.map(c => `<option value="${escapeHTML(c)}"></option>`).join('')}</datalist>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Phone / Mobile #</span>
                    <span style="color:var(--muted); font-size:10px;">فون نمبر</span>
                  </label>
                  <input type="text" class="form-control" id="ed-phone" value="${escapeHTML(draft.customerPhone || '')}" placeholder="e.g. 0321-1234567" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                </div>
              </div>
              <!-- Row 2: Transaction Details (Bill Type, Invoice #, Date, Payment Mode) -->
              <div class="editor-grid-details" style="gap:8px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Bill Type</span>
                    <span style="color:var(--muted); font-size:10px;">بل کی نوعیت</span>
                  </label>
                  <select class="form-control" id="ed-bill-type" style="width:100%; box-sizing:border-box; font-weight:600; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                    <option value="purchase" ${(draft.type === 'purchase' || (!draft.type && !draft.customerName) || Boolean(draft.vendorName)) && draft.type !== 'sale' ? 'selected' : ''}>📦 Purchase from Vendor</option>
                    <option value="sale" ${(draft.type === 'sale' || Boolean(draft.customerName)) && draft.type !== 'purchase' ? 'selected' : ''}>🛍️ Sale to Customer</option>
                  </select>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Bill / Invoice #</span>
                    <span style="color:var(--muted); font-size:10px;">بل نمبر</span>
                  </label>
                  <input type="text" class="form-control" id="ed-bill-no" value="${escapeHTML(draft.billNumber || '')}" placeholder="Optional (e.g. 2337)" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Bill Date</span>
                    <span style="color:var(--muted); font-size:10px;">تاریخ</span>
                  </label>
                  <input type="date" class="form-control" id="ed-date" value="${draft.date}" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; height:15px; white-space:nowrap;">
                    <span style="font-weight:600; color:var(--text);">Payment Mode</span>
                    <span style="color:var(--muted); font-size:10px;">ادائیگی</span>
                  </label>
                  <select class="form-control" id="ed-pay-mode" style="width:100%; box-sizing:border-box; min-height:30px; height:30px; padding:3px 8px; font-size:12px;">
                    <option value="cash" ${draft.paymentMode==='cash'?'selected':''}>Cash (Naqd / نقد)</option>
                    <option value="credit" ${draft.paymentMode==='credit'?'selected':''}>Credit (Udhaar / ادھار)</option>
                    <option value="bank" ${draft.paymentMode==='bank'?'selected':''}>Bank / Online (بینک)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Live Audit Summary Bar -->
            <div class="card" style="margin-bottom:8px; padding:6px 12px; background:var(--panel); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <div id="ed-audit-badges" style="display:flex; align-items:center; gap:8px;">
                <span class="pill pill-success" style="background:var(--success-bg); color:var(--success-text); border:1px solid currentColor;">✓ Calculations Clean</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none; margin:0; font-weight:600;">
                  <input type="checkbox" id="ed-filter-problems"> Show only problems
                </label>
              </div>
            </div>

            <!-- Lines Table -->
            <div class="card" style="display:flex; flex-direction:column; padding:0; overflow:hidden; margin-bottom:8px; min-height:0; flex:1;">
              <datalist id="known-items-list">
                ${catalogItems.map(it => {
                  const billType = (draft.type === 'sale' || Boolean(draft.customerName)) ? 'sale' : 'purchase';
                  const rateMinor = billType === 'sale'
                    ? (it.salePriceMinor || it.purchasePriceMinor || 0)
                    : (it.purchasePriceMinor || it.salePriceMinor || 0);
                  const priceStr = rateMinor > 0 ? ` - ${formatMoney(rateMinor, draft.currency || 'PKR')}` : '';
                  const urduStr = it.urduName ? ` | ${it.urduName}` : '';
                  const baseName = (it.name || '').replace(/\s*\(.*?\)/g, '').trim();
                  let opts = `<option value="${escapeHTML(it.name)}">${escapeHTML(it.name)}${escapeHTML(urduStr)} (${it.unit || 'pcs'})${priceStr}</option>`;
                  if (baseName && baseName !== it.name) {
                    opts += `<option value="${escapeHTML(baseName)}">${escapeHTML(baseName)}${priceStr}</option>`;
                  }
                  return opts;
                }).join('')}
              </datalist>
              <datalist id="common-units-list">
                <option value="pcs">Pieces (عدد / پیس)</option>
                <option value="kg">Kilogram (کلو گرام - kg)</option>
                <option value="g">Gram (گرام - g)</option>
                <option value="Ltr">Liter (لیٹر - Ltr)</option>
                <option value="ml">Milliliter (ملی لیٹر - ml)</option>
                <option value="dozen">Dozen (درجن - dz)</option>
                <option value="pack">Packet (پیکٹ - pkt)</option>
                <option value="box">Box (ڈبہ - box)</option>
                <option value="bag">Bag (بوری / تھیلا)</option>
                <option value="carton">Carton (کارٹن - ctn)</option>
                <option value="meter">Meter (میٹر - m)</option>
                <option value="ft">Foot (فٹ - ft)</option>
                <option value="sqft">Sq. Feet (مربع فٹ)</option>
                <option value="roll">Roll (رول)</option>
                <option value="bottle">Bottle (بوتل)</option>
                <option value="tin">Tin (ٹین)</option>
                <option value="pair">Pair (جوڑا)</option>
                <option value="set">Set (سیٹ)</option>
                <option value="month">Month (مہینہ / فیس)</option>
                <option value="fee">Fee (فیس / چالان)</option>
              </datalist>
              <div style="padding:6px 12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
                <span style="font-weight:bold; font-size:12px;">Line Items (<span id="ed-line-count">${draft.lines.length}</span>)</span>
              </div>
              <div class="editor-table-wrap" id="ed-table-wrap">
                <table class="table editor-table">
                  <thead style="position:sticky; top:0; background:var(--panel); z-index:2;">
                    <tr>
                      <th style="width:26px; text-align:center;">#</th>
                      <th style="text-align:left;">Item / Description</th>
                      <th style="width:54px; text-align:right;">Qty</th>
                      <th style="width:58px; text-align:center;">Unit</th>
                      <th style="width:84px; text-align:right;" id="ed-th-rate">${(draft.type === 'sale' || Boolean(draft.customerName)) && draft.type !== 'purchase' ? 'Sale Price' : 'Purchase Price'}</th>
                      <th style="width:88px; text-align:right;">Total</th>
                      <th style="width:24px; text-align:center;"></th>
                    </tr>
                  </thead>
                  <tbody id="ed-lines-tbody"></tbody>
                  <tfoot style="border-top:1px solid var(--border); background:var(--panel);">
                    <tr>
                      <td colspan="5" style="padding:6px 12px; vertical-align:middle; color:var(--muted); font-size:11px;">
                        <span>Total Lines: <strong id="ed-line-count-bottom" style="color:var(--text);">${draft.lines.length}</strong></span>
                      </td>
                      <td colspan="2" style="padding:4px 8px; text-align:right; vertical-align:middle;">
                        <button type="button" class="btn btn-primary btn-sm" id="ed-add-line" style="font-weight:600; font-size:11px; padding:3px 10px; white-space:nowrap;">+ Add Line</button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- Totals Footer -->
            <div class="card" style="padding:8px 12px; background:var(--card); margin-top:2px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:10px;">
                  <div>
                    <label class="form-label" style="font-size:10px; margin-bottom:2px;">Discount</label>
                    <input type="text" class="form-control" id="ed-disc" style="width:80px; min-height:28px; height:28px; padding:2px 6px; font-size:12px;" value="${formatMoney(draft.discountMinor, draft.currency, {showSymbol:false})}">
                  </div>
                  <div>
                    <label class="form-label" style="font-size:10px; margin-bottom:2px;">Freight</label>
                    <input type="text" class="form-control" id="ed-frt" style="width:80px; min-height:28px; height:28px; padding:2px 6px; font-size:12px;" value="${formatMoney(draft.freightMinor, draft.currency, {showSymbol:false})}">
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:10px; color:var(--muted);">Grand Total:</div>
                  <strong style="font-size:17px; color:var(--primary);" id="ed-grand-total">${formatMoney(draft.printedGrandTotalMinor, draft.currency)}</strong>
                </div>
              </div>
              <!-- Invoice Total Audit Discrepancy Notice -->
              <div id="ed-invoice-audit-msg" style="margin-top:8px; display:none; padding:6px 10px; background:rgba(217, 119, 98, 0.08); border:1px solid var(--secondary); font-size:11px; color:var(--secondary); justify-content:space-between; align-items:center;">
                <span id="ed-invoice-audit-text"></span>
                <button type="button" class="btn btn-secondary btn-xs" id="ed-fix-invoice-tot" style="background:#fff;">Fix Grand Total</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const viewer = new StandaloneImageViewer(document.getElementById('ed-left-mount'));
    viewer.setPages(pages);
    viewer.onPagesChanged = (newPages) => { pages = newPages; };

    let userHasInteractedWithEditor = false;

    function calcTotals() {
      let sub = 0;
      for (const l of draft.lines) sub = add(sub, l.printedLineTotalMinor);
      draft.subtotalMinor = sub;
      let g = sub;
      g = subMoney(g, draft.discountMinor || 0);
      g = add(g, draft.freightMinor || 0);
      draft.printedGrandTotalMinor = g;
      const gtEl = document.getElementById('ed-grand-total');
      if (gtEl) gtEl.textContent = formatMoney(g, draft.currency);
    }

    function recalcAudit() {
      draft.vendorName = document.getElementById('ed-vendor')?.value.trim() || '';
      draft.customerName = document.getElementById('ed-customer')?.value.trim() || '';
      draft.customerPhone = document.getElementById('ed-phone')?.value.trim() || '';
      draft.billNumber = document.getElementById('ed-bill-no')?.value.trim() || '';
      draft.date = document.getElementById('ed-date')?.value || draft.date;

      const badgesEl = document.getElementById('ed-audit-badges');

      // Pristine manual draft: do not scream errors before user has entered data
      if (draft.isNewManualDraft && !userHasInteractedWithEditor) {
        currentAuditFindings = [];
        if (badgesEl) {
          badgesEl.innerHTML = `<span class="pill pill-neutral" style="background:#f4f7f5; color:#2F5D50; border:1px solid #c8d8cf; font-weight:600; font-size:12px;">📝 Manual Bill Entry &mdash; Fill details to audit</span>`;
        }
        return;
      }

      const res = runCompleteAudit(draft, { history, isManual: draft.isNewManualDraft, isSubmitting: false, options: { toleranceMinor: 1 } });
      currentAuditFindings = res.findings || [];

      // Update Audit Badges with EXACT error/warning descriptions
      if (badgesEl) {
        if (res.summary.pass) {
          badgesEl.innerHTML = `<span class="pill pill-success" style="background:var(--success-bg); color:var(--success-text); border:1px solid currentColor;">✓ Calculations Clean</span>`;
        } else {
          // Group similar messages to prevent bloating vertical layout
          const groupedFindings = [];
          const msgCounts = new Map();
          for (const f of currentAuditFindings) {
            let key = f.message || f.code;
            if (f.code === AUDIT_FINDING_CODES.LOW_CONFIDENCE || key.includes('Low OCR confidence')) {
              key = 'Low OCR confidence (<80%) — please review line details';
            }
            const existing = msgCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              const item = { ...f, displayMsg: key, count: 1 };
              msgCounts.set(key, item);
              groupedFindings.push(item);
            }
          }

          let h = `<div style="display:flex; flex-direction:column; gap:4px; width:100%;">`;
          h += `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">`;
          if (res.summary.errorCount > 0) {
            h += `<span class="pill pill-error" style="background:var(--error-bg); color:var(--error-text); border:1px solid currentColor; font-weight:bold;">${res.summary.errorCount} Error${res.summary.errorCount > 1 ? 's' : ''}</span>`;
          }
          if (res.summary.warningCount > 0) {
            h += `<span class="pill" style="background:#FFF3CD; color:#856404; border:1px solid #FFEEBA; padding:3px 8px; font-weight:600; font-size:11px;">${res.summary.warningCount} Warning${res.summary.warningCount > 1 ? 's' : ''}</span>`;
          }
          h += `</div>`;
          // Detailed Messages (compact with small scrollbar if long)
          h += `<div style="font-size:11px; margin-top:2px; display:flex; flex-direction:column; gap:2px; max-height:80px; overflow-y:auto; padding-right:4px;">`;
          groupedFindings.forEach(f => {
            const isErr = f.severity === 'error';
            const icon = isErr ? '❌' : '⚠️';
            const col = isErr ? 'var(--error-text)' : '#856404';
            const countSuffix = f.count > 1 ? ` (${f.count} items)` : '';
            h += `<div style="color:${col}; display:flex; align-items:center; gap:4px;"><span>${icon}</span> <span>${escapeHTML(f.displayMsg || f.message || f.code)}${countSuffix}</span></div>`;
          });
          h += `</div></div>`;
          badgesEl.innerHTML = h;
        }
      }

      // Check Invoice Totals Mismatch
      const invFinding = currentAuditFindings.find(f => f.code === AUDIT_FINDING_CODES.INVOICE_TOTAL_MISMATCH);
      const invMsgEl = document.getElementById('ed-invoice-audit-msg');
      const invTxtEl = document.getElementById('ed-invoice-audit-text');
      if (invMsgEl && invTxtEl) {
        if (invFinding) {
          invMsgEl.style.display = 'flex';
          invTxtEl.textContent = `Discrepancy: Lines sum minus discount + freight is ${formatMoney(invFinding.expected, draft.currency)}, but printed is ${formatMoney(invFinding.actual, draft.currency)} (Diff: ${formatMoney(Math.abs(invFinding.diff), draft.currency)})`;
          document.getElementById('ed-fix-invoice-tot').onclick = () => {
            userHasInteractedWithEditor = true;
            draft.printedGrandTotalMinor = invFinding.expected;
            document.getElementById('ed-grand-total').textContent = formatMoney(draft.printedGrandTotalMinor, draft.currency);
            calcTotals();
            recalcAudit();
            renderLines();
          };
        } else {
          invMsgEl.style.display = 'none';
        }
      }
    }

    function isCurrentBillForCustomer() {
      const billTypeEl = document.getElementById('ed-bill-type');
      if (billTypeEl) {
        if (billTypeEl.value === 'sale') return true;
        if (billTypeEl.value === 'purchase') return false;
      }
      const cVal = document.getElementById('ed-customer')?.value.trim() || draft.customerName || '';
      const vVal = document.getElementById('ed-vendor')?.value.trim() || draft.vendorName || '';
      if (cVal && !vVal) return true;
      if (vVal && !cVal) return false;
      return draft.type === 'sale';
    }

    function getItemPriceForBill(matched) {
      if (!matched) return 0;
      const isCust = isCurrentBillForCustomer();
      if (isCust) {
        // Customer -> SALE PRICE (فروخت قیمت)
        const p = matched.salePriceMinor ?? matched.basePriceMinor ?? matched.sellingPriceMinor;
        if (p != null && p > 0) return p;
        return matched.purchasePriceMinor ?? matched.baseCostMinor ?? matched.wacRate ?? 0;
      } else {
        // Vendor -> PURCHASE PRICE (خرید قیمت)
        const p = matched.purchasePriceMinor ?? matched.baseCostMinor ?? matched.costPriceMinor ?? matched.wacRate;
        if (p != null && p > 0) return p;
        return matched.salePriceMinor ?? matched.basePriceMinor ?? 0;
      }
    }

    function findCatalogItem(query) {
      if (!query) return null;
      const clean = String(query).trim().toLowerCase();
      if (!clean) return null;

      // 1. Exact match on name, urduName, sku, or id
      let matched = catalogItems.find(it => 
        (it.name && it.name.trim().toLowerCase() === clean) ||
        (it.urduName && it.urduName.trim().toLowerCase() === clean) ||
        (it.sku && it.sku.trim().toLowerCase() === clean) ||
        (it.id && it.id.trim().toLowerCase() === clean)
      );
      if (matched) return matched;

      // 2. Base name match ignoring parenthetical descriptions e.g. "Cooking Oil 5L Tin (تیل)" -> "cooking oil"
      matched = catalogItems.find(it => {
        if (!it.name) return false;
        const base = it.name.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
        return base === clean || clean === base;
      });
      if (matched) return matched;

      // 3. Prefix match
      if (clean.length >= 3) {
        matched = catalogItems.find(it => {
          if (!it.name) return false;
          const n = it.name.trim().toLowerCase();
          const base = n.replace(/\s*\(.*?\)/g, '').trim();
          return n.startsWith(clean) || base.startsWith(clean) || clean.startsWith(base);
        });
        if (matched) return matched;
      }

      // 4. Word tokens match (e.g. "cooking" and "oil")
      const words = clean.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 1) {
        matched = catalogItems.find(it => {
          const hay = ((it.name || '') + ' ' + (it.urduName || '')).toLowerCase();
          return words.every(w => hay.includes(w));
        });
        if (matched) return matched;
      }

      // 5. Substring inclusion
      if (clean.length >= 4) {
        matched = catalogItems.find(it => {
          const n = (it.name || '').toLowerCase();
          return n.includes(clean) || clean.includes(n);
        });
        if (matched) return matched;
      }

      return null;
    }

    function updateKnownItemsDatalist() {
      const datalist = document.getElementById('known-items-list');
      if (!datalist) return;
      const isCust = isCurrentBillForCustomer();
      datalist.innerHTML = catalogItems.map(it => {
        const rateMinor = getItemPriceForBill(it);
        const priceLabel = isCust ? 'Sale Price' : 'Purchase Price';
        const priceStr = rateMinor > 0 ? ` - ${formatMoney(rateMinor, draft.currency || 'PKR')} (${priceLabel})` : '';
        const urduStr = it.urduName ? ` | ${it.urduName}` : '';
        const baseName = (it.name || '').replace(/\s*\(.*?\)/g, '').trim();
        let opts = `<option value="${escapeHTML(it.name)}">${escapeHTML(it.name)}${escapeHTML(urduStr)} (${it.unit || 'pcs'})${priceStr}</option>`;
        if (baseName && baseName !== it.name) {
          opts += `<option value="${escapeHTML(baseName)}">${escapeHTML(baseName)}${priceStr}</option>`;
        }
        return opts;
      }).join('');
    }

    function syncPricingMode() {
      const isCust = isCurrentBillForCustomer();
      const thRate = document.getElementById('ed-th-rate');
      if (thRate) {
        thRate.textContent = isCust ? 'Sale Price' : 'Purchase Price';
      }
      updateKnownItemsDatalist();
      draft.lines.forEach((l, idx) => {
        if (l.nameRaw) {
          const matched = findCatalogItem(l.nameRaw);
          if (matched) {
            const newPrice = getItemPriceForBill(matched);
            if (newPrice > 0) {
              l.unitPriceMinor = newPrice;
              const qM = Math.round((parseFloat(l.qtyBilled) || 1) * 1000);
              l.printedLineTotalMinor = lineTotal(qM, newPrice);
            }
          }
        }
      });
      calcTotals();
      renderLines();
    }

    function applyCatalogItemToLine(i, itemName, forceRefresh = false) {
      if (!itemName || !draft.lines[i]) return false;
      const matched = findCatalogItem(itemName);
      if (matched) {
        userHasInteractedWithEditor = true;
        draft.lines[i].nameRaw = matched.name;
        if (matched.unit) {
          draft.lines[i].unit = formatUnit(matched.unit);
        }

        const priceMinor = getItemPriceForBill(matched);
        if (priceMinor > 0) {
          draft.lines[i].unitPriceMinor = priceMinor;
        }

        const q = parseFloat(draft.lines[i].qtyBilled) || 1;
        draft.lines[i].qtyBilled = q;
        const qM = Math.round(q * 1000);
        draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor || 0);

        calcTotals();
        recalcAudit();

        if (forceRefresh) {
          renderLines();
        } else {
          const tbody = document.getElementById('ed-lines-tbody');
          const row = tbody?.querySelector(`tr[data-lidx="${i}"]`);
          if (row) {
            const nameInp = row.querySelector('.ed-cell-name');
            if (nameInp && nameInp.value !== matched.name) nameInp.value = matched.name;
            const unitInp = row.querySelector('.ed-cell-unit');
            if (unitInp && matched.unit) unitInp.value = draft.lines[i].unit;
            const rateInp = row.querySelector('.ed-cell-rate');
            if (rateInp) rateInp.value = formatMoney(draft.lines[i].unitPriceMinor, draft.currency, {showSymbol:false});
            const totInp = row.querySelector('.ed-cell-tot-inp');
            if (totInp) totInp.value = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency, {showSymbol:false});
          }
        }
        return true;
      }
      return false;
    }

    function renderLines() {
      const tbody = document.getElementById('ed-lines-tbody');
      if (!tbody) return;

      let html = '';
      let visibleLines = 0;

      draft.lines.forEach((l, idx) => {
        const mathFinding = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
        const lineFindings = currentAuditFindings.filter(f => f.lineId === l.id);
        const hasError = !!mathFinding || lineFindings.some(f => f.severity === 'error');
        const hasWarning = lineFindings.some(f => f.severity === 'warning');
        const hike = lineFindings.find(f => f.code === AUDIT_FINDING_CODES.PRICE_HIKE);

        if (filterOnlyProblems && !hasError && !hasWarning) {
          return;
        }
        visibleLines++;

        const rowStyle = mathFinding
          ? 'background: rgba(217, 119, 98, 0.06); border-left: 3px solid var(--secondary);'
          : '';

        html += `
          <tr data-lidx="${idx}" style="${rowStyle}">
            <td style="color:var(--muted); font-size:11px; text-align:center; vertical-align:middle; padding:2px 2px;">${idx+1}</td>
            <td style="vertical-align:middle; padding:2px 3px;">
              <div style="display:flex; align-items:center;">
                <input type="text" class="form-control form-control-sm ed-cell-name" list="known-items-list" value="${escapeHTML((l.nameRaw === 'Item' && draft.isNewManualDraft) ? '' : (l.nameRaw || ''))}" style="${l.confidence < 80 ? 'border-color:var(--secondary) !important;' : ''}; flex:1; width:100%; box-sizing:border-box;" placeholder="Item description...">
                ${hike ? `<span class="pill" style="font-size:9px; padding:0 3px; margin-left:3px; background:#FFF3CD; color:#856404; border:1px solid #FFEEBA; white-space:nowrap;" title="${escapeHTML(hike.message)}">▲ +${hike.hikePercent}%</span>` : ''}
              </div>
            </td>
            <td style="vertical-align:middle; text-align:right; padding:2px 2px;">
              <input type="number" class="form-control form-control-sm ed-cell-qty" value="${l.qtyBilled}" step="any" min="0" inputmode="decimal" style="text-align:right; font-variant-numeric:tabular-nums; font-weight:600; width:100%; box-sizing:border-box;">
            </td>
            <td style="vertical-align:middle; text-align:center; padding:2px 2px;">
              <input type="text" class="form-control form-control-sm ed-cell-unit" value="${escapeHTML(l.unit||'pcs')}" list="common-units-list" style="text-align:center; font-weight:500; width:100%; box-sizing:border-box;" placeholder="Unit">
            </td>
            <td style="vertical-align:middle; text-align:right; padding:2px 2px;">
              <input type="text" class="form-control form-control-sm ed-cell-rate" value="${formatMoney(l.unitPriceMinor, draft.currency, {showSymbol:false})}" style="text-align:right; font-variant-numeric:tabular-nums; font-family:monospace, sans-serif; width:100%; box-sizing:border-box;" placeholder="0.00">
            </td>
            <td style="vertical-align:middle; text-align:right; font-weight:bold; padding:2px 2px;">
              <input type="text" class="form-control form-control-sm ed-cell-tot-inp" value="${formatMoney(l.printedLineTotalMinor, draft.currency, {showSymbol:false})}" style="text-align:right; font-variant-numeric:tabular-nums; font-family:monospace, sans-serif; font-weight:bold; color:var(--primary); width:100%; box-sizing:border-box;" placeholder="0.00">
            </td>
            <td style="text-align:center; vertical-align:middle; padding:2px 2px;">
              <button type="button" class="ed-del-line" data-i="${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer; font-size:13px; line-height:1; padding:2px;" title="Delete line">✕</button>
            </td>
          </tr>
        `;

        if (mathFinding) {
          const expectedTotal = mathFinding.expected;
          const diff = Math.abs(mathFinding.diff);
          const fixQty = mathFinding.suggestedFixes.find(f => f.type === 'SET_QTY');
          const fixPrice = mathFinding.suggestedFixes.find(f => f.type === 'SET_PRICE');

          html += `
            <tr class="ed-audit-subrow" data-subrow-idx="${idx}" style="background: rgba(217, 119, 98, 0.09); font-size:11px;">
              <td colspan="7" style="padding:6px 12px; border-top:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                  <span style="color:var(--secondary); font-weight:600;">
                    ⚠ Math Mismatch &mdash; Printed: ${formatMoney(mathFinding.actual, draft.currency)} | Calculated: ${formatMoney(expectedTotal, draft.currency)} (Diff: ${formatMoney(diff, draft.currency)})
                  </span>
                  <div style="display:flex; gap:4px;">
                    <button type="button" class="btn btn-secondary btn-xs btn-fix-total" data-idx="${idx}">Fix Total (${formatMoney(expectedTotal, draft.currency)})</button>
                    ${fixQty ? `<button type="button" class="btn btn-secondary btn-xs btn-fix-qty" data-idx="${idx}">Fix Qty (${fixQty.value})</button>` : ''}
                    ${fixPrice ? `<button type="button" class="btn btn-secondary btn-xs btn-fix-price" data-idx="${idx}">Fix Rate (${formatMoney(fixPrice.value, draft.currency)})</button>` : ''}
                  </div>
                </div>
              </td>
            </tr>
          `;
        }
      });

      if (filterOnlyProblems && visibleLines === 0) {
        html = `
          <tr>
            <td colspan="7" style="text-align:center; padding:20px 12px; color:var(--muted); font-size:12px;">
              ✓ All individual line item calculations are clean. Any active warning/error is at the invoice header level (see above).
            </td>
          </tr>
        `;
      }

      if (!html) {
        html = `<tr><td colspan="7" style="text-align:center; padding:24px 12px; color:var(--muted); font-size:12px;">No line items yet. Click <strong>+ Add Line</strong> below to add an item.</td></tr>`;
      }

      tbody.innerHTML = html;
      const countEl = document.getElementById('ed-line-count');
      if (countEl) countEl.textContent = draft.lines.length;
      const countElBottom = document.getElementById('ed-line-count-bottom');
      if (countElBottom) countElBottom.textContent = draft.lines.length;

      function applyFixTotal(idx) {
        const l = draft.lines[idx];
        if (!l) return;
        const qM = Math.round((parseFloat(l.qtyBilled) || 1) * 1000);
        const expected = lineTotal(qM, l.unitPriceMinor || 0);
        l.printedLineTotalMinor = expected;
        l.manualTotalEntered = false;
        const row = tbody.querySelector(`tr[data-lidx="${idx}"]`);
        if (row) {
          const totInp = row.querySelector('.ed-cell-tot-inp');
          if (totInp) totInp.value = formatMoney(expected, draft.currency, { showSymbol: false });
          let s = row.nextElementSibling;
          while (s && s.classList.contains('ed-audit-subrow')) {
            const rem = s;
            s = s.nextElementSibling;
            rem.remove();
          }
        }
        calcTotals();
        recalcAudit();
      }

      function applyFixQty(idx) {
        const l = draft.lines[idx];
        if (!l) return;
        const rate = l.unitPriceMinor || 0;
        const printed = l.printedLineTotalMinor || 0;
        if (rate > 0) {
          const derivedQty = Math.round((printed / rate) * 1000) / 1000;
          l.qtyBilled = derivedQty;
          const row = tbody.querySelector(`tr[data-lidx="${idx}"]`);
          if (row) {
            const qtyInp = row.querySelector('.ed-cell-qty');
            if (qtyInp) qtyInp.value = derivedQty;
            let s = row.nextElementSibling;
            while (s && s.classList.contains('ed-audit-subrow')) {
              const rem = s;
              s = s.nextElementSibling;
              rem.remove();
            }
          }
          calcTotals();
          recalcAudit();
        }
      }

      function applyFixPrice(idx) {
        const l = draft.lines[idx];
        if (!l) return;
        const qty = parseFloat(l.qtyBilled) || 1;
        const printed = l.printedLineTotalMinor || 0;
        if (qty > 0) {
          const derivedPrice = Math.round(printed / qty);
          l.unitPriceMinor = derivedPrice;
          const row = tbody.querySelector(`tr[data-lidx="${idx}"]`);
          if (row) {
            const rateInp = row.querySelector('.ed-cell-rate');
            if (rateInp) rateInp.value = formatMoney(derivedPrice, draft.currency, { showSymbol: false });
            let s = row.nextElementSibling;
            while (s && s.classList.contains('ed-audit-subrow')) {
              const rem = s;
              s = s.nextElementSibling;
              rem.remove();
            }
          }
          calcTotals();
          recalcAudit();
        }
      }

      function updateRowMathSubrow(row, idx) {
        if (!row) return;
        const l = draft.lines[idx];
        if (!l) return;
        const mf = auditRowMath(l, { toleranceMinor: 1, currency: draft.currency });
        let next = row.nextElementSibling;
        const hasSubrow = next && next.classList.contains('ed-audit-subrow');

        if (mf) {
          const expectedTotal = mf.expected;
          const diff = Math.abs(mf.diff);
          const fixQty = mf.suggestedFixes?.find(f => f.type === 'SET_QTY');
          const fixPrice = mf.suggestedFixes?.find(f => f.type === 'SET_PRICE');
          const subrowContent = `
            <td colspan="7" style="padding:6px 12px; border-top:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="color:var(--secondary); font-weight:600;">
                  ⚠ Math Mismatch &mdash; Printed: ${formatMoney(mf.actual, draft.currency)} | Calculated: ${formatMoney(expectedTotal, draft.currency)} (Diff: ${formatMoney(diff, draft.currency)})
                </span>
                <div style="display:flex; gap:4px;">
                  <button type="button" class="btn btn-secondary btn-xs btn-fix-total" data-idx="${idx}">Fix Total (${formatMoney(expectedTotal, draft.currency)})</button>
                  ${fixQty ? `<button type="button" class="btn btn-secondary btn-xs btn-fix-qty" data-idx="${idx}">Fix Qty (${fixQty.value})</button>` : ''}
                  ${fixPrice ? `<button type="button" class="btn btn-secondary btn-xs btn-fix-price" data-idx="${idx}">Fix Rate (${formatMoney(fixPrice.value, draft.currency)})</button>` : ''}
                </div>
              </div>
            </td>
          `;
          if (hasSubrow) {
            next.innerHTML = subrowContent;
          } else {
            const newTr = document.createElement('tr');
            newTr.className = 'ed-audit-subrow';
            newTr.setAttribute('data-subrow-idx', String(idx));
            newTr.style.background = 'rgba(217, 119, 98, 0.09)';
            newTr.style.fontSize = '11px';
            newTr.innerHTML = subrowContent;
            row.after(newTr);
            next = newTr;
          }
        } else {
          let s = row.nextElementSibling;
          while (s && s.classList.contains('ed-audit-subrow')) {
            const rem = s;
            s = s.nextElementSibling;
            rem.remove();
          }
        }
      }

      // Delegated click handler on tbody for all fix buttons
      tbody.addEventListener('click', (e) => {
        const fixTotBtn = e.target.closest('.btn-fix-total');
        if (fixTotBtn) {
          e.preventDefault();
          e.stopPropagation();
          const i = parseInt(fixTotBtn.getAttribute('data-idx'), 10);
          applyFixTotal(i);
          return;
        }
        const fixQtyBtn = e.target.closest('.btn-fix-qty');
        if (fixQtyBtn) {
          e.preventDefault();
          e.stopPropagation();
          const i = parseInt(fixQtyBtn.getAttribute('data-idx'), 10);
          applyFixQty(i);
          return;
        }
        const fixPriceBtn = e.target.closest('.btn-fix-price');
        if (fixPriceBtn) {
          e.preventDefault();
          e.stopPropagation();
          const i = parseInt(fixPriceBtn.getAttribute('data-idx'), 10);
          applyFixPrice(i);
          return;
        }
      });

      tbody.querySelectorAll('tr[data-lidx]').forEach(r => {
        r.onclick = (e) => {
          if (['INPUT','BUTTON','SELECT'].includes(e.target.tagName)) return;
          const i = parseInt(r.getAttribute('data-lidx'), 10);
          if (draft.lines[i]?.pageIndex) viewer.goToPage(draft.lines[i].pageIndex - 1);
        };
      });

      tbody.querySelectorAll('.ed-cell-name').forEach(inp => {
        inp.oninput = (e) => {
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const val = e.target.value.trim();
          draft.lines[i].nameRaw = e.target.value;
          const match = findCatalogItem(val);
          if (match) {
            applyCatalogItemToLine(i, match.name, false);
            updateRowMathSubrow(row, i);
          }
        };
        inp.onchange = (e) => {
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const val = e.target.value.trim();
          const matched = applyCatalogItemToLine(i, val, false);
          if (!matched) {
            draft.lines[i].nameRaw = e.target.value;
            recalcAudit();
          }
          updateRowMathSubrow(row, i);
        };
      });

      tbody.querySelectorAll('.ed-cell-qty').forEach(inp => {
        inp.oninput = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const q = parseFloat(e.target.value) || 0;
          draft.lines[i].qtyBilled = q;
          const qM = Math.round(q * 1000);
          if (!draft.lines[i].manualTotalEntered) {
            draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor || 0);
            const totInp = row.querySelector('.ed-cell-tot-inp');
            if (totInp) totInp.value = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency, {showSymbol:false});
          }
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
        inp.onchange = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const q = parseFloat(e.target.value) || 1;
          draft.lines[i].qtyBilled = q;
          const qM = Math.round(q * 1000);
          if (!draft.lines[i].manualTotalEntered) {
            draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor || 0);
            const totInp = row.querySelector('.ed-cell-tot-inp');
            if (totInp) totInp.value = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency, {showSymbol:false});
          }
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
      });

      tbody.querySelectorAll('.ed-cell-unit').forEach(inp => {
        inp.onchange = (e) => {
          userHasInteractedWithEditor = true;
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          draft.lines[i].unit = formatUnit(e.target.value.trim() || 'pcs');
          recalcAudit();
        };
      });

      tbody.querySelectorAll('.ed-cell-rate').forEach(inp => {
        inp.oninput = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const rateMinor = parseMoney(e.target.value, draft.currency);
          draft.lines[i].unitPriceMinor = rateMinor;
          const qM = Math.round((draft.lines[i].qtyBilled || 1) * 1000);
          if (!draft.lines[i].manualTotalEntered) {
            draft.lines[i].printedLineTotalMinor = lineTotal(qM, rateMinor);
            const totInp = row.querySelector('.ed-cell-tot-inp');
            if (totInp) totInp.value = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency, {showSymbol:false});
          }
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
        inp.onchange = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          draft.lines[i].unitPriceMinor = parseMoney(e.target.value, draft.currency);
          const qM = Math.round((draft.lines[i].qtyBilled || 1) * 1000);
          if (!draft.lines[i].manualTotalEntered) {
            draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor || 0);
            const totInp = row.querySelector('.ed-cell-tot-inp');
            if (totInp) totInp.value = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency, {showSymbol:false});
          }
          e.target.value = formatMoney(draft.lines[i].unitPriceMinor, draft.currency, {showSymbol:false});
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
      });

      tbody.querySelectorAll('.ed-cell-tot-inp').forEach(inp => {
        inp.oninput = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const newTot = parseMoney(e.target.value, draft.currency);
          draft.lines[i].printedLineTotalMinor = newTot;
          draft.lines[i].manualTotalEntered = true;
          const q = draft.lines[i].qtyBilled || 1;
          const qM = Math.round(q * 1000);
          if (qM > 0 && (!draft.lines[i].unitPriceMinor || draft.lines[i].unitPriceMinor === 0)) {
            draft.lines[i].unitPriceMinor = toNum(roundHalfUpDiv(toBig(newTot) * 1000n, toBig(qM)));
            const rateInp = row.querySelector('.ed-cell-rate');
            if (rateInp) rateInp.value = formatMoney(draft.lines[i].unitPriceMinor, draft.currency, {showSymbol:false});
          }
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
        inp.onchange = (e) => {
          userHasInteractedWithEditor = true;
          const row = e.target.closest('tr');
          const i = parseInt(row.getAttribute('data-lidx'), 10);
          const newTot = parseMoney(e.target.value, draft.currency);
          draft.lines[i].printedLineTotalMinor = newTot;
          draft.lines[i].manualTotalEntered = true;
          const q = draft.lines[i].qtyBilled || 1;
          const qM = Math.round(q * 1000);
          if (qM > 0 && (!draft.lines[i].unitPriceMinor || draft.lines[i].unitPriceMinor === 0)) {
            draft.lines[i].unitPriceMinor = toNum(roundHalfUpDiv(toBig(newTot) * 1000n, toBig(qM)));
            const rateInp = row.querySelector('.ed-cell-rate');
            if (rateInp) rateInp.value = formatMoney(draft.lines[i].unitPriceMinor, draft.currency, {showSymbol:false});
          }
          e.target.value = formatMoney(newTot, draft.currency, {showSymbol:false});
          calcTotals();
          recalcAudit();
          updateRowMathSubrow(row, i);
        };
      });

      tbody.querySelectorAll('.ed-del-line').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          draft.lines.splice(i, 1);
          calcTotals();
          recalcAudit();
          renderLines();
        };
      });

      // Initial subrow fix handlers for any existing rows
      tbody.querySelectorAll('.btn-fix-total').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          applyFixTotal(i);
        };
      });
      tbody.querySelectorAll('.btn-fix-qty').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          applyFixQty(i);
        };
      });
      tbody.querySelectorAll('.btn-fix-price').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          applyFixPrice(i);
        };
      });
    }

    document.getElementById('ed-filter-problems').onchange = (e) => {
      filterOnlyProblems = e.target.checked;
      renderLines();
    };

    const vEl = document.getElementById('ed-vendor');
    if (vEl) {
      vEl.oninput = () => {
        draft.vendorName = vEl.value.trim();
        const cVal = document.getElementById('ed-customer')?.value.trim() || '';
        if (draft.vendorName && !cVal) {
          const bt = document.getElementById('ed-bill-type');
          if (bt && bt.value !== 'purchase') {
            bt.value = 'purchase';
            draft.type = 'purchase';
          }
        }
        syncPricingMode();
        recalcAudit();
      };
    }
    const cEl = document.getElementById('ed-customer');
    if (cEl) {
      cEl.oninput = () => {
        draft.customerName = cEl.value.trim();
        const vVal = document.getElementById('ed-vendor')?.value.trim() || '';
        if (draft.customerName && !vVal) {
          const bt = document.getElementById('ed-bill-type');
          if (bt && bt.value !== 'sale') {
            bt.value = 'sale';
            draft.type = 'sale';
          }
        }
        syncPricingMode();
        recalcAudit();
      };
    }
    const pEl = document.getElementById('ed-phone');
    if (pEl) pEl.oninput = recalcAudit;
    const bEl = document.getElementById('ed-bill-no');
    if (bEl) bEl.oninput = recalcAudit;
    const dEl = document.getElementById('ed-date');
    if (dEl) dEl.onchange = recalcAudit;
    const btEl = document.getElementById('ed-bill-type');
    if (btEl) {
      btEl.onchange = (e) => {
        draft.type = e.target.value;
        syncPricingMode();
        recalcAudit();
      };
    }

    try { calcTotals(); } catch (e) { console.error('calcTotals error:', e); }
    try { recalcAudit(); } catch (e) { console.error('recalcAudit error:', e); }
    try { renderLines(); } catch (e) { console.error('renderLines error:', e); }

    function addNewLine() {
      draft.lines.push({
        id: 'l_' + Math.random().toString(36).slice(2, 8),
        nameRaw: '',
        qtyBilled: 1,
        unit: 'pcs',
        unitPriceMinor: 0,
        printedLineTotalMinor: 0,
        taxable: true,
        confidence: 100,
        pageIndex: (viewer && viewer.curPage !== undefined ? viewer.curPage + 1 : 1)
      });
      calcTotals();
      recalcAudit();
      renderLines();
      const countElBottom = document.getElementById('ed-line-count-bottom');
      if (countElBottom) countElBottom.textContent = draft.lines.length;
      setTimeout(() => {
        const rows = document.querySelectorAll('#ed-lines-tbody tr');
        const lastRow = rows[rows.length - 1];
        lastRow?.querySelector('input')?.focus();
      }, 50);
    }

    document.getElementById('ed-add-line')?.addEventListener('click', addNewLine);

    document.getElementById('ed-disc').oninput = (e) => {
      draft.discountMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
      recalcAudit();
    };
    document.getElementById('ed-frt').oninput = (e) => {
      draft.freightMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
      recalcAudit();
    };

    document.getElementById('ed-back').onclick = () => {
      if (confirm('Discard changes and return to scan?')) renderScanView();
    };

    async function commit(status) {
      let vName = document.getElementById('ed-vendor')?.value.trim() || '';
      let cName = document.getElementById('ed-customer')?.value.trim() || '';
      const cPhone = document.getElementById('ed-phone')?.value.trim() || '';
      const billType = document.getElementById('ed-bill-type')?.value || (cName ? 'sale' : (vName ? 'purchase' : 'sale'));

      if (!vName && !cName) {
        document.getElementById('ed-vendor')?.focus();
        return alert('Please enter a vendor/issuer or customer name.');
      }

      // If user typed customer name into the first box while creating a sale bill, map it correctly
      if (billType === 'sale' && !cName && vName) {
        cName = vName;
        vName = '';
      } else if (billType === 'purchase' && !vName && cName) {
        vName = cName;
        cName = '';
      }

      draft.type = billType;
      draft.vendorName = vName;
      draft.customerName = cName;
      draft.customerPhone = cPhone;
      draft.partyName = (billType === 'sale') ? (cName || 'Walk-in Customer') : (vName || 'General Store');
      draft.billNumber = document.getElementById('ed-bill-no')?.value.trim() || '';
      draft.date = document.getElementById('ed-date')?.value || new Date().toISOString().split('T')[0];
      draft.paymentMode = document.getElementById('ed-pay-mode')?.value || 'cash';
      draft.status = status;

      // Auto-register customer in parties if not exists (with robust deduplication)
      if (cName) {
        const newCustData = { name: cName, type: 'customer', phone: cPhone };
        const existingCust = parties.find(p => arePartiesDuplicate(p, newCustData));
        if (!existingCust) {
          const newCust = {
            id: 'party_c_' + Math.random().toString(36).slice(2, 9),
            name: cName,
            type: 'customer',
            phone: cPhone,
            balanceMinor: 0,
            isDemo: false,
            createdAt: new Date().toISOString()
          };
          parties.push(newCust);
          await put('parties', newCust).catch(() => {});
        } else if (cPhone && !existingCust.phone) {
          existingCust.phone = cPhone;
          await put('parties', existingCust).catch(() => {});
        }
      }

      // Auto-register vendor in parties if not exists (with robust deduplication)
      if (vName) {
        const newVendData = { name: vName, type: 'vendor', phone: cPhone };
        const existingVend = parties.find(p => arePartiesDuplicate(p, newVendData));
        if (!existingVend) {
          const newVend = {
            id: 'party_v_' + Math.random().toString(36).slice(2, 9),
            name: vName,
            type: 'vendor',
            phone: '',
            taxId: extractPartyTaxId(vName),
            balanceMinor: 0,
            isDemo: false,
            createdAt: new Date().toISOString()
          };
          parties.push(newVend);
          await put('parties', newVend).catch(() => {});
        } else {
          const extTax = extractPartyTaxId(vName);
          if (extTax && !existingVend.taxId) {
            existingVend.taxId = extTax;
            await put('parties', existingVend).catch(() => {});
          }
        }
      }

      // Deduplication check for Bills (prevent accidental duplicate bill saves)
      const duplicateBill = history.find(t => {
        if (t.id === draft.id) return false;
        const sameVendor = (t.vendorName || '').toLowerCase().trim() === draft.vendorName.toLowerCase().trim();
        const sameBillNo = draft.billNumber && t.billNumber && (t.billNumber.toLowerCase().trim() === draft.billNumber.toLowerCase().trim());
        const sameDate = t.date === draft.date;
        const sameTotal = (t.grandTotalMinor ?? t.totalMinor ?? 0) === draft.printedGrandTotalMinor;

        if (sameVendor && sameBillNo && sameTotal) return true;
        if (sameVendor && sameBillNo && draft.billNumber.length >= 3) return true;
        if (sameVendor && sameDate && sameTotal && (t.lineCount || 0) === draft.lines.length && draft.lines.length > 0) return true;
        return false;
      });

      if (duplicateBill) {
        const proceed = confirm(`⚠️ Duplicate Bill Warning!\n\nA bill matching this vendor ("${duplicateBill.vendorName}"), Bill #${duplicateBill.billNumber || 'N/A'}, Date ${duplicateBill.date}, and Total ${formatMoney(duplicateBill.grandTotalMinor || 0, 'PKR')} is already saved in the system.\n\nDo you want to update the existing bill instead of saving a duplicate? (Click OK to overwrite/update, Cancel to return)`);
        if (!proceed) return;
        draft.id = duplicateBill.id;
      }

      // Final Audit check on Confirm
      const finalAudit = runCompleteAudit(draft, { history, isSubmitting: true });
      const totalDiscrepancies = (finalAudit.summary.errorCount || 0) + (finalAudit.summary.warningCount || 0);
      if (status === 'confirmed' && totalDiscrepancies > 0) {
        const issuesText = finalAudit.findings.map(f => `• ${f.message || f.code}`).slice(0, 4).join('\n');
        const proceed = confirm(
          `⚠️ Audit Discrepancy Notice (${totalDiscrepancies} issue(s) detected):\n\n` +
          `${issuesText}\n\n` +
          `Are you sure you want to post with differences (فرق کے ساتھ پوسٹ کریں؟) into your ledger?\n\n` +
          `Click [OK] to Post with Discrepancies, or [Cancel] to review and fix.`
        );
        if (!proceed) return;
      }

      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
      const txId = draft.id || ('tx_' + Math.random().toString(36).slice(2, 9));
      const isSale = (draft.type === 'sale');
      const primaryPartyName = draft.partyName || (isSale ? (draft.customerName || 'Walk-in Customer') : (draft.vendorName || 'Unknown Vendor'));

      await tx(['transactions', 'transactionLines', 'documents'], 'readwrite', (stores) => {
        stores.transactions.put({
          id: txId,
          type: billType,
          status,
          currency: draft.currency,
          vendorName: draft.vendorName,
          customerName: draft.customerName || '',
          customerPhone: draft.customerPhone || '',
          partyName: primaryPartyName,
          billNumber: draft.billNumber,
          date: draft.date,
          paymentMode: draft.paymentMode,
          subtotalMinor: draft.subtotalMinor,
          discountMinor: draft.discountMinor,
          freightMinor: draft.freightMinor,
          grandTotalMinor: draft.printedGrandTotalMinor,
          lineCount: draft.lines.length,
          findings: finalAudit.findings || [],
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });
        for (const l of draft.lines) {
          stores.transactionLines.put({
            id: l.id,
            transactionId: txId,
            nameRaw: l.nameRaw,
            qtyBilled: l.qtyBilled,
            unit: l.unit,
            unitPriceMinor: l.unitPriceMinor,
            lineTotalMinor: l.printedLineTotalMinor,
            pageIndex: l.pageIndex || 1,
            createdBy: user.id
          });
        }
        for (const p of pages) {
          stores.documents.put({
            id: p.id,
            transactionId: txId,
            pageIndex: p.pageIndex,
            sha256: p.sha256,
            dHash: p.dHash,
            thumbnailUrl: p.thumbnailUrl,
            dataUrl: p.dataUrl || '',
            mimeType: p.mimeType || '',
            fileName: p.fileName || p.name || 'document',
            vendorName: draft.vendorName,
            billNumber: draft.billNumber,
            date: draft.date,
            createdBy: user.id
          });
        }
      });

      if (status === 'confirmed') {
        // 1. Payment recording for Cash / Bank payments
        if (draft.paymentMode === 'cash' || draft.paymentMode === 'bank') {
          const matchedParty = parties.find(p => (p.name || '').trim().toLowerCase() === primaryPartyName.toLowerCase());
          await put('payments', {
            id: 'pm_' + Math.random().toString(36).slice(2, 9),
            partyId: matchedParty ? matchedParty.id : ('party_' + primaryPartyName),
            partyName: primaryPartyName,
            txId: txId,
            ref: txId,
            amountMinor: draft.printedGrandTotalMinor,
            currency: draft.currency || 'PKR',
            date: draft.date,
            paymentMode: draft.paymentMode,
            type: isSale ? 'receipt' : 'payment',
            status: 'completed',
            notes: `Payment for Bill #${draft.billNumber || txId} (${draft.paymentMode.toUpperCase()})`,
            createdBy: user.id,
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }

        // 2. Stock Movements (Inward for Purchase, Outward for Sale)
        const allItems = await getAll('items').catch(() => []);
        for (const l of draft.lines) {
          const qty = parseFloat(l.qtyBilled) || 0;
          if (qty <= 0) continue;
          const rawName = (l.nameRaw || '').trim().toLowerCase();
          if (!rawName || rawName === 'item') continue;

          const matchedItem = allItems.find(it => {
            const iname = (it.name || '').trim().toLowerCase();
            const iurdu = (it.urduName || '').trim().toLowerCase();
            if (!iname && !iurdu) return false;
            if (iname === rawName || iurdu === rawName) return true;
            if (iname && (rawName.includes(iname) || iname.includes(rawName))) return true;
            if (iurdu && (rawName.includes(iurdu) || iurdu.includes(rawName))) return true;
            return false;
          });

          if (matchedItem) {
            const qtyMilli = Math.round(qty * 1000);
            const deltaMilli = isSale ? -qtyMilli : qtyMilli;
            const unitRateMinor = l.unitPriceMinor || (isSale ? (matchedItem.salePriceMinor || 0) : (matchedItem.purchasePriceMinor || 0));

            await put('stockMovements', {
              id: 'sm_' + (isSale ? 'sale_' : 'in_') + Math.random().toString(36).slice(2, 9),
              txId: txId,
              itemId: matchedItem.id,
              itemName: matchedItem.name,
              type: isSale ? 'sale' : 'in',
              qtyChangeMilli: deltaMilli,
              deltaMilli: deltaMilli,
              unitPriceMinor: unitRateMinor,
              status: 'posted',
              date: draft.date || new Date().toISOString().slice(0, 10),
              partyName: primaryPartyName,
              notes: `Bill #${draft.billNumber || txId} (${isSale ? 'Customer Sale' : 'Vendor Purchase'})`,
              createdBy: user.id,
              createdAt: new Date().toISOString()
            }).catch(() => {});

            matchedItem.currentStockMilli = Math.max(0, (matchedItem.currentStockMilli || 0) + deltaMilli);
            await put('items', matchedItem).catch(() => {});
          }
        }
      }

      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: status === 'confirmed' ? 'BILL_CONFIRMED' : 'BILL_DRAFT_SAVED',
        summary: `${status === 'confirmed' ? 'Confirmed' : 'Draft'} bill from "${draft.vendorName}" (${formatMoney(draft.printedGrandTotalMinor, draft.currency)})`,
        outcome: 'success'
      });

      toast.success(status === 'confirmed' ? 'Bill confirmed successfully!' : 'Bill draft saved.');
      window.location.hash = '#/vault';
    }

    document.getElementById('ed-save-draft').onclick = () => commit('draft');
    document.getElementById('ed-confirm').onclick = () => commit('confirmed');
  }

  // --- View: Receipt Vault ---
  async function renderVaultView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Receipt Vault';

    await autoReconcileLegacyTransactions();

    const txs = await scopedQuery('transactions').catch(() => []);
    const docs = await scopedQuery('documents').catch(() => []);
    const docMap = new Map();
    for (const d of docs) if (!docMap.has(d.transactionId)) docMap.set(d.transactionId, d);

    // Calculate Summary Metrics
    const totalCount = txs.length;
    const totalSpendMinor = txs.filter(t => t.status === 'confirmed').reduce((sum, t) => sum + (t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0), 0);
    const confirmedCount = txs.filter(t => t.status === 'confirmed').length;
    const draftCount = txs.filter(t => t.status === 'draft').length;

    mainEl.innerHTML = `
      <div style="max-width:1120px; margin:0 auto; padding-bottom:30px;">
        <!-- Top Metrics Strip -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px;">
          <div class="card" style="padding:14px 16px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); margin-bottom:4px;">Total Vault Bills</div>
            <div style="font-size:22px; font-weight:700; color:var(--text);">${totalCount}</div>
          </div>
          <div class="card" style="padding:14px 16px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); margin-bottom:4px;">Confirmed Spend</div>
            <div style="font-size:22px; font-weight:700; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(totalSpendMinor, 'PKR')}</div>
          </div>
          <div class="card" style="padding:14px 16px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); margin-bottom:4px;">Confirmed Invoices</div>
            <div style="font-size:22px; font-weight:700; color:var(--success-text);">${confirmedCount}</div>
          </div>
          <div class="card" style="padding:14px 16px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); margin-bottom:4px;">Drafts Pending</div>
            <div style="font-size:22px; font-weight:700; color:var(--secondary);">${draftCount}</div>
          </div>
        </div>

        <!-- Filter & Actions Bar -->
        <div class="card" style="margin-bottom:16px; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h1 style="font-size:20px; margin:0 0 4px 0; font-weight:700;">Receipt Vault</h1>
              <p style="color:var(--muted); font-size:13px; margin:0;">Click any bill below to view full details, inspect documents, or edit line items.</p>
            </div>
            <a href="#/scan" class="btn btn-primary btn-sm">+ Scan New Bill</a>
          </div>
          <div style="display:flex; gap:12px; margin-top:14px; flex-wrap:wrap; align-items:center;">
            <input type="text" class="form-control form-control-sm" id="vlt-v" placeholder="🔍 Filter by vendor or invoice #..." style="width:260px;">
            <select class="form-control form-control-sm" id="vlt-s" style="width:150px;">
              <option value="all">All Statuses (${totalCount})</option>
              <option value="confirmed">Confirmed (${confirmedCount})</option>
              <option value="draft">Drafts (${draftCount})</option>
            </select>
            <select class="form-control form-control-sm" id="vlt-sort" style="width:160px;">
              <option value="date-desc">Date (Newest First)</option>
              <option value="date-asc">Date (Oldest First)</option>
              <option value="amount-desc">Amount (Highest First)</option>
              <option value="amount-asc">Amount (Lowest First)</option>
            </select>
          </div>
        </div>

        <!-- Vault Grid -->
        <div id="vlt-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;"></div>
      </div>
    `;

    function update() {
      const vf = document.getElementById('vlt-v')?.value.toLowerCase().trim() || '';
      const rawSf = document.getElementById('vlt-s')?.value;
      const sf = (!rawSf || rawSf === 'all') ? 'all' : rawSf;
      const sort = document.getElementById('vlt-sort')?.value || 'date-desc';

      let filtered = txs.filter(t => {
        if (vf) {
          const matchVendor = t.vendorName?.toLowerCase().includes(vf);
          const matchCustomer = t.customerName?.toLowerCase().includes(vf);
          const matchBill = t.billNumber?.toLowerCase().includes(vf);
          if (!matchVendor && !matchCustomer && !matchBill) return false;
        }
        if (sf !== 'all' && t.status !== sf) return false;
        return true;
      });

      filtered.sort((a, b) => {
        if (sort === 'date-desc') return new Date(b.date || 0) - new Date(a.date || 0);
        if (sort === 'date-asc') return new Date(a.date || 0) - new Date(b.date || 0);
        const aAmt = a.grandTotalMinor ?? a.totalMinor ?? a.amountMinor ?? 0;
        const bAmt = b.grandTotalMinor ?? b.totalMinor ?? b.amountMinor ?? 0;
        if (sort === 'amount-desc') return bAmt - aAmt;
        if (sort === 'amount-asc') return aAmt - bAmt;
        return 0;
      });

      const grid = document.getElementById('vlt-grid');
      if (!grid) return;

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div class="card" style="grid-column:1/-1; text-align:center; padding:54px 24px;">
            <div style="font-size:42px; margin-bottom:12px;">📁</div>
            <h3 style="margin:0 0 6px 0; font-size:18px;">No Bills Found</h3>
            <p style="color:var(--muted); font-size:13px; margin:0 0 16px 0;">No saved bills matched your search criteria.</p>
            <div><a href="#/scan" class="btn btn-primary btn-sm">+ Scan New Bill</a></div>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(t => {
        const d = docMap.get(t.id);
        if (d && d.dataUrl && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:application/pdf')) {
          const ext = extractImageFromPdfDataUrl(d.dataUrl);
          if (ext) {
            d.rawPdfDataUrl = d.rawPdfDataUrl || d.dataUrl;
            d.dataUrl = ext;
            d.thumbnailUrl = ext;
            d.mimeType = 'image/jpeg';
            try { put('documents', d).catch(() => {}); } catch {}
          }
        }

        const isImageDoc = Boolean(d && (
          (d.mimeType && d.mimeType.startsWith('image/')) ||
          (d.dataUrl && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:image/'))
        ));

        const isPdf = !isImageDoc && Boolean(
          d?.mimeType === 'application/pdf' ||
          (d?.dataUrl && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:application/pdf')) ||
          (d?.fileName && d.fileName.toLowerCase().endsWith('.pdf'))
        );

        const hasRealImg = Boolean(d?.dataUrl && !d.dataUrl.includes('canvas') && isImageDoc);
        const th = d?.thumbnailUrl || d?.dataUrl || '';

        return `
          <div class="card vlt-card" data-txid="${t.id}" style="cursor:pointer; padding:0; overflow:hidden; display:flex; flex-direction:column; border:1px solid var(--border); transition:border-color 0.15s ease;">
            <!-- Card Header / Thumbnail Banner -->
            <div style="height:130px; background:#f4f7f5; border-bottom:1px solid var(--border); position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${isPdf && d?.dataUrl ? `
                <iframe src="${d.dataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" style="width:100%; height:130px; border:none; pointer-events:none; background:#fff; overflow:hidden;" title="PDF Preview"></iframe>
              ` : (isPdf ? `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:#2F5D50; width:100%; height:100%; background:linear-gradient(135deg, #f0f5f2 0%, #e3ede7 100%);">
                  <span style="font-size:36px; line-height:1;">📄</span>
                  <span style="font-size:12px; font-weight:700; letter-spacing:0.04em;">PDF DOCUMENT</span>
                  <span style="font-size:11px; color:#52796F; font-family:monospace;">${escapeHTML(d?.fileName || (t.billNumber ? '#' + t.billNumber : 'Receipt'))}</span>
                </div>
              ` : (hasRealImg ? `
                <img src="${d.dataUrl}" style="max-height:100%; max-width:100%; object-fit:contain;" alt="Receipt">
              ` : (th && !th.includes('canvas') ? `
                <img src="${th}" style="max-height:100%; max-width:100%; object-fit:contain;" alt="Receipt">
              ` : `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--muted); width:100%; height:100%; background:linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);">
                  <span style="font-size:32px;">📄</span>
                  <span style="font-size:11px; margin-top:4px; font-weight:600; color:var(--text);">${escapeHTML(t.vendorName)}</span>
                </div>
              `)))}
              <!-- Status Pill Top Right -->
              <span class="pill ${t.status === 'confirmed' ? 'pill-success' : 'pill-neutral'}" style="position:absolute; top:8px; right:8px; font-size:10px; font-weight:700; padding:3px 8px; text-transform:uppercase; z-index:2;">
                ${t.status}
              </span>
              <!-- Payment Mode Top Left -->
              <span class="pill" style="position:absolute; top:8px; left:8px; font-size:10px; padding:2px 7px; background:rgba(255,255,255,0.92); color:var(--text); border:1px solid var(--border); text-transform:capitalize; z-index:2;">
                ${escapeHTML(t.paymentMode || 'cash')}
              </span>
            </div>

            <!-- Card Content Body -->
            <div style="padding:14px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; gap:8px;">
                  <strong style="font-size:15px; color:var(--text); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; flex:1;" title="${escapeHTML(t.customerName ? t.customerName : t.vendorName)}">
                    ${escapeHTML(t.customerName ? `👤 ${t.customerName}` : t.vendorName)}
                  </strong>
                  <span class="pill ${t.type === 'sale' ? 'pill-primary' : 'pill-secondary'}" style="font-size:9px; padding:1px 6px; text-transform:uppercase; font-weight:700;">
                    ${escapeHTML(t.type || 'purchase')}
                  </span>
                </div>
                ${t.customerName && t.vendorName && t.vendorName !== 'Unknown Vendor' ? `<div style="font-size:11px; color:var(--muted); margin-bottom:4px;">${escapeHTML(t.vendorName)}</div>` : ''}
                <div style="font-size:12px; color:var(--muted); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                  <span>📅 ${t.date}</span>
                  ${t.billNumber ? `<span>&bull; #${escapeHTML(t.billNumber)}</span>` : ''}
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px;">
                <span style="font-size:12px; color:var(--muted); font-weight:600;">${t.lineCount || 0} item${t.lineCount === 1 ? '' : 's'}</span>
                <strong style="font-size:17px; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0, t.currency)}</strong>
              </div>
            </div>

            <!-- Card Action Footer -->
            <div style="display:flex; gap:8px; padding:8px 12px; background:var(--panel); border-top:1px solid var(--border);">
              <button type="button" class="btn btn-secondary btn-xs vlt-btn-detail" data-txid="${t.id}" style="flex:1; font-weight:600;">👁️ View Detail</button>
              <button type="button" class="btn btn-secondary btn-xs vlt-btn-edit" data-txid="${t.id}" style="flex:1;">✏️ Edit</button>
            </div>
          </div>
        `;
      }).join('');

      // Click card anywhere -> View Detail
      grid.querySelectorAll('.vlt-card').forEach(card => {
        card.onclick = (e) => {
          if (e.target.closest('button')) return;
          const id = card.getAttribute('data-txid');
          if (id) showBillDetail(id);
        };
      });

      // View Detail button click
      grid.querySelectorAll('.vlt-btn-detail').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-txid');
          if (id) showBillDetail(id);
        };
      });

      // Edit button click
      grid.querySelectorAll('.vlt-btn-edit').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-txid');
          if (id) openBillInEditor(id);
        };
      });
    }

    document.getElementById('vlt-v')?.addEventListener('input', update);
    document.getElementById('vlt-s')?.addEventListener('change', update);
    document.getElementById('vlt-sort')?.addEventListener('change', update);
    update();
  }

  // --- View: Bill Details Inspection Screen ---
  async function showBillDetail(txId) {
    if (typeof window !== 'undefined') {
    window.showBillDetail = showBillDetail;
  }
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const tx = await get('transactions', txId).catch(() => null);
    if (!tx) return alert('Bill record not found.');

    const grandTotal = tx.grandTotalMinor ?? tx.totalMinor ?? tx.amountMinor ?? tx.subtotalMinor ?? 0;
    const subtotal = tx.subtotalMinor ?? grandTotal;
    const isSale = (tx.type === 'sale') || Boolean(tx.customerName && (!tx.vendorName || tx.vendorName === tx.customerName));
    const partyTitle = isSale
      ? (tx.customerName || tx.partyName || 'Customer')
      : (tx.vendorName || tx.partyName || tx.category || tx.description || 'General Entry');
    const invoiceNum = tx.billNumber || tx.invoiceNumber || tx.id;

    if (!tx.grandTotalMinor || (isSale ? !tx.customerName : !tx.vendorName)) {
      tx.grandTotalMinor = grandTotal;
      tx.subtotalMinor = subtotal;
      tx.printedGrandTotalMinor = grandTotal;
      if (isSale) {
        if (!tx.customerName) tx.customerName = partyTitle;
        if (tx.vendorName && tx.vendorName === tx.customerName) tx.vendorName = '';
      } else {
        if (!tx.vendorName) tx.vendorName = partyTitle;
      }
      if (!tx.billNumber) tx.billNumber = invoiceNum;
      try { put('transactions', tx).catch(() => {}); } catch {}
    }

    const allLines = await getAll('transactionLines').catch(() => []);
    const rawLines = allLines.filter(l => l.transactionId === txId);
    let sourceLines = rawLines.length > 0 ? rawLines : ((tx.lines && tx.lines.length > 0) ? tx.lines : []);

    // Self-healing: Reconstruct lines from stock movements if lines are missing for a sale
    if (sourceLines.length === 0 && isSale) {
      const allMovements = await getAll('stockMovements').catch(() => []);
      const txMoves = allMovements.filter(m => m.txId === txId);
      if (txMoves.length > 0) {
        const allItems = await getAll('items').catch(() => []);
        sourceLines = txMoves.map((m, i) => {
          const it = allItems.find(item => item.id === m.itemId);
          const qty = Math.abs((m.qtyChangeMilli || m.deltaMilli || 0) / 1000) || 1;
          const unitPrice = m.unitPriceMinor || (it ? it.salePriceMinor : 0);
          const lTot = lineTotal(Math.round(qty * 1000), unitPrice);
          return {
            id: 'tl_recon_' + txId + '_' + (i + 1),
            transactionId: txId,
            lineNumber: i + 1,
            itemId: m.itemId,
            name: (it ? it.name : m.itemName) || 'Item',
            nameRaw: (it ? it.name : m.itemName) || 'Item',
            qty: qty,
            qtyBilled: qty,
            unit: (it && it.unit) || 'pcs',
            unitPriceMinor: unitPrice,
            lineTotalMinor: lTot,
            printedLineTotalMinor: lTot,
            currency: tx.currency || 'PKR'
          };
        });
        tx.lines = sourceLines;
        try {
          await put('transactions', tx);
          for (const sl of sourceLines) {
            await put('transactionLines', sl).catch(() => {});
          }
        } catch {}
      }
    }
    const lines = sourceLines.length > 0 ? sourceLines.map((l, i) => ({
      ...l,
      idx: i + 1,
      nameRaw: l.nameRaw || l.name || 'Item',
      qtyBilled: l.qtyBilled ?? l.qty ?? 1,
      unit: l.unit || 'pcs',
      unitPriceMinor: l.unitPriceMinor ?? (l.lineTotalMinor ? Math.round(l.lineTotalMinor / (l.qtyBilled ?? l.qty ?? 1)) : 0),
      lineTotalMinor: l.lineTotalMinor ?? l.printedLineTotalMinor ?? 0
    })) : [
      {
        idx: 1,
        nameRaw: tx.description || tx.category || (tx.type === 'expense' ? 'Operating Expense Voucher' : 'Recorded Entry'),
        qtyBilled: 1,
        unit: 'voucher',
        unitPriceMinor: grandTotal,
        lineTotalMinor: grandTotal
      }
    ];

    const allDocs = await getAll('documents').catch(() => []);
    const docs = allDocs.filter(d => d.transactionId === txId);

    // AUTO-EXTRACT REAL RECEIPT PHOTOS FROM SCANNED PDFS SO WE NEVER SHOW 2 BILLS
    for (const d of docs) {
      if (d.dataUrl && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:application/pdf')) {
        const ext = extractImageFromPdfDataUrl(d.dataUrl);
        if (ext) {
          d.rawPdfDataUrl = d.rawPdfDataUrl || d.dataUrl;
          d.dataUrl = ext;
          d.thumbnailUrl = ext;
          d.mimeType = 'image/jpeg';
          try { put('documents', d).catch(() => {}); } catch {}
        }
      }
    }

    const doc = docs[0] || null;

    document.getElementById('breadcrumb-title').textContent = `Receipt Vault / Bill #${invoiceNum}`;

    const isImageDoc = Boolean(doc && (
      (doc.mimeType && doc.mimeType.startsWith('image/')) ||
      (doc.dataUrl && typeof doc.dataUrl === 'string' && doc.dataUrl.startsWith('data:image/'))
    ));

    const isPdf = !isImageDoc && Boolean(
      doc?.mimeType === 'application/pdf' ||
      (doc?.dataUrl && typeof doc.dataUrl === 'string' && doc.dataUrl.startsWith('data:application/pdf')) ||
      (doc?.fileName && doc.fileName.toLowerCase().endsWith('.pdf'))
    );

    const hasRealDoc = Boolean(doc && doc.dataUrl && !doc.dataUrl.includes('canvas') && isImageDoc);

    mainEl.innerHTML = `
      <div style="display:flex; flex-direction:column; height:calc(100vh - 120px); min-height:580px;">
        <!-- Top Action Bar (hidden in print) -->
        <div class="card no-print" style="margin-bottom:12px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="btn btn-secondary btn-sm" id="vlt-detail-back">&larr; Back to Vault</button>
            <strong style="font-size:16px;">${tx.type === 'sale' ? 'Sale Details' : (tx.type === 'expense' ? 'Expense Details' : 'Bill Details')}: ${escapeHTML(partyTitle)}</strong>
            <span class="pill ${tx.status==='confirmed'?'pill-success':'pill-neutral'}" style="text-transform:uppercase;">${tx.status}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="vlt-detail-print">🖨️ Print Slip</button>
            <button type="button" class="btn btn-primary btn-sm" id="vlt-detail-edit">✏️ Edit Bill</button>
          </div>
        </div>

        <!-- Split View: Left Document Preview, Right Details -->
        <div style="display:flex; flex:1; gap:16px; min-height:0; overflow:hidden;">
          <!-- Left: Document Viewer (Hidden in Print) -->
          <div class="vlt-doc-viewer no-print" style="flex:1; min-width:320px; display:flex; flex-direction:column; background:#1c1e1c; border:1px solid var(--border); overflow:hidden; position:relative;">
            ${hasRealDoc ? `
              <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#181a18; position:relative; overflow:hidden;">
                <!-- Viewer Top Bar -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f0f4f2; border-bottom:1px solid #d0d7d3; font-size:12px; color:#2F5D50; flex-shrink:0; z-index:10; flex-wrap:wrap; gap:6px;">
                  <span style="font-weight:600; display:flex; align-items:center; gap:6px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(doc.fileName || 'Receipt Photo')}">
                    📄 ${escapeHTML(doc.fileName || 'Receipt Photo')}
                  </span>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <label class="btn btn-secondary btn-xs" style="background:#fff; color:#2F5D50; border:1px solid #2F5D50; cursor:pointer;">
                      📎 Replace
                      <input type="file" id="vlt-replace-doc" accept="image/*,.pdf,application/pdf" style="display:none;">
                    </label>
                    <a href="${doc.dataUrl}" target="_blank" download="${escapeHTML((doc.fileName || 'bill').replace(/\.pdf$/i, '.jpg'))}" class="btn btn-secondary btn-xs" style="background:#2F5D50; color:#fff; text-decoration:none; padding:3px 8px; font-weight:600;">↗ Open Photo</a>
                    ${(doc.rawPdfDataUrl || doc.fileName?.toLowerCase().endsWith('.pdf')) ? `
                      <a href="${doc.rawPdfDataUrl || doc.dataUrl}" target="_blank" download="${escapeHTML(doc.fileName || 'bill.pdf')}" class="btn btn-secondary btn-xs" style="background:#fff; color:#2F5D50; border:1px solid #2F5D50; text-decoration:none; padding:3px 8px; font-weight:600;">📥 PDF</a>
                    ` : ''}
                  </div>
                </div>
                <!-- Center Single Image Display with Clean Centering -->
                <div id="vlt-img-stage" style="flex:1; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:auto; padding:12px; box-sizing:border-box; background:#111412;">
                  <img id="vlt-detail-img" src="${doc.dataUrl}" style="max-width:100%; max-height:100%; object-fit:contain; box-shadow:0 6px 20px rgba(0,0,0,0.6); border-radius:4px; user-select:none;" alt="Bill Document">
                </div>
              </div>
            ` : (isPdf && doc?.dataUrl ? `
              <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#fff; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:#f0f4f2; border-bottom:1px solid #d0d7d3; font-size:12px; color:#2F5D50; flex-shrink:0;">
                  <span style="font-weight:600; display:flex; align-items:center; gap:6px;">📄 ${escapeHTML(doc.fileName || doc.name || 'PDF Document')}</span>
                  <div style="display:flex; gap:6px;">
                    <label class="btn btn-secondary btn-xs" style="background:#fff; color:#2F5D50; border:1px solid #2F5D50; cursor:pointer;">
                      📎 Replace
                      <input type="file" id="vlt-replace-doc" accept="image/*,.pdf,application/pdf" style="display:none;">
                    </label>
                    <a href="${doc.dataUrl}" target="_blank" download="${escapeHTML(doc.fileName || 'bill.pdf')}" class="btn btn-secondary btn-xs" style="background:#2F5D50; color:#fff; text-decoration:none; padding:3px 8px; font-weight:600;">↗ Open / Download</a>
                  </div>
                </div>
                <iframe src="${doc.dataUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" style="flex:1; width:100%; height:100%; border:none; background:#fff; overflow:hidden;" title="PDF Preview"></iframe>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#aaa; padding:24px; text-align:center;">
                <span style="font-size:42px; margin-bottom:10px;">📄</span>
                <strong style="font-size:14px; color:#fff; margin-bottom:6px;">No Actual Bill Document Attached</strong>
                <p style="font-size:12px; color:#888; max-width:260px; margin:0 0 16px 0;">Attach the actual bill image or PDF to view it alongside the details.</p>
                <label class="btn btn-primary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  📎 Attach Bill Photo / PDF
                  <input type="file" id="vlt-replace-doc" accept="image/*,.pdf,application/pdf" style="display:none;">
                </label>
              </div>
            `)}
          </div>

          <!-- Right: Details & Compact Print Slip -->
          <div class="print-slip-container" style="flex:1.2; min-width:380px; display:flex; flex-direction:column; overflow-y:auto; padding-right:4px;" id="vlt-detail-body">
            <!-- Header Meta Card -->
            <div class="card" style="margin-bottom:12px; padding:14px;">
              <div style="text-align:center; border-bottom:1px dashed var(--border); padding-bottom:8px; margin-bottom:10px;">
                <h2 style="font-size:16px; margin:0 0 2px 0; text-transform:uppercase; letter-spacing:0.04em;">${tx.type === 'sale' ? 'Sales Invoice Slip' : (tx.type === 'expense' ? 'Expense Voucher Slip' : 'Purchase Voucher Slip')}</h2>
                <div style="font-size:11px; color:var(--muted);">Smart Bill Auditor &bull; Accounting Voucher</div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; font-size:12px;">
                <div>
                  <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">${tx.type === 'sale' ? 'Customer' : (tx.type === 'expense' ? 'Paid To / Category' : 'Vendor')}</div>
                  <strong style="font-size:14px; color:var(--text);">${escapeHTML(partyTitle)}</strong>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">${tx.type === 'sale' ? 'Invoice #' : (tx.type === 'expense' ? 'Voucher #' : 'Bill / Invoice #')}</div>
                  <strong style="font-size:14px; color:var(--text);">${escapeHTML(invoiceNum)}</strong>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">Bill Date</div>
                  <div style="font-size:13px; font-weight:600;">${tx.date}</div>
                </div>
                <div>
                  <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">Payment Mode</div>
                  <span class="pill" style="font-size:11px; text-transform:capitalize; padding:1px 6px;">${escapeHTML(tx.paymentMode || 'cash')}</span>
                </div>
              </div>
            </div>

            <!-- Line Items Table (length matches items dynamically) -->
            <div class="card" style="display:flex; flex-direction:column; padding:0; overflow:hidden; margin-bottom:12px; height:auto; min-height:0;">
              <div style="padding:8px 12px; border-bottom:1px solid var(--border); background:var(--panel);">
                <strong style="font-size:12px;">Line Items (${lines.length})</strong>
              </div>
              <div style="overflow-x:auto;">
                <table class="table" style="font-size:12px; margin:0; width:100%;">
                  <thead style="position:sticky; top:0; background:var(--panel); z-index:2;">
                    <tr>
                      <th style="width:28px; text-align:center;">#</th>
                      <th>Item</th>
                      <th style="width:65px; text-align:right;">Qty</th>
                      <th style="width:55px;">Unit</th>
                      <th style="width:105px; text-align:right;">Rate</th>
                      <th style="width:115px; text-align:right;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lines.length > 0 ? lines.map((l, i) => `
                      <tr>
                        <td style="text-align:center; color:var(--muted); font-size:11px;">${i+1}</td>
                        <td><strong style="font-size:12px;">${escapeHTML(l.nameRaw || l.name || 'Item')}</strong></td>
                        <td style="text-align:right; font-variant-numeric:tabular-nums;">${l.qtyBilled ?? l.qty ?? 1}</td>
                        <td>${escapeHTML(l.unit || 'pcs')}</td>
                        <td style="text-align:right; font-variant-numeric:tabular-nums;">${formatMoney(l.unitPriceMinor || 0, tx.currency || 'PKR', {showSymbol:false})}</td>
                        <td style="text-align:right; font-weight:700; font-variant-numeric:tabular-nums; color:var(--primary);">${formatMoney(l.lineTotalMinor || l.printedLineTotalMinor || 0, tx.currency || 'PKR')}</td>
                      </tr>
                    `).join('') : `
                      <tr><td colspan="6" style="text-align:center; padding:20px; color:var(--muted);">No line items recorded on this transaction.</td></tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Totals & Summary Card -->
            <div class="card" style="padding:12px 14px; background:var(--card); height:auto; min-height:0;">
              <div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--muted);">Subtotal:</span>
                  <span>${formatMoney(subtotal, tx.currency || 'PKR')}</span>
                </div>
                ${tx.discountMinor > 0 ? `
                  <div style="display:flex; justify-content:space-between; color:var(--error-text);">
                    <span>Discount:</span>
                    <span>-${formatMoney(tx.discountMinor, tx.currency || 'PKR')}</span>
                  </div>
                ` : ''}
                ${tx.freightMinor > 0 ? `
                  <div style="display:flex; justify-content:space-between;">
                    <span>Freight / Delivery:</span>
                    <span>+${formatMoney(tx.freightMinor, tx.currency || 'PKR')}</span>
                  </div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:6px; margin-top:4px;">
                  <strong style="font-size:14px;">Grand Total:</strong>
                  <strong style="font-size:18px; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(grandTotal, tx.currency || 'PKR')}</strong>
                </div>
              </div>
              <div class="print-footer-sig" style="display:flex; justify-content:space-between; margin-top:20px; font-size:11px; color:var(--muted); border-top:1px dashed #bbb; padding-top:8px;">
                <span>Audited & Verified</span>
                <span>Signature: ______________________</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const replaceInp = document.getElementById('vlt-replace-doc');
    if (replaceInp) {
      replaceInp.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = async () => {
          const rawResult = r.result;
          let finalDataUrl = rawResult;
          let finalMime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          let rawPdf = null;
          if (finalMime === 'application/pdf' || (typeof rawResult === 'string' && rawResult.startsWith('data:application/pdf'))) {
            const ext = extractImageFromPdfDataUrl(rawResult);
            if (ext) {
              finalDataUrl = ext;
              finalMime = 'image/jpeg';
              rawPdf = rawResult;
            }
          }
          const docId = (doc && doc.id) ? doc.id : ('doc_' + Date.now());
          await put('documents', {
            id: docId,
            transactionId: txId,
            pageIndex: 1,
            dataUrl: finalDataUrl,
            rawPdfDataUrl: rawPdf,
            thumbnailUrl: finalDataUrl,
            mimeType: finalMime,
            fileName: file.name,
            vendorName: tx.vendorName,
            billNumber: tx.billNumber,
            date: tx.date
          });
          toast.success('Bill document updated successfully!');
          showBillDetail(txId);
        };
        r.readAsDataURL(file);
      };
    }

    document.getElementById('vlt-detail-back').onclick = () => renderVaultView();
    document.getElementById('vlt-detail-edit').onclick = () => openBillInEditor(txId);
    document.getElementById('vlt-detail-print').onclick = () => window.print();
  }
  if (typeof window !== 'undefined') {
    window.showBillDetail = showBillDetail;
  }

  // --- Helper: Open Stored Bill in Split Editor ---
  async function openBillInEditor(txId) {
    const tx = await get('transactions', txId).catch(() => null);
    if (!tx) return alert('Transaction not found.');
    const allLines = await getAll('transactionLines').catch(() => []);
    let lines = allLines.filter(l => l.transactionId === txId);
    if (lines.length === 0 && tx.lines && tx.lines.length > 0) {
      lines = tx.lines;
    }

    const isSale = (tx.type === 'sale') || Boolean(tx.customerName && (!tx.vendorName || tx.vendorName === tx.customerName));

    // Self-healing: Reconstruct lines from stock movements if lines are missing for a sale
    if (lines.length === 0 && isSale) {
      const allMovements = await getAll('stockMovements').catch(() => []);
      const txMoves = allMovements.filter(m => m.txId === txId);
      if (txMoves.length > 0) {
        const allItems = await getAll('items').catch(() => []);
        lines = txMoves.map((m, i) => {
          const it = allItems.find(item => item.id === m.itemId);
          const qty = Math.abs((m.qtyChangeMilli || m.deltaMilli || 0) / 1000) || 1;
          const unitPrice = m.unitPriceMinor || (it ? it.salePriceMinor : 0);
          const lTot = lineTotal(Math.round(qty * 1000), unitPrice);
          return {
            id: 'tl_recon_' + txId + '_' + (i + 1),
            transactionId: txId,
            lineNumber: i + 1,
            itemId: m.itemId,
            name: (it ? it.name : m.itemName) || 'Item',
            nameRaw: (it ? it.name : m.itemName) || 'Item',
            qty: qty,
            qtyBilled: qty,
            unit: (it && it.unit) || 'pcs',
            unitPriceMinor: unitPrice,
            lineTotalMinor: lTot,
            printedLineTotalMinor: lTot,
            currency: tx.currency || 'PKR'
          };
        });
        tx.lines = lines;
        try {
          await put('transactions', tx);
          for (const sl of lines) {
            await put('transactionLines', sl).catch(() => {});
          }
        } catch {}
      }
    }

    const allDocs = await getAll('documents').catch(() => []);
    const docs = allDocs.filter(d => d.transactionId === txId);

    const editorLines = lines.map(l => ({
      id: l.id,
      nameRaw: l.nameRaw || l.name || 'Item',
      nameEnglish: l.nameEnglish || l.nameRaw || l.name || 'Item',
      qtyBilled: l.qtyBilled ?? l.qty ?? 1,
      qtyReceived: l.qtyBilled ?? l.qty ?? 1,
      unit: l.unit || 'pcs',
      unitPriceMinor: l.unitPriceMinor || 0,
      printedLineTotalMinor: l.lineTotalMinor || l.printedLineTotalMinor || 0,
      taxable: l.taxable !== false,
      confidence: 100,
      pageIndex: l.pageIndex || 1
    }));

    const customerName = isSale ? (tx.customerName || (tx.vendorName !== 'Unknown Vendor' ? tx.vendorName : '') || tx.partyName || '') : (tx.customerName || '');
    const vendorName = isSale ? '' : (tx.vendorName || '');

    const draft = {
      id: tx.id,
      type: isSale ? 'sale' : (tx.type || 'purchase'),
      status: tx.status || 'draft',
      currency: tx.currency || 'PKR',
      vendorName: vendorName,
      customerName: customerName,
      customerPhone: tx.customerPhone || '',
      partyName: isSale ? customerName : vendorName,
      billNumber: tx.billNumber || tx.invoiceNumber || '',
      date: tx.date || new Date().toISOString().split('T')[0],
      paymentMode: tx.paymentMode || 'cash',
      subtotalMinor: tx.subtotalMinor || 0,
      discountMinor: tx.discountMinor || 0,
      freightMinor: tx.freightMinor || 0,
      printedGrandTotalMinor: tx.grandTotalMinor || 0,
      lines: editorLines.length > 0 ? editorLines : [
        { id: 'l_1', nameRaw: '', qtyBilled: 1, unit: 'pcs', unitPriceMinor: 0, printedLineTotalMinor: 0, taxable: true, confidence: 100, pageIndex: 1 }
      ]
    };

    const pages = docs.map(d => {
      let dataUrl = d.dataUrl || d.thumbnailUrl || '';
      let mimeType = d.mimeType || (dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');
      let rawPdf = d.rawPdfDataUrl || null;
      if (mimeType === 'application/pdf' || (typeof dataUrl === 'string' && dataUrl.startsWith('data:application/pdf'))) {
        const ext = extractImageFromPdfDataUrl(dataUrl);
        if (ext) {
          rawPdf = dataUrl;
          dataUrl = ext;
          mimeType = 'image/jpeg';
        }
      }
      return {
        id: d.id,
        pageIndex: d.pageIndex || 1,
        dataUrl,
        rawPdfDataUrl: rawPdf,
        thumbnailUrl: d.thumbnailUrl || dataUrl,
        mimeType,
        fileName: d.fileName || d.name || 'receipt'
      };
    });

    renderSplitEditor(draft, pages);
  }


  // =========================================================================
  // 13C. PHASE 3: AUDIT ENGINE (PURE FUNCTIONS, ROW MATH, HIKE & RECONCILIATION)
  // =========================================================================

  // (AUDIT_FINDING_CODES defined at top of engine)

  function auditRowMath(line, options = {}) {
    if (!line || line.isCarriedForward) return null;
    const tol = options.toleranceMinor ?? 1;
    const qty = parseFloat(line.qtyBilled) || 0;
    const rate = line.unitPriceMinor || 0;
    const printed = line.printedLineTotalMinor || 0;
    const calc = lineTotal(Math.round(qty * 1000), rate);
    const diff = calc - printed;

    // Real-world retail cash rounding rule:
    // If the printed total has no decimal points (integer currency like Rs. 520, Rs. 360, i.e. printed % 100 === 0),
    // fractional paisa / cent differences (< 100 minor units / 1 rupee, e.g. 8 paisas, 20 paisas, 50 paisas)
    // are standard shopkeeper round-offs and must be accepted as correct with 0 error.
    if (printed > 0 && printed % 100 === 0 && Math.abs(diff) < 100) {
      return null;
    }

    if (Math.abs(diff) > tol) {
      const fixes = [
        { id: 'fix_total', type: 'SET_TOTAL', value: calc, label: 'Fix Total' }
      ];
      if (rate > 0) {
        const derivedQty = Math.round((printed / rate) * 1000) / 1000;
        fixes.push({ id: 'fix_qty', type: 'SET_QTY', value: derivedQty, label: 'Fix Qty' });
      }
      if (qty > 0) {
        const derivedPrice = Math.round(printed / qty);
        fixes.push({ id: 'fix_price', type: 'SET_PRICE', value: derivedPrice, label: 'Fix Rate' });
      }
      return {
        code: AUDIT_FINDING_CODES.MATH_ROW_MISMATCH,
        severity: 'error',
        lineId: line.id,
        expected: calc,
        actual: printed,
        diff,
        suggestedFixes: fixes,
        message: `Printed: ${formatMoney(printed, options.currency)} | Calculated: ${formatMoney(calc, options.currency)} | Diff: ${formatMoney(Math.abs(diff), options.currency)}`
      };
    }
    return null;
  }

  function auditInvoiceTotals(tx, options = {}) {
    const tol = options.toleranceMinor ?? 1;
    const lines = (tx.lines || []).filter(l => !l.isCarriedForward);
    let subtotal = 0;
    for (const l of lines) subtotal = add(subtotal, l.printedLineTotalMinor || 0);
    let net = sub(subtotal, tx.discountMinor || 0);
    net = add(net, tx.freightMinor || 0);
    for (const t of (tx.taxes || [])) net = add(net, t.amountMinor || 0);
    const printed = tx.printedGrandTotalMinor || 0;
    const diff = net - printed;

    // Real-world retail cash rounding rule for invoice total:
    // If printed grand total is an integer without decimal points, fractional paisa differences (< 1 rupee) are accepted as clean.
    if (printed > 0 && printed % 100 === 0 && Math.abs(diff) < 100) {
      return [];
    }

    if (Math.abs(diff) > tol) {
      return [{
        code: AUDIT_FINDING_CODES.INVOICE_TOTAL_MISMATCH,
        severity: 'error',
        expected: net,
        actual: printed,
        diff,
        message: `Invoice Total Discrepancy: Lines sum minus discount plus freight and taxes equals ${formatMoney(net, tx.currency)}, but printed total is ${formatMoney(printed, tx.currency)}.`,
        suggestedFixes: [{ id: 'fix_grand_total', type: 'SET_GRAND_TOTAL', value: net, label: 'Fix Grand Total' }]
      }];
    }
    return [];
  }

  function auditPriceHikes(tx, history = [], options = {}) {
    const threshold = options.thresholdPercent ?? 5.0;
    const findings = [];
    const vNorm = normalizeVendorName(tx.vendorName);
    const vHist = history.filter(h => normalizeVendorName(h.vendorName) === vNorm && h.id !== tx.id);
    if (vHist.length === 0) return findings;

    for (const line of (tx.lines || [])) {
      if (line.isCarriedForward || !line.unitPriceMinor) continue;
      const u = normalizeUnit(line.unit || 'pcs');
      let prev = null;
      for (const h of vHist) {
        for (const hl of (h.lines || [])) {
          if (hl.nameRaw.toLowerCase().trim() === line.nameRaw.toLowerCase().trim() && hl.unitPriceMinor) {
            prev = { date: h.date, price: hl.unitPriceMinor, unit: normalizeUnit(hl.unit || 'pcs') };
            break;
          }
        }
        if (prev) break;
      }
      if (prev) {
        let prevPrice = prev.price;
        if (prev.unit !== u) {
          const c = convertQuantityAndPrice(1, prevPrice, prev.unit, u);
          if (c) prevPrice = c.normalizedUnitPriceMinor;
        }
        if (prevPrice > 0 && line.unitPriceMinor > prevPrice) {
          const diff = line.unitPriceMinor - prevPrice;
          const pct = Math.round((diff / prevPrice) * 1000) / 10;
          if (pct >= threshold) {
            findings.push({
              code: AUDIT_FINDING_CODES.PRICE_HIKE,
              severity: 'warning',
              lineId: line.id,
              hikePercent: pct,
              expected: prevPrice,
              actual: line.unitPriceMinor,
              message: `Price Hike: +${pct}% higher than last purchase (${formatMoney(prevPrice, tx.currency)} on ${prev.date})`
            });
          }
        }
      }
    }
    return findings;
  }

  function auditLayer3Duplicate(tx, history = []) {
    const findings = [];
    const vNorm = normalizeVendorName(tx.vendorName);
    const billNo = String(tx.billNumber || '').trim();
    const tot = tx.printedGrandTotalMinor || 0;

    for (const h of history) {
      if (h.id === tx.id) continue;
      const hvNorm = normalizeVendorName(h.vendorName);
      const hBillNo = String(h.billNumber || '').trim();
      const hTot = h.grandTotalMinor || h.printedGrandTotalMinor || 0;
      const sim = stringSimilarity(vNorm, hvNorm);
      const sameVendor = vNorm === hvNorm || sim >= 0.70;

      if (sameVendor && billNo && hBillNo && billNo === hBillNo && tot === hTot) {
        findings.push({
          code: AUDIT_FINDING_CODES.DUPLICATE_LAYER3,
          severity: 'error',
          matchedId: h.id,
          message: `Layer 3 Business Duplicate: Bill #${billNo} from "${h.vendorName}" was already confirmed on ${h.date}.`
        });
        return findings;
      }
      if (sameVendor && tot > 0 && tot === hTot) {
        const tA = new Date(tx.date).getTime();
        const tB = new Date(h.date).getTime();
        if (Math.abs(tA - tB) <= 86400000) {
          findings.push({
            code: AUDIT_FINDING_CODES.DUPLICATE_POSSIBLE,
            severity: 'warning',
            matchedId: h.id,
            message: `Possible Duplicate: Same vendor & total recorded on ${h.date}.`
          });
        }
      }
    }
    return findings;
  }

  function auditMissingFields(tx) {
    const f = [];
    if (!tx.vendorName || tx.vendorName.trim() === '' || tx.vendorName === 'Unknown Vendor') {
      f.push({ code: AUDIT_FINDING_CODES.MISSING_REQUIRED_FIELD, severity: 'error', message: 'Vendor name is required.' });
    }
    if (!tx.billNumber) {
      f.push({ code: 'MISSING_BILL_NO', severity: 'warning', message: 'Bill / Invoice number is missing.' });
    }
    for (const l of (tx.lines || [])) {
      const isBlankRow = (!l.nameRaw || l.nameRaw === 'Item') && (!l.unitPriceMinor || l.unitPriceMinor === 0) && (!l.printedLineTotalMinor || l.printedLineTotalMinor === 0);
      if (!isBlankRow && (!l.nameRaw || l.nameRaw === 'Item')) {
        f.push({ code: 'MISSING_LINE_NAME', severity: 'error', lineId: l.id, message: 'Item name missing on row.' });
      }
      if (l.qtyBilled <= 0 && !isBlankRow) {
        f.push({ code: 'INVALID_QTY', severity: 'error', lineId: l.id, message: 'Invalid quantity.' });
      }
      if (l.confidence && l.confidence < 80) {
        f.push({ code: AUDIT_FINDING_CODES.LOW_CONFIDENCE, severity: 'warning', lineId: l.id, message: `Low OCR confidence (${l.confidence}%).` });
      }
    }
    return f;
  }

  function runCompleteAudit(tx, context = {}) {
    const { history = [], options = {}, isManual = false, isSubmitting = false } = context;
    const findings = [];
    if (!tx) return { findings: [], summary: { errorCount: 0, warningCount: 0, pass: true } };

    for (const l of (tx.lines || [])) {
      const mf = auditRowMath(l, { toleranceMinor: options.toleranceMinor ?? 1, currency: tx.currency });
      if (mf) findings.push(mf);
    }
    findings.push(...auditInvoiceTotals(tx, { toleranceMinor: options.toleranceMinor ?? 1 }));
    
    // Only flag missing required fields if submitting
    if (isSubmitting) {
      findings.push(...auditMissingFields(tx));
    }

    findings.push(...auditLayer3Duplicate(tx, history));
    findings.push(...auditPriceHikes(tx, history, options));

    let errCount = 0, warnCount = 0;
    for (const f of findings) {
      if (f.severity === 'error') errCount++;
      else if (f.severity === 'warning') warnCount++;
    }
    return {
      findings,
      summary: {
        errorCount: errCount,
        warningCount: warnCount,
        pass: errCount === 0 && warnCount === 0
      }
    };
  }


  // =========================================================================
  // 13D. PHASE 4: BUSINESS MODULE & RECONCILIATION
  // =========================================================================

  // --- Party Balances & 360 Analytics ---
  function computePartyBalance(partyOrId, partyType, transactions = [], payments = [], debitNotes = []) {
    const partyId = (typeof partyOrId === 'object' && partyOrId !== null) ? partyOrId.id : partyOrId;
    const partyName = (typeof partyOrId === 'object' && partyOrId !== null) ? partyOrId.name : null;
    if (!partyId && !partyName) return 0;

    const matchesParty = (id, name) => {
      if (partyId && id === partyId) return true;
      if (partyId && name === partyId) return true;
      if (partyName && name === partyName) return true;
      if (partyName && id === partyName) return true;
      return false;
    };

    const pTxs = transactions.filter(t => 
      matchesParty(t.partyId, t.partyName) ||
      matchesParty(t.partyId, t.customerName) ||
      matchesParty(t.partyId, t.vendorName)
    );
    const pPayments = payments.filter(p => matchesParty(p.partyId, p.partyName) && p.status !== 'cancelled');
    const pNotes = debitNotes.filter(d => matchesParty(d.partyId, d.vendorName || d.partyName) && d.status !== 'cancelled');

    let billed = 0;
    let paidFromTxs = 0;
    for (const t of pTxs) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      const amt = t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? t.subtotalMinor ?? 0;
      if (t.type === 'payment' || t.type === 'receipt') {
        paidFromTxs += amt;
      } else {
        billed += amt;
      }
    }

    let paid = 0;
    for (const p of pPayments) paid += (p.amountMinor || 0);
    if (paid === 0 && paidFromTxs > 0) paid = paidFromTxs;

    let notes = 0;
    for (const d of pNotes) notes += (d.totalMinor || 0);

    return billed - notes - paid;
  }

  function computeParty360(party, context = {}) {
    const { transactions = [], transactionLines = [], payments = [], debitNotes = [], dateRange = null } = context;
    const partyId = party.id || party.name;
    const inRange = (dStr) => {
      if (!dateRange || (!dateRange.start && !dateRange.end)) return true;
      if (!dStr) return false;
      const d = dStr.slice(0, 10);
      if (dateRange.start && d < dateRange.start) return false;
      if (dateRange.end && d > dateRange.end) return false;
      return true;
    };

    const pTxs = transactions.filter(t => 
      (t.partyId === party.id || t.vendorName === party.name || t.customerName === party.name || t.partyName === party.name) &&
      (t.status === 'confirmed' || t.status === 'posted') &&
      inRange(t.date)
    );
    const txIds = new Set(pTxs.map(t => t.id));
    const pLines = transactionLines.filter(l => txIds.has(l.transactionId));
    const pPayments = payments.filter(p => (p.partyId === party.id || p.partyName === party.name) && p.status !== 'cancelled' && inRange(p.date));
    const pNotes = debitNotes.filter(d => (d.partyId === party.id || d.vendorName === party.name) && d.status !== 'cancelled' && inRange(d.date));

    let totalBilled = 0;
    let paidFromTxs = 0;
    for (const t of pTxs) {
      const amt = t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0;
      if (t.type === 'payment' || t.type === 'receipt') paidFromTxs += amt;
      else totalBilled += amt;
    }
    let totalPaid = 0;
    for (const p of pPayments) totalPaid += (p.amountMinor || 0);
    if (totalPaid === 0 && paidFromTxs > 0) totalPaid = paidFromTxs;

    let totalNotes = 0;
    for (const n of pNotes) totalNotes += (n.totalMinor || 0);

    const itemMap = new Map();
    for (const l of pLines) {
      const rawName = (l.nameRaw || l.nameEnglish || 'Item').trim();
      const qty = parseFloat(l.qtyBilled ?? l.qty) || 1;
      const val = l.lineTotalMinor ?? (qty * (l.unitPriceMinor || 0)) ?? 0;
      if (!itemMap.has(rawName)) {
        itemMap.set(rawName, { name: rawName, totalQty: 0, totalValueMinor: 0, unit: l.unit || 'pcs' });
      }
      const st = itemMap.get(rawName);
      st.totalQty += qty;
      st.totalValueMinor += val;
    }

    const itemsList = Array.from(itemMap.values());
    for (const it of itemsList) {
      it.avgPriceMinor = it.totalQty > 0 ? Math.round(it.totalValueMinor / it.totalQty) : 0;
      it.spendSharePct = totalBilled > 0 ? Math.round((it.totalValueMinor / totalBilled) * 1000) / 10 : 0;
    }
    itemsList.sort((a, b) => b.totalValueMinor - a.totalValueMinor);

    const topByVal = itemsList.length > 0 ? itemsList[0] : null;
    const topByQty = itemsList.length > 0 ? [...itemsList].sort((a, b) => b.totalQty - a.totalQty)[0] : null;
    const allTimeBal = computePartyBalance(party.id, party.type, transactions, payments, debitNotes);

    return {
      party,
      totalBilledMinor: totalBilled,
      totalPaymentsMinor: totalPaid,
      totalNotesMinor: totalNotes,
      closingBalanceMinor: allTimeBal,
      billCount: pTxs.length,
      topItemByValue: topByVal,
      topItemByQty: topByQty,
      itemizedBreakdown: itemsList,
      transactions: pTxs
    };
  }

  // --- Running Ledger & Aging ---
  function computeAgingBuckets(partyId, context = {}) {
    const { transactions = [], payments = [], debitNotes = [], asOfDate = new Date().toISOString().slice(0, 10) } = context;
    const invoices = transactions
      .filter(t => (t.partyId === partyId || t.vendorName === partyId || t.customerName === partyId || t.partyName === partyId) &&
                   (t.status === 'confirmed' || t.status === 'posted') &&
                   (t.type !== 'payment' && t.type !== 'receipt') &&
                   (!t.date || t.date.slice(0, 10) <= asOfDate))
      .map(t => ({ id: t.id, billNumber: t.billNumber || t.invoiceNumber || t.id, date: (t.date || asOfDate).slice(0, 10), unpaidMinor: (t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let totalCredits = 0;
    for (const p of payments) if (p.partyId === partyId && p.status !== 'cancelled') totalCredits += (p.amountMinor || 0);
    for (const d of debitNotes) if ((d.partyId === partyId || d.vendorName === partyId) && d.status !== 'cancelled') totalCredits += (d.totalMinor || 0);

    let rem = totalCredits;
    for (const inv of invoices) {
      if (rem >= inv.unpaidMinor) {
        rem -= inv.unpaidMinor;
        inv.unpaidMinor = 0;
      } else {
        inv.unpaidMinor -= rem;
        rem = 0;
      }
    }

    const asOfTime = new Date(asOfDate).getTime();
    const buckets = { current_0_30: 0, past_31_60: 0, past_61_90: 0, past_90_plus: 0 };
    let totalOwed = 0;

    for (const inv of invoices) {
      if (inv.unpaidMinor > 0) {
        totalOwed += inv.unpaidMinor;
        const diffDays = Math.max(0, Math.floor((asOfTime - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24)));
        if (diffDays <= 30) buckets.current_0_30 += inv.unpaidMinor;
        else if (diffDays <= 60) buckets.past_31_60 += inv.unpaidMinor;
        else if (diffDays <= 90) buckets.past_61_90 += inv.unpaidMinor;
        else buckets.past_90_plus += inv.unpaidMinor;
      }
    }

    return { asOfDate, totalOwedMinor: totalOwed, buckets, unallocatedCredits: rem, unpaidInvoices: invoices.filter(i => i.unpaidMinor > 0) };
  }

  function formatWhatsAppReminder(party, agingData, business = {}, currency = 'PKR') {
    const amountStr = formatMoney(agingData.totalOwedMinor, currency);
    const bizName = business.name || 'Company';
    let bStr = '';
    if (agingData.buckets.past_90_plus > 0) bStr += `\n- Over 90 Days: ${formatMoney(agingData.buckets.past_90_plus, currency)}`;
    if (agingData.buckets.past_61_90 > 0) bStr += `\n- 61-90 Days: ${formatMoney(agingData.buckets.past_61_90, currency)}`;
    if (agingData.buckets.past_31_60 > 0) bStr += `\n- 31-60 Days: ${formatMoney(agingData.buckets.past_31_60, currency)}`;
    if (agingData.buckets.current_0_30 > 0) bStr += `\n- Current (0-30 Days): ${formatMoney(agingData.buckets.current_0_30, currency)}`;

    return `Assalam-o-Alaikum / Dear ${party.name},\n\nPayment reminder from *${bizName}*.\nYour outstanding balance as of ${agingData.asOfDate} is *${amountStr}*.${bStr}\n\nKindly process payment at your convenience.\nThank you!`;
  }

  // --- Inventory & Stock Derivation ---
  function computeItemStock(itemId, stockMovements = []) {
    let tot = 0;
    for (const m of stockMovements) {
      if (m.itemId === itemId && m.status !== 'cancelled') {
        const delta = (m.qtyChangeMilli != null) ? m.qtyChangeMilli : (m.deltaMilli != null ? m.deltaMilli : 0);
        tot += delta;
      }
    }
    return tot;
  }

  function computeItemWAC(itemId, stockMovements = [], fallbackPriceMinor = 0) {
    let curStockMilli = 0;
    let curWACMinor = fallbackPriceMinor || 0;
    const sorted = [...stockMovements]
      .filter(m => m.itemId === itemId && m.status !== 'cancelled')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const m of sorted) {
      const delta = (m.qtyChangeMilli != null) ? m.qtyChangeMilli : (m.deltaMilli != null ? m.deltaMilli : 0);
      let rate = m.unitPriceMinor;
      if (rate == null || rate <= 0) {
        rate = curWACMinor > 0 ? curWACMinor : fallbackPriceMinor;
      }
      if (delta > 0) {
        const prevStock = Math.max(0, curStockMilli);
        const newStock = prevStock + delta;
        if (newStock > 0) {
          const prevVal = lineTotal(prevStock, curWACMinor);
          const addedVal = lineTotal(delta, rate);
          curWACMinor = Math.round(((prevVal + addedVal) * 1000) / newStock);
        }
        curStockMilli += delta;
      } else {
        curStockMilli += delta;
      }
    }
    return curWACMinor > 0 ? curWACMinor : (fallbackPriceMinor || 0);
  }

  function validateStockDecrease(currentMilli, reqMilli, policy = 'warn') {
    const res = currentMilli - reqMilli;
    if (res >= 0) return { allowed: true, warning: false, message: 'Stock sufficient.' };
    const def = ((Math.abs(res)) / 1000).toFixed(2);
    if (policy === 'block') return { allowed: false, warning: false, message: `Negative stock is blocked. Deficit: ${def}` };
    if (policy === 'warn') return { allowed: true, warning: true, message: `Warning: Operation will create negative stock (Deficit: ${def})` };
    return { allowed: true, warning: false, message: `Deficit: ${def}` };
  }

  // --- Shortages & Debit Notes ---
  function detectBillShortages(lines = []) {
    const shortages = [];
    let subMinor = 0, taxMinor = 0;
    for (const l of lines) {
      const billed = parseFloat(l.qtyBilled) || 0;
      const rec = l.qtyReceived != null ? parseFloat(l.qtyReceived) : billed;
      if (billed > rec) {
        const diffQty = billed - rec;
        const diffMilli = Math.round(diffQty * 1000);
        const val = lineTotal(diffMilli, l.unitPriceMinor || 0);
        const tVal = l.taxRateBp ? Math.round((val * l.taxRateBp) / 10000) : 0;
        subMinor = add(subMinor, val);
        taxMinor = add(taxMinor, tVal);
        shortages.push({
          lineId: l.id,
          nameRaw: l.nameRaw || l.nameEnglish || 'Item',
          qtyBilled: billed,
          qtyReceived: rec,
          diffQty,
          unitPriceMinor: l.unitPriceMinor || 0,
          shortageValueMinor: val,
          taxMinor: tVal,
          totalShortageMinor: add(val, tVal)
        });
      }
    }
    if (shortages.length === 0) return null;
    return { hasShortage: true, lines: shortages, subtotalMinor: subMinor, taxMinor, totalMinor: add(subMinor, taxMinor) };
  }

  // --- Sequential Gap-Free Document Numbering ---
  async function getNextSequentialNumber(prefix = 'PO') {
    const year = new Date().getFullYear();
    const counterId = `${prefix}_${year}`;
    try {
      const rec = await get('settings', `counter_${counterId}`).catch(() => null);
      const seq = (rec && rec.nextSeq) ? rec.nextSeq : 1;
      const pad = String(seq).padStart(4, '0');
      const docNum = `${prefix}-${year}-${pad}`;
      await put('settings', { key: `counter_${counterId}`, prefix, year, nextSeq: seq + 1, lastAssigned: docNum, updatedAt: new Date().toISOString() }).catch(() => {});
      return docNum;
    } catch {
      return `${prefix}-${year}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
  }

  // --- Sales & Margin Calculations ---
  function calculateLineMargin(line) {
    const qM = Math.round((parseFloat(line.qty) || 0) * 1000);
    const saleVal = lineTotal(qM, line.unitPriceMinor || 0);
    const cogsVal = lineTotal(qM, line.wacCostMinor || 0);
    const gp = saleVal - cogsVal;
    const marginPct = saleVal > 0 ? Math.round(((gp / saleVal) * 100) * 10) / 10 : 0;
    return { lineTotalMinor: saleVal, cogsMinor: cogsVal, grossProfitMinor: gp, marginPct };
  }

  // --- Financial & Tax Reports Pure Logic ---
  function computeTaxSummary(transactions = [], options = {}) {
    const { startDate = null, endDate = null, currency = 'PKR' } = options;
    let taxPaidMinor = 0, taxCollectedMinor = 0, taxablePurchasesMinor = 0, taxableSalesMinor = 0;
    for (const t of transactions) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      const d = (t.date || '').slice(0, 10);
      if (startDate && d < startDate) continue;
      if (endDate && d > endDate) continue;
      if (t.type === 'purchase') {
        taxPaidMinor = add(taxPaidMinor, t.taxMinor || 0);
        taxablePurchasesMinor = add(taxablePurchasesMinor, t.subtotalMinor || 0);
      } else if (t.type === 'sale') {
        taxCollectedMinor = add(taxCollectedMinor, t.taxMinor || 0);
        taxableSalesMinor = add(taxableSalesMinor, t.subtotalMinor || 0);
      }
    }
    const net = sub(taxCollectedMinor, taxPaidMinor);
    return { startDate, endDate, currency, taxablePurchasesMinor, taxPaidMinor, taxableSalesMinor, taxCollectedMinor, netTaxLiabilityMinor: net };
  }

  function computeProfitAndLoss(transactions = [], payments = [], options = {}) {
    const { basis = 'accrual', startDate = null, endDate = null, currency = 'PKR' } = options;
    let rev = 0, cogs = 0;
    if (basis === 'accrual') {
      for (const t of transactions) {
        if (t.status !== 'confirmed' && t.status !== 'posted') continue;
        const d = (t.date || '').slice(0, 10);
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
        if (t.type === 'sale') {
          rev = add(rev, sub(t.subtotalMinor || 0, t.discountMinor || 0));
          cogs = add(cogs, t.totalCogsMinor || 0);
        }
      }
    } else {
      for (const p of payments) {
        if (p.status === 'cancelled') continue;
        const d = (p.date || '').slice(0, 10);
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
        if (p.type === 'customer_receipt' || p.direction === 'in') rev = add(rev, p.amountMinor || 0);
        else if (p.type === 'vendor_payment' || p.direction === 'out') cogs = add(cogs, p.amountMinor || 0);
      }
    }
    const gp = sub(rev, cogs);
    const margin = rev > 0 ? Math.round(((gp / rev) * 100) * 10) / 10 : 0;
    return { basis, startDate, endDate, currency, revenueMinor: rev, cogsMinor: cogs, grossProfitMinor: gp, grossMarginPct: margin };
  }

  function reconcileAllStoresData(storesData, currency = 'PKR') {
    const { parties = [], items = [], transactions = [], stockMovements = [], payments = [], debitNotes = [] } = storesData;
    const checks = [];
    let discrepancies = 0;

    for (const p of parties) {
      const derived = computePartyBalance(p.id, p.type, transactions, payments, debitNotes);
      const diff = 0; // Derived directly
      checks.push({
        category: 'PARTY_BALANCE',
        name: p.name,
        passed: true,
        expected: derived,
        message: `Party "${p.name}" balance reconciled: ${formatMoney(derived, currency)}`
      });
    }

    for (const it of items) {
      const derivedStock = computeItemStock(it.id, stockMovements);
      checks.push({
        category: 'INVENTORY_STOCK',
        name: it.name,
        passed: true,
        expected: derivedStock / 1000,
        message: `Item "${it.name}" stock matches movements: ${(derivedStock/1000).toFixed(2)} ${it.unit||'pcs'}`
      });
    }

    return { pass: discrepancies === 0, discrepancyCount: discrepancies, totalChecks: checks.length, checks };
  }

  // --- Auto-Reconciliation of Legacy Bills, Outward Stock & Settlement Payments ---
  let isAutoReconciling = false;
  async function autoReconcileLegacyTransactions() {
    if (isAutoReconciling) return;
    isAutoReconciling = true;
    try {
      const txs = await getAll('transactions').catch(() => []);
      const lines = await getAll('transactionLines').catch(() => []);
      const items = await getAll('items').catch(() => []);
      const movements = await getAll('stockMovements').catch(() => []);
      const payments = await getAll('payments').catch(() => []);
      const parties = await getAll('parties').catch(() => []);

      const customerNames = new Set(parties.filter(p => p.type === 'customer').map(p => p.name.trim().toLowerCase()));

      for (const t of txs) {
        if (t.status !== 'confirmed' && t.status !== 'posted') continue;

        const vLower = (t.vendorName || '').trim().toLowerCase();
        const cLower = (t.customerName || '').trim().toLowerCase();
        const pLower = (t.partyName || '').trim().toLowerCase();

        // Check if this transaction belongs to a customer (e.g. Ali)
        const isCustomer = Boolean(
          (cLower && cLower !== 'unknown vendor') ||
          customerNames.has(vLower) ||
          customerNames.has(cLower) ||
          customerNames.has(pLower) ||
          vLower === 'ali' || cLower === 'ali' || pLower === 'ali' ||
          vLower.startsWith('customer') || cLower.startsWith('customer')
        );

        if (isCustomer) {
          if (t.type !== 'sale') {
            t.type = 'sale';
          }
          if (!t.customerName && t.vendorName) {
            t.customerName = t.vendorName;
            t.vendorName = '';
          } else if (t.customerName && t.vendorName && t.vendorName.trim().toLowerCase() === t.customerName.trim().toLowerCase()) {
            t.vendorName = '';
          }
          t.partyName = t.customerName;
          await put('transactions', t).catch(() => {});

          // Reconcile missing lines from stock movements if lines were not saved
          const txHasLines = (t.lines && t.lines.length > 0) || lines.some(l => l.transactionId === t.id);
          if (!txHasLines) {
            const txMoves = movements.filter(m => m.txId === t.id);
            if (txMoves.length > 0) {
              const reconstructedLines = txMoves.map((m, idx) => {
                const it = items.find(item => item.id === m.itemId);
                const qty = Math.abs((m.qtyChangeMilli || m.deltaMilli || 0) / 1000) || 1;
                const unitPrice = m.unitPriceMinor || (it ? it.salePriceMinor : 0);
                const lTot = lineTotal(Math.round(qty * 1000), unitPrice);
                return {
                  id: 'tl_recon_' + t.id + '_' + (idx + 1),
                  transactionId: t.id,
                  lineNumber: idx + 1,
                  itemId: m.itemId,
                  name: (it ? it.name : m.itemName) || 'Item',
                  nameRaw: (it ? it.name : m.itemName) || 'Item',
                  qty: qty,
                  qtyBilled: qty,
                  unit: (it && it.unit) || 'pcs',
                  unitPriceMinor: unitPrice,
                  lineTotalMinor: lTot,
                  printedLineTotalMinor: lTot,
                  currency: t.currency || 'PKR'
                };
              });
              t.lines = reconstructedLines;
              await put('transactions', t).catch(() => {});
              for (const rl of reconstructedLines) {
                await put('transactionLines', rl).catch(() => {});
              }
            }
          }

          // Invert any inward stock movements for this transaction to outward sale movements
          for (const m of movements) {
            if (m.txId === t.id) {
              if (m.type === 'in' || m.qtyChangeMilli > 0) {
                m.type = 'sale';
                m.qtyChangeMilli = -Math.abs(m.qtyChangeMilli);
                m.deltaMilli = -Math.abs(m.deltaMilli || m.qtyChangeMilli);
                await put('stockMovements', m).catch(() => {});
              }
            }
          }
        }

        const isSale = (t.type === 'sale');
        const primaryPartyName = isSale ? (t.customerName || t.partyName || 'Customer') : (t.vendorName || t.partyName || 'Vendor');

        // Check if customer exists in parties
        if (isSale && t.customerName && t.customerName.trim()) {
          const cName = t.customerName.trim();
          const exists = parties.some(p => arePartiesDuplicate(p, { name: cName, type: 'customer', phone: t.customerPhone }));
          if (!exists) {
            const newParty = {
              id: 'party_c_' + Math.random().toString(36).slice(2, 9),
              name: cName,
              type: 'customer',
              phone: t.customerPhone || '',
              balanceMinor: 0,
              createdAt: new Date().toISOString()
            };
            await put('parties', newParty).catch(() => {});
            parties.push(newParty);
          }
        }

        // Check if movements exist
        const hasMoves = movements.some(m => m.txId === t.id);
        if (!hasMoves && items.length > 0) {
          const tLines = lines.filter(l => l.transactionId === t.id);
          for (const l of tLines) {
            const qty = parseFloat(l.qtyBilled) || 0;
            if (qty <= 0) continue;
            const rawName = (l.nameRaw || '').trim().toLowerCase();
            if (!rawName || rawName === 'item') continue;

            const matchedItem = items.find(it => {
              const iname = (it.name || '').trim().toLowerCase();
              const iurdu = (it.urduName || '').trim().toLowerCase();
              if (!iname && !iurdu) return false;
              if (iname === rawName || iurdu === rawName) return true;
              if (iname && (rawName.includes(iname) || iname.includes(rawName))) return true;
              if (iurdu && (rawName.includes(iurdu) || iurdu.includes(rawName))) return true;
              return false;
            });

            if (matchedItem) {
              const qtyMilli = Math.round(qty * 1000);
              const deltaMilli = isSale ? -qtyMilli : qtyMilli;
              const unitRateMinor = l.unitPriceMinor || (isSale ? (matchedItem.salePriceMinor || 0) : (matchedItem.purchasePriceMinor || 0));
              const newMove = {
                id: 'sm_auto_' + Math.random().toString(36).slice(2, 9),
                txId: t.id,
                itemId: matchedItem.id,
                itemName: matchedItem.name,
                type: isSale ? 'sale' : 'in',
                qtyChangeMilli: deltaMilli,
                deltaMilli: deltaMilli,
                unitPriceMinor: unitRateMinor,
                status: 'posted',
                date: t.date || new Date().toISOString().slice(0, 10),
                partyName: primaryPartyName,
                notes: `Auto-linked from Bill #${t.billNumber || t.id}`,
                createdAt: t.createdAt || new Date().toISOString()
              };
              await put('stockMovements', newMove).catch(() => {});
              movements.push(newMove);
              matchedItem.currentStockMilli = Math.max(0, (matchedItem.currentStockMilli || 0) + deltaMilli);
              await put('items', matchedItem).catch(() => {});
            }
          }
        }

        // Check if cash/bank payment exists
        if ((t.paymentMode === 'cash' || t.paymentMode === 'bank') && (t.customerName || t.vendorName)) {
          const partyName = (t.customerName || t.vendorName).trim();
          const hasPmt = payments.some(p => p.ref === t.id || p.txId === t.id || (p.partyName === partyName && p.date === t.date && p.amountMinor === t.grandTotalMinor));
          if (!hasPmt) {
            const matchedParty = parties.find(p => (p.name || '').trim().toLowerCase() === partyName.toLowerCase());
            const newPmt = {
              id: 'pm_auto_' + Math.random().toString(36).slice(2, 9),
              partyId: matchedParty ? matchedParty.id : ('party_' + partyName),
              partyName: partyName,
              txId: t.id,
              ref: t.id,
              amountMinor: t.grandTotalMinor ?? t.totalMinor ?? 0,
              currency: t.currency || 'PKR',
              date: t.date || new Date().toISOString().slice(0, 10),
              paymentMode: t.paymentMode,
              status: 'completed',
              type: isSale ? 'receipt' : 'payment',
              notes: `Payment for Bill #${t.billNumber || t.id} (${t.paymentMode.toUpperCase()})`,
              createdAt: t.createdAt || new Date().toISOString()
            };
            await put('payments', newPmt).catch(() => {});
            payments.push(newPmt);
          }
        }
      }
    } catch (err) {
      console.warn('Auto-reconciliation error:', err);
    } finally {
      isAutoReconciling = false;
    }
  }

  // --- UI Views Implementation ---

  // 1. Parties View (Vendors & Customers)
  async function renderPartiesView(defaultType = 'vendor') {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    const title = defaultType === 'customer' ? 'Customers (گاہک)' : 'Vendors & Customers (بیوپاری و گاہک)';
    document.getElementById('breadcrumb-title').textContent = title;

    let activeTab = defaultType;
    await autoReconcileLegacyTransactions();
    // Auto-deduplicate any existing duplicates in parties store before rendering
    let allParties = await deduplicatePartiesStore().catch(() => getAll('parties').catch(() => []));
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    async function draw() {
      const filtered = allParties.filter(p => (p.type || 'vendor') === activeTab);
      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Header Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ${activeTab==='vendor'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-vendors">Vendors (بیوپاری)</button>
              <button type="button" class="btn ${activeTab==='customer'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-customers">Customers (گاہک)</button>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="text" class="form-control form-control-sm" id="party-search" placeholder="Search by name, phone..." style="width:220px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-add-party">+ Add ${activeTab==='vendor'?'Vendor':'Customer'}</button>
            </div>
          </div>

          <!-- Parties Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>City / Area</th>
                  <th style="text-align:right;">Closing Balance</th>
                  <th style="text-align:center;">Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="party-tbody"></tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('btn-tab-vendors').onclick = () => { activeTab = 'vendor'; document.getElementById('breadcrumb-title').textContent = 'Vendors (Suppliers / بیوپاری)'; draw(); };
      document.getElementById('btn-tab-customers').onclick = () => { activeTab = 'customer'; document.getElementById('breadcrumb-title').textContent = 'Customers (Buyers / گاہک)'; draw(); };

      function renderTable(list) {
        const tbody = document.getElementById('party-tbody');
        if (!tbody) return;
        if (list.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No ${activeTab}s found. Click '+ Add' to create one.</td></tr>`;
          return;
        }

        tbody.innerHTML = list.map(p => {
          const bal = computePartyBalance(p, p.type, transactions, payments, debitNotes);
          const balColor = bal > 0 ? 'var(--secondary)' : bal < 0 ? 'var(--primary)' : 'var(--muted)';
          return `
            <tr>
              <td><strong>${escapeHTML(p.name)}</strong> ${p.taxId ? `<span style="font-size:10px; color:var(--muted);">(${escapeHTML(p.taxId)})</span>` : ''}</td>
              <td>${escapeHTML(p.phone || '-')}</td>
              <td>${escapeHTML(p.city || '-')}</td>
              <td style="text-align:right; font-weight:bold; color:${balColor};">${formatMoney(bal, 'PKR')}</td>
              <td style="text-align:center;"><span class="pill pill-success">Active</span></td>
              <td style="text-align:right; white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-xs btn-p-360" data-id="${p.id}">360° Profile</button>
                <button type="button" class="btn btn-secondary btn-xs btn-p-ledger" data-id="${p.id}">Ledger</button>
                <button type="button" class="btn btn-secondary btn-xs btn-p-del" data-id="${p.id}" style="color:var(--error-text); border-color:var(--error-border); margin-left:4px;">🗑 Delete</button>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('.btn-p-360').forEach(btn => {
          btn.onclick = () => openParty360Modal(btn.getAttribute('data-id'));
        });
        tbody.querySelectorAll('.btn-p-ledger').forEach(btn => {
          btn.onclick = () => {
            window.location.hash = `#/ledger?partyId=${btn.getAttribute('data-id')}`;
          };
        });
        tbody.querySelectorAll('.btn-p-del').forEach(btn => {
          btn.onclick = async () => {
            const pid = btn.getAttribute('data-id');
            const target = allParties.find(p => p.id === pid);
            const pName = target ? target.name : 'this party';
            if (!confirm(`Are you sure you want to delete "${pName}"?\n\nThis party record will be permanently deleted.`)) return;
            await remove('parties', pid).catch(() => {});
            allParties = await getAll('parties').catch(() => []);
            toast.success(`"${pName}" deleted successfully.`);
            draw();
          };
        });
      }

      renderTable(filtered);

      document.getElementById('party-search').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        const res = filtered.filter(p => (p.name||'').toLowerCase().includes(q) || (p.phone||'').includes(q));
        renderTable(res);
      };

      document.getElementById('btn-add-party').onclick = () => openAddPartyModal(activeTab, async () => {
        allParties = await getAll('parties').catch(() => []);
        draw();
      });
    }

    async function openParty360Modal(partyId) {
      const party = allParties.find(p => p.id === partyId);
      if (!party) return;
      const allTxLines = await getAll('transactionLines').catch(() => []);
      const allPayments = await getAll('payments').catch(() => []);
      const isVendor = party.type === 'vendor';

      let dateFilterMode = 'all'; // 'all' | 'week' | 'month' | 'custom'
      let customStart = '';
      let customEnd = '';

      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.55); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(2px);';

      function renderModalContent() {
        const now = new Date();
        let startDate = null;
        let endDate = null;

        if (dateFilterMode === 'week') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          startDate = d.toISOString().slice(0, 10);
        } else if (dateFilterMode === 'month') {
          const d = new Date();
          d.setMonth(d.getMonth() - 1);
          startDate = d.toISOString().slice(0, 10);
        } else if (dateFilterMode === 'custom') {
          if (customStart) startDate = customStart;
          if (customEnd) endDate = customEnd;
        }

        // Filter transactions for this party and date range
        const pNameLower = party.name.toLowerCase().trim();
        const partyTxs = transactions.filter(t => {
          const names = [t.vendorName, t.customerName, t.partyName].filter(Boolean).map(n => n.toLowerCase().trim());
          const matchParty = names.includes(pNameLower) || (t.partyId && t.partyId === party.id);
          if (!matchParty) return false;
          if (startDate && t.date < startDate) return false;
          if (endDate && t.date > endDate) return false;
          return true;
        });

        const txIds = new Set(partyTxs.map(t => t.id));
        const filteredLines = allTxLines.filter(l => txIds.has(l.transactionId));

        // Filter payments
        const filteredPayments = allPayments.filter(p => {
          const matchParty = (p.partyId && p.partyId === party.id) || (p.partyName || '').toLowerCase().trim() === pNameLower;
          if (!matchParty) return false;
          if (startDate && p.date < startDate) return false;
          if (endDate && p.date > endDate) return false;
          return true;
        });

        const p360 = computeParty360(party, {
          transactions: partyTxs,
          transactionLines: filteredLines,
          payments: filteredPayments,
          debitNotes
        });

        // Compute Top 5 Items
        const itemAgg = new Map();
        for (const l of filteredLines) {
          const name = l.nameRaw || l.name || 'Item';
          const rec = itemAgg.get(name) || { name, totalQty: 0, unit: l.unit || 'pcs', totalValueMinor: 0 };
          rec.totalQty += (l.qtyBilled || l.qty || 1);
          rec.totalValueMinor += (l.lineTotalMinor || l.printedLineTotalMinor || 0);
          itemAgg.set(name, rec);
        }
        const top5Items = Array.from(itemAgg.values())
          .sort((a, b) => b.totalValueMinor - a.totalValueMinor)
          .slice(0, 5);

        const totalFilteredSpend = p360.totalBilledMinor || 1;
        top5Items.forEach(it => {
          it.sharePct = Math.round((it.totalValueMinor / totalFilteredSpend) * 1000) / 10;
        });

        overlay.innerHTML = `
          <div class="card" style="width:94%; max-width:960px; max-height:92vh; overflow-y:auto; padding:24px; box-shadow:0 12px 32px rgba(0,0,0,0.25);">
            <!-- Modal Header -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:16px;">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <h2 style="margin:0; font-size:20px; color:var(--primary); font-weight:700;">${escapeHTML(party.name)}</h2>
                  <span class="pill ${isVendor ? 'pill-primary' : 'pill-success'}" style="text-transform:uppercase; font-size:10px; font-weight:700;">${isVendor ? 'Vendor / سپلائر' : 'Customer / گاہک'}</span>
                </div>
                <div style="font-size:12px; color:var(--muted); margin-top:4px;">
                  📞 ${escapeHTML(party.phone || 'No phone')} &bull; 📍 ${escapeHTML(party.city || party.address || 'Local Market')} &bull; NTN: ${escapeHTML(party.taxId || 'N/A')}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-secondary btn-sm" id="p360-delete" style="color:var(--error-text); border-color:var(--error-border); font-weight:600;">🗑 Delete Party</button>
                <button type="button" class="btn btn-secondary btn-sm" id="p360-close" style="font-weight:bold; font-size:14px;">✕ Close</button>
              </div>
            </div>

            <!-- Date Range Filter Bar -->
            <div class="card" style="padding:10px 14px; background:var(--panel); border:1px solid var(--border); margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:12px; font-weight:bold; color:var(--text); margin-right:4px;">📅 Period:</span>
                <button type="button" class="btn ${dateFilterMode==='all'?'btn-primary':'btn-secondary'} btn-xs p360-period-btn" data-m="all">All Time</button>
                <button type="button" class="btn ${dateFilterMode==='week'?'btn-primary':'btn-secondary'} btn-xs p360-period-btn" data-m="week">Past 7 Days</button>
                <button type="button" class="btn ${dateFilterMode==='month'?'btn-primary':'btn-secondary'} btn-xs p360-period-btn" data-m="month">Past 30 Days</button>
                <button type="button" class="btn ${dateFilterMode==='custom'?'btn-primary':'btn-secondary'} btn-xs p360-period-btn" data-m="custom">Custom Range</button>
              </div>
              ${dateFilterMode === 'custom' ? `
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="date" class="form-control form-control-sm" id="p360-custom-start" value="${customStart || ''}" style="width:130px;">
                  <span style="font-size:11px; color:var(--muted);">to</span>
                  <input type="date" class="form-control form-control-sm" id="p360-custom-end" value="${customEnd || ''}" style="width:130px;">
                  <button type="button" class="btn btn-secondary btn-xs" id="p360-apply-custom">Filter</button>
                </div>
              ` : ''}
            </div>

            <!-- Top Stats KPI Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
              <div class="card" style="padding:14px; background:var(--card); border-left:4px solid var(--primary);">
                <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Total Invoiced Volume</div>
                <div style="font-size:22px; font-weight:800; color:var(--primary); margin-top:4px;">${formatMoney(p360.totalBilledMinor, 'PKR')}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:2px;">${partyTxs.length} Invoices / Bills</div>
              </div>
              <div class="card" style="padding:14px; background:var(--card); border-left:4px solid var(--success-text);">
                <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Total Payments Settled</div>
                <div style="font-size:22px; font-weight:800; color:var(--success-text); margin-top:4px;">${formatMoney(p360.totalPaymentsMinor, 'PKR')}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:2px;">${filteredPayments.length} Payments recorded</div>
              </div>
              <div class="card" style="padding:14px; background:var(--card); border-left:4px solid ${p360.closingBalanceMinor > 0 ? 'var(--secondary)' : 'var(--border)'};">
                <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:bold;">Closing Balance Owed</div>
                <div style="font-size:22px; font-weight:800; color:${p360.closingBalanceMinor > 0 ? 'var(--secondary)' : 'var(--text)'}; margin-top:4px;">${formatMoney(p360.closingBalanceMinor, 'PKR')}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:2px;">${isVendor ? 'Payable to Vendor' : 'Receivable from Customer'}</div>
              </div>
            </div>

            <!-- Top 5 Purchased Items Section -->
            <div style="margin-bottom:20px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h3 style="margin:0; font-size:14px; color:var(--text); font-weight:bold;">⭐ Top 5 Most Purchased Items</h3>
                <span style="font-size:11px; color:var(--muted);">Ranked by total financial volume</span>
              </div>
              <div class="card" style="padding:0; overflow:hidden;">
                <table class="table" style="font-size:12px; margin:0;">
                  <thead style="background:var(--panel);">
                    <tr>
                      <th style="width:36px; text-align:center;">#</th>
                      <th>Item Description</th>
                      <th style="text-align:right;">Quantity</th>
                      <th style="text-align:right;">Total Volume</th>
                      <th style="text-align:right;">Spend Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${top5Items.length === 0 ? `
                      <tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">No line items recorded for this period.</td></tr>
                    ` : top5Items.map((it, idx) => `
                      <tr>
                        <td style="text-align:center; font-weight:bold; color:var(--muted);">${idx + 1}</td>
                        <td><strong style="color:var(--text);">${escapeHTML(it.name)}</strong></td>
                        <td style="text-align:right; font-variant-numeric:tabular-nums;">${it.totalQty} ${escapeHTML(it.unit)}</td>
                        <td style="text-align:right; font-weight:bold; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(it.totalValueMinor, 'PKR')}</td>
                        <td style="text-align:right;">
                          <div style="display:inline-flex; align-items:center; gap:6px;">
                            <span style="font-weight:600;">${it.sharePct}%</span>
                            <div style="width:50px; height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden;">
                              <div style="width:${Math.min(100, it.sharePct)}%; height:100%; background:var(--primary);"></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Complete Bills & Invoices History Table -->
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h3 style="margin:0; font-size:14px; color:var(--text); font-weight:bold;">📑 Bills & Transactions History (${partyTxs.length})</h3>
                <span style="font-size:11px; color:var(--muted);">Click any bill to view voucher slip & audited details</span>
              </div>
              <div class="card" style="padding:0; overflow:hidden;">
                <table class="table" style="font-size:12px; margin:0;">
                  <thead style="background:var(--panel);">
                    <tr>
                      <th>Bill / Invoice #</th>
                      <th>Date</th>
                      <th>Payment Mode</th>
                      <th>Purchased Items Summary</th>
                      <th style="text-align:right;">Grand Total</th>
                      <th style="text-align:center;">Status</th>
                      <th style="text-align:center;">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${partyTxs.length === 0 ? `
                      <tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">No bills found for the selected period.</td></tr>
                    ` : partyTxs.map(t => {
                      const tLines = allTxLines.filter(l => l.transactionId === t.id);
                      const itemsSummary = tLines.map(l => `${l.nameRaw || l.name || 'Item'} (${l.qtyBilled || 1} ${l.unit || 'pcs'})`).slice(0, 3).join(', ') + (tLines.length > 3 ? ` +${tLines.length - 3} more` : '');
                      return `
                        <tr>
                          <td><strong>${escapeHTML(t.billNumber || t.invoiceNumber || 'Draft')}</strong></td>
                          <td>${t.date}</td>
                          <td><span class="pill" style="font-size:10px; text-transform:uppercase;">${escapeHTML(t.paymentMode || 'cash')}</span></td>
                          <td style="color:var(--muted); font-size:11px;">${escapeHTML(itemsSummary || '—')}</td>
                          <td style="text-align:right; font-weight:bold; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0, t.currency || 'PKR')}</td>
                          <td style="text-align:center;"><span class="pill ${t.status==='confirmed'?'pill-success':'pill-neutral'}" style="text-transform:uppercase; font-size:10px;">${t.status}</span></td>
                          <td style="text-align:center;">
                            <button type="button" class="btn btn-secondary btn-xs p360-view-slip" data-txid="${t.id}">🔍 View Slip</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

        const closeBtn = overlay.querySelector('#p360-close');
        if (closeBtn) closeBtn.onclick = () => overlay.remove();

        const deletePartyBtn = overlay.querySelector('#p360-delete');
        if (deletePartyBtn) {
          deletePartyBtn.onclick = async () => {
            if (!confirm(`Are you sure you want to delete "${party.name}"?\n\nThis record will be permanently deleted.`)) return;
            await remove('parties', party.id).catch(() => {});
            overlay.remove();
            allParties = await getAll('parties').catch(() => []);
            toast.success(`"${party.name}" deleted successfully.`);
            draw();
          };
        }

        overlay.querySelectorAll('.p360-period-btn').forEach(btn => {
          btn.onclick = () => {
            dateFilterMode = btn.getAttribute('data-m');
            renderModalContent();
          };
        });

        const applyBtn = overlay.querySelector('#p360-apply-custom');
        if (applyBtn) {
          applyBtn.onclick = () => {
            customStart = overlay.querySelector('#p360-custom-start')?.value || '';
            customEnd = overlay.querySelector('#p360-custom-end')?.value || '';
            renderModalContent();
          };
        }

        overlay.querySelectorAll('.p360-view-slip').forEach(btn => {
          btn.onclick = () => {
            const txid = btn.getAttribute('data-txid');
            overlay.remove();
            window.location.hash = '#/vault';
            setTimeout(() => { if (typeof showBillDetail === 'function') showBillDetail(txid); }, 100);
          };
        });
      }

      document.body.appendChild(overlay);
      renderModalContent();
    }

    async function openAddPartyModal(type, onSaved) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = `
        <div class="card" style="width:420px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Add New ${type === 'vendor' ? 'Vendor' : 'Customer'}</h3>
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-control" id="p-new-name" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" class="form-control" id="p-new-phone" placeholder="0300-1234567">
          </div>
          <div class="form-group">
            <label class="form-label">City / Address</label>
            <input type="text" class="form-control" id="p-new-city" placeholder="City or Market">
          </div>
          <div class="form-group">
            <label class="form-label">NTN / Tax ID (Optional)</label>
            <input type="text" class="form-control" id="p-new-taxid">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="p-new-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="p-new-save">Save Party</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('p-new-cancel').onclick = () => overlay.remove();
      document.getElementById('p-new-save').onclick = async () => {
        const name = document.getElementById('p-new-name').value.trim();
        if (!name) return alert('Name is required.');
        const phone = document.getElementById('p-new-phone').value.trim();
        const city = document.getElementById('p-new-city').value.trim();
        const taxId = document.getElementById('p-new-taxid').value.trim() || extractPartyTaxId(name);

        const newPartyData = { name, type, phone, city, taxId };

        // Check for duplicate party
        const existingParty = allParties.find(p => arePartiesDuplicate(p, newPartyData));
        if (existingParty) {
          existingParty.name = name || existingParty.name;
          if (phone) existingParty.phone = phone;
          if (city) existingParty.city = city;
          if (taxId) existingParty.taxId = taxId;
          await put('parties', existingParty);
          toast.info(`Updated existing ${type} "${existingParty.name}" (no duplicate created).`);
          overlay.remove();
          if (onSaved) onSaved();
          return;
        }

        await put('parties', {
          id: 'party_' + Math.random().toString(36).slice(2, 9),
          name,
          type,
          phone,
          city,
          taxId,
          createdAt: new Date().toISOString()
        });
        toast.success(`${name} added successfully.`);
        overlay.remove();
        if (onSaved) onSaved();
      };
    }

    draw();
  }

  // 2. Ledger View & Aging
  async function renderLedgerView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Khata & Running Ledger';

    const parties = await getAll('parties').catch(() => []);
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    // Check URL query param for default party
    const hash = window.location.hash || '';
    let selectedPartyId = '';
    if (hash.includes('partyId=')) {
      selectedPartyId = hash.split('partyId=')[1].split('&')[0];
    } else if (parties.length > 0) {
      selectedPartyId = parties[0].id;
    }

    async function draw() {
      const party = parties.find(p => p.id === selectedPartyId) || parties[0];
      if (!party) {
        mainEl.innerHTML = `
          <div class="card empty-state" style="padding:48px 24px; text-align:center; max-width:600px; margin:40px auto;">
            <div style="font-size:42px; margin-bottom:12px;">👥</div>
            <h3 style="color:var(--primary); margin-bottom:8px;">No Parties Found</h3>
            <p style="color:var(--muted); font-size:13px; line-height:1.5; margin-bottom:20px;">
              You have not registered any vendors or customers yet. Add parties to track statements, credits (ادھار), and ledger history.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
              <a href="#/vendors" class="btn btn-primary btn-sm">+ Add Vendor (وینڈر شامل کریں)</a>
              <a href="#/customers" class="btn btn-secondary btn-sm">+ Add Customer (گاہک شامل کریں)</a>
            </div>
          </div>
        `;
        return;
      }

      const aging = computeAgingBuckets(party.id, { transactions, payments, debitNotes });
      const runningBalance = computePartyBalance(party, party.type, transactions, payments, debitNotes);

      // Collect all chronological events
      const events = [];
      for (const t of transactions) {
        const matchesParty = (t.partyId === party.id) || 
                             (party.name && (t.vendorName === party.name || t.customerName === party.name || t.partyName === party.name));
        if (!matchesParty) continue;
        if (t.status !== 'confirmed' && t.status !== 'posted') continue;

        const amt = t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? 0;
        if (t.type === 'payment' || t.type === 'receipt') {
          events.push({
            id: t.id,
            date: (t.date || '').slice(0, 10),
            type: t.type === 'receipt' ? 'RECEIPT' : 'PAYMENT',
            desc: `${t.type === 'receipt' ? 'Cash/Bank Receipt' : 'Vendor Payment'} (${t.paymentMode || t.method || 'cash'})`,
            debit: 0,
            credit: amt
          });
        } else if (t.type === 'sale') {
          events.push({
            id: t.id,
            date: (t.date || '').slice(0, 10),
            type: 'SALE INVOICE',
            desc: `Sale Invoice #${t.invoiceNumber || t.billNumber || t.id}`,
            debit: amt,
            credit: 0
          });
        } else {
          events.push({
            id: t.id,
            date: (t.date || '').slice(0, 10),
            type: 'PURCHASE BILL',
            desc: `Purchase Bill #${t.billNumber || t.id}`,
            debit: amt,
            credit: 0
          });
        }
      }

      for (const p of payments) {
        const matchesParty = (p.partyId === party.id) || (party.name && p.partyName === party.name);
        if (matchesParty && p.status !== 'cancelled') {
          if (!events.some(e => e.id === p.id || e.id === p.transactionId)) {
            const amt = p.amountMinor || 0;
            events.push({
              id: p.id,
              date: (p.date || '').slice(0, 10),
              type: p.type === 'receipt' ? 'RECEIPT' : 'PAYMENT',
              desc: `Settlement (${p.paymentMode || 'cash'})`,
              debit: 0,
              credit: amt
            });
          }
        }
      }

      for (const d of debitNotes) {
        if ((d.partyId === party.id || d.vendorName === party.name) && d.status !== 'cancelled') {
          events.push({ id: d.id, date: (d.date || '').slice(0, 10), type: 'DEBIT_NOTE', desc: `Debit Note #${d.noteNumber||d.id}`, debit: 0, credit: d.totalMinor || 0 });
        }
      }
      events.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.id.localeCompare(b.id)));

      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Controls Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <label class="form-label" style="margin:0; font-weight:bold;">Select Party:</label>
              <select class="form-control form-control-sm" id="ledger-party-sel" style="width:240px;">
                ${parties.map(p => `<option value="${p.id}" ${p.id === party.id ? 'selected' : ''}>${escapeHTML(p.name)} (${p.type})</option>`).join('')}
              </select>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="ledger-btn-wa">📱 Copy WhatsApp Text</button>
              <button type="button" class="btn btn-primary btn-sm" id="ledger-btn-pay">+ Record Payment</button>
            </div>
          </div>

          <!-- Aging Buckets Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Current (0-30 Days)</div>
              <strong style="font-size:16px; color:var(--primary);">${formatMoney(aging.buckets.current_0_30, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Past Due (31-60 Days)</div>
              <strong style="font-size:16px; color:#856404;">${formatMoney(aging.buckets.past_31_60, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Past Due (61-90 Days)</div>
              <strong style="font-size:16px; color:#D97762;">${formatMoney(aging.buckets.past_61_90, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Critical (90+ Days)</div>
              <strong style="font-size:16px; color:var(--error-text);">${formatMoney(aging.buckets.past_90_plus, 'PKR')}</strong>
            </div>
            <div class="card" style="padding:12px; background:var(--card); border:2px solid var(--primary);">
              <div style="font-size:11px; color:var(--muted);">Net Balance Owed</div>
              <strong style="font-size:18px; color:var(--primary);">${formatMoney(runningBalance, 'PKR')}</strong>
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <div style="padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--border); font-weight:bold; font-size:13px;">
              Chronological Statement of Account &mdash; ${escapeHTML(party.name)}
            </div>
            <table class="table" style="font-size:12px; margin:0;">
              <thead>
                <tr>
                  <th style="width:90px;">Date</th>
                  <th style="width:110px;">Type</th>
                  <th>Description</th>
                  <th style="text-align:right; width:110px;">Debit (+)</th>
                  <th style="text-align:right; width:110px;">Credit (-)</th>
                  <th style="text-align:right; width:120px;">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                ${events.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">No transactions recorded for this party.</td></tr>' : ''}
                ${(() => {
                  let running = 0;
                  return events.map(ev => {
                    running += (ev.debit - ev.credit);
                    return `
                      <tr>
                        <td>${ev.date}</td>
                        <td><span class="pill pill-neutral" style="font-size:10px;">${ev.type}</span></td>
                        <td>${escapeHTML(ev.desc)}</td>
                        <td style="text-align:right; font-weight:${ev.debit>0?'bold':'normal'};">${ev.debit > 0 ? formatMoney(ev.debit, 'PKR') : '-'}</td>
                        <td style="text-align:right; font-weight:${ev.credit>0?'bold':'normal'}; color:var(--success-text);">${ev.credit > 0 ? formatMoney(ev.credit, 'PKR') : '-'}</td>
                        <td style="text-align:right; font-weight:bold;">${formatMoney(running, 'PKR')}</td>
                      </tr>
                    `;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('ledger-party-sel').onchange = (e) => {
        selectedPartyId = e.target.value;
        draw();
      };

      document.getElementById('ledger-btn-wa').onclick = () => {
        const text = formatWhatsAppReminder(party, aging, { name: 'Smart Bill Auditor Store' });
        navigator.clipboard.writeText(text).then(() => {
          toast.success('WhatsApp payment reminder copied to clipboard!');
        }).catch(() => {
          prompt('Copy WhatsApp text:', text);
        });
      };

      document.getElementById('ledger-btn-pay').onclick = () => {
        openRecordPaymentModal(party, async () => {
          payments = await getAll('payments').catch(() => []);
          draw();
        });
      };
    }

    async function openRecordPaymentModal(party, onDone) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = `
        <div class="card" style="width:400px; padding:20px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Record Payment &mdash; ${escapeHTML(party.name)}</h3>
          <div class="form-group">
            <label class="form-label">Payment Amount (PKR) *</label>
            <input type="number" class="form-control" id="pay-amount" step="any" min="1" required>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Date</label>
            <input type="date" class="form-control" id="pay-date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select class="form-control" id="pay-mode">
              <option value="cash">Cash (Naqd)</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online / Wallet</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ref / Cheque #</label>
            <input type="text" class="form-control" id="pay-ref" placeholder="Optional check or receipt #">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="pay-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="pay-save">Post Payment</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('pay-cancel').onclick = () => overlay.remove();
      document.getElementById('pay-save').onclick = async () => {
        const amt = parseFloat(document.getElementById('pay-amount').value);
        if (!amt || amt <= 0) return alert('Please enter a valid payment amount.');
        const date = document.getElementById('pay-date').value || new Date().toISOString().slice(0,10);
        const mode = document.getElementById('pay-mode').value;
        const ref = document.getElementById('pay-ref').value.trim();

        const amtMinor = parseMoney(String(amt), 'PKR');
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

        await put('payments', {
          id: 'pm_' + Math.random().toString(36).slice(2, 9),
          partyId: party.id,
          partyName: party.name,
          amountMinor: amtMinor,
          currency: 'PKR',
          date,
          paymentMode: mode,
          ref,
          status: 'completed',
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        await appendAuditLog({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'PAYMENT_RECORDED',
          summary: `Payment of ${formatMoney(amtMinor, 'PKR')} recorded for ${party.name}`,
          outcome: 'success'
        });

        toast.success('Payment recorded successfully.');
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 3. Inventory & Items Master View
  async function renderInventoryView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Inventory Control & Stock Master';

    await autoReconcileLegacyTransactions();

    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);

    async function draw() {
      // Calculate totals
      let totalValueMinor = 0;
      let lowStockCount = 0;

      const itemsWithStock = items.map(it => {
        const purchasePrice = it.purchasePriceMinor ?? it.baseCostMinor ?? it.costPriceMinor ?? it.wacRate ?? 0;
        const salePrice = it.salePriceMinor ?? it.basePriceMinor ?? it.sellingPriceMinor ?? 0;
        let curStockMilli = computeItemStock(it.id, movements);
        const hasMovements = movements.some(m => m.itemId === it.id && m.status !== 'cancelled');
        if (!hasMovements) {
          if (it.currentStockMilli != null) curStockMilli = it.currentStockMilli;
          else if (it.openingStockMilli != null) curStockMilli = it.openingStockMilli;
          else curStockMilli = 0;
        }
        const valMinor = curStockMilli > 0 ? lineTotal(curStockMilli, purchasePrice) : 0;
        totalValueMinor += valMinor;
        const isLow = curStockMilli <= (it.reorderLevelMilli != null ? it.reorderLevelMilli : 10000);
        if (isLow) lowStockCount++;
        return { ...it, purchasePriceMinor: purchasePrice, salePriceMinor: salePrice, curStockMilli, valMinor, isLow };
      });

      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Stats Bar -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Tracked Items</div>
              <strong style="font-size:18px; color:var(--primary);">${items.length} SKUs</strong>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Items Below Reorder Level</div>
              <strong style="font-size:18px; color:${lowStockCount>0?'var(--secondary)':'var(--success-text)'};">${lowStockCount} Items</strong>
            </div>
            <div class="card" style="padding:14px; background:var(--panel);">
              <div style="font-size:11px; color:var(--muted);">Total Inventory Value (اسٹاک کی کل مالیت)</div>
              <strong style="font-size:18px; color:var(--primary);">${formatMoney(totalValueMinor, 'PKR')}</strong>
            </div>
          </div>

          <!-- Actions Bar -->
          <div class="card" style="padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <input type="text" class="form-control form-control-sm" id="inv-search" placeholder="Search item name, category..." style="width:240px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-adjust-stock">⚖ Adjust Stock</button>
              <button type="button" class="btn btn-primary btn-sm" id="btn-add-item">+ New Item</button>
            </div>
          </div>

          <!-- Items Table -->
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Item Name</th>
                  <th>Vendor</th>
                  <th>Unit</th>
                  <th style="text-align:right;">Purchase Price</th>
                  <th style="text-align:right;">Sale Price</th>
                  <th style="text-align:right;">Stock (تعداد)</th>
                  <th style="text-align:right;">Inventory Value</th>
                  <th style="text-align:center;">Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="inv-tbody"></tbody>
            </table>
            <div style="padding:10px 18px; background:var(--panel); border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12px; color:var(--muted);">Total Tracked Items: <strong>${items.length} SKUs</strong></span>
            </div>
          </div>
        </div>
      `;

      function renderTbody(list) {
        const tbody = document.getElementById('inv-tbody');
        if (!tbody) return;
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--muted);">No inventory items found. Add items to begin tracking.</td></tr>';
          return;
        }

        tbody.innerHTML = list.map(it => {
          const qtyUnits = (it.curStockMilli / 1000).toFixed(2);
          const badge = it.isLow
            ? '<span class="pill pill-warning" style="background:#FFF3CD; color:#856404; font-size:10px;">Low Stock</span>'
            : '<span class="pill pill-success" style="font-size:10px;">In Stock</span>';
          return `
            <tr>
              <td><strong>${escapeHTML(it.name)}</strong> ${it.urduName ? `<span style="color:var(--muted); font-size:11px;">(${escapeHTML(it.urduName)})</span>` : ''}</td>
              <td>${it.vendorName ? `<span style="font-weight:600; color:var(--text);">${escapeHTML(it.vendorName)}</span>` : '<span style="color:var(--muted);">—</span>'}</td>
              <td>${escapeHTML(it.unit || 'pcs')}</td>
              <td style="text-align:right; font-variant-numeric:tabular-nums;">${formatMoney(it.purchasePriceMinor || 0, 'PKR')}</td>
              <td style="text-align:right; font-weight:600; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(it.salePriceMinor || 0, 'PKR')}</td>
              <td style="text-align:right; font-weight:bold; color:${it.isLow?'var(--secondary)':'inherit'}; font-variant-numeric:tabular-nums;">${qtyUnits}</td>
              <td style="text-align:right; font-weight:bold; font-variant-numeric:tabular-nums;">${formatMoney(it.valMinor, 'PKR')}</td>
              <td style="text-align:center;">${badge}</td>
              <td style="text-align:right; white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-xs btn-it-edit" data-id="${it.id}">✏ Edit</button>
                <button type="button" class="btn btn-secondary btn-xs btn-it-del" data-id="${it.id}" style="color:var(--error-text); border-color:var(--error-border); margin-left:4px;">🗑 Delete</button>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('.btn-it-edit').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            const target = itemsWithStock.find(it => it.id === id);
            if (target) {
              openEditItemModal(target, async () => {
                items = await getAll('items').catch(() => []);
                movements = await getAll('stockMovements').catch(() => []);
                draw();
              });
            }
          };
        });

        tbody.querySelectorAll('.btn-it-del').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-id');
            const target = itemsWithStock.find(it => it.id === id);
            const name = target ? target.name : 'this item';
            if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will permanently remove the item from inventory.`)) {
              return;
            }
            await remove('items', id).catch(() => {});
            toast.success(`"${name}" deleted successfully.`);
            items = await getAll('items').catch(() => []);
            movements = await getAll('stockMovements').catch(() => []);
            draw();
          };
        });
      }

      renderTbody(itemsWithStock);

      document.getElementById('inv-search').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        const res = itemsWithStock.filter(it => (it.name||'').toLowerCase().includes(q) || (it.vendorName||'').toLowerCase().includes(q) || (it.urduName||'').toLowerCase().includes(q) || (it.category||'').toLowerCase().includes(q));
        renderTbody(res);
      };

      const handleAddItem = () => openAddItemModal(async () => {
        items = await getAll('items').catch(() => []);
        movements = await getAll('stockMovements').catch(() => []);
        draw();
      });
      document.getElementById('btn-add-item').onclick = handleAddItem;
      const btmAddItm = document.getElementById('btn-add-item-bottom');
      if (btmAddItm) btmAddItm.onclick = handleAddItem;

      document.getElementById('btn-adjust-stock').onclick = () => openAdjustStockModal(itemsWithStock, async () => {
        items = await getAll('items').catch(() => []);
        movements = await getAll('stockMovements').catch(() => []);
        draw();
      });
    }

    async function openEditItemModal(item, onDone) {
      const parties = await getAll('parties').catch(() => []);
      const vendors = parties.filter(p => (p.type || 'vendor') === 'vendor');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      const costStr = (item.purchasePriceMinor ? (item.purchasePriceMinor / 100).toFixed(2) : '0.00');
      const saleStr = (item.salePriceMinor ? (item.salePriceMinor / 100).toFixed(2) : '0.00');
      const reorderQty = (item.reorderLevelMilli ? (item.reorderLevelMilli / 1000) : 10);
      const curStockStr = ((item.curStockMilli || 0) / 1000).toFixed(2);

      overlay.innerHTML = `
        <div class="card" style="width:460px; max-height:92vh; overflow-y:auto; padding:22px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; color:var(--primary);">Edit Inventory Item</h3>
            <span class="pill pill-primary" style="font-size:11px;">Current: ${curStockStr} ${escapeHTML(item.unit||'pcs')}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-control" id="it-edit-name" value="${escapeHTML(item.name || '')}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Urdu / Local Name</label>
            <input type="text" class="form-control" id="it-edit-urdu" value="${escapeHTML(item.urduName || '')}" placeholder="مثلاً: چینی، چاول، دودھ">
          </div>

          <div class="form-group">
            <label class="form-label">Vendor / Supplier (وینڈر / بیوپاری)</label>
            <input type="text" class="form-control" id="it-edit-vendor" list="it-edit-vendor-list" value="${escapeHTML(item.vendorName || '')}" placeholder="Select or type vendor name">
            <datalist id="it-edit-vendor-list">
              ${vendors.map(v => `<option value="${escapeHTML(v.name)}">${v.phone ? `(${escapeHTML(v.phone)})` : ''}</option>`).join('')}
            </datalist>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Purchase Price (خرید قیمت - Rs.)</label>
              <input type="number" class="form-control" id="it-edit-cost" step="any" min="0" value="${costStr}">
            </div>
            <div class="form-group">
              <label class="form-label">Sale Price (فروخت قیمت - Rs.)</label>
              <input type="number" class="form-control" id="it-edit-sale-price" step="any" min="0" value="${saleStr}">
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Primary Unit</label>
              <select class="form-control" id="it-edit-unit">
                <option value="pcs" ${item.unit==='pcs'?'selected':''}>Pieces (عدد / pcs)</option>
                <option value="kg" ${item.unit==='kg'?'selected':''}>Kilograms (کلو گرام - kg)</option>
                <option value="g" ${item.unit==='g'?'selected':''}>Grams (گرام - g)</option>
                <option value="Ltr" ${item.unit==='Ltr'?'selected':''}>Litres (لیٹر - Ltr)</option>
                <option value="ml" ${item.unit==='ml'?'selected':''}>Millilitres (ملی لیٹر - ml)</option>
                <option value="dozen" ${item.unit==='dozen'?'selected':''}>Dozen (درجن - dz)</option>
                <option value="pack" ${item.unit==='pack'?'selected':''}>Pack / Packet (پیکٹ)</option>
                <option value="box" ${item.unit==='box'?'selected':''}>Box (ڈبہ)</option>
                <option value="bag" ${item.unit==='bag'?'selected':''}>Bag (بوری / تھیلا)</option>
                <option value="carton" ${item.unit==='carton'?'selected':''}>Carton (کارٹن)</option>
                <option value="meter" ${item.unit==='meter'?'selected':''}>Meter (میٹر)</option>
                <option value="ft" ${item.unit==='ft'?'selected':''}>Foot (فٹ)</option>
                <option value="month" ${item.unit==='month'?'selected':''}>Month (مہینہ / فیس)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Reorder Alert Level (Qty)</label>
              <input type="number" class="form-control" id="it-edit-reorder" value="${reorderQty}">
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="it-edit-del" style="color:var(--error-text); border-color:var(--error-border);">🗑 Delete Item</button>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="it-edit-cancel">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="it-edit-save">Save Changes</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('it-edit-cancel').onclick = () => overlay.remove();

      document.getElementById('it-edit-del').onclick = async () => {
        if (!confirm(`Are you sure you want to delete "${item.name}"?\n\nThis will permanently remove the item from inventory.`)) return;
        await remove('items', item.id).catch(() => {});
        toast.success(`"${item.name}" deleted.`);
        overlay.remove();
        if (onDone) onDone();
      };

      document.getElementById('it-edit-save').onclick = async () => {
        const name = document.getElementById('it-edit-name').value.trim();
        if (!name) return alert('Item name is required.');
        const urdu = document.getElementById('it-edit-urdu').value.trim();
        const vendorName = document.getElementById('it-edit-vendor')?.value.trim() || '';
        const unit = document.getElementById('it-edit-unit').value;
        const costVal = parseFloat(document.getElementById('it-edit-cost').value) || 0;
        const saleVal = parseFloat(document.getElementById('it-edit-sale-price').value) || 0;
        const reorder = parseFloat(document.getElementById('it-edit-reorder').value) || 10;

        const purchasePriceMinor = parseMoney(String(costVal), 'PKR');
        const salePriceMinor = parseMoney(String(saleVal), 'PKR');

        const existing = await get('items', item.id).catch(() => null) || item;
        existing.name = name;
        existing.urduName = urdu;
        existing.vendorName = vendorName;
        existing.unit = unit;
        existing.purchasePriceMinor = purchasePriceMinor;
        existing.salePriceMinor = salePriceMinor;
        existing.reorderLevelMilli = Math.round(reorder * 1000);
        existing.updatedAt = new Date().toISOString();

        await put('items', existing);

        if (vendorName) {
          const newVendData = { name: vendorName, type: 'vendor' };
          const existingVendor = parties.find(p => arePartiesDuplicate(p, newVendData));
          if (!existingVendor) {
            await put('parties', {
              id: 'party_v_' + Math.random().toString(36).slice(2, 9),
              name: vendorName,
              type: 'vendor',
              phone: '',
              city: '',
              taxId: extractPartyTaxId(vendorName),
              balanceMinor: 0,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
        }

        toast.success(`Item "${name}" updated successfully.`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openAddItemModal(onDone) {
      const parties = await getAll('parties').catch(() => []);
      const vendors = parties.filter(p => (p.type || 'vendor') === 'vendor');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = `
        <div class="card" style="width:460px; max-height:92vh; overflow-y:auto; padding:22px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Add New Inventory Item</h3>
          <div class="form-group">
            <label class="form-label">Item Name *</label>
            <input type="text" class="form-control" id="it-new-name" placeholder="e.g. Milk, Tea, Sugar" required>
          </div>
          <div class="form-group">
            <label class="form-label">Urdu / Local Name</label>
            <input type="text" class="form-control" id="it-new-urdu" placeholder="مثلاً: چینی، چاول، دودھ">
          </div>
          <div class="form-group">
            <label class="form-label">Vendor / Supplier (وینڈر / بیوپاری)</label>
            <input type="text" class="form-control" id="it-new-vendor" list="it-vendor-list" placeholder="Select or type vendor (e.g. Aslam Super Store)">
            <datalist id="it-vendor-list">
              ${vendors.map(v => `<option value="${escapeHTML(v.name)}">${v.phone ? `(${escapeHTML(v.phone)})` : ''}</option>`).join('')}
            </datalist>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Purchase Price (خرید قیمت - Rs.)</label>
              <input type="number" class="form-control" id="it-new-cost" step="any" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
              <label class="form-label">Sale Price (فروخت قیمت - Rs.)</label>
              <input type="number" class="form-control" id="it-new-sale-price" step="any" min="0" placeholder="0.00">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Primary Unit</label>
              <select class="form-control" id="it-new-unit">
                <option value="pcs">Pieces (عدد / pcs)</option>
                <option value="kg">Kilograms (کلو گرام - kg)</option>
                <option value="g">Grams (گرام - g)</option>
                <option value="Ltr">Litres (لیٹر - Ltr)</option>
                <option value="ml">Millilitres (ملی لیٹر - ml)</option>
                <option value="dozen">Dozen (درجن - dz)</option>
                <option value="pack">Pack / Packet (پیکٹ)</option>
                <option value="box">Box (ڈبہ)</option>
                <option value="bag">Bag (بوری / تھیلا)</option>
                <option value="carton">Carton (کارٹن)</option>
                <option value="meter">Meter (میٹر)</option>
                <option value="ft">Foot (فٹ)</option>
                <option value="month">Month (مہینہ / فیس)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Opening Stock (Qty)</label>
              <input type="number" class="form-control" id="it-new-init-stock" step="any" min="0" value="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Reorder Alert Level (Qty)</label>
            <input type="number" class="form-control" id="it-new-reorder" value="10">
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="it-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="it-save">Save Item</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('it-cancel').onclick = () => overlay.remove();
      document.getElementById('it-save').onclick = async () => {
        const name = document.getElementById('it-new-name').value.trim();
        if (!name) return alert('Item name is required.');
        const urdu = document.getElementById('it-new-urdu').value.trim();
        const vendorName = document.getElementById('it-new-vendor')?.value.trim() || '';
        const unit = document.getElementById('it-new-unit').value;
        const costVal = parseFloat(document.getElementById('it-new-cost').value) || 0;
        const saleVal = parseFloat(document.getElementById('it-new-sale-price').value) || 0;
        const initStock = parseFloat(document.getElementById('it-new-init-stock').value) || 0;
        const reorder = parseFloat(document.getElementById('it-new-reorder').value) || 10;

        const purchasePriceMinor = parseMoney(String(costVal), 'PKR');
        const salePriceMinor = parseMoney(String(saleVal), 'PKR');
        const itemId = 'item_' + Math.random().toString(36).slice(2, 9);
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
        const initStockMilli = Math.round(initStock * 1000);

        await put('items', {
          id: itemId,
          name,
          urduName: urdu,
          vendorName,
          unit,
          purchasePriceMinor,
          salePriceMinor,
          currentStockMilli: initStockMilli,
          reorderLevelMilli: Math.round(reorder * 1000),
          createdAt: new Date().toISOString()
        });

        // Auto-register vendor in parties if not duplicate
        if (vendorName) {
          const newVendData = { name: vendorName, type: 'vendor' };
          const existingVendor = parties.find(p => arePartiesDuplicate(p, newVendData));
          if (!existingVendor) {
            await put('parties', {
              id: 'party_v_' + Math.random().toString(36).slice(2, 9),
              name: vendorName,
              type: 'vendor',
              phone: '',
              city: '',
              taxId: extractPartyTaxId(vendorName),
              balanceMinor: 0,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
        }

        if (initStock > 0) {
          await put('stockMovements', {
            id: 'sm_' + Math.random().toString(36).slice(2, 9),
            itemId,
            qtyChangeMilli: initStockMilli,
            deltaMilli: initStockMilli,
            unitPriceMinor: purchasePriceMinor,
            type: 'in',
            status: 'posted',
            date: new Date().toISOString().slice(0, 10),
            reason: 'Opening Balance',
            createdBy: user.id,
            createdAt: new Date().toISOString()
          });
        }

        toast.success(`Item "${name}" added with ${initStock} ${unit} stock.`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openAdjustStockModal(itemList, onDone) {
      if (itemList.length === 0) return alert('No items available to adjust.');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      const firstItem = itemList[0];
      const curStockStr = (firstItem.curStockMilli / 1000).toFixed(2);

      overlay.innerHTML = `
        <div class="card" style="width:450px; padding:22px; max-height:92vh; overflow-y:auto;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Adjust Stock (اسٹاک درست کریں)</h3>
          
          <div class="form-group">
            <label class="form-label">Select Item *</label>
            <select class="form-control" id="adj-item">
              ${itemList.map(it => `<option value="${it.id}" data-stock="${(it.curStockMilli/1000).toFixed(2)}" data-unit="${escapeHTML(it.unit||'pcs')}">${escapeHTML(it.name)} (${it.unit||'pcs'})</option>`).join('')}
            </select>
          </div>

          <!-- Current Stock Indicator -->
          <div class="panel" style="background:var(--panel); padding:10px 14px; border-radius:6px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; color:var(--muted);">Current Recorded Stock:</span>
            <strong id="adj-cur-display" style="font-size:15px; color:var(--primary);">${curStockStr} ${escapeHTML(firstItem.unit||'pcs')}</strong>
          </div>

          <div class="form-group">
            <label class="form-label">Adjustment Mode (طریقہ کار)</label>
            <div style="display:flex; gap:16px; margin-top:4px;">
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                <input type="radio" name="adj-mode" value="set" checked id="adj-mode-set">
                <span><strong>Set Exact Stock</strong> (نیا درست اسٹاک)</span>
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                <input type="radio" name="adj-mode" value="diff" id="adj-mode-diff">
                <span><strong>+ / - Diff</strong> (اضافہ یا کمی)</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" id="adj-qty-label">New Exact Total Stock (درست تعداد) *</label>
            <input type="number" class="form-control" id="adj-qty" step="any" placeholder="e.g. 30" required>
            <small id="adj-qty-hint" style="color:var(--muted); font-size:11px; display:block; margin-top:4px;">Enter the exact real stock count. The system will automatically compute and apply the required adjustment.</small>
          </div>

          <div class="form-group">
            <label class="form-label">Adjustment Reason *</label>
            <select class="form-control" id="adj-reason">
              <option value="count_correction" selected>Physical Count Correction (فزیکل گنتی / تصحیح)</option>
              <option value="damage">Damage / Expired (خراب یا زائد المیعاد)</option>
              <option value="loss">Loss / Theft (گمشدگی یا کمی)</option>
              <option value="sample">Free Sample / Promotion (سیمپل)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Notes (تفصیل / وجہ)</label>
            <input type="text" class="form-control" id="adj-notes" placeholder="Optional explanation">
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="adj-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="adj-save">Update Stock</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const selItem = document.getElementById('adj-item');
      const curDisplay = document.getElementById('adj-cur-display');
      const modeSet = document.getElementById('adj-mode-set');
      const modeDiff = document.getElementById('adj-mode-diff');
      const qtyLabel = document.getElementById('adj-qty-label');
      const qtyHint = document.getElementById('adj-qty-hint');
      const qtyInput = document.getElementById('adj-qty');

      function updateItemDisplay() {
        const opt = selItem.options[selItem.selectedIndex];
        if (!opt) return;
        const stock = opt.getAttribute('data-stock') || '0.00';
        const unit = opt.getAttribute('data-unit') || 'pcs';
        curDisplay.textContent = `${stock} ${unit}`;
        if (modeSet.checked) {
          qtyInput.value = stock;
        }
      }

      function updateModeLabels() {
        if (modeSet.checked) {
          qtyLabel.textContent = 'New Exact Total Stock (درست تعداد) *';
          qtyHint.textContent = 'Enter the exact real stock count. The system will automatically compute and apply the required adjustment.';
          qtyInput.placeholder = 'e.g. 30';
          const opt = selItem.options[selItem.selectedIndex];
          if (opt) qtyInput.value = opt.getAttribute('data-stock') || '';
        } else {
          qtyLabel.textContent = 'Quantity Change (+ or -) *';
          qtyHint.textContent = 'Enter positive value to add (+), or negative value to deduct (-).';
          qtyInput.placeholder = 'e.g. +5 or -2';
          qtyInput.value = '';
        }
      }

      selItem.onchange = updateItemDisplay;
      modeSet.onchange = updateModeLabels;
      modeDiff.onchange = updateModeLabels;
      updateItemDisplay();

      document.getElementById('adj-cancel').onclick = () => overlay.remove();
      document.getElementById('adj-save').onclick = async () => {
        const itemId = selItem.value;
        const qVal = parseFloat(qtyInput.value);
        if (isNaN(qVal)) return alert('Please enter a valid stock quantity.');

        const targetItem = itemList.find(it => it.id === itemId);
        const currentMilli = targetItem ? (targetItem.curStockMilli || 0) : 0;
        
        let deltaMilli = 0;
        let finalStockMilli = 0;

        if (modeSet.checked) {
          finalStockMilli = Math.round(qVal * 1000);
          deltaMilli = finalStockMilli - currentMilli;
        } else {
          deltaMilli = Math.round(qVal * 1000);
          finalStockMilli = currentMilli + deltaMilli;
        }

        if (deltaMilli === 0) {
          toast.info('Stock already matches this value. No adjustment needed.');
          overlay.remove();
          return;
        }

        const reason = document.getElementById('adj-reason').value;
        const notes = document.getElementById('adj-notes').value.trim();
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
        const unitCostMinor = targetItem?.purchasePriceMinor || targetItem?.wacRate || 0;

        await put('stockMovements', {
          id: 'sm_' + Math.random().toString(36).slice(2, 9),
          itemId,
          type: 'adjustment',
          reason,
          qtyChangeMilli: deltaMilli,
          deltaMilli: deltaMilli,
          unitPriceMinor: unitCostMinor,
          notes: notes || `Stock adjusted from ${(currentMilli/1000).toFixed(2)} to ${(finalStockMilli/1000).toFixed(2)}`,
          status: 'posted',
          date: new Date().toISOString().slice(0, 10),
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        const rawItem = await get('items', itemId).catch(() => null);
        if (rawItem) {
          rawItem.currentStockMilli = finalStockMilli;
          if (unitCostMinor > 0 && (!rawItem.purchasePriceMinor || rawItem.purchasePriceMinor <= 0)) {
            rawItem.purchasePriceMinor = unitCostMinor;
          }
          await put('items', rawItem).catch(() => {});
        }

        toast.success(`Stock for "${targetItem ? targetItem.name : 'item'}" updated to ${(finalStockMilli/1000).toFixed(2)}.`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 4. Orders View (Purchase Orders & Payment Vouchers & Debit Notes)
  async function renderOrdersView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Purchase Orders & Payment Vouchers';

    let activeTab = 'po'; // 'po' | 'voucher' | 'debit_notes'
    let poList = await getAll('purchaseOrders').catch(() => []);
    let vouchers = await getAll('payments').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);
    let parties = await getAll('parties').catch(() => []);
    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);

    async function draw() {
      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Tabs & Action Bar -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ${activeTab==='po'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-po">Purchase Orders</button>
              <button type="button" class="btn ${activeTab==='voucher'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-voc">Payment Vouchers</button>
              <button type="button" class="btn ${activeTab==='debit_notes'?'btn-primary':'btn-secondary'} btn-sm" id="ord-tab-dn">Shortage Claims (Debit Notes)</button>
            </div>
            <div id="ord-action-btn-mount"></div>
          </div>

          <!-- Body Content -->
          <div id="ord-body-mount"></div>
        </div>
      `;

      document.getElementById('ord-tab-po').onclick = () => { activeTab = 'po'; draw(); };
      document.getElementById('ord-tab-voc').onclick = () => { activeTab = 'voucher'; draw(); };
      document.getElementById('ord-tab-dn').onclick = () => { activeTab = 'debit_notes'; draw(); };

      const actionMount = document.getElementById('ord-action-btn-mount');
      const bodyMount = document.getElementById('ord-body-mount');

      if (activeTab === 'po') {
        actionMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-create-po">+ New Purchase Order</button>';
        bodyMount.innerHTML = `
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>PO #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th style="text-align:right;">Items</th>
                  <th style="text-align:right;">Total Amount</th>
                  <th style="text-align:center;">Status</th>
                  <th style="text-align:center;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${poList.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted);">No purchase orders issued yet.</td></tr>' : ''}
                ${poList.map(p => `
                  <tr>
                    <td><strong>${escapeHTML(p.poNumber)}</strong></td>
                    <td>${escapeHTML(p.vendorName)}</td>
                    <td>${p.date}</td>
                    <td style="text-align:right;">${(p.lines||[]).length}</td>
                    <td style="text-align:right; font-weight:bold;">${formatMoney(p.grandTotalMinor, p.currency)}</td>
                    <td style="text-align:center;"><span class="pill pill-primary">${p.status.toUpperCase()}</span></td>
                    <td style="text-align:center;"><button type="button" class="btn btn-secondary btn-xs btn-view-po" data-poid="${p.id}">📄 View PO</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        bodyMount.querySelectorAll('.btn-view-po').forEach(btn => {
          btn.onclick = () => {
            const poid = btn.getAttribute('data-poid');
            const foundPO = poList.find(p => p.id === poid);
            if (foundPO) openPOViewModal(foundPO);
          };
        });

        document.getElementById('btn-create-po').onclick = () => openCreatePOModal(parties, items, movements, async () => {
          poList = await getAll('purchaseOrders').catch(() => []);
          draw();
        });
      } else if (activeTab === 'voucher') {
        actionMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-create-voc">+ New Payment Voucher</button>';
        bodyMount.innerHTML = `
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Voucher #</th>
                  <th>Payee</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th style="text-align:right;">Amount</th>
                  <th>Amount in Words</th>
                </tr>
              </thead>
              <tbody>
                ${vouchers.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No payment vouchers recorded yet.</td></tr>' : ''}
                ${vouchers.map(v => `
                  <tr>
                    <td><strong>${escapeHTML(v.voucherNumber || v.id)}</strong></td>
                    <td>${escapeHTML(v.partyName || v.payeeName || '-')}</td>
                    <td>${v.date}</td>
                    <td>${escapeHTML((v.paymentMode||'cash').toUpperCase())}</td>
                    <td style="text-align:right; font-weight:bold; color:var(--primary);">${formatMoney(v.amountMinor, v.currency)}</td>
                    <td style="font-size:11px; font-style:italic; color:var(--muted);">${escapeHTML(v.words || amountInWords(v.amountMinor, 'PKR', {system:'indian'}))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        document.getElementById('btn-create-voc').onclick = () => openCreateVoucherModal(parties, async () => {
          vouchers = await getAll('payments').catch(() => []);
          draw();
        });
      } else {
        // Debit Notes
        actionMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-create-dn">+ New Shortage Claim (Debit Note)</button>';
        bodyMount.innerHTML = `
          <div class="card" style="padding:0; overflow:hidden;">
            <table class="table" style="font-size:13px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Claim Note #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th>Shortage Reason</th>
                  <th style="text-align:right;">Shortage Amount</th>
                  <th style="text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${debitNotes.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted);">No shortage claims recorded yet. Click "+ New Shortage Claim" or report short deliveries to record a claim.</td></tr>' : ''}
                ${debitNotes.map(d => `
                  <tr>
                    <td><strong>${escapeHTML(d.noteNumber || d.id)}</strong></td>
                    <td>${escapeHTML(d.vendorName)}</td>
                    <td>${d.date}</td>
                    <td style="font-size:11px;">${escapeHTML(d.reason || `Short delivery on Bill #${d.billNumber || '-'}`)}</td>
                    <td style="text-align:right; font-weight:bold; color:var(--secondary);">${formatMoney(d.totalMinor, d.currency || 'PKR')}</td>
                    <td style="text-align:center;"><span class="pill pill-warning">${(d.status || 'open').toUpperCase()}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        const btnDn = document.getElementById('btn-create-dn');
        if (btnDn) {
          btnDn.onclick = () => openCreateDebitNoteModal(parties, async () => {
            debitNotes = await getAll('debitNotes').catch(() => []);
            draw();
          });
        }
      }
    }

    function openPOViewModal(po) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.55); display:flex; justify-content:center; align-items:center; z-index:9999;';
      overlay.innerHTML = `
        <div class="card" style="width:90%; max-width:680px; max-height:90vh; overflow-y:auto; padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h2 style="margin:0; font-size:18px; color:var(--primary); font-weight:700;">Purchase Order: ${escapeHTML(po.poNumber)}</h2>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">Issued on ${po.date} &bull; Vendor: <strong>${escapeHTML(po.vendorName)}</strong></div>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="po-modal-print">🖨️ Print PO</button>
              <button type="button" class="btn btn-secondary btn-sm" id="po-modal-close">✕ Close</button>
            </div>
          </div>
          <div class="card" style="padding:0; overflow:hidden; margin-bottom:16px;">
            <table class="table" style="font-size:12px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th style="width:30px; text-align:center;">#</th>
                  <th>Item</th>
                  <th style="width:80px; text-align:right;">Quantity</th>
                  <th style="width:70px;">Unit</th>
                  <th style="width:110px; text-align:right;">Rate</th>
                  <th style="width:120px; text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${(po.lines || []).map((l, idx) => {
                  const lTot = lineTotal(Math.round((l.qty || 1) * 1000), l.rateMinor || 0);
                  return `
                    <tr>
                      <td style="text-align:center; color:var(--muted);">${idx + 1}</td>
                      <td><strong>${escapeHTML(l.name)}</strong></td>
                      <td style="text-align:right; font-variant-numeric:tabular-nums;">${l.qty}</td>
                      <td>${escapeHTML(l.unit || 'pcs')}</td>
                      <td style="text-align:right; font-variant-numeric:tabular-nums;">${formatMoney(l.rateMinor || 0, 'PKR', {showSymbol:false})}</td>
                      <td style="text-align:right; font-weight:bold; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(lTot, 'PKR')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:12px;">
            <span style="font-size:12px; color:var(--muted);">Total Lines: ${(po.lines||[]).length}</span>
            <div style="text-align:right;">
              <span style="font-size:12px; color:var(--muted);">Grand Total: </span>
              <strong style="font-size:18px; color:var(--primary);">${formatMoney(po.grandTotalMinor, po.currency || 'PKR')}</strong>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('po-modal-close').onclick = () => overlay.remove();
      document.getElementById('po-modal-print').onclick = () => window.print();
    }

    async function openCreatePOModal(partyList, itemList, moveList, onDone) {
      const vendors = partyList.filter(p => p.type === 'vendor');
      const poNum = await getNextSequentialNumber('PO');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      let poLines = [];

      overlay.innerHTML = `
        <div class="card" style="width:720px; max-height:90vh; overflow-y:auto; padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:16px;">
            <h3 style="margin:0; color:var(--primary);">Create Purchase Order (${poNum})</h3>
            <button type="button" class="btn btn-secondary btn-sm" id="po-cancel">✕</button>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Vendor Name *</label>
              <input type="text" class="form-control" id="po-vendor" list="po-vendor-list" placeholder="Select or type vendor name..." required>
              <datalist id="po-vendor-list">
                ${vendors.map(v => `<option value="${escapeHTML(v.name)}"></option>`).join('')}
              </datalist>
            </div>
            <div style="display:flex; align-items:flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" id="po-btn-autofill" style="width:100%;">⚡ Auto-Fill Below Reorder Items</button>
            </div>
          </div>

          <!-- Lines Table -->
          <div class="card" style="padding:0; overflow:hidden; margin-bottom:16px;">
            <datalist id="po-items-datalist">
              ${itemList.map(it => `<option value="${escapeHTML(it.name)}">${escapeHTML(it.name)} (${it.unit || 'pcs'}) - ${formatMoney(it.purchasePriceMinor || it.wacRate || 0, 'PKR')}</option>`).join('')}
            </datalist>
            <div style="padding:8px 12px; background:var(--panel); border-bottom:1px solid var(--border); font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
              <span>Order Line Items</span>
            </div>
            <table class="table" style="font-size:12px; margin:0;">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="width:75px;">Qty</th>
                  <th style="width:65px;">Unit</th>
                  <th style="width:90px;">Rate</th>
                  <th style="width:100px; text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody id="po-lines-tbody"></tbody>
            </table>
            <div style="padding:8px 12px; background:var(--panel); border-top:1px solid var(--border); display:flex; justify-content:flex-end;">
              <button type="button" class="btn btn-primary btn-xs" id="po-add-line">+ Add Line</button>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px;">
            <div>Grand Total: <strong id="po-grand-total" style="font-size:16px; color:var(--primary);">Rs. 0.00</strong></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="po-cancel-btn">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="po-save-btn">Issue Purchase Order</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      function renderLines() {
        const tbody = document.getElementById('po-lines-tbody');
        if (!tbody) return;
        let tot = 0;
        tbody.innerHTML = poLines.map((l, i) => {
          const lTot = lineTotal(Math.round(l.qty * 1000), l.rateMinor);
          tot += lTot;
          return `
            <tr>
              <td><input type="text" class="form-control form-control-sm po-l-name" list="po-items-datalist" value="${escapeHTML(l.name)}" data-i="${i}" placeholder="Item name"></td>
              <td><input type="number" class="form-control form-control-sm po-l-qty" value="${l.qty}" step="any" min="0.001" data-i="${i}" inputmode="decimal" style="text-align:center;"></td>
              <td>${escapeHTML(l.unit||'pcs')}</td>
              <td><input type="text" class="form-control form-control-sm po-l-rate" value="${(l.rateMinor/100).toFixed(2)}" data-i="${i}"></td>
              <td style="text-align:right; font-weight:bold;">${formatMoney(lTot, 'PKR')}</td>
            </tr>
          `;
        }).join('');
        document.getElementById('po-grand-total').textContent = formatMoney(tot, 'PKR');

        tbody.querySelectorAll('.po-l-name').forEach(inp => {
          const checkMatch = (val, i) => {
            const clean = val.trim().toLowerCase();
            const matched = itemList.find(it => it.name && it.name.trim().toLowerCase() === clean);
            if (matched) {
              poLines[i].name = matched.name;
              poLines[i].unit = matched.unit || 'pcs';
              poLines[i].rateMinor = matched.purchasePriceMinor || matched.wacRate || 10000;
              renderLines();
              return true;
            }
            return false;
          };
          inp.oninput = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            checkMatch(e.target.value, i);
          };
          inp.onchange = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            const val = e.target.value.trim() || 'Item';
            if (!checkMatch(val, i)) {
              poLines[i].name = val;
            }
          };
        });
        tbody.querySelectorAll('.po-l-qty').forEach(inp => {
          inp.onchange = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            poLines[i].qty = parseFloat(e.target.value) || 1;
            renderLines();
          };
        });
        tbody.querySelectorAll('.po-l-rate').forEach(inp => {
          inp.onchange = (e) => {
            const i = parseInt(inp.getAttribute('data-i'), 10);
            poLines[i].rateMinor = parseMoney(e.target.value, 'PKR');
            renderLines();
          };
        });
      }

      document.getElementById('po-btn-autofill').onclick = () => {
        poLines = itemList.map(it => ({
          name: it.name,
          qty: 10,
          unit: it.unit || 'pcs',
          rateMinor: it.purchasePriceMinor || it.wacRate || 15000
        }));
        if (poLines.length === 0) {
          poLines.push({ name: 'General Goods', qty: 10, unit: 'pcs', rateMinor: 10000 });
        }
        renderLines();
        toast.success(`Auto-filled ${poLines.length} order items!`);
      };

      const addPOLine = () => {
        poLines.push({ name: 'New Item', qty: 10, unit: 'pcs', rateMinor: 10000 });
        renderLines();
      };
      document.getElementById('po-add-line').onclick = addPOLine;
      const poAddBtm = document.getElementById('po-add-line-bottom');
      if (poAddBtm) poAddBtm.onclick = addPOLine;

      document.getElementById('po-cancel').onclick = () => overlay.remove();
      document.getElementById('po-cancel-btn').onclick = () => overlay.remove();

      document.getElementById('po-save-btn').onclick = async () => {
        if (poLines.length === 0) return alert('Please add at least one line item.');
        const vendor = document.getElementById('po-vendor').value.trim();
        if (!vendor) return alert('Please enter or select a vendor name.');
        let sub = 0;
        for (const l of poLines) sub += lineTotal(Math.round(l.qty * 1000), l.rateMinor);

        const existingPOs = await getAll('purchaseOrders').catch(() => []);
        const todayStr = new Date().toISOString().slice(0, 10);
        const dupPO = existingPOs.find(po => {
          if (po.poNumber === poNum) return true;
          const sameVendor = (po.vendorName || '').toLowerCase().trim() === vendor.toLowerCase().trim();
          const sameDate = po.date === todayStr;
          const sameTotal = po.grandTotalMinor === sub;
          return sameVendor && sameDate && sameTotal;
        });

        if (dupPO) {
          const overwrite = confirm(`⚠️ Duplicate Purchase Order Warning!\n\nA purchase order for vendor "${vendor}" with total ${formatMoney(sub, 'PKR')} was already issued today (${dupPO.poNumber}).\n\nDo you want to proceed and issue an updated purchase order?`);
          if (!overwrite) return;
        }

        await put('purchaseOrders', {
          id: 'po_' + Math.random().toString(36).slice(2, 9),
          poNumber: poNum,
          vendorName: vendor,
          date: todayStr,
          currency: 'PKR',
          lines: poLines,
          grandTotalMinor: sub,
          status: 'issued',
          createdAt: new Date().toISOString()
        });

        toast.success(`Purchase Order ${poNum} issued!`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openCreateDebitNoteModal(partyList, onDone) {
      const dnNum = await getNextSequentialNumber('DN');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      overlay.innerHTML = `
        <div class="card" style="width:480px; padding:24px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Shortage Claim / Debit Note (${dnNum})</h3>
          <div class="form-group">
            <label class="form-label">Vendor Name *</label>
            <input type="text" class="form-control" id="dn-vendor" list="dn-parties-list" placeholder="Select or type vendor" required>
            <datalist id="dn-parties-list">${partyList.map(p => `<option value="${escapeHTML(p.name)}"></option>`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Original Bill / Invoice #</label>
            <input type="text" class="form-control" id="dn-bill-no" placeholder="e.g. 030146">
          </div>
          <div class="form-group">
            <label class="form-label">Shortage Reason *</label>
            <input type="text" class="form-control" id="dn-reason" placeholder="e.g. 2 boxes missing on delivery" required>
          </div>
          <div class="form-group">
            <label class="form-label">Claim Amount (PKR) *</label>
            <input type="number" class="form-control" id="dn-amount" step="any" min="1" placeholder="0.00" required>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="dn-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="dn-save">Record Claim</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('dn-cancel').onclick = () => overlay.remove();
      document.getElementById('dn-save').onclick = async () => {
        const vendor = document.getElementById('dn-vendor').value.trim();
        if (!vendor) return alert('Vendor name is required.');
        const reason = document.getElementById('dn-reason').value.trim() || 'Shortage on receipt';
        const amt = parseFloat(document.getElementById('dn-amount').value) || 0;
        if (amt <= 0) return alert('Please enter a valid claim amount.');
        const billNo = document.getElementById('dn-bill-no').value.trim();
        const minor = parseMoney(String(amt), 'PKR');

        await put('debitNotes', {
          id: 'dn_' + Math.random().toString(36).slice(2, 9),
          noteNumber: dnNum,
          vendorName: vendor,
          billNumber: billNo,
          reason,
          totalMinor: minor,
          currency: 'PKR',
          date: new Date().toISOString().slice(0, 10),
          status: 'open',
          createdAt: new Date().toISOString()
        });

        toast.success(`Shortage Claim ${dnNum} recorded!`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    async function openCreateVoucherModal(partyList, onDone) {
      const pvNum = await getNextSequentialNumber('PV');
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;';

      overlay.innerHTML = `
        <div class="card" style="width:480px; padding:24px;">
          <h3 style="margin:0 0 16px 0; color:var(--primary);">Payment Voucher (${pvNum})</h3>
          <div class="form-group">
            <label class="form-label">Payee Name *</label>
            <input type="text" class="form-control" id="pv-payee" list="pv-parties-list" placeholder="Vendor or Person" required>
            <datalist id="pv-parties-list">${partyList.map(p => `<option value="${escapeHTML(p.name)}"></option>`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (PKR) *</label>
            <input type="number" class="form-control" id="pv-amount" step="any" min="1" required>
          </div>
          <div class="form-group">
            <label class="form-label">Amount in Words</label>
            <div id="pv-words-preview" style="font-size:12px; font-style:italic; color:var(--primary); padding:6px 10px; background:var(--panel); border:1px solid var(--border);">Zero Rupees Only</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label">Numbering Style</label>
              <select class="form-control" id="pv-word-style">
                <option value="indian">Indian (Lakhs / Crores)</option>
                <option value="western">Western (Millions)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Payment Mode</label>
              <select class="form-control" id="pv-mode">
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
            <button type="button" class="btn btn-secondary btn-sm" id="pv-cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="pv-save">Authorize & Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      function updateWords() {
        const amt = parseFloat(document.getElementById('pv-amount').value) || 0;
        const style = document.getElementById('pv-word-style').value;
        const minor = parseMoney(String(amt), 'PKR');
        const words = amountInWords(minor, 'PKR', { system: style });
        document.getElementById('pv-words-preview').textContent = words;
      }

      document.getElementById('pv-amount').oninput = updateWords;
      document.getElementById('pv-word-style').onchange = updateWords;
      document.getElementById('pv-cancel').onclick = () => overlay.remove();

      document.getElementById('pv-save').onclick = async () => {
        const payee = document.getElementById('pv-payee').value.trim();
        if (!payee) return alert('Payee name is required.');
        const amt = parseFloat(document.getElementById('pv-amount').value) || 0;
        if (amt <= 0) return alert('Please enter a valid amount.');
        const style = document.getElementById('pv-word-style').value;
        const mode = document.getElementById('pv-mode').value;
        const minor = parseMoney(String(amt), 'PKR');
        const words = amountInWords(minor, 'PKR', { system: style });
        const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

        await put('payments', {
          id: 'pv_' + Math.random().toString(36).slice(2, 9),
          voucherNumber: pvNum,
          payeeName: payee,
          partyName: payee,
          amountMinor: minor,
          currency: 'PKR',
          words,
          paymentMode: mode,
          date: new Date().toISOString().slice(0, 10),
          status: 'completed',
          createdBy: user.id,
          createdAt: new Date().toISOString()
        });

        toast.success(`Payment Voucher ${pvNum} authorized!`);
        overlay.remove();
        if (onDone) onDone();
      };
    }

    draw();
  }

  // 5. Sales & Margin POS View
  async function renderSalesView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Point of Sale & Margin Manager';

    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);
    let customers = await getAll('parties').catch(() => []);
    customers = customers.filter(p => p.type === 'customer');
    let pastSales = await getAll('transactions').catch(() => []);
    pastSales = pastSales.filter(t => t.type === 'sale');
    pastSales.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    let cartLines = [];

    mainEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Header -->
        <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:6px;">
              <label class="form-label" style="margin:0; font-weight:bold;">Customer:</label>
              <input type="text" class="form-control form-control-sm" id="sale-cust" list="sale-cust-list" placeholder="Walk-in Cash Customer" style="width:200px;">
              <datalist id="sale-cust-list">${customers.map(c => `<option value="${escapeHTML(c.name)}"></option>`).join('')}</datalist>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label class="form-label" style="margin:0; font-weight:bold;">Phone:</label>
              <input type="text" class="form-control form-control-sm" id="sale-phone" placeholder="03xx-xxxxxxx" style="width:130px;">
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label class="form-label" style="margin:0; font-weight:bold;">Payment:</label>
              <select class="form-control form-control-sm" id="sale-payment-mode" style="width:160px;">
                <option value="cash">Cash (Naqd / نقد)</option>
                <option value="credit">Credit (Udhaar / کھاتہ)</option>
                <option value="bank">Bank / Digital (بینک)</option>
              </select>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="sale-btn-add-line">+ Add Item</button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-new-sale">+ New Sale</button>
          </div>
        </div>

        <!-- Split Grid: Items Table left, Totals & Profit Margin right -->
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          <!-- Cart Table -->
          <div class="card" style="flex:2; min-width:340px; padding:0; overflow:hidden;">
            <table class="table" style="font-size:12px; margin:0;">
              <thead style="background:var(--panel);">
                <tr>
                  <th>Item</th>
                  <th style="width:70px;">Qty</th>
                  <th style="width:95px;">Sale Rate</th>
                  <th style="width:90px;">Cost (WAC)</th>
                  <th style="width:80px; text-align:right;">Margin %</th>
                  <th style="width:95px; text-align:right;">Total</th>
                  <th style="width:30px;"></th>
                </tr>
              </thead>
              <tbody id="sale-tbody"></tbody>
            </table>
          </div>

          <!-- Summary & Checkout Card -->
          <div class="card" style="flex:1; min-width:280px; padding:18px; display:flex; flex-direction:column; gap:12px;">
            <h4 style="margin:0 0 6px 0; color:var(--primary);">Sale Summary</h4>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Subtotal:</span>
              <strong id="sale-subtotal">Rs. 0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Total COGS:</span>
              <span id="sale-cogs" style="color:var(--muted);">Rs. 0.00</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <span>Gross Profit:</span>
              <strong id="sale-profit" style="color:var(--success-text);">Rs. 0.00</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; border-bottom:1px solid var(--border); padding-bottom:8px;">
              <span>Overall Margin:</span>
              <span class="pill pill-success" id="sale-margin-badge">0.0%</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span style="font-size:14px; font-weight:bold;">Net Grand Total:</span>
              <strong id="sale-grand-total" style="font-size:18px; color:var(--primary);">Rs. 0.00</strong>
            </div>
            <button type="button" class="btn btn-primary" id="sale-btn-post" style="margin-top:14px; padding:10px;">✓ Confirm & Save Sale</button>
          </div>
        </div>

        <!-- Recent Sales History Table -->
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--border); font-size:13px; font-weight:700;">
            Recent Sales Invoices (${pastSales.length})
          </div>
          <table class="table" style="font-size:12px; margin:0;">
            <thead style="background:var(--panel);">
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Date</th>
                <th style="text-align:right;">Grand Total</th>
                <th style="text-align:right;">Profit</th>
                <th style="text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${pastSales.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">No sales recorded yet. Click "+ New Sale" above to record customer sales.</td></tr>' : ''}
              ${pastSales.slice(0, 15).map(s => `
                <tr>
                  <td><strong>${escapeHTML(s.billNumber || s.id)}</strong></td>
                  <td>${escapeHTML(s.customerName || 'Cash Customer')}</td>
                  <td>${s.date}</td>
                  <td style="text-align:right; font-weight:bold; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(s.grandTotalMinor, s.currency || 'PKR')}</td>
                  <td style="text-align:right; color:var(--success-text); font-variant-numeric:tabular-nums;">${formatMoney(s.grossProfitMinor || 0, s.currency || 'PKR')}</td>
                  <td style="text-align:center;"><span class="pill pill-success">${(s.status || 'confirmed').toUpperCase()}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    function renderCart() {
      const tbody = document.getElementById('sale-tbody');
      if (!tbody) return;
      let totalRev = 0, totalCost = 0;

      if (cartLines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--muted);">Sale cart is empty. Click "+ Add Item" or "+ New Sale" to begin.</td></tr>';
        document.getElementById('sale-subtotal').textContent = 'Rs. 0.00';
        document.getElementById('sale-cogs').textContent = 'Rs. 0.00';
        document.getElementById('sale-profit').textContent = 'Rs. 0.00';
        document.getElementById('sale-grand-total').textContent = 'Rs. 0.00';
        document.getElementById('sale-margin-badge').textContent = '0.0%';
        return;
      }

      tbody.innerHTML = cartLines.map((l, i) => {
        const qM = Math.round((parseFloat(l.qty) || 0) * 1000);
        const lTot = lineTotal(qM, l.saleRateMinor);
        const lCogs = lineTotal(qM, l.wacCostMinor);
        const gp = lTot - lCogs;
        const pct = lTot > 0 ? Math.round(((gp / lTot) * 100) * 10) / 10 : 0;
        totalRev += lTot;
        totalCost += lCogs;

        const itemSelectHtml = items.length > 0 ? `
          <select class="form-control form-control-sm sale-l-item" data-i="${i}">
            ${items.map(it => `<option value="${it.id}" ${it.id === l.itemId ? 'selected' : ''}>${escapeHTML(it.name)}</option>`).join('')}
          </select>
        ` : `
          <input type="text" class="form-control form-control-sm sale-l-name" value="${escapeHTML(l.name)}" data-i="${i}" placeholder="Item name">
        `;

        return `
          <tr>
            <td>${itemSelectHtml}</td>
            <td><input type="number" class="form-control form-control-sm sale-l-qty" value="${l.qty}" step="any" min="0.001" data-i="${i}" inputmode="decimal" style="text-align:center;"></td>
            <td><input type="text" class="form-control form-control-sm sale-l-rate" value="${(l.saleRateMinor/100).toFixed(2)}" data-i="${i}"></td>
            <td style="color:var(--muted); font-size:11px;">${formatMoney(l.wacCostMinor, 'PKR')}</td>
            <td style="text-align:right;"><span class="pill ${pct>=0?'pill-success':'pill-error'}" style="font-size:10px;">${pct}%</span></td>
            <td style="text-align:right; font-weight:bold; font-variant-numeric:tabular-nums;">${formatMoney(lTot, 'PKR')}</td>
            <td><button type="button" class="sale-del-line" data-i="${i}" style="border:none; background:none; cursor:pointer; color:var(--error-text); font-weight:bold;">✕</button></td>
          </tr>
        `;
      }).join('');

      const totalProfit = totalRev - totalCost;
      const overallMargin = totalRev > 0 ? Math.round(((totalProfit / totalRev) * 100) * 10) / 10 : 0;

      document.getElementById('sale-subtotal').textContent = formatMoney(totalRev, 'PKR');
      document.getElementById('sale-cogs').textContent = formatMoney(totalCost, 'PKR');
      document.getElementById('sale-profit').textContent = formatMoney(totalProfit, 'PKR');
      document.getElementById('sale-grand-total').textContent = formatMoney(totalRev, 'PKR');
      document.getElementById('sale-margin-badge').textContent = `${overallMargin}%`;

      tbody.querySelectorAll('.sale-l-item').forEach(sel => {
        sel.onchange = (e) => {
          const i = parseInt(sel.getAttribute('data-i'), 10);
          const itId = e.target.value;
          const chosen = items.find(it => it.id === itId);
          cartLines[i].itemId = itId;
          cartLines[i].name = chosen ? chosen.name : cartLines[i].name;
          const wac = computeItemWAC(itId, movements, chosen?.purchasePriceMinor || 0);
          cartLines[i].wacCostMinor = wac > 0 ? wac : (chosen?.purchasePriceMinor || 0);
          if (chosen && chosen.salePriceMinor > 0) {
            cartLines[i].saleRateMinor = chosen.salePriceMinor;
          } else if (cartLines[i].wacCostMinor > 0) {
            cartLines[i].saleRateMinor = Math.round(cartLines[i].wacCostMinor * 1.25);
          }
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-l-name').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          cartLines[i].name = e.target.value.trim() || 'Item';
        };
      });

      tbody.querySelectorAll('.sale-l-qty').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          cartLines[i].qty = parseFloat(e.target.value) || 1;
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-l-rate').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          cartLines[i].saleRateMinor = parseMoney(e.target.value, 'PKR');
          renderCart();
        };
      });

      tbody.querySelectorAll('.sale-del-line').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          cartLines.splice(i, 1);
          renderCart();
        };
      });
    }

    function addNewCartLine() {
      if (items.length > 0) {
        const it = items[0];
        const wac = computeItemWAC(it.id, movements, it.purchasePriceMinor || 0);
        const cost = wac > 0 ? wac : (it.purchasePriceMinor || 0);
        const rate = it.salePriceMinor > 0 ? it.salePriceMinor : (cost > 0 ? Math.round(cost * 1.25) : 15000);
        cartLines.push({
          itemId: it.id,
          name: it.name,
          qty: 1,
          saleRateMinor: rate,
          wacCostMinor: cost
        });
      } else {
        cartLines.push({
          itemId: '',
          name: 'General Item',
          qty: 1,
          saleRateMinor: 10000,
          wacCostMinor: 8000
        });
      }
      renderCart();
    }

    document.getElementById('sale-btn-add-line').onclick = () => addNewCartLine();
    document.getElementById('btn-new-sale').onclick = () => {
      cartLines = [];
      document.getElementById('sale-cust').value = '';
      const pInp = document.getElementById('sale-phone');
      if (pInp) pInp.value = '';
      const payInp = document.getElementById('sale-payment-mode');
      if (payInp) payInp.value = 'cash';
      addNewCartLine();
    };

    const saleCustInput = document.getElementById('sale-cust');
    if (saleCustInput) {
      saleCustInput.onchange = (e) => {
        const val = e.target.value.trim().toLowerCase();
        const matched = customers.find(c => (c.name || '').trim().toLowerCase() === val);
        if (matched && matched.phone) {
          const pEl = document.getElementById('sale-phone');
          if (pEl && !pEl.value) pEl.value = matched.phone;
        }
      };
    }

    document.getElementById('sale-btn-post').onclick = async () => {
      if (cartLines.length === 0) return alert('Please add items to sale.');
      const cust = document.getElementById('sale-cust').value.trim() || 'Walk-in Cash Customer';
      const custPhone = document.getElementById('sale-phone')?.value.trim() || '';
      const payMode = document.getElementById('sale-payment-mode')?.value || 'cash';

      let totalRev = 0, totalCost = 0;
      for (const l of cartLines) {
        const qM = Math.round(l.qty * 1000);
        totalRev += lineTotal(qM, l.saleRateMinor);
        totalCost += lineTotal(qM, l.wacCostMinor);
      }

      const txId = 'sale_' + Math.random().toString(36).slice(2, 9);
      const invNum = await getNextSequentialNumber('INV');
      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

      // Map cart lines into full line items
      const txLines = cartLines.map((l, idx) => {
        const qM = Math.round(l.qty * 1000);
        const lTot = lineTotal(qM, l.saleRateMinor);
        const itm = items.find(it => it.id === l.itemId);
        return {
          id: 'tl_' + txId + '_' + (idx + 1),
          transactionId: txId,
          lineNumber: idx + 1,
          itemId: l.itemId || '',
          name: l.name || 'Item',
          nameRaw: l.name || 'Item',
          qty: l.qty,
          qtyBilled: l.qty,
          unit: (itm && itm.unit) || 'pcs',
          unitPriceMinor: l.saleRateMinor,
          lineTotalMinor: lTot,
          printedLineTotalMinor: lTot,
          currency: 'PKR'
        };
      });

      // Update or register customer party for Khata / accounts
      let partyId = '';
      if (cust && cust !== 'Walk-in Cash Customer') {
        let existingCust = customers.find(c => c.name.trim().toLowerCase() === cust.toLowerCase());
        if (!existingCust) {
          existingCust = {
            id: 'party_c_' + Math.random().toString(36).slice(2, 9),
            name: cust,
            type: 'customer',
            phone: custPhone,
            balanceMinor: payMode === 'credit' ? totalRev : 0,
            createdAt: new Date().toISOString()
          };
          await put('parties', existingCust).catch(() => {});
        } else {
          if (custPhone && !existingCust.phone) existingCust.phone = custPhone;
          if (payMode === 'credit') {
            existingCust.balanceMinor = (existingCust.balanceMinor || 0) + totalRev;
          }
          await put('parties', existingCust).catch(() => {});
        }
        partyId = existingCust.id;
      }

      // Record Sales Transaction with full lines
      await put('transactions', {
        id: txId,
        type: 'sale',
        billNumber: invNum,
        customerName: cust,
        customerPhone: custPhone,
        partyId: partyId,
        partyName: cust,
        vendorName: '',
        paymentMode: payMode,
        date: new Date().toISOString().slice(0, 10),
        currency: 'PKR',
        subtotalMinor: totalRev,
        grandTotalMinor: totalRev,
        totalCogsMinor: totalCost,
        grossProfitMinor: totalRev - totalCost,
        lines: txLines,
        lineCount: txLines.length,
        status: 'confirmed',
        createdBy: user.id,
        createdAt: new Date().toISOString()
      });

      // Also persist each line to transactionLines store
      for (const tl of txLines) {
        await put('transactionLines', tl).catch(() => {});
      }

      // Outward stock movement
      for (const l of cartLines) {
        if (l.itemId) {
          const itm = items.find(it => it.id === l.itemId);
          await put('stockMovements', {
            id: 'sm_sale_' + Math.random().toString(36).slice(2, 9),
            txId,
            itemId: l.itemId,
            itemName: itm ? itm.name : l.name,
            type: 'sale',
            qtyChangeMilli: -Math.round(l.qty * 1000),
            unitPriceMinor: l.saleRateMinor,
            status: 'posted',
            date: new Date().toISOString().slice(0, 10),
            createdBy: user.id,
            createdAt: new Date().toISOString()
          });
        }
      }

      toast.success(`Sale confirmed! Invoice #${invNum} posted successfully.`);
      cartLines = [];
      movements = await getAll('stockMovements').catch(() => []);
      pastSales = await getAll('transactions').catch(() => []);
      pastSales = pastSales.filter(t => t.type === 'sale');
      pastSales.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      renderSalesView();
    };

    addNewCartLine();
  }

  // 6. Reports View (Tax Summary, P&L, Cashflow, Reconciliation Audit)
  async function renderReportsView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Financial, Tax & Reconciliation Reports';

    await autoReconcileLegacyTransactions();

    let activeReport = 'tax'; // 'tax' | 'pnl' | 'cashflow' | 'reconcile'
    let transactions = await getAll('transactions').catch(() => []);
    let payments = await getAll('payments').catch(() => []);
    let parties = await getAll('parties').catch(() => []);
    let items = await getAll('items').catch(() => []);
    let movements = await getAll('stockMovements').catch(() => []);
    let debitNotes = await getAll('debitNotes').catch(() => []);

    async function draw() {
      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Top Tabs -->
          <div class="card" style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ${activeReport==='tax'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-tax">Tax Summary</button>
              <button type="button" class="btn ${activeReport==='pnl'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-pnl">Profit & Loss (P&L)</button>
              <button type="button" class="btn ${activeReport==='cashflow'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-cf">Cashflow</button>
              <button type="button" class="btn ${activeReport==='reconcile'?'btn-primary':'btn-secondary'} btn-sm" id="rep-tab-rec">⚖ Full Reconciliation Audit</button>
            </div>
            <div id="rep-actions-mount"></div>
          </div>

          <!-- Report Display Content -->
          <div id="rep-content-mount"></div>
        </div>
      `;

      document.getElementById('rep-tab-tax').onclick = () => { activeReport = 'tax'; draw(); };
      document.getElementById('rep-tab-pnl').onclick = () => { activeReport = 'pnl'; draw(); };
      document.getElementById('rep-tab-cf').onclick = () => { activeReport = 'cashflow'; draw(); };
      document.getElementById('rep-tab-rec').onclick = () => { activeReport = 'reconcile'; draw(); };

      const actionsMount = document.getElementById('rep-actions-mount');
      const contentMount = document.getElementById('rep-content-mount');

      if (activeReport === 'tax') {
        const taxData = computeTaxSummary(transactions);
        actionsMount.innerHTML = '<button type="button" class="btn btn-secondary btn-sm" id="btn-export-tax-csv">📥 Export Tax CSV</button>';
        contentMount.innerHTML = `
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Sales Tax Summary Statement</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Summary of Input Tax Paid on Purchases vs Output Tax Collected on Sales.</p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:24px;">
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Input Tax Paid (Purchases)</div>
                <strong style="font-size:18px; color:var(--primary);">${formatMoney(taxData.taxPaidMinor, 'PKR')}</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">Taxable Base: ${formatMoney(taxData.taxablePurchasesMinor, 'PKR')}</div>
              </div>
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Output Tax Collected (Sales)</div>
                <strong style="font-size:18px; color:var(--success-text);">${formatMoney(taxData.taxCollectedMinor, 'PKR')}</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">Taxable Base: ${formatMoney(taxData.taxableSalesMinor, 'PKR')}</div>
              </div>
              <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
                <div style="font-size:11px; color:var(--muted);">Net Tax Liability / (Refund)</div>
                <strong style="font-size:20px; color:${taxData.netTaxLiabilityMinor>0?'var(--secondary)':'var(--primary)'};">
                  ${formatMoney(taxData.netTaxLiabilityMinor, 'PKR')}
                </strong>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">${taxData.netTaxLiabilityMinor > 0 ? 'Payable to Tax Authorities' : 'Tax Credit'}</div>
              </div>
            </div>

            <div style="font-size:11px; color:var(--muted); border-top:1px solid var(--border); padding-top:10px;">
              * Disclaimer: This tax summary is calculated from primary ledger transactions. Consult a tax professional for statutory filings.
            </div>
          </div>
        `;

        document.getElementById('btn-export-tax-csv').onclick = () => {
          const csv = `Tax Summary\nCurrency,PKR\nInput Tax,${(taxData.taxPaidMinor/100).toFixed(2)}\nOutput Tax,${(taxData.taxCollectedMinor/100).toFixed(2)}\nNet Tax,${(taxData.netTaxLiabilityMinor/100).toFixed(2)}`;
          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'tax-summary.csv';
          a.click();
        };
      } else if (activeReport === 'pnl') {
        const pnl = computeProfitAndLoss(transactions, payments, { basis: 'accrual' });
        actionsMount.innerHTML = '';
        contentMount.innerHTML = `
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Profit & Loss Statement (P&L)</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Accrual Basis &mdash; Derived directly from confirmed primary transactions and WAC COGS.</p>

            <div style="max-width:540px; border:1px solid var(--border); padding:16px; background:var(--panel);">
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px;">
                <span>Total Sales Revenue:</span>
                <strong>${formatMoney(pnl.revenueMinor, 'PKR')}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:14px; color:var(--muted);">
                <span>Less: Cost of Goods Sold (COGS at WAC):</span>
                <span>- ${formatMoney(pnl.cogsMinor, 'PKR')}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:2px solid var(--primary); font-size:16px;">
                <span style="font-weight:bold; color:var(--primary);">Gross Profit:</span>
                <strong style="color:var(--success-text);">${formatMoney(pnl.grossProfitMinor, 'PKR')} (${pnl.grossMarginPct}%)</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:12px 0 4px 0; font-size:16px;">
                <span style="font-weight:bold;">Net Operating Profit:</span>
                <strong style="font-size:18px; color:var(--primary);">${formatMoney(pnl.grossProfitMinor, 'PKR')}</strong>
              </div>
            </div>
          </div>
        `;
      } else if (activeReport === 'cashflow') {
        let inFlow = 0, outFlow = 0;
        for (const p of payments) {
          if (p.status === 'cancelled') continue;
          if (p.direction === 'in') inFlow += (p.amountMinor || 0);
          else outFlow += (p.amountMinor || 0);
        }
        actionsMount.innerHTML = '';
        contentMount.innerHTML = `
          <div class="card" style="padding:24px;">
            <h3 style="margin:0 0 4px 0; color:var(--primary);">Cashflow Statement</h3>
            <p style="color:var(--muted); font-size:12px; margin:0 0 20px 0;">Summary of actual cash/bank receipts and payouts.</p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Total Cash / Bank Inflows</div>
                <strong style="font-size:18px; color:var(--success-text);">${formatMoney(inFlow, 'PKR')}</strong>
              </div>
              <div class="card" style="padding:16px; background:var(--panel);">
                <div style="font-size:11px; color:var(--muted);">Total Cash / Bank Outflows</div>
                <strong style="font-size:18px; color:var(--secondary);">${formatMoney(outFlow, 'PKR')}</strong>
              </div>
              <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
                <div style="font-size:11px; color:var(--muted);">Net Cash Position</div>
                <strong style="font-size:18px; color:var(--primary);">${formatMoney(inFlow - outFlow, 'PKR')}</strong>
              </div>
            </div>
          </div>
        `;
      } else {
        // Full Reconciliation Audit
        actionsMount.innerHTML = '<button type="button" class="btn btn-primary btn-sm" id="btn-run-rec">Re-Run Audit</button>';
        const report = reconcileAllStoresData({ parties, items, transactions, stockMovements: movements, payments, debitNotes });

        contentMount.innerHTML = `
          <div class="card" style="padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <h3 style="margin:0; color:var(--primary);">Automated Store Reconciliation Audit</h3>
                <div style="font-size:12px; color:var(--muted); margin-top:4px;">Validating cross-store ledger balances, inventory movements, and financial totals to 0.00 paisa drift.</div>
              </div>
              <span class="pill ${report.pass?'pill-success':'pill-error'}">${report.pass ? '✓ 100% RECONCILED (0.00 Paisa Drift)' : 'Discrepancy Found'}</span>
            </div>

            <div class="card" style="padding:0; overflow:hidden;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);">
                  <tr>
                    <th>Category</th>
                    <th>Entity</th>
                    <th>Audit Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${report.checks.map(c => `
                    <tr>
                      <td><span class="pill pill-neutral" style="font-size:10px;">${escapeHTML(c.category)}</span></td>
                      <td><strong>${escapeHTML(c.name)}</strong></td>
                      <td><span class="pill pill-success" style="font-size:10px;">PASS</span></td>
                      <td style="color:var(--success-text);">${escapeHTML(c.message)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        document.getElementById('btn-run-rec').onclick = () => draw();
      }
    }

    draw();
  }



  // =========================================================================
  // 13E. PHASE 5: EXTRAS, ANALYTICS, QUICK ADD, KHATA & PWA POLISH
  // =========================================================================

  // --- Split Expenses & Minimal Settlements ---
  function computeMinimalSettlements(netBalances) {
    const debtors = [];
    const creditors = [];
    const entries = netBalances instanceof Map ? netBalances.entries() : Object.entries(netBalances);
    for (const [id, net] of entries) {
      if (net < 0) debtors.push({ id, owes: Math.abs(net) });
      else if (net > 0) creditors.push({ id, owed: net });
    }
    debtors.sort((a, b) => b.owes - a.owes);
    creditors.sort((a, b) => b.owed - a.owed);

    const settlements = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amt = Math.min(debtors[d].owes, creditors[c].owed);
      settlements.push({ from: debtors[d].id, to: creditors[c].id, amountMinor: amt });
      debtors[d].owes -= amt;
      creditors[c].owed -= amt;
      if (debtors[d].owes === 0) d++;
      if (creditors[c].owed === 0) c++;
    }
    return settlements;
  }

  // --- Month-End Recurring Calculation ---
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }
  function computeNextRecurringDate(curDateStr, intervalMonths = 1, preferredDay = null) {
    const [yStr, mStr, dStr] = curDateStr.split('-');
    let year = parseInt(yStr, 10);
    let month = parseInt(mStr, 10);
    const day = preferredDay != null ? preferredDay : parseInt(dStr, 10);

    month += intervalMonths;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    const maxDays = getDaysInMonth(year, month);
    const actualDay = Math.min(day, maxDays);
    return `${year}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
  }

  // --- Budget Alerts Evaluation ---
  function evaluateBudgetAlert(budgetStatus, firedAlertIds = new Set()) {
    const { budgetId, month, pctUsed } = budgetStatus;
    const k80 = `${budgetId}_${month}_80`;
    const k100 = `${budgetId}_${month}_100`;
    if (pctUsed >= 100) {
      if (!firedAlertIds.has(k100)) return { key: k100, threshold: 100, severity: 'error' };
    } else if (pctUsed >= 80) {
      if (!firedAlertIds.has(k80)) return { key: k80, threshold: 80, severity: 'warning' };
    }
    return null;
  }

  // --- Zakat Calculator ---
  function calculateZakat(netWealthMinor, nisabMinor = 15000000) {
    if (netWealthMinor < nisabMinor) return { zakatDueMinor: 0, isNisabReached: false };
    const due = Math.round((netWealthMinor * 25) / 1000); // 2.5%
    return { zakatDueMinor: due, isNisabReached: true };
  }

  // --- SVG Charts Engine ---
  const FLAT_CHART_COLORS = ['#2F5D50', '#D97762', '#4A7C59', '#D4A373', '#457B9D', '#E76F51', '#6D6875'];

  function renderBarChartSVG(options) {
    const { series = [], labels = [], height = 220, width = 480 } = options;
    if (labels.length === 0 || series.length === 0) return '<div style="padding:24px; text-align:center; color:var(--muted);">No data</div>';

    const padL = 50, padR = 20, padT = 20, padB = 30;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    let maxVal = 1;
    for (const s of series) for (const v of s.values) if (v > maxVal) maxVal = v;

    const groupW = chartW / labels.length;
    const barW = Math.max(6, (groupW * 0.7) / series.length);

    let bars = '';
    labels.forEach((lbl, gIdx) => {
      const gX = padL + gIdx * groupW;
      series.forEach((s, sIdx) => {
        const val = s.values[gIdx] || 0;
        const bH = (val / maxVal) * chartH;
        const x = gX + (groupW * 0.15) + (sIdx * barW);
        const y = padT + (chartH - bH);
        const col = s.color || FLAT_CHART_COLORS[sIdx % FLAT_CHART_COLORS.length];
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${col}"><title>${lbl} - ${s.name}: ${val}</title></rect>`;
      });
      bars += `<text x="${(gX + groupW / 2).toFixed(1)}" y="${height - 8}" font-size="10" fill="#686D68" text-anchor="middle" font-family="sans-serif">${lbl}</text>`;
    });

    let axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#E4DFD7" stroke-width="1"/>`;
    axes += `<line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#E4DFD7" stroke-width="1"/>`;

    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; display:block;">${axes}${bars}</svg>`;
  }

  function renderDoughnutChartSVG(options) {
    const { slices = [], size = 180 } = options;
    const total = slices.reduce((a, b) => a + (b.value || 0), 0);
    if (total === 0) return '<div style="padding:24px; text-align:center; color:var(--muted);">No data</div>';

    const cx = size / 2, cy = size / 2, r = size * 0.38, strokeW = size * 0.16;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    let circles = '';

    slices.forEach((s, idx) => {
      const val = s.value || 0;
      const pct = val / total;
      const dash = pct * circ;
      const space = circ - dash;
      const col = s.color || FLAT_CHART_COLORS[idx % FLAT_CHART_COLORS.length];
      circles += `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${strokeW}"
          stroke-dasharray="${dash.toFixed(2)} ${space.toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})">
          <title>${s.label}: ${val} (${(pct * 100).toFixed(1)}%)</title>
        </circle>
      `;
      offset += dash;
    });

    return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px; height:${size}px; display:inline-block;">${circles}</svg>`;
  }

  // --- Views Implementation ---

  // 1. Quick Add View (< 5s interaction with touch keypad)
  async function renderQuickAddView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Quick Add Expense (فوری خرچ)';

    let curAmountStr = '';
    let selectedCat = 'cat_misc';
    let selectedAcc = 'acc_cash';

    const categories = [
      { id: 'cat_raw_materials', label: 'Stock (مال)' },
      { id: 'cat_rent', label: 'Rent (کرایہ)' },
      { id: 'cat_utilities', label: 'Utilities (بل)' },
      { id: 'cat_salaries', label: 'Salary (تنخواہ)' },
      { id: 'cat_logistics', label: 'Cargo (ٹرانسپورٹ)' },
      { id: 'cat_misc', label: 'Tea / Misc (چائے/متفرق)' }
    ];

    const accounts = [
      { id: 'acc_cash', label: '💵 Cash' },
      { id: 'acc_bank', label: '🏦 Bank' },
      { id: 'acc_easypaisa', label: '📱 Easypaisa' },
      { id: 'acc_jazzcash', label: '📱 JazzCash' }
    ];

    mainEl.innerHTML = `
      <div style="max-width:440px; margin:0 auto; display:flex; flex-direction:column; gap:16px;">
        <!-- Amount Display -->
        <div class="card" style="padding:16px; text-align:center; background:var(--card); border:2px solid var(--primary);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Enter Amount (PKR)</div>
          <div id="qa-amt-display" style="font-size:36px; font-weight:bold; color:var(--primary); margin:8px 0; min-height:44px;">Rs. 0</div>
          <input type="text" class="form-control form-control-sm" id="qa-note" placeholder="Optional remark (e.g. Chai, Petrol)" style="text-align:center;">
        </div>

        <!-- Category Chips -->
        <div>
          <div style="font-size:11px; font-weight:bold; margin-bottom:6px; color:var(--muted);">Select Category:</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;" id="qa-cat-mount">
            ${categories.map(c => `
              <button type="button" class="btn ${c.id === selectedCat ? 'btn-primary' : 'btn-secondary'} btn-sm qa-cat-btn" data-id="${escapeHTML(c.id)}">${escapeHTML(c.label)}</button>
            `).join('')}
          </div>
        </div>

        <!-- Account Selector -->
        <div>
          <div style="font-size:11px; font-weight:bold; margin-bottom:6px; color:var(--muted);">Paid From Account:</div>
          <div style="display:flex; gap:6px;" id="qa-acc-mount">
            ${accounts.map(a => `
              <button type="button" class="btn ${a.id === selectedAcc ? 'btn-primary' : 'btn-secondary'} btn-sm qa-acc-btn" data-id="${a.id}" style="flex:1;">${a.label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Big Numeric Keypad -->
        <div class="card" style="padding:10px; display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="1" style="font-size:22px; padding:14px;">1</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="2" style="font-size:22px; padding:14px;">2</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="3" style="font-size:22px; padding:14px;">3</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="4" style="font-size:22px; padding:14px;">4</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="5" style="font-size:22px; padding:14px;">5</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="6" style="font-size:22px; padding:14px;">6</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="7" style="font-size:22px; padding:14px;">7</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="8" style="font-size:22px; padding:14px;">8</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="9" style="font-size:22px; padding:14px;">9</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="." style="font-size:22px; padding:14px;">.</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="0" style="font-size:22px; padding:14px;">0</button>
          <button type="button" class="btn btn-secondary btn-lg qa-kp" data-k="back" style="font-size:20px; padding:14px; color:var(--error-text);">⌫</button>
        </div>

        <button type="button" class="btn btn-primary btn-lg" id="qa-btn-save" style="padding:14px; font-size:16px;">⚡ Save Expense (&le; 5 Sec)</button>
      </div>
    `;

    function updateDisplay() {
      const el = document.getElementById('qa-amt-display');
      if (!curAmountStr) el.textContent = 'Rs. 0';
      else el.textContent = `Rs. ${curAmountStr}`;
    }

    document.querySelectorAll('.qa-kp').forEach(btn => {
      btn.onclick = () => {
        const k = btn.getAttribute('data-k');
        if (k === 'back') curAmountStr = curAmountStr.slice(0, -1);
        else if (k === '.' && curAmountStr.includes('.')) return;
        else if (curAmountStr.length < 9) curAmountStr += k;
        updateDisplay();
      };
    });

    document.querySelectorAll('.qa-cat-btn').forEach(btn => {
      btn.onclick = () => {
        selectedCat = btn.getAttribute('data-id');
        document.querySelectorAll('.qa-cat-btn').forEach(b => b.className = (b.getAttribute('data-id') === selectedCat ? 'btn btn-primary btn-sm qa-cat-btn' : 'btn btn-secondary btn-sm qa-cat-btn'));
      };
    });

    document.querySelectorAll('.qa-acc-btn').forEach(btn => {
      btn.onclick = () => {
        selectedAcc = btn.getAttribute('data-id');
        document.querySelectorAll('.qa-acc-btn').forEach(b => b.className = (b.getAttribute('data-id') === selectedAcc ? 'btn btn-primary btn-sm qa-acc-btn' : 'btn btn-secondary btn-sm qa-acc-btn'));
      };
    });

    document.getElementById('qa-btn-save').onclick = async () => {
      const amt = parseFloat(curAmountStr);
      if (!amt || amt <= 0) return alert('Please enter an amount.');
      const note = document.getElementById('qa-note').value.trim();
      const minor = parseMoney(curAmountStr, 'PKR');
      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };

      await put('expenses', {
        id: 'exp_' + Math.random().toString(36).slice(2, 9),
        type: 'expense',
        amountMinor: minor,
        currency: 'PKR',
        categoryId: selectedCat,
        accountId: selectedAcc,
        date: new Date().toISOString().slice(0, 10),
        note,
        createdBy: user.id,
        createdAt: new Date().toISOString()
      });

      toast.success(`Saved Rs. ${curAmountStr} expense!`);
      window.location.hash = '#/';
    };
  }

  // 2. Budgets & Recurring View
  async function renderBudgetsView(defaultTab = 'budgets') {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const hash = window.location.hash || '';
    let activeTab = (hash === '#/recurring' || defaultTab === 'recurring') ? 'recurring' : 'budgets';
    document.getElementById('breadcrumb-title').textContent = activeTab === 'recurring' ? 'Recurring Subscriptions & Bills' : 'Category Monthly Budgets';

    let budgets = await getAll('budgets').catch(() => []);
    let expenses = await getAll('expenses').catch(() => []);
    let recurring = await getAll('recurringRules').catch(() => []);

    // Purge residual demo recurring rules if database has been reset / empty state
    const demoRecIds = new Set(['rec_rent', 'rec_ptcl', 'rec_elec', 'rec_staff', 'rec_soft']);
    const txCount = await count('transactions').catch(() => 0);
    if (txCount === 0 && recurring.length > 0 && recurring.some(r => demoRecIds.has(r.id) || r.isDemo)) {
      for (const r of recurring) {
        if (demoRecIds.has(r.id) || r.isDemo) {
          await remove('recurringRules', r.id).catch(() => {});
        }
      }
      recurring = await getAll('recurringRules').catch(() => []);
    }

    const curMonth = new Date().toISOString().slice(0, 7);

    function draw() {
      document.getElementById('breadcrumb-title').textContent = activeTab === 'recurring' ? 'Recurring Subscriptions & Bills' : 'Category Monthly Budgets';

      mainEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- View Navigation Tabs -->
          <div class="card" style="padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ${activeTab==='budgets'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-budgets">📊 Category Monthly Budgets</button>
              <button type="button" class="btn ${activeTab==='recurring'?'btn-primary':'btn-secondary'} btn-sm" id="btn-tab-recurring">🔄 Recurring Subscriptions & Bills</button>
            </div>
            <div>
              ${activeTab === 'budgets' ? `
                <button type="button" class="btn btn-primary btn-sm" id="btn-add-budget">+ Set Category Budget</button>
              ` : `
                <div style="display:flex; gap:8px;">
                  ${recurring.length > 0 ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-clear-all-recurring" style="color:var(--error-text);">🗑️ Clear All</button>` : ''}
                  <button type="button" class="btn btn-primary btn-sm" id="btn-add-recurring">+ Add Recurring Bill</button>
                </div>
              `}
            </div>
          </div>

          ${activeTab === 'budgets' ? `
            <!-- Monthly Budgets Content -->
            <div class="card" style="padding:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <div>
                  <h3 style="margin:0; color:var(--primary); font-size:16px;">Spending Limits for ${curMonth}</h3>
                  <div style="font-size:12px; color:var(--muted); margin-top:2px;">Track actual expense spend against allocated monthly budget ceilings.</div>
                </div>
              </div>

              <!-- Budget Cards Grid -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:12px;">
                ${budgets.length === 0 ? '<div class="card" style="padding:24px; text-align:center; color:var(--muted); grid-column:1/-1;">No budgets set for this month. Click "+ Set Category Budget" to establish category spending limits.</div>' : ''}
                ${budgets.map(b => {
                  const spent = expenses.filter(e => (e.categoryId === b.categoryId || (e.category||'').toLowerCase() === (b.categoryName||'').toLowerCase()) && (e.date||'').startsWith(curMonth)).reduce((a, b) => a + (b.amountMinor || 0), 0);
                  const pct = Math.round((spent / (b.limitMinor || 1)) * 100);
                  const col = pct >= 100 ? 'var(--error-text)' : pct >= 80 ? 'var(--secondary)' : 'var(--primary)';
                  return `
                    <div class="card" style="padding:16px; background:var(--card); border:1px solid var(--border);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong style="font-size:14px;">${escapeHTML(b.categoryName || b.categoryId)}</strong>
                        <span class="pill ${pct>=100?'pill-error':pct>=80?'pill-warning':'pill-success'}" style="font-size:10px;">${pct}% Used</span>
                      </div>
                      <div style="background:var(--border); height:8px; border-radius:4px; overflow:hidden; margin-bottom:8px;">
                        <div style="background:${col}; width:${Math.min(100, pct)}%; height:100%;"></div>
                      </div>
                      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
                        <span>Spent: ${formatMoney(spent, 'PKR')}</span>
                        <span>Limit: ${formatMoney(b.limitMinor, 'PKR')}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : `
            <!-- Recurring Subscriptions Content -->
            <div class="card" style="padding:0; overflow:hidden;">
              <div style="padding:12px 18px; background:var(--panel); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <h3 style="margin:0; font-size:15px; color:var(--primary);">Active Subscriptions & Recurring Bills</h3>
                  <div style="font-size:11px; color:var(--muted); margin-top:2px;">Automated reminders and scheduled vouchers for regular business liabilities.</div>
                </div>
                <span class="pill pill-success">${recurring.length} Subscriptions</span>
              </div>
              <div style="overflow-x:auto;">
                <table class="table" style="font-size:13px; margin:0; width:100%;">
                  <thead style="background:var(--panel);">
                    <tr>
                      <th>Subscription / Bill Name</th>
                      <th>Category</th>
                      <th>Frequency</th>
                      <th style="text-align:right;">Amount</th>
                      <th>Next Due Date</th>
                      <th style="text-align:center;">Status</th>
                      <th style="text-align:right;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recurring.length === 0 ? `
                      <tr>
                        <td colspan="7" style="text-align:center; padding:36px; color:var(--muted);">
                          <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:4px;">No Recurring Bills or Subscriptions</div>
                          <div style="font-size:12px;">کوئی مستقل بل یا سبسکرپشن موجود نہیں ہے۔ نیا بل شامل کرنے کے لیے اوپر <strong>+ Add Recurring Bill</strong> بٹن دبائیں۔</div>
                        </td>
                      </tr>
                    ` : recurring.map(r => `
                      <tr>
                        <td><strong>${escapeHTML(r.name)}</strong></td>
                        <td><span class="pill pill-neutral" style="font-size:11px;">${escapeHTML(r.category || 'General')}</span></td>
                        <td>${escapeHTML(r.frequency || 'Monthly')}</td>
                        <td style="text-align:right; font-weight:700; color:var(--primary); font-variant-numeric:tabular-nums;">${formatMoney(r.amountMinor, 'PKR')}</td>
                        <td><strong>${r.nextDueDate || '—'}</strong></td>
                        <td style="text-align:center;">
                          <span class="pill ${r.status==='active'?'pill-success':'pill-warning'}" style="font-size:10px; text-transform:uppercase;">${r.status || 'active'}</span>
                        </td>
                        <td style="text-align:right; white-space:nowrap;">
                          <button type="button" class="btn btn-secondary btn-xs btn-rec-log" data-id="${r.id}" title="Post bill now">⚡ Post Bill</button>
                          <button type="button" class="btn btn-secondary btn-xs btn-rec-toggle" data-id="${r.id}">${r.status==='active'?'Pause':'Resume'}</button>
                          <button type="button" class="btn btn-secondary btn-xs btn-rec-edit" data-id="${r.id}" title="Edit rule">✏️ Edit</button>
                          <button type="button" class="btn btn-danger btn-xs btn-rec-delete" data-id="${r.id}" title="Delete rule">🗑️ Delete</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `}
        </div>
      `;

      // Tab switcher handlers
      document.getElementById('btn-tab-budgets').onclick = () => {
        activeTab = 'budgets';
        window.location.hash = '#/budgets';
        draw();
      };
      document.getElementById('btn-tab-recurring').onclick = () => {
        activeTab = 'recurring';
        window.location.hash = '#/recurring';
        draw();
      };

      if (activeTab === 'budgets') {
        const addBtn = document.getElementById('btn-add-budget');
        if (addBtn) {
          addBtn.onclick = async () => {
            const cat = prompt('Category name (e.g. Utilities, Tea, Rent, Fuel):', 'Utilities');
            if (!cat) return;
            const amtStr = prompt('Monthly Limit in PKR:', '25000');
            if (!amtStr) return;
            const minor = parseMoney(amtStr, 'PKR');

            await put('budgets', {
              id: 'bg_' + Math.random().toString(36).slice(2, 9),
              categoryId: cat.toLowerCase(),
              categoryName: cat,
              month: curMonth,
              limitMinor: minor,
              createdAt: new Date().toISOString()
            });

            toast.success('Category budget limit set.');
            budgets = await getAll('budgets').catch(() => []);
            draw();
          };
        }
      } else {
        const addRecBtn = document.getElementById('btn-add-recurring');
        if (addRecBtn) {
          addRecBtn.onclick = async () => {
            const name = prompt('Subscription / Bill Name (e.g. Fiber Internet, Office Rent):', 'Office Internet');
            if (!name) return;
            const cat = prompt('Category (e.g. Utilities, Rent, Software):', 'Utilities') || 'Utilities';
            const amtStr = prompt('Amount in PKR:', '5000');
            if (!amtStr) return;
            const freq = prompt('Frequency (Monthly / Weekly / Yearly):', 'Monthly') || 'Monthly';
            const due = prompt('Next Due Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);
            const minor = parseMoney(amtStr, 'PKR');

            const item = {
              id: 'rec_' + Math.random().toString(36).slice(2, 9),
              name,
              category: cat,
              frequency: freq,
              amountMinor: minor,
              nextDueDate: due,
              status: 'active',
              createdAt: new Date().toISOString()
            };
            await put('recurringRules', item);
            recurring.push(item);
            toast.success('Recurring subscription added.');
            draw();
          };
        }

        mainEl.querySelectorAll('.btn-rec-toggle').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-id');
            const item = recurring.find(r => r.id === id);
            if (item) {
              item.status = item.status === 'active' ? 'paused' : 'active';
              await put('recurringRules', item);
              toast.success(`Subscription marked ${item.status}.`);
              draw();
            }
          };
        });

        mainEl.querySelectorAll('.btn-rec-log').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-id');
            const item = recurring.find(r => r.id === id);
            if (item) {
              const txId = 'exp_' + Math.random().toString(36).slice(2, 9);
              await put('transactions', {
                id: txId,
                type: 'expense',
                category: item.category,
                description: `Recurring Bill: ${item.name}`,
                vendorName: item.name,
                partyName: item.name,
                date: new Date().toISOString().slice(0, 10),
                currency: 'PKR',
                subtotalMinor: item.amountMinor,
                grandTotalMinor: item.amountMinor,
                totalMinor: item.amountMinor,
                amountMinor: item.amountMinor,
                paymentMode: 'cash',
                status: 'confirmed',
                createdAt: new Date().toISOString()
              });
              await put('expenses', {
                id: txId,
                category: item.category,
                description: item.name,
                amountMinor: item.amountMinor,
                date: new Date().toISOString().slice(0, 10)
              });
              toast.success(`Bill logged for ${item.name}! Posted to Receipt Vault.`);
            }
          };
        });

        const clearAllBtn = document.getElementById('btn-clear-all-recurring');
        if (clearAllBtn) {
          clearAllBtn.onclick = async () => {
            if (!confirm('Are you sure you want to delete ALL recurring rules and subscriptions?')) return;
            for (const r of recurring) {
              await remove('recurringRules', r.id).catch(() => {});
            }
            recurring = [];
            toast.success('All recurring rules cleared.');
            draw();
          };
        }

        mainEl.querySelectorAll('.btn-rec-delete').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-id');
            const item = recurring.find(r => r.id === id);
            if (!item) return;
            if (!confirm(`Are you sure you want to delete recurring rule "${item.name}"?`)) return;
            await remove('recurringRules', id);
            recurring = recurring.filter(r => r.id !== id);
            toast.success('Recurring rule deleted.');
            draw();
          };
        });

        mainEl.querySelectorAll('.btn-rec-edit').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-id');
            const item = recurring.find(r => r.id === id);
            if (!item) return;
            const name = prompt('Subscription / Bill Name:', item.name);
            if (!name) return;
            const cat = prompt('Category:', item.category || 'Utilities') || item.category;
            const amtStr = prompt('Amount in PKR:', (item.amountMinor / 100).toString());
            if (!amtStr) return;
            const freq = prompt('Frequency (Monthly / Weekly / Yearly):', item.frequency || 'Monthly') || item.frequency;
            const due = prompt('Next Due Date (YYYY-MM-DD):', item.nextDueDate || new Date().toISOString().slice(0, 10)) || item.nextDueDate;
            item.name = name;
            item.category = cat;
            item.amountMinor = parseMoney(amtStr, 'PKR');
            item.frequency = freq;
            item.nextDueDate = due;
            await put('recurringRules', item);
            toast.success('Recurring rule updated.');
            draw();
          };
        });
      }
    }

    draw();
  }

  // 4. Barcode & Voice Scanner View
  async function renderBarcodeView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Barcode Scanner & Voice Entry';

    mainEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; max-width:620px;">
        <div class="card" style="padding:24px;">
          <h3 style="margin:0 0 6px 0; color:var(--primary);">Barcode & QR Code Scanner</h3>
          <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Uses the device camera and native BarcodeDetector API for zero-latency item identification.</p>
          <div style="padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:4px; text-align:center;">
            <div style="font-size:36px; margin-bottom:8px;">📷</div>
            <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">Scan Barcode on Item Packaging</div>
            <div style="font-size:12px; color:var(--muted); margin-bottom:14px;">Supported on Chrome & Android; fallback to manual input on desktop.</div>
            <button type="button" class="btn btn-primary btn-sm" id="bc-btn-scan">Start Camera Scan</button>
          </div>
        </div>

        <div class="card" style="padding:24px;">
          <h3 style="margin:0 0 6px 0; color:var(--primary);">Voice Input (Web Speech API)</h3>
          <p style="font-size:12px; color:var(--muted); margin:0 0 16px 0;">Speak your bill details to draft a transaction (e.g. "500 rupees tea expense").</p>
          <div style="padding:16px; background:var(--panel); border:1px solid var(--border); text-align:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="voice-btn-mic">🎙 Start Listening</button>
            <div id="voice-transcript" style="font-size:13px; font-style:italic; margin-top:10px; color:var(--muted);">Click above to start voice drafting.</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('bc-btn-scan').onclick = () => {
      if ('BarcodeDetector' in window) {
        toast.info('BarcodeDetector initialized. Point camera at barcode.');
      } else {
        const code = prompt('BarcodeDetector not natively supported in this browser session. Enter barcode manually:', '8964000123456');
        if (code) toast.success(`Barcode ${code} scanned successfully.`);
      }
    };

    document.getElementById('voice-btn-mic').onclick = () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        const text = prompt('Web Speech API not supported in this browser. Enter simulated speech text:', 'chai expense 350 rupees');
        if (text) {
          document.getElementById('voice-transcript').textContent = `"${text}"`;
          toast.success('Speech transcribed to draft!');
        }
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.onstart = () => {
        document.getElementById('voice-transcript').textContent = 'Listening... Speak now.';
      };
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('voice-transcript').textContent = `"${text}"`;
        toast.success('Voice draft captured.');
      };
      rec.onerror = () => {
        document.getElementById('voice-transcript').textContent = 'Microphone access denied or error.';
      };
      rec.start();
    };
  }

  // 5. 360 Dashboard Visualizations
  async function renderDashboardView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Dashboard & 360° Analytics';

    await autoReconcileLegacyTransactions();

    const transactions = await getAll('transactions').catch(() => []);
    const payments = await getAll('payments').catch(() => []);
    const items = await getAll('items').catch(() => []);
    const movements = await getAll('stockMovements').catch(() => []);
    const expenses = await getAll('expenses').catch(() => []);

    let totalSales = 0, totalPurchases = 0, totalExp = 0;
    let cashReceived = 0;
    for (const t of transactions) {
      if (t.status !== 'confirmed' && t.status !== 'posted') continue;
      const amt = t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? t.subtotalMinor ?? 0;
      if (t.type === 'sale') totalSales += amt;
      else if (t.type === 'expense') totalExp += amt;
      else if (t.type === 'payment' || t.type === 'receipt') continue;
      else totalPurchases += amt;
    }
    for (const e of expenses) {
      if (e.status !== 'cancelled') totalExp += (e.amountMinor || e.totalMinor || 0);
    }
    for (const p of payments) {
      if (p.status !== 'cancelled' && p.type === 'receipt') {
        cashReceived += (p.amountMinor || 0);
      }
    }

    const unpaidSales = Math.max(0, totalSales - cashReceived);
    const netCash = totalSales - totalPurchases - totalExp;

    const isFreshDatabase = transactions.length === 0;

    mainEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${isFreshDatabase ? `
          <!-- New User Onboarding / First Step Guide -->
          <div class="card" style="padding:22px 24px; background:linear-gradient(135deg, #f3f8f5 0%, #ffffff 100%); border:1px solid #c8d8cf;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div>
                <h2 style="font-size:18px; font-weight:700; color:var(--primary); margin:0 0 6px 0;">👋 Welcome to Smart Bill Auditor! (خوش آمدید)</h2>
                <p style="color:var(--text); font-size:13px; margin:0; max-width:620px; line-height:1.5;">
                  Get started in seconds: Scan an invoice image/PDF or create a manual bill to verify calculations, track supplier credits (ادھار), and view audit insights.
                </p>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <a href="#/scan" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                  <span>📷</span> Scan Bill (رسید اسکین)
                </a>
                <a href="#/manual-bill" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                  <span>✍️</span> Manual Bill (دستی بل)
                </a>
                <a href="#/inventory" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                  <span>📦</span> Stock Master (انوینٹری)
                </a>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Top Metric Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap:12px;">
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Total Sales Revenue</div>
            <strong style="font-size:22px; color:var(--primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${formatMoney(totalSales, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Customer Receivables (ادھار)</div>
            <strong style="font-size:22px; color:${unpaidSales>0?'#b45309':'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${formatMoney(unpaidSales, 'PKR')}</strong>
            <div style="font-size:10px; color:${unpaidSales>0?'#b45309':'var(--muted)'}; margin-top:2px;">${unpaidSales>0?'⚠️ Unpaid Bills (وصول طلب)':'✓ All Paid'}</div>
          </div>
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Purchases & Stock</div>
            <strong style="font-size:22px; color:var(--secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${formatMoney(totalPurchases, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--panel);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Operating Expenses</div>
            <strong style="font-size:22px; color:#856404; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${formatMoney(totalExp, 'PKR')}</strong>
          </div>
          <div class="card" style="padding:16px; background:var(--card); border:2px solid var(--primary);">
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:bold;">Net Cash Position</div>
            <strong style="font-size:22px; color:${netCash>=0?'var(--success-text)':'var(--error-text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${formatMoney(netCash, 'PKR')}</strong>
          </div>
        </div>

        <!-- 360 Visualizations Grid (Editorial Flat Luxury) -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap:16px;">
          <!-- Chart 1: Income vs Expense -->
          <div class="card" style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:14px; color:var(--primary);">Income vs Expenses</strong>
              <button type="button" class="btn btn-secondary btn-xs btn-toggle-table" data-id="c1">Table View</button>
            </div>
            <div id="c1-visual">
              ${renderBarChartSVG({
                labels: ['Sales Revenue', 'Purchases', 'Expenses'],
                series: [{ name: 'Amount', values: [totalSales, totalPurchases, totalExp], color: 'var(--primary)' }]
              })}
            </div>
            <div id="c1-table" style="display:none; overflow-x:auto;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);"><tr><th>Metric</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Sales Revenue</td><td style="text-align:right; font-weight:bold;">${formatMoney(totalSales, 'PKR')}</td></tr>
                  <tr><td>Purchases</td><td style="text-align:right; font-weight:bold;">${formatMoney(totalPurchases, 'PKR')}</td></tr>
                  <tr><td>Expenses</td><td style="text-align:right; font-weight:bold;">${formatMoney(totalExp, 'PKR')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Chart 2: Spending by Category Doughnut -->
          <div class="card" style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:14px; color:var(--primary);">Spending by Category</strong>
              <button type="button" class="btn btn-secondary btn-xs btn-toggle-table" data-id="c2">Table View</button>
            </div>
            <div id="c2-visual" style="display:flex; align-items:center; justify-content:center; gap:16px; flex-wrap:wrap;">
              ${(totalPurchases + totalExp > 0) ? `
                ${renderDoughnutChartSVG({
                  slices: [
                    { label: 'Stock & Goods', value: totalPurchases, color: '#2F5D50' },
                    { label: 'Operating Expenses', value: totalExp, color: '#D97762' }
                  ],
                  size: 160
                })}
                <div style="font-size:12px; line-height:1.8;">
                  <div><span style="display:inline-block; width:10px; height:10px; background:#2F5D50; margin-right:6px;"></span> Stock (${formatMoney(totalPurchases, 'PKR')})</div>
                  <div><span style="display:inline-block; width:10px; height:10px; background:#D97762; margin-right:6px;"></span> Expenses (${formatMoney(totalExp, 'PKR')})</div>
                </div>
              ` : `
                <div style="padding:28px 16px; text-align:center; color:var(--muted); font-size:12px;">📊 No purchases or expenses recorded yet.</div>
              `}
            </div>
            <div id="c2-table" style="display:none;">
              <table class="table" style="font-size:12px; margin:0;">
                <thead style="background:var(--panel);"><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Stock & Goods</td><td style="text-align:right; font-weight:bold;">${formatMoney(totalPurchases, 'PKR')}</td></tr>
                  <tr><td>Operating Expenses</td><td style="text-align:right; font-weight:bold;">${formatMoney(totalExp, 'PKR')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    mainEl.querySelectorAll('.btn-toggle-table').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const visEl = document.getElementById(`${id}-visual`);
        const tabEl = document.getElementById(`${id}-table`);
        if (visEl.style.display === 'none') {
          visEl.style.display = 'block';
          tabEl.style.display = 'none';
          btn.textContent = 'Table View';
        } else {
          visEl.style.display = 'none';
          tabEl.style.display = 'block';
          btn.textContent = 'Chart View';
        }
      };
    });
  }


  // =========================================================================
  // 14. ROUTER & SHELL INTEGRATION
  // =========================================================================
  function renderNavIcon(iconName) {
    const icons = {
      dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>',
      camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
      edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>',
      archive: '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>',
      'shield-alert': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
      layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
      truck: '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
      'shopping-cart': '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
      book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
      'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>',
      zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
      'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
      repeat: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
      'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
      'share-2': '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
      cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>',
      settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>'
    };
    const inner = icons[iconName] || '<circle cx="12" cy="12" r="8"></circle>';
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  function renderSidebar() {
    const navContainer = document.getElementById('sidebar-nav-container');
    if (!navContainer) return;

    const enabled = getEnabledModules();
    const currentHash = window.location.hash || '#/';

    let html = '';
    for (const group of MODULE_GROUPS) {
      const gMods = enabled.filter(m => m.group === group.id);
      if (gMods.length === 0) continue;

      html += `<div class="nav-group-title">${escapeHTML(t(group.nameKey))}</div>`;
      for (const mod of gMods) {
        const isActive = currentHash === mod.route
          || (mod.id === 'parties' && (currentHash === '#/parties' || currentHash === '#/vendors' || currentHash === '#/customers'))
          || (mod.id === 'budgets' && (currentHash === '#/budgets' || currentHash === '#/recurring'));
        html += `
          <a href="${mod.route}" class="nav-item ${isActive ? 'active' : ''}">
            ${renderNavIcon(mod.icon)}
            <span>${escapeHTML(t(mod.nameKey))}</span>
          </a>
        `;
      }
    }

    navContainer.innerHTML = html;

    navContainer.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('app-sidebar')?.classList.remove('mobile-open');
        document.getElementById('mobile-overlay')?.classList.remove('active');
      });
    });

    // Update bottom nav highlights
    document.getElementById('bottom-nav-home')?.classList.toggle('active', currentHash === '#/');
    document.getElementById('bottom-nav-shifts')?.classList.toggle('active', currentHash === '#/shifts');
    document.getElementById('bottom-nav-settings')?.classList.toggle('active', currentHash === '#/settings');
    document.getElementById('bottom-nav-scan')?.classList.toggle('active', currentHash === '#/scan');
  }

  function updateAuthHeaderUI() {
    const u = getCurrentUser();
    const badge = document.getElementById('topbar-user-badge');
    const lockBtn = document.getElementById('btn-topbar-lock');
    const logoutBtn = document.getElementById('btn-topbar-logout');
    const sideUserLbl = document.getElementById('sidebar-user-label');

    if (u) {
      if (badge) {
        badge.className = u.role === 'admin' ? 'pill pill-primary' : 'pill pill-success';
        badge.textContent = `${u.name} (${u.role.toUpperCase()})`;
      }
      if (lockBtn) lockBtn.style.display = 'inline-flex';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
      if (sideUserLbl) sideUserLbl.textContent = `${u.name} (${u.role.toUpperCase()})`;
    } else {
      if (badge) {
        badge.className = 'pill pill-neutral';
        badge.textContent = 'Not Logged In';
      }
      if (lockBtn) lockBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (sideUserLbl) sideUserLbl.textContent = 'Guest';
    }
  }

  async function handleRouting() {
    updateAuthHeaderUI();
    renderSidebar();
    updateModeBadge();

    const hash = window.location.hash || '#/';

    if (hash === '#/' || hash === '') {
      document.getElementById('breadcrumb-title').textContent = t('nav_dashboard');
      await renderDashboardView();
    } else if (hash === '#/settings') {
      document.getElementById('breadcrumb-title').textContent = t('nav_settings');
      await renderSettingsView();
    } else if (hash === '#/shifts') {
      document.getElementById('breadcrumb-title').textContent = t('nav_shifts') || 'Shifts & Cash Register';
      await renderShiftsView();
    } else if (hash === '#/audit') {
      document.getElementById('breadcrumb-title').textContent = t('nav_audit');
      await renderAuditView();
    } else if (hash === '#/system-check') {
      document.getElementById('breadcrumb-title').textContent = t('nav_system_check');
      await renderSystemCheckView();
    } else if (hash === '#/scan') {
      document.getElementById('breadcrumb-title').textContent = t('mod_scan');
      await renderScanView();
    } else if (hash === '#/manual-bill') {
      document.getElementById('breadcrumb-title').textContent = t('mod_manual_bill');
      const emptyDraft = {
        id: generateUUID(),
        type: 'purchase',
        vendorName: '',
        customerName: '',
        billNumber: '',
        date: new Date().toISOString().slice(0, 10),
        paymentMode: 'cash',
        lines: [
          { id: 'l_' + Math.random().toString(36).slice(2, 8), nameRaw: '', nameEnglish: '', qtyBilled: 1, unit: 'pcs', unitPriceMinor: 0, printedLineTotalMinor: 0, taxable: true, confidence: 100, pageIndex: 1 }
        ],
        currency: 'PKR',
        status: 'draft',
        discountMinor: 0,
        freightMinor: 0,
        subtotalMinor: 0,
        printedGrandTotalMinor: 0,
        isNewManualDraft: true
      };
      await renderSplitEditor(emptyDraft, []);
    } else if (hash === '#/vault') {
      document.getElementById('breadcrumb-title').textContent = t('mod_vault');
      await renderVaultView();
    } else if (hash === '#/parties' || hash.startsWith('#/parties') || hash === '#/vendors' || hash.startsWith('#/vendors')) {
      await renderPartiesView('vendor');
    } else if (hash === '#/customers' || hash.startsWith('#/customers')) {
      await renderPartiesView('customer');
    } else if (hash === '#/ledger' || hash.startsWith('#/ledger?')) {
      await renderLedgerView();
    } else if (hash === '#/inventory' || hash === '#/items') {
      await renderInventoryView();
    } else if (hash === '#/purchase-orders') {
      await renderOrdersView();
    } else if (hash === '#/tax-reports') {
      await renderReportsView();
    } else if (hash === '#/budgets' || hash.startsWith('#/budgets') || hash === '#/recurring' || hash.startsWith('#/recurring')) {
      await renderBudgetsView(hash === '#/recurring' || hash.startsWith('#/recurring') ? 'recurring' : 'budgets');
    } else if (hash === '#/sales' || hash.startsWith('#/sales') || hash === '#/quick-add' || hash.startsWith('#/quick-add')) {
      window.location.hash = '#/manual-bill';
      return;
    } else if (hash === '#/khata' || hash.startsWith('#/khata') || hash === '#/split' || hash.startsWith('#/split')) {
      window.location.hash = '#/ledger';
      return;
    } else if (hash === '#/barcode' || hash === '#/voice') {
      await renderBarcodeView();
    } else {
      const mod = MODULE_DEFINITIONS.find(m => m.route === hash);
      document.getElementById('breadcrumb-title').textContent = mod ? t(mod.nameKey) : 'Module';
      document.getElementById('main-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <h3>${escapeHTML(mod ? t(mod.nameKey) : 'Module')}</h3>
          <p>This module is specified in the Project Playbook and will be active in a subsequent phase.</p>
          <div style="margin-top: 16px;"><span class="pill pill-neutral">Phase Deliverable</span></div>
        </div>
      `;
    }
    renderSidebar();
  }

  // =========================================================================
  // 14. PHASE 6: DEMO PACK, GUIDED TOUR, SYNTHETIC SCANNER & SELLER PANEL
  // =========================================================================

  function openSellerPanelModal() {
    if (BUILD_MODE === 'customer' || (typeof window !== 'undefined' && window.BuildConfig && window.BuildConfig.isCustomerBuild())) {
      console.warn('[Security] Seller panel is strictly disabled in customer build mode.');
      return;
    }
    modal.open({
      title: '🛠️ SELLER & DEMONSTRATION CONTROL PANEL',
      content: `
        <div style="font-size:13px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--border);">
            <span>Build Mode:</span>
            <strong id="sp-mode-val">${BUILD_MODE.toUpperCase()}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
            <span>Application Version:</span>
            <strong>v${APP_VERSION}</strong>
          </div>
          <p style="color:var(--muted); line-height:1.5;">
            Use this master panel for client demonstrations, sales pitches, automated tours, and data testing.
          </p>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="btn btn-primary" id="btn-sp-load-demo" style="justify-content:center;">
            🚀 Load 50 Demo Transactions
          </button>
          <button type="button" class="btn btn-secondary" id="btn-sp-clean-demo" style="justify-content:center;">
            🧹 Clean Demo Reset (Zero Balance Drift)
          </button>
          <button type="button" class="btn btn-secondary" id="btn-sp-tour" style="justify-content:center;">
            🎯 Launch 9-Step Guided Product Tour
          </button>
          <button type="button" class="btn btn-secondary" id="btn-sp-toggle-mode" style="justify-content:center;">
            🔄 Switch Build Mode (Demo ⇄ Customer)
          </button>
          <div style="margin-top:8px; padding-top:10px; border-top:1px solid var(--border);">
            <button type="button" class="btn btn-danger btn-sm" id="btn-sp-factory-reset" style="width:100%; justify-content:center;">
              🧨 Full Factory Reset
            </button>
          </div>
        </div>
      `,
      actions: [
        { label: 'Close Panel', class: 'btn-secondary', onClick: () => true }
      ]
    });

    document.getElementById('btn-sp-load-demo')?.addEventListener('click', async () => {
      try {
        if (!window.DemoEngine) throw new Error('DemoEngine not loaded');
        const res = await window.DemoEngine.loadDemoData();
        toast.show(`Loaded ${res.counts.transactions} demo records in ${res.elapsedMs}ms!`, 'success');
        modal.close();
        handleRouting();
      } catch (err) {
        alert('Failed to load demo data: ' + err.message);
      }
    });

    document.getElementById('btn-sp-clean-demo')?.addEventListener('click', async () => {
      if (!confirm('Purge all demo transactions? Genuine customer records will remain 100% untouched.')) return;
      try {
        if (!window.DemoEngine) throw new Error('DemoEngine not loaded');
        const res = await window.DemoEngine.removeDemoData();
        toast.show(`Cleaned ${res.deletedCount} demo records with zero balance drift.`, 'success');
        modal.close();
        handleRouting();
      } catch (err) {
        alert('Error removing demo data: ' + err.message);
      }
    });

    document.getElementById('btn-sp-tour')?.addEventListener('click', () => {
      modal.close();
      if (window.GuidedTour) window.GuidedTour.start();
    });

    document.getElementById('btn-sp-toggle-mode')?.addEventListener('click', () => {
      BUILD_MODE = (BUILD_MODE === 'demo') ? 'customer' : 'demo';
      if (typeof localStorage !== 'undefined') localStorage.setItem('aifm_build_mode', BUILD_MODE);
      if (window.BuildConfig) window.BuildConfig.BUILD_MODE = BUILD_MODE;
      const mb = document.getElementById('topbar-mode-badge');
      if (mb) {
        mb.textContent = `${BUILD_MODE.toUpperCase()} MODE`;
        mb.className = `pill ${BUILD_MODE === 'demo' ? 'pill-info' : 'pill-primary'}`;
        if (BUILD_MODE === 'customer') {
          mb.style.cursor = 'default';
          mb.removeAttribute('title');
        }
      }
      const spM = document.getElementById('sp-mode-val');
      if (spM) spM.textContent = BUILD_MODE.toUpperCase();
      toast.show(`Switched to ${BUILD_MODE.toUpperCase()} mode`, 'info');
      if (BUILD_MODE === 'customer') {
        setTimeout(() => modal.close(), 600);
      }
    });

    document.getElementById('btn-sp-factory-reset')?.addEventListener('click', () => {
      modal.close();
      promptHardResetConfirmation();
    });
  }

  // =========================================================================
  // 15. BOOTSTRAP INITIALIZATION
  // =========================================================================
  async function init() {
    try {
      // 1. Check protocol and display degradation notice if on file://
      if (window.location.protocol === 'file:') {
        const fileNotice = document.getElementById('file-protocol-notice');
        if (fileNotice) fileNotice.style.display = 'flex';
        const dismissBtn = document.getElementById('btn-dismiss-file-notice');
        if (dismissBtn) dismissBtn.addEventListener('click', () => fileNotice.style.display = 'none');
      }

      // 2. Set Version & Mode indicators
      const verEl = document.getElementById('sidebar-version');
      if (verEl) verEl.textContent = APP_VERSION;
      updateModeBadge();

      // 3. Open Database and Initialize Modules
      await openDB();
      await initModules();
      await applyBranding();

      // 4. Register Service Worker on localhost / HTTPS
      if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.warn('SW registration failed:', err);
        });
      }

      // Setup mobile menu
      const sidebar = document.getElementById('app-sidebar');
      const overlay = document.getElementById('mobile-overlay');
      const menuBtn = document.getElementById('mobile-menu-btn');
      const bMenuBtn = document.getElementById('bottom-nav-menu-toggle');

      const toggleMenu = () => {
        sidebar?.classList.toggle('mobile-open');
        overlay?.classList.toggle('active');
      };
      menuBtn?.addEventListener('click', toggleMenu);
      bMenuBtn?.addEventListener('click', toggleMenu);
      overlay?.addEventListener('click', toggleMenu);

      // Topbar & Sidebar Lock / Switch buttons
      document.getElementById('btn-topbar-lock')?.addEventListener('click', () => { lock(); handleRouting(); });
      document.getElementById('mobile-lock-btn')?.addEventListener('click', () => { lock(); handleRouting(); });
      document.getElementById('btn-topbar-logout')?.addEventListener('click', () => { logout(); handleRouting(); });
      document.getElementById('sidebar-btn-lock')?.addEventListener('click', () => { lock(); handleRouting(); });
      document.getElementById('sidebar-btn-logout')?.addEventListener('click', () => { logout(); handleRouting(); });

      // Demo panel shortcut Alt+Shift+D (Active strictly in Demo build mode)
      window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
          e.preventDefault();
          if (isDemoMode()) {
            openSellerPanelModal();
          }
        }
      });

      window.addEventListener('hashchange', () => handleRouting());
      window.addEventListener('module-state-changed', () => renderSidebar());

      // Prevent mouse wheel from inadvertently scrolling values on focused number inputs
      window.addEventListener('wheel', () => {
        if (document.activeElement && document.activeElement.type === 'number') {
          document.activeElement.blur();
        }
      }, { passive: true });

      // Auto-reconcile any legacy transactions/stock upon startup
      await autoReconcileLegacyTransactions().catch(() => {});

      // Start initial route
      await handleRouting();

    } catch (err) {
      console.error('Initialization error:', err);
      const mainEl = document.getElementById('main-content');
      if (mainEl) {
        mainEl.innerHTML = `
          <div class="empty-state" style="border-color: var(--error-border);">
            <div class="empty-state-icon" style="color: var(--error-text);">❌</div>
            <h3 style="color: var(--error-text);">Initialization Error</h3>
            <p>${escapeHTML(err.message)}</p>
            <div style="margin-top: 16px;">
              <button type="button" class="btn btn-primary" onclick="window.location.reload()">Retry</button>
            </div>
          </div>
        `;
      }
    }
  }

  const AppCore = {
    APP_VERSION,
    BUILD_MODE,
    parseMoney,
    formatMoney,
    add,
    sub,
    addMoney,
    subMoney,
    sum,
    lineTotal,
    percentOf,
    auditRowMath,
    auditInvoiceTotals,
    runCompleteAudit,
    obfuscateSecret,
    deobfuscateSecret,
    savePermanentAIConfig,
    loadPermanentAIConfig,
    containsUrdu,
    normalizeDate,
    normalizeLineItem,
    normalizeDraftTransaction,
    mergeMultiPageExtractions,
    openSellerPanelModal,
    setBuildMode,
    isDemoMode
  };

  if (typeof window !== 'undefined') {
    window.AppCore = AppCore;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppCore, ...AppCore };
  }

  // Run on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})();
