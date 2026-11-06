/**
 * @file table.js
 * @description Flat data table renderer adhering to Editorial Flat Luxury design rules.
 */

import { escapeHTML } from '../core/utils.js';

/**
 * Renders an HTML string for a structured data table.
 * @param {Object} options
 * @param {Array<{ key: string, label: string, align?: string, format?: Function }>} options.columns
 * @param {Array<Object>} options.data
 * @param {string} [options.emptyMessage='No records found']
 * @returns {string} HTML string
 */
export function renderTable({ columns, data, emptyMessage = 'No records found' }) {
  if (!data || data.length === 0) {
    return `
      <div class="empty-state" style="padding: 24px;">
        <p style="color: var(--muted);">${escapeHTML(emptyMessage)}</p>
      </div>
    `;
  }

  const headerCells = columns.map(col => `
    <th style="text-align: ${col.align || 'left'};">${escapeHTML(col.label)}</th>
  `).join('');

  const rows = data.map(row => {
    const cells = columns.map(col => {
      let val = row[col.key];
      if (typeof col.format === 'function') {
        val = col.format(val, row);
      } else {
        val = escapeHTML(val ?? '—');
      }
      return `<td style="text-align: ${col.align || 'left'};">${val}</td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
