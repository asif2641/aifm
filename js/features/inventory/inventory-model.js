// =========================================================================
// INVENTORY & STOCK DERIVATION MODEL (PURE FUNCTIONS)
// Stock is ALWAYS derived = sum(stockMovements). Zero floating-point arithmetic.
// =========================================================================

import { lineTotal } from '../../core/money.js';

/**
 * Computes current stock for an item from its stock movements.
 * Positive qtyChangeMilli = inward (purchase, positive adjustment, sales return)
 * Negative qtyChangeMilli = outward (sale, negative adjustment, purchase return)
 *
 * @param {string} itemId - Item ID
 * @param {Array<Object>} stockMovements - All stock movements
 * @returns {number} Stock in milli-units (e.g. 1000 = 1.000 units)
 */
export function computeItemStock(itemId, stockMovements = []) {
  if (!itemId) return 0;
  let totalMilli = 0;
  for (const m of stockMovements) {
    if (m.itemId === itemId && m.status !== 'cancelled') {
      totalMilli += (m.qtyChangeMilli || 0);
    }
  }
  return totalMilli;
}

/**
 * Derives the Weighted Average Cost (WAC) in integer minor units.
 * Formula:
 *   WAC = (Existing Stock * Old WAC + Inward Qty * Unit Rate) / Total New Stock
 *
 * @param {string} itemId - Item ID
 * @param {Array<Object>} stockMovements - Stock movements sorted chronologically
 * @param {number} [fallbackPriceMinor=0] - Fallback purchase price in minor units
 * @returns {number} WAC in integer minor units
 */
export function computeItemWAC(itemId, stockMovements = [], fallbackPriceMinor = 0) {
  if (!itemId) return 0;

  let currentStockMilli = 0;
  let currentWACMinor = fallbackPriceMinor || 0;

  // Filter and sort movements chronologically
  const itemMoves = stockMovements
    .filter(m => m.itemId === itemId && m.status !== 'cancelled')
    .sort((a, b) => {
      const dA = a.date || '';
      const dB = b.date || '';
      if (dA !== dB) return dA.localeCompare(dB);
      return (a.id || '').localeCompare(b.id || '');
    });

  for (const m of itemMoves) {
    const deltaMilli = (m.qtyChangeMilli != null) ? m.qtyChangeMilli : (m.deltaMilli != null ? m.deltaMilli : 0);
    let unitPriceMinor = m.unitPriceMinor;
    if (unitPriceMinor == null || unitPriceMinor <= 0) {
      unitPriceMinor = currentWACMinor > 0 ? currentWACMinor : fallbackPriceMinor;
    }

    if (deltaMilli > 0) {
      // Inward movement (Purchase or Inward Adjustment)
      const prevStockMilli = Math.max(0, currentStockMilli);
      const newStockMilli = prevStockMilli + deltaMilli;

      if (newStockMilli > 0) {
        // Total value = (prevStock * prevWAC + newQty * newRate)
        const prevValue = lineTotal(prevStockMilli, currentWACMinor);
        const addedValue = lineTotal(deltaMilli, unitPriceMinor);
        const totalValue = prevValue + addedValue;

        // New WAC rate = totalValue / (newStockMilli / 1000)
        currentWACMinor = Math.round((totalValue * 1000) / newStockMilli);
      }
      currentStockMilli += deltaMilli;
    } else {
      // Outward movement (Sale, Damaged, Outward Adjustment)
      // Outward movements reduce quantity but do NOT change the unit WAC
      currentStockMilli += deltaMilli;
    }
  }

  return Math.max(0, currentWACMinor > 0 ? currentWACMinor : (fallbackPriceMinor || 0));
}

/**
 * Validates stock decrease against the configured negative-stock policy.
 *
 * @param {number} currentStockMilli - Current stock in milli-units
 * @param {number} decreaseMilli - Qty to decrease in milli-units (positive number)
 * @param {string} policy - 'block' | 'warn' | 'allow'
 * @returns {Object} { allowed: boolean, warning: boolean, message: string }
 */
export function validateStockDecrease(currentStockMilli, decreaseMilli, policy = 'warn') {
  const resultStock = currentStockMilli - decreaseMilli;

  if (resultStock >= 0) {
    return { allowed: true, warning: false, message: 'Stock sufficient.' };
  }

  const defUnit = (Math.abs(resultStock) / 1000).toFixed(2);
  const msg = `Insufficient stock: Operation requires ${(decreaseMilli / 1000).toFixed(2)}, but current stock is ${(currentStockMilli / 1000).toFixed(2)} (Deficit: ${defUnit}).`;

  if (policy === 'block') {
    return {
      allowed: false,
      warning: false,
      message: `${msg} Negative stock is BLOCKED by company policy.`
    };
  }

  if (policy === 'warn') {
    return {
      allowed: true,
      warning: true,
      message: `${msg} Proceeding will create negative inventory.`
    };
  }

  // policy === 'allow'
  return {
    allowed: true,
    warning: false,
    message: msg
  };
}

/**
 * Checks whether an item's derived stock is below its reorder level.
 *
 * @param {Object} item - Item master object { reorderLevelMilli, ... }
 * @param {number} currentStockMilli - Current derived stock in milli-units
 * @returns {boolean} True if stock <= reorder level
 */
export function isLowStock(item, currentStockMilli) {
  if (!item || item.reorderLevelMilli == null) return false;
  return currentStockMilli <= item.reorderLevelMilli;
}

/**
 * Unit conversion helper for standard inventory units.
 *
 * @param {number} qtyMilli - Quantity in milli-units
 * @param {string} fromUnit - 'kg' | 'g' | 'dozen' | 'pcs' | 'litre' | 'ml'
 * @param {string} toUnit - Target unit
 * @returns {number|null} Converted qty in milli-units, or null if incompatible
 */
export function convertStockUnit(qtyMilli, fromUnit, toUnit) {
  const uFrom = String(fromUnit || '').toLowerCase().trim();
  const uTo = String(toUnit || '').toLowerCase().trim();

  if (uFrom === uTo) return qtyMilli;

  // Mass: kg <-> g
  if (uFrom === 'kg' && uTo === 'g') return qtyMilli * 1000;
  if (uFrom === 'g' && uTo === 'kg') return Math.round(qtyMilli / 1000);

  // Count: dozen <-> pcs
  if (uFrom === 'dozen' && (uTo === 'pcs' || uTo === 'piece' || uTo === 'pieces')) return qtyMilli * 12;
  if ((uFrom === 'pcs' || uFrom === 'piece' || uFrom === 'pieces') && uTo === 'dozen') return Math.round(qtyMilli / 12);

  // Volume: litre <-> ml
  if ((uFrom === 'litre' || uFrom === 'l' || uFrom === 'liter') && uTo === 'ml') return qtyMilli * 1000;
  if (uTo === 'litre' || uTo === 'l' || uTo === 'liter' && uFrom === 'ml') return Math.round(qtyMilli / 1000);

  return null;
}
