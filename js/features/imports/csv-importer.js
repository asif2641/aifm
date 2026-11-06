// =========================================================================
// BANK STATEMENT CSV IMPORTER (PURE FUNCTIONS)
// Parses CSV, maps columns, detects duplicates, saves nothing before confirm
// =========================================================================

import { parseMoney } from '../../core/money.js';
import { suggestCategory } from '../quick-add/quick-add.js';

/**
 * Parses raw CSV text into array of rows and headers.
 *
 * @param {string} csvText - Raw CSV string
 * @returns {{ headers: string[], rows: Array<string[]> }}
 */
export function parseCSV(csvText) {
  if (!csvText) return { headers: [], rows: [] };
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line) => {
    const tokens = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        tokens.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    tokens.push(cur.trim());
    return tokens.map(t => t.replace(/^"|"$/g, '').trim());
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow).filter(r => r.length > 1);

  return { headers, rows };
}

/**
 * Automatically suggests column index mapping for standard bank statement columns.
 *
 * @param {string[]} headers - CSV headers
 * @returns {Object} { dateIdx, descIdx, amountIdx, debitIdx, creditIdx }
 */
export function autoDetectColumnMapping(headers = []) {
  const mapping = { dateIdx: -1, descIdx: -1, amountIdx: -1, debitIdx: -1, creditIdx: -1 };

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (mapping.dateIdx === -1 && (lower.includes('date') || lower.includes('tarikh') || lower.includes('time'))) {
      mapping.dateIdx = idx;
    }
    if (mapping.descIdx === -1 && (lower.includes('desc') || lower.includes('particular') || lower.includes('detail') || lower.includes('narration') || lower.includes('memo'))) {
      mapping.descIdx = idx;
    }
    if (mapping.amountIdx === -1 && (lower.includes('amount') || lower.includes('total') || lower.includes('net'))) {
      mapping.amountIdx = idx;
    }
    if (mapping.debitIdx === -1 && (lower.includes('debit') || lower.includes('withdrawal') || lower.includes('dr'))) {
      mapping.debitIdx = idx;
    }
    if (mapping.creditIdx === -1 && (lower.includes('credit') || lower.includes('deposit') || lower.includes('cr'))) {
      mapping.creditIdx = idx;
    }
  });

  return mapping;
}

/**
 * Processes CSV rows with column mapping and existing transactions for duplicate detection.
 * Does NOT persist anything to the database.
 *
 * @param {Array<string[]>} rows - Parsed CSV rows
 * @param {Object} mapping - Column indices
 * @param {Array<Object>} existingTransactions - Current transactions to check against
 * @param {string} currency - 'PKR'
 * @returns {Object} Preview data { items: Array<Object>, duplicateCount: number, validCount: number }
 */
export function previewCSVImport(rows, mapping, existingTransactions = [], currency = 'PKR') {
  const existingSet = new Set(
    existingTransactions.map(t => `${(t.date || '').slice(0, 10)}_${t.grandTotalMinor || t.amountMinor}`)
  );

  const items = [];
  let duplicateCount = 0;

  rows.forEach((r, rowIdx) => {
    const dateRaw = mapping.dateIdx >= 0 ? r[mapping.dateIdx] : '';
    const desc = mapping.descIdx >= 0 ? r[mapping.descIdx] : 'Bank Transaction';

    let amountMinor = 0;
    if (mapping.amountIdx >= 0 && r[mapping.amountIdx]) {
      amountMinor = parseMoney(r[mapping.amountIdx], currency);
    } else if (mapping.debitIdx >= 0 && r[mapping.debitIdx]) {
      amountMinor = parseMoney(r[mapping.debitIdx], currency);
    } else if (mapping.creditIdx >= 0 && r[mapping.creditIdx]) {
      amountMinor = parseMoney(r[mapping.creditIdx], currency);
    }

    if (amountMinor === 0) return;

    // Date normalization
    let dateStr = new Date().toISOString().slice(0, 10);
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().slice(0, 10);
      }
    }

    const key = `${dateStr}_${amountMinor}`;
    const isDuplicate = existingSet.has(key);
    if (isDuplicate) duplicateCount++;

    const catId = suggestCategory(desc);

    items.push({
      rowIndex: rowIdx + 1,
      date: dateStr,
      description: desc,
      amountMinor,
      categoryId: catId,
      isDuplicate
    });
  });

  return {
    items,
    totalRows: rows.length,
    validCount: items.length - duplicateCount,
    duplicateCount
  };
}
