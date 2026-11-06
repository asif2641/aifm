/**
 * @file utils.js
 * @description General utility functions for Smart Bill Auditor.
 * Includes cryptographic UUID v4 generation, HTML escaping, and debounce helpers.
 */

/**
 * Generates a RFC4122 compliant UUID v4 using crypto.randomUUID or fallback.
 * @returns {string} UUID string
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues for older WebKit / environments
  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 16; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  buf[6] = (buf[6] & 0x0f) | 0x40; // Version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // Variant RFC4122

  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Escapes unsafe characters in strings before rendering to prevent XSS.
 * Master Rule: Escape all user and AI text on render; never inject raw data into innerHTML.
 * @param {string} str 
 * @returns {string} HTML-escaped string
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats an ISO date string (YYYY-MM-DD or full timestamp) into localized readable format.
 * @param {string} isoDate 
 * @param {string} [locale='en-US'] 
 * @returns {string}
 */
export function formatDate(isoDate, locale = 'en-US') {
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

/**
 * Creates a debounced function that delays invoking fn until waitMs milliseconds have elapsed.
 * @param {Function} fn 
 * @param {number} waitMs 
 * @returns {Function}
 */
export function debounce(fn, waitMs) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, waitMs);
  };
}

/**
 * Extracts raw JPEG images from PDF byte array.
 * Scanned bills / photos in PDFs are stored with /DCTDecode (JPEG magic FF D8 FF).
 * @param {Uint8Array} pdfBytes
 * @returns {Uint8Array[]}
 */
export function extractJpegImagesFromPdf(pdfBytes) {
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

export function uint8ArrayToDataUrl(bytes, mimeType = 'image/jpeg') {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function dataUrlToUint8Array(dataUrl) {
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

export function extractImageFromPdfDataUrl(pdfDataUrl) {
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

