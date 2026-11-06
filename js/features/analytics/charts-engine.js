// =========================================================================
// FLAT CHARTS ENGINE & DATA TABLE GENERATOR (PURE FUNCTIONS)
// Zero-dependency pure SVG solid flat rendering. 0 gradients, 0 shadows.
// =========================================================================

import { formatMoney } from '../../core/money.js';

export const FLAT_CHART_COLORS = [
  '#2F5D50', // Deep Forest
  '#D97762', // Warm Coral
  '#4A7C59', // Leaf Green
  '#D4A373', // Desert Tan
  '#457B9D', // Steel Blue
  '#E76F51', // Burnt Orange
  '#6D6875', // Muted Slate
  '#3D5A80'  // Navy
];

/**
 * Generates an SVG Bar Chart.
 *
 * @param {Object} options - { series: [{ name, color, values: number[] }], labels: string[], height, width }
 * @returns {string} SVG string
 */
export function renderBarChartSVG(options) {
  const { series = [], labels = [], height = 240, width = 500 } = options;
  if (labels.length === 0 || series.length === 0) {
    return `<div style="text-align:center; padding:32px; color:var(--muted);">No data to display</div>`;
  }

  const padLeft = 60, padRight = 20, padTop = 20, padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Find max value across all series
  let maxVal = 1;
  for (const s of series) {
    for (const v of s.values) {
      if (v > maxVal) maxVal = v;
    }
  }

  const groupCount = labels.length;
  const seriesCount = series.length;
  const groupW = chartW / groupCount;
  const barW = Math.max(6, (groupW * 0.7) / seriesCount);

  let barsHTML = '';
  labels.forEach((lbl, gIdx) => {
    const groupX = padLeft + gIdx * groupW;

    series.forEach((s, sIdx) => {
      const val = s.values[gIdx] || 0;
      const barH = (val / maxVal) * chartH;
      const x = groupX + (groupW * 0.15) + (sIdx * barW);
      const y = padTop + (chartH - barH);
      const col = s.color || FLAT_CHART_COLORS[sIdx % FLAT_CHART_COLORS.length];

      barsHTML += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${col}"><title>${lbl} - ${s.name}: ${val}</title></rect>`;
    });

    // Label on X axis
    const lblX = groupX + groupW / 2;
    const lblY = height - 12;
    barsHTML += `<text x="${lblX.toFixed(1)}" y="${lblY}" font-size="10" fill="#686D68" text-anchor="middle" font-family="sans-serif">${lbl}</text>`;
  });

  // Y axis ticks (3 ticks)
  let axisHTML = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="#E4DFD7" stroke-width="1"/>`;
  axisHTML += `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#E4DFD7" stroke-width="1"/>`;

  [0, 0.5, 1].forEach(pct => {
    const yVal = maxVal * pct;
    const yPos = padTop + chartH * (1 - pct);
    axisHTML += `<line x1="${padLeft - 4}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" stroke="#E4DFD7" stroke-dasharray="2,2" stroke-width="1"/>`;
    axisHTML += `<text x="${padLeft - 8}" y="${yPos + 3}" font-size="9" fill="#686D68" text-anchor="end" font-family="sans-serif">${Math.round(yVal / 100).toLocaleString()}</text>`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; display:block;">
      ${axisHTML}
      ${barsHTML}
    </svg>
  `;
}

/**
 * Generates an SVG Doughnut Chart.
 *
 * @param {Object} options - { slices: [{ label, value, color }], size }
 * @returns {string} SVG string
 */
export function renderDoughnutChartSVG(options) {
  const { slices = [], size = 200 } = options;
  const total = slices.reduce((a, b) => a + (b.value || 0), 0);
  if (total === 0) {
    return `<div style="text-align:center; padding:32px; color:var(--muted);">No data to display</div>`;
  }

  const cx = size / 2, cy = size / 2, r = size * 0.38, strokeW = size * 0.16;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  let pathsHTML = '';

  slices.forEach((s, idx) => {
    const val = s.value || 0;
    const pct = val / total;
    const strokeDash = pct * circ;
    const strokeSpace = circ - strokeDash;
    const col = s.color || FLAT_CHART_COLORS[idx % FLAT_CHART_COLORS.length];

    pathsHTML += `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${strokeW}"
        stroke-dasharray="${strokeDash.toFixed(2)} ${strokeSpace.toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})">
        <title>${s.label}: ${val} (${(pct * 100).toFixed(1)}%)</title>
      </circle>
    `;
    offset += strokeDash;
  });

  return `
    <svg viewBox="0 0 ${size} ${size}" style="width:${size}px; height:${size}px; display:inline-block;">
      ${pathsHTML}
    </svg>
  `;
}

/**
 * Generates an accessible Data Table equivalent for any chart.
 *
 * @param {Array<string>} headers - Table column headers
 * @param {Array<Array<any>>} rows - Table rows
 * @returns {string} HTML table string
 */
export function renderDataTableHTML(headers = [], rows = []) {
  return `
    <table class="table" style="font-size:12px; margin:0;">
      <thead style="background:var(--panel);">
        <tr>
          ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            ${r.map((c, i) => `<td style="${i > 0 ? 'text-align:right;' : ''}">${c}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
