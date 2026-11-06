/**
 * @file item-master.js
 * @description Item Master management, alias resolution (Urdu/English), and unit conversion.
 */

import { stringSimilarity } from './duplicate-layer3.js';

export const UNIT_CONVERSIONS = {
  // Weight
  kg: { g: 1000, gm: 1000, gram: 1000, grams: 1000, kg: 1 },
  g: { kg: 0.001, g: 1, gm: 1, gram: 1 },
  // Count
  dozen: { pcs: 12, piece: 12, pieces: 12, nos: 12, dozen: 1 },
  pcs: { dozen: 1 / 12, pcs: 1, piece: 1, pieces: 1, nos: 1 },
  // Volume
  litre: { ml: 1000, l: 1, litre: 1, liter: 1 },
  l: { ml: 1000, litre: 1, l: 1 },
  ml: { litre: 0.001, l: 0.001, ml: 1 }
};

/**
 * Normalizes unit string to standard abbreviation.
 * @param {string} rawUnit 
 * @returns {string}
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit) return 'pcs';
  const u = String(rawUnit).toLowerCase().trim();
  if (['kg', 'kgs', 'kilo', 'kilogram'].includes(u)) return 'kg';
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(u)) return 'g';
  if (['dozen', 'doz', 'dz'].includes(u)) return 'dozen';
  if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'number', 'adad'].includes(u)) return 'pcs';
  if (['l', 'ltr', 'litre', 'liter', 'litres'].includes(u)) return 'litre';
  if (['ml', 'milli'].includes(u)) return 'ml';
  if (['box', 'dabba', 'pack', 'packet', 'carton'].includes(u)) return 'box';
  return u;
}

/**
 * Converts a quantity and unit price from one unit to another.
 * e.g., 500 g at Rs. 75 -> equivalent to 0.5 kg at Rs. 150/kg.
 * @param {number} qty 
 * @param {number} unitPriceMinor 
 * @param {string} fromUnit 
 * @param {string} toUnit 
 * @returns {{ convertedQty: number, normalizedUnitPriceMinor: number }|null}
 */
export function convertQuantityAndPrice(qty, unitPriceMinor, fromUnit, toUnit) {
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);

  if (normFrom === normTo) {
    return { convertedQty: qty, normalizedUnitPriceMinor: unitPriceMinor };
  }

  const convTable = UNIT_CONVERSIONS[normFrom];
  if (!convTable || !convTable[normTo]) {
    return null; // Incompatible units (e.g. kg to pcs)
  }

  const factor = convTable[normTo];
  const convertedQty = qty * factor;
  // If 1 kg = 1000 g, price per kg = price per g * 1000
  const normalizedUnitPriceMinor = Math.round(unitPriceMinor / factor);

  return {
    convertedQty,
    normalizedUnitPriceMinor
  };
}

/**
 * Resolves an extracted line item name against the Item Master list.
 * @param {string} rawName 
 * @param {Array<Object>} masterItems 
 * @returns {{ item: Object|null, matchType: 'exact_alias'|'normalized'|'fuzzy'|'none', confidence: number }}
 */
export function matchItemMaster(rawName, masterItems = []) {
  if (!rawName || !Array.isArray(masterItems) || masterItems.length === 0) {
    return { item: null, matchType: 'none', confidence: 0 };
  }

  const query = rawName.toLowerCase().trim();

  // 1. Exact alias or name match
  for (const item of masterItems) {
    if (item.name?.toLowerCase().trim() === query || item.nameUrdu?.trim() === query) {
      return { item, matchType: 'exact_alias', confidence: 100 };
    }
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
    for (const a of aliases) {
      if (a.toLowerCase().trim() === query) {
        return { item, matchType: 'exact_alias', confidence: 100 };
      }
    }
  }

  // 2. Normalized match (remove weight suffixes like '50kg', '1kg', etc.)
  const cleanQuery = query.replace(/\b\d+(\.\d+)?\s*(kg|g|gm|pcs|ltr|ml|box)\b/g, '').trim();
  for (const item of masterItems) {
    const cleanItemName = item.name?.toLowerCase().replace(/\b\d+(\.\d+)?\s*(kg|g|gm|pcs|ltr|ml|box)\b/g, '').trim();
    if (cleanQuery && cleanItemName && cleanQuery === cleanItemName) {
      return { item, matchType: 'normalized', confidence: 90 };
    }
  }

  // 3. Fuzzy match (similarity >= 0.65)
  let bestItem = null;
  let bestSim = 0;
  for (const item of masterItems) {
    const sim = stringSimilarity(cleanQuery || query, item.name || '');
    if (sim > bestSim && sim >= 0.65) {
      bestSim = sim;
      bestItem = item;
    }
  }

  if (bestItem) {
    return { item: bestItem, matchType: 'fuzzy', confidence: Math.round(bestSim * 100) };
  }

  return { item: null, matchType: 'none', confidence: 0 };
}
