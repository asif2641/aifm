const fs = require('fs');
const path = require('path');

const standalonePath = path.join(__dirname, '..', 'app.standalone.js');
let code = fs.readFileSync(standalonePath, 'utf8');

// 1. Add Phase 3 Pure Audit Engine Block right before Section 14 (ROUTER & SHELL INTEGRATION)
const phase3Block = `
  // =========================================================================
  // 13C. PHASE 3: AUDIT ENGINE (PURE FUNCTIONS, ROW MATH, HIKE & RECONCILIATION)
  // =========================================================================

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

  function auditRowMath(line, options = {}) {
    if (!line || line.isCarriedForward) return null;
    const tol = options.toleranceMinor ?? 1;
    const qty = parseFloat(line.qtyBilled) || 0;
    const rate = line.unitPriceMinor || 0;
    const printed = line.printedLineTotalMinor || 0;
    const calc = lineTotal(Math.round(qty * 1000), rate);
    const diff = calc - printed;

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
        message: \`Printed: \${formatMoney(printed, options.currency)} | Calculated: \${formatMoney(calc, options.currency)} | Diff: \${formatMoney(Math.abs(diff), options.currency)}\`
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

    if (Math.abs(diff) > tol) {
      return [{
        code: AUDIT_FINDING_CODES.INVOICE_TOTAL_MISMATCH,
        severity: 'error',
        expected: net,
        actual: printed,
        diff,
        message: \`Invoice Total Discrepancy: Lines sum minus discount plus freight and taxes equals \${formatMoney(net, tx.currency)}, but printed total is \${formatMoney(printed, tx.currency)}.\`,
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
              message: \`Price Hike: +\${pct}% higher than last purchase (\${formatMoney(prevPrice, tx.currency)} on \${prev.date})\`
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
          message: \`Layer 3 Business Duplicate: Bill #\${billNo} from "\${h.vendorName}" was already confirmed on \${h.date}.\`
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
            message: \`Possible Duplicate: Same vendor & total recorded on \${h.date}.\`
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
      if (!l.nameRaw || l.nameRaw === 'Item') {
        f.push({ code: 'MISSING_LINE_NAME', severity: 'error', lineId: l.id, message: 'Item name missing on row.' });
      }
      if (l.qtyBilled <= 0) {
        f.push({ code: 'INVALID_QTY', severity: 'error', lineId: l.id, message: 'Invalid quantity.' });
      }
      if (l.confidence && l.confidence < 80) {
        f.push({ code: AUDIT_FINDING_CODES.LOW_CONFIDENCE, severity: 'warning', lineId: l.id, message: \`Low OCR confidence (\${l.confidence}%).\` });
      }
    }
    return f;
  }

  function runCompleteAudit(tx, context = {}) {
    const { history = [], options = {} } = context;
    const findings = [];
    if (!tx) return { findings: [], summary: { errorCount: 0, warningCount: 0, pass: true } };

    for (const l of (tx.lines || [])) {
      const mf = auditRowMath(l, { toleranceMinor: options.toleranceMinor ?? 1, currency: tx.currency });
      if (mf) findings.push(mf);
    }
    findings.push(...auditInvoiceTotals(tx, { toleranceMinor: options.toleranceMinor ?? 1 }));
    findings.push(...auditMissingFields(tx));
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
`;

// Insert phase3Block right before Section 14
const routerAnchor = "  // =========================================================================\n  // 14. ROUTER & SHELL INTEGRATION";
if (code.includes(routerAnchor)) {
  code = code.replace(routerAnchor, phase3Block + '\n' + routerAnchor);
} else {
  console.error('Could not find router anchor');
}

// 2. Add Audit Tests link in renderSystemCheckView
code = code.replace(
  '<a href="./tests/scan-pipeline.test.html" target="_blank" class="btn btn-primary btn-sm">📸 Scan Pipeline Tests (13)</a>',
  '<a href="./tests/scan-pipeline.test.html" target="_blank" class="btn btn-primary btn-sm">📸 Scan Pipeline Tests (13)</a>\n            <a href="./tests/audit.test.html" target="_blank" class="btn btn-secondary btn-sm">⚖️ Audit Tests (42)</a>'
);

fs.writeFileSync(standalonePath, code, 'utf8');
console.log('Successfully added Phase 3 Audit Engine to app.standalone.js!');
