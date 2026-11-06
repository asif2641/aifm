const fs = require('fs');
const path = require('path');

const standalonePath = path.join(__dirname, '..', 'app.standalone.js');
let code = fs.readFileSync(standalonePath, 'utf8');

// 1. Check if scan & vault are marked isBuilt: true
code = code.replace(
  "{ id: 'scan', nameKey: 'mod_scan', icon: 'camera', group: 'operations', route: '#/scan', core: false, dependsOn: [], defaultEnabled: true, isBuilt: false }",
  "{ id: 'scan', nameKey: 'mod_scan', icon: 'camera', group: 'operations', route: '#/scan', core: false, dependsOn: [], defaultEnabled: true, isBuilt: true }"
);
code = code.replace(
  "{ id: 'vault', nameKey: 'mod_vault', icon: 'archive', group: 'operations', route: '#/vault', core: false, dependsOn: ['scan'], defaultEnabled: true, isBuilt: false }",
  "{ id: 'vault', nameKey: 'mod_vault', icon: 'archive', group: 'operations', route: '#/vault', core: false, dependsOn: ['scan'], defaultEnabled: true, isBuilt: true }"
);

// 2. Add Phase 2 logic before section 14 (ROUTER & SHELL INTEGRATION)
const phase2Block = `
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
      issues.push({ type: 'resolution_low', severity: 'error', message: \`Low resolution (\${width}×\${height}px). Minimum recommended is \${cfg.minResolution}px.\` });
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

  async function computeSHA256(buffer) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return bufferToHex(digest);
    }
    return 'sha256-mock-' + Math.random().toString(36);
  }

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
              message: \`Likely duplicate photo detected (\${dist} bit difference).\`
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
    try {
      const d = new Date(rawDate);
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

  function normalizeLineItem(rawLine = {}, currencyCode = 'PKR', defaultPageIndex = 1) {
    const nameRaw = String(rawLine.nameRaw || rawLine.name || 'Item').trim();
    const nameUrdu = String(rawLine.nameUrdu || '').trim();
    const nameEnglish = String(rawLine.nameEnglish || nameRaw).trim();
    let qty = 1;
    if (typeof rawLine.qty === 'number' && rawLine.qty > 0) qty = rawLine.qty;
    else if (rawLine.qty) {
      const p = parseFloat(String(rawLine.qty).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(p) && p > 0) qty = p;
    }
    const unit = String(rawLine.unit || 'pcs').toLowerCase().trim();
    const category = String(rawLine.category || 'General').trim();
    const unitPriceMinor = parseMoney(rawLine.unitPrice ?? rawLine.rate ?? 0, currencyCode);
    let printedLineTotalMinor = parseMoney(rawLine.lineTotal ?? rawLine.printedLineTotal ?? 0, currencyCode);
    if (printedLineTotalMinor === 0 && unitPriceMinor > 0) {
      const qtyMilli = Math.round(qty * 1000);
      printedLineTotalMinor = lineTotal(qtyMilli, unitPriceMinor);
    }
    const lower = nameRaw.toLowerCase();
    const isCarriedForward = lower.includes('carried forward') || lower.includes('brought forward') || lower.includes('b/f') || lower.includes('c/f');
    let confidence = 95;
    if (typeof rawLine.confidence === 'number') confidence = Math.max(0, Math.min(100, Math.round(rawLine.confidence)));

    return {
      id: rawLine.id || ('line_' + Math.random().toString(36).slice(2, 9)),
      nameRaw,
      nameEnglish,
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
    const currency = raw.currencyHint || defaultCurrency || 'PKR';
    const vendorObj = raw.vendor || {};
    const vendorName = String(vendorObj.name || raw.vendorName || 'Unknown Vendor').trim();
    const vendorTaxId = String(vendorObj.taxId || raw.vendorTaxId || '').trim();
    const customerObj = raw.customer || {};
    const customerName = String(customerObj.name || '').trim();
    const billNumber = String(raw.billNumber || raw.invoiceNumber || '').trim();
    const date = normalizeDate(raw.date);
    const paymentMode = normalizePaymentMode(raw.paymentMode);

    const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
    const lines = rawLines.map((l, i) => normalizeLineItem(l, currency, l.pageIndex || 1));

    let subtotalMinor = 0;
    for (const l of lines.filter(l => !l.isCarriedForward)) {
      subtotalMinor = add(subtotalMinor, l.printedLineTotalMinor);
    }

    const discountMinor = parseMoney(raw.discount || 0, currency);
    const freightMinor = parseMoney(raw.freight || raw.shipping || 0, currency);
    let grandTotalMinor = parseMoney(raw.printedGrandTotal ?? raw.grandTotal ?? 0, currency);
    if (grandTotalMinor === 0) {
      grandTotalMinor = add(sub(subtotalMinor, discountMinor), freightMinor);
    }

    return {
      type: 'purchase',
      status: 'draft',
      currency,
      vendorName,
      vendorTaxId,
      customerName,
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
    if (pageResults.length === 0) return { mergedDraft: normalizeDraftTransaction({}, currencyCode, pageMeta), deduplicatedCount: 0, notes: [] };
    if (pageResults.length === 1) return { mergedDraft: normalizeDraftTransaction(pageResults[0], currencyCode, pageMeta), deduplicatedCount: 0, notes: [] };

    let mergedVendor = null, mergedCustomer = null, mergedBillNumber = null, mergedDate = null, mergedPaymentMode = null;
    let mergedGrandTotal = 0, mergedDiscount = 0, mergedFreight = 0;
    const allLines = [];
    let deduplicatedCount = 0;
    const notes = [];

    for (let i = 0; i < pageResults.length; i++) {
      const p = pageResults[i];
      const pageNum = i + 1;
      if (!mergedVendor && (p.vendor?.name || p.vendorName)) {
        mergedVendor = p.vendor || { name: p.vendorName, taxId: p.vendorTaxId };
        notes.push(\`Header captured from Page \${pageNum}.\`);
      }
      if (!mergedBillNumber && (p.billNumber || p.invoiceNumber)) mergedBillNumber = p.billNumber || p.invoiceNumber;
      if (!mergedDate && p.date) mergedDate = p.date;
      if (!mergedPaymentMode && p.paymentMode) mergedPaymentMode = p.paymentMode;

      const rawLines = Array.isArray(p.lines) ? p.lines : [];
      for (const rawL of rawLines) {
        const line = normalizeLineItem(rawL, currencyCode, pageNum);
        if (allLines.length > 0) {
          const last = allLines[allLines.length - 1];
          if (last.pageIndex !== pageNum && last.nameRaw.toLowerCase() === line.nameRaw.toLowerCase() && last.printedLineTotalMinor === line.printedLineTotalMinor) {
            deduplicatedCount++;
            notes.push(\`Deduplicated junction line "\${line.nameRaw}".\`);
            continue;
          }
        }
        allLines.push(line);
      }
    }

    for (let i = pageResults.length - 1; i >= 0; i--) {
      const p = pageResults[i];
      if (p.printedGrandTotal || p.grandTotal) {
        mergedGrandTotal = p.printedGrandTotal || p.grandTotal;
        notes.push(\`Grand Total captured from Page \${i + 1}.\`);
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
  async function getAISettings() {
    const s = await get('settings', 'ai');
    return s?.value || { provider: 'gemini', apiKey: '', model: 'gemini-1.5-flash', monthlyLimitRequests: 100 };
  }

  async function testGeminiConnection(apiKey, model = 'gemini-1.5-flash') {
    if (!apiKey || apiKey.trim() === '') return { success: false, message: 'API key is empty.' };
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model)}:generateContent?key=\${encodeURIComponent(apiKey.trim())}\`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with: {"status":"ok"}' }] }], generationConfig: { responseMimeType: 'application/json' } })
      });
      if (res.ok) return { success: true, message: \`Connected successfully to \${model}.\` };
      const err = await res.json().catch(() => ({}));
      return { success: false, message: \`API Error \${res.status}: \${err.error?.message || res.statusText}\` };
    } catch (err) {
      return { success: false, message: \`Network/CORS error: \${err.message}\` };
    }
  }

  async function extractBillWithGemini(images, apiKey, model = 'gemini-1.5-flash') {
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model)}:generateContent?key=\${encodeURIComponent(apiKey.trim())}\`;
    const prompt = \`Extract all bill/invoice information into clean JSON format:
{
  "vendor": { "name": string, "taxId": string },
  "billNumber": string,
  "date": "YYYY-MM-DD",
  "paymentMode": "cash"|"credit"|"bank",
  "currencyHint": "PKR"|"USD"|"INR"|"EUR"|"GBP"|"AED"|"SAR",
  "discount": number,
  "freight": number,
  "printedGrandTotal": number,
  "lines": [
    { "nameRaw": string, "nameUrdu": string, "nameEnglish": string, "qty": number, "unit": string, "unitPrice": number, "lineTotal": number, "confidence": number }
  ]
}
Copy numbers exactly as printed. Do not calculate.\`;

    const parts = [{ text: prompt }];
    for (const img of images) {
      const base64 = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || \`AI Error \${res.status}\`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from AI model.');
    const cleaned = text.replace(/^\\\`\\\`\\\`json\\s*/, '').replace(/\\s*\\\`\\\`\\\`$/, '').trim();
    return JSON.parse(cleaned);
  }

  async function extractBillFromPages(pages, currency = 'PKR') {
    const aiConfig = await getAISettings();
    const cacheKey = pages.map(p => p.sha256).sort().join('_');

    // Check cache
    const cached = await get('apiUsage', 'cache_' + cacheKey);
    if (cached && cached.extractedData) {
      const { mergedDraft, notes } = mergeMultiPageExtractions(cached.extractedData.pageResults, pages, currency);
      notes.unshift('Instant extraction from local SHA-256 cache (0 quota used).');
      return { draft: mergedDraft, fromCache: true, notes };
    }

    if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
      throw new Error('NO_API_KEY');
    }

    const pageResults = [];
    // Process pages
    for (let i = 0; i < pages.length; i += 4) {
      const chunk = pages.slice(i, i + 4);
      const res = await extractBillWithGemini(chunk, aiConfig.apiKey, aiConfig.model);
      pageResults.push(res);
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
      this.mountEl.innerHTML = \`
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
      \`;
      this.stage = this.mountEl.querySelector('#v-stage');
      this.imgEl = this.mountEl.querySelector('#v-img');
      this.zoomLbl = this.mountEl.querySelector('#v-zoom-lbl');

      this.mountEl.querySelector('#v-zoom-in').onclick = () => this.zoom(0.2);
      this.mountEl.querySelector('#v-zoom-out').onclick = () => this.zoom(-0.2);
      this.mountEl.querySelector('#v-zoom-fit').onclick = () => this.reset();

      this.stage.onmousedown = (e) => {
        this.isDragging = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.stage.style.cursor = 'grabbing';
      };
      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      });
      window.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (this.stage) this.stage.style.cursor = 'grab';
        }
      });
      this.stage.onwheel = (e) => {
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
      c.innerHTML = this.pages.map((p, i) => \`
        <button type="button" class="btn \${i === this.curPage ? 'btn-primary' : 'btn-secondary'} btn-sm" style="padding:2px 8px; font-size:11px;" data-vidx="\${i}">
          Page \${i + 1}
        </button>
      \`).join('');
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
      if (this.pages.length === 0) return;
      this.imgEl.src = this.pages[this.curPage].dataUrl;
      this.reset();
    }
    zoom(d) {
      this.scale = Math.max(0.4, Math.min(4.0, this.scale + d));
      this.updateTransform();
    }
    reset() {
      this.scale = 1.0; this.panX = 0; this.panY = 0;
      this.updateTransform();
    }
    updateTransform() {
      if (!this.imgEl) return;
      this.imgEl.style.transform = \`translate(\${this.panX}px, \${this.panY}px) scale(\${this.scale})\`;
      if (this.zoomLbl) this.zoomLbl.textContent = Math.round(this.scale * 100) + '%';
    }
  }

  // --- View: Scan Capture Interface ---
  let activeScanPages = [];

  async function renderScanView() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    activeScanPages = [];

    mainEl.innerHTML = \`
      <div style="max-width:880px; margin:0 auto;">
        <div class="card" style="margin-bottom:16px; padding:12px 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-sc-camera">📷 Camera Capture</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-sc-upload">📁 Upload Photos / PDF</button>
            </div>
            <span style="font-size:13px; font-weight:600; color:var(--muted);">Tray: <strong id="sc-tray-count" style="color:var(--text);">0 / 10</strong></span>
          </div>
        </div>

        <div id="sc-cam-box" class="card" style="padding:0; overflow:hidden; background:#111; margin-bottom:16px;">
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
            <div style="flex:1; display:flex; justify-content:center;">
              <button type="button" class="btn btn-primary" id="btn-sc-snap" style="padding:10px 24px; font-weight:bold;">📸 Snap Page</button>
            </div>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer; margin:0;">
              <span>+ Add Photo</span>
              <input type="file" id="sc-extra-inp" accept="image/*" multiple style="display:none;">
            </label>
          </div>
        </div>

        <div id="sc-up-box" class="card" style="display:none; padding:36px 24px; text-align:center; border:2px dashed var(--border); margin-bottom:16px;">
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
    \`;

    // Camera Init
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
    initCam();

    // Mode Toggle
    document.getElementById('btn-sc-camera')?.addEventListener('click', () => {
      document.getElementById('sc-cam-box').style.display = 'block';
      document.getElementById('sc-up-box').style.display = 'none';
      document.getElementById('btn-sc-camera').className = 'btn btn-primary btn-sm';
      document.getElementById('btn-sc-upload').className = 'btn btn-secondary btn-sm';
    });
    document.getElementById('btn-sc-upload')?.addEventListener('click', () => {
      document.getElementById('sc-cam-box').style.display = 'none';
      document.getElementById('sc-up-box').style.display = 'block';
      document.getElementById('btn-sc-camera').className = 'btn btn-secondary btn-sm';
      document.getElementById('btn-sc-upload').className = 'btn btn-primary btn-sm';
      if (stream) stream.getTracks().forEach(t => t.stop());
    });

    // Snap Handler
    async function processBlob(blob) {
      if (activeScanPages.length >= 10) return alert('Maximum 10 pages per bill.');
      const img = new Image();
      const url = URL.createObjectURL(blob);
      await new Promise(r => { img.onload = r; img.src = url; });
      URL.revokeObjectURL(url);

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
        sha256,
        dHash,
        quality,
        duplicate
      });
      renderTrayUI();
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
        if (!e.target.files) return;
        for (const f of e.target.files) await processBlob(f);
      });
    });

    function renderTrayUI() {
      const card = document.getElementById('sc-tray-card');
      const items = document.getElementById('sc-tray-items');
      const countEl = document.getElementById('sc-tray-count');
      const btnAi = document.getElementById('btn-sc-ai');
      const btnMan = document.getElementById('btn-sc-manual');

      if (countEl) countEl.textContent = \`\${activeScanPages.length} / 10\`;
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

        return \`
          <div style="min-width:120px; max-width:140px; border:1px solid var(--border); background:var(--card); padding:8px; border-radius:2px; flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom:4px;">
              <span>P\${idx + 1}</span>
              <button type="button" class="sc-del-p" data-i="\${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer;">✕</button>
            </div>
            <div style="height:110px; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:6px;">
              <img src="\${p.thumbnailUrl}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="p\${idx+1}">
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              \${badge}
              <div style="display:flex; justify-content:space-between;">
                <button type="button" class="btn btn-secondary btn-sm sc-mv-l" data-i="\${idx}" \${idx===0?'disabled':''} style="padding:2px 6px; font-size:10px;">◀</button>
                <button type="button" class="btn btn-secondary btn-sm sc-mv-r" data-i="\${idx}" \${idx===activeScanPages.length-1?'disabled':''} style="padding:2px 6px; font-size:10px;">▶</button>
              </div>
            </div>
          </div>
        \`;
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
      btn.textContent = '⏳ Processing with AI...';

      try {
        const { draft, fromCache, notes } = await extractBillFromPages(activeScanPages);
        toast.success(fromCache ? 'Loaded from local cache!' : 'AI Extraction complete!');
        renderSplitEditor(draft, activeScanPages);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '⚡ Scan with AI →';
        if (err.message === 'NO_API_KEY') {
          if (confirm('Gemini API key is not configured. Would you like to enter this bill manually or open Settings to add your key? Click OK for Manual Entry, Cancel to open Settings.')) {
            const manualDraft = normalizeDraftTransaction({}, 'PKR', activeScanPages);
            renderSplitEditor(manualDraft, activeScanPages);
          } else {
            window.location.hash = '#/settings';
          }
        } else {
          alert('Extraction failed: ' + err.message + '. Opening manual editor.');
          const manualDraft = normalizeDraftTransaction({}, 'PKR', activeScanPages);
          renderSplitEditor(manualDraft, activeScanPages);
        }
      }
    });

    document.getElementById('btn-sc-manual')?.addEventListener('click', () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const manualDraft = normalizeDraftTransaction({}, 'PKR', activeScanPages);
      renderSplitEditor(manualDraft, activeScanPages);
    });
  }

  // --- View: Split-Screen Bill Editor ---
  async function renderSplitEditor(draft, pages) {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    document.getElementById('breadcrumb-title').textContent = 'Review & Edit Bill';

    const parties = await getAll('parties').catch(() => []);
    const vendors = parties.filter(p => p.type === 'vendor').map(p => p.name);

    mainEl.innerHTML = \`
      <div style="display:flex; flex-direction:column; height: calc(100vh - 120px); min-height:580px;">
        <!-- Top bar -->
        <div class="card" style="margin-bottom:10px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-back">&larr; Back</button>
            <strong style="font-size:15px;">Review Bill</strong>
            <span class="pill pill-primary">\${draft.status.toUpperCase()}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ed-save-draft">💾 Save Draft</button>
            <button type="button" class="btn btn-primary btn-sm" id="ed-confirm">✓ Confirm & Post</button>
          </div>
        </div>

        <!-- Split Body -->
        <div style="display:flex; flex:1; gap:16px; min-height:0; overflow:hidden;">
          <!-- Left: Image Viewer -->
          <div style="flex:1; min-width:300px; display:flex; flex-direction:column;" id="ed-left-mount"></div>

          <!-- Right: Lines & Header -->
          <div style="flex:1.2; min-width:360px; display:flex; flex-direction:column; overflow-y:auto; padding-right:4px;">
            <!-- Header Meta -->
            <div class="card" style="margin-bottom:12px; padding:12px;">
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Vendor Name</label>
                  <input type="text" class="form-control" id="ed-vendor" value="\${escapeHTML(draft.vendorName || '')}" list="known-v-list" required>
                  <datalist id="known-v-list">\${vendors.map(v => \`<option value="\${escapeHTML(v)}"></option>\`).join('')}</datalist>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill / Invoice #</label>
                  <input type="text" class="form-control" id="ed-bill-no" value="\${escapeHTML(draft.billNumber || '')}">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Bill Date</label>
                  <input type="date" class="form-control" id="ed-date" value="\${draft.date}">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:11px;">Payment Mode</label>
                  <select class="form-control" id="ed-pay-mode">
                    <option value="cash" \${draft.paymentMode==='cash'?'selected':''}>Cash (Naqd)</option>
                    <option value="credit" \${draft.paymentMode==='credit'?'selected':''}>Credit (Udhaar)</option>
                    <option value="bank" \${draft.paymentMode==='bank'?'selected':''}>Bank / Online</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Lines Table -->
            <div class="card" style="flex:1; display:flex; flex-direction:column; padding:0; overflow:hidden; margin-bottom:12px;">
              <div style="padding:10px 14px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
                <span style="font-weight:bold; font-size:12px;">Line Items (<span id="ed-line-count">\${draft.lines.length}</span>)</span>
                <button type="button" class="btn btn-secondary btn-sm" id="ed-add-line">+ Add Line</button>
              </div>
              <div style="flex:1; overflow-y:auto; max-height:360px;">
                <table class="table" style="font-size:12px; margin:0;">
                  <thead style="position:sticky; top:0; background:var(--panel); z-index:2;">
                    <tr>
                      <th style="width:28px;">#</th>
                      <th>Item</th>
                      <th style="width:65px;">Qty</th>
                      <th style="width:60px;">Unit</th>
                      <th style="width:85px;">Rate</th>
                      <th style="width:90px;">Total</th>
                      <th style="width:30px;"></th>
                    </tr>
                  </thead>
                  <tbody id="ed-lines-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Totals Footer -->
            <div class="card" style="padding:14px; background:var(--card);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:12px;">
                  <div>
                    <label class="form-label" style="font-size:10px;">Discount</label>
                    <input type="text" class="form-control" id="ed-disc" style="width:90px;" value="\${formatMoney(draft.discountMinor, draft.currency, {showSymbol:false})}">
                  </div>
                  <div>
                    <label class="form-label" style="font-size:10px;">Freight</label>
                    <input type="text" class="form-control" id="ed-frt" style="width:90px;" value="\${formatMoney(draft.freightMinor, draft.currency, {showSymbol:false})}">
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px; color:var(--muted);">Grand Total:</div>
                  <strong style="font-size:18px; color:var(--primary);" id="ed-grand-total">\${formatMoney(draft.printedGrandTotalMinor, draft.currency)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    \`;

    const viewer = new StandaloneImageViewer(document.getElementById('ed-left-mount'));
    viewer.setPages(pages);

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

    function renderLines() {
      const tbody = document.getElementById('ed-lines-tbody');
      if (!tbody) return;
      tbody.innerHTML = draft.lines.map((l, idx) => \`
        <tr data-lidx="\${idx}" style="cursor:pointer;">
          <td style="color:var(--muted); font-size:10px; text-align:center;">\${idx+1}</td>
          <td>
            <input type="text" class="form-control form-control-sm ed-cell-name" value="\${escapeHTML(l.nameRaw)}" style="\${l.confidence < 80 ? 'border-color:var(--secondary);' : ''}">
          </td>
          <td>
            <input type="number" class="form-control form-control-sm ed-cell-qty" value="\${l.qtyBilled}" step="any" min="0.01" style="text-align:right;">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm ed-cell-unit" value="\${escapeHTML(l.unit||'pcs')}">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm ed-cell-rate" value="\${formatMoney(l.unitPriceMinor, draft.currency, {showSymbol:false})}" style="text-align:right;">
          </td>
          <td style="text-align:right; font-weight:bold;">
            <span class="ed-cell-tot">\${formatMoney(l.printedLineTotalMinor, draft.currency)}</span>
          </td>
          <td style="text-align:center;">
            <button type="button" class="ed-del-line" data-i="\${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer;">✕</button>
          </td>
        </tr>
      \`).join('');

      document.getElementById('ed-line-count').textContent = draft.lines.length;

      tbody.querySelectorAll('tr').forEach(r => {
        r.onclick = (e) => {
          if (['INPUT','BUTTON'].includes(e.target.tagName)) return;
          const i = parseInt(r.getAttribute('data-lidx'), 10);
          if (draft.lines[i]?.pageIndex) viewer.goToPage(draft.lines[i].pageIndex - 1);
        };
      });

      tbody.querySelectorAll('.ed-cell-name').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          draft.lines[i].nameRaw = e.target.value.trim();
        };
      });
      tbody.querySelectorAll('.ed-cell-qty').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          const q = parseFloat(e.target.value) || 1;
          draft.lines[i].qtyBilled = q;
          const qM = Math.round(q * 1000);
          draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor);
          e.target.closest('tr').querySelector('.ed-cell-tot').textContent = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency);
          calcTotals();
        };
      });
      tbody.querySelectorAll('.ed-cell-rate').forEach(inp => {
        inp.onchange = (e) => {
          const i = parseInt(e.target.closest('tr').getAttribute('data-lidx'), 10);
          draft.lines[i].unitPriceMinor = parseMoney(e.target.value, draft.currency);
          const qM = Math.round((draft.lines[i].qtyBilled || 1) * 1000);
          draft.lines[i].printedLineTotalMinor = lineTotal(qM, draft.lines[i].unitPriceMinor);
          e.target.closest('tr').querySelector('.ed-cell-tot').textContent = formatMoney(draft.lines[i].printedLineTotalMinor, draft.currency);
          calcTotals();
        };
      });
      tbody.querySelectorAll('.ed-del-line').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          draft.lines.splice(i, 1);
          renderLines();
          calcTotals();
        };
      });
    }

    renderLines();
    calcTotals();

    document.getElementById('ed-add-line').onclick = () => {
      draft.lines.push({
        id: 'l_' + Math.random().toString(36).slice(2, 8),
        nameRaw: 'New Item',
        qtyBilled: 1,
        unit: 'pcs',
        unitPriceMinor: 0,
        printedLineTotalMinor: 0,
        taxable: true,
        confidence: 100,
        pageIndex: viewer.curPage + 1
      });
      renderLines();
    };

    document.getElementById('ed-disc').oninput = (e) => {
      draft.discountMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
    };
    document.getElementById('ed-frt').oninput = (e) => {
      draft.freightMinor = parseMoney(e.target.value, draft.currency);
      calcTotals();
    };

    document.getElementById('ed-back').onclick = () => {
      if (confirm('Discard changes and return to scan?')) renderScanView();
    };

    async function commit(status) {
      const vName = document.getElementById('ed-vendor')?.value.trim();
      if (!vName) return alert('Please enter a vendor name.');
      draft.vendorName = vName;
      draft.billNumber = document.getElementById('ed-bill-no')?.value.trim();
      draft.date = document.getElementById('ed-date')?.value || new Date().toISOString().split('T')[0];
      draft.paymentMode = document.getElementById('ed-pay-mode')?.value || 'cash';
      draft.status = status;

      const user = getCurrentUser() || { id: 'admin', name: 'Admin', role: 'admin' };
      const txId = draft.id || ('tx_' + Math.random().toString(36).slice(2, 9));

      await tx(['transactions', 'transactionLines', 'documents'], 'readwrite', (stores) => {
        stores.transactions.put({
          id: txId,
          type: 'purchase',
          status,
          currency: draft.currency,
          vendorName: draft.vendorName,
          billNumber: draft.billNumber,
          date: draft.date,
          paymentMode: draft.paymentMode,
          subtotalMinor: draft.subtotalMinor,
          discountMinor: draft.discountMinor,
          freightMinor: draft.freightMinor,
          grandTotalMinor: draft.printedGrandTotalMinor,
          lineCount: draft.lines.length,
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
            vendorName: draft.vendorName,
            billNumber: draft.billNumber,
            date: draft.date,
            createdBy: user.id
          });
        }
      });

      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: status === 'confirmed' ? 'BILL_CONFIRMED' : 'BILL_DRAFT_SAVED',
        summary: \`\${status === 'confirmed' ? 'Confirmed' : 'Draft'} bill from "\${draft.vendorName}" (\${formatMoney(draft.printedGrandTotalMinor, draft.currency)})\`,
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

    const txs = await scopedQuery('transactions').catch(() => []);
    const docs = await scopedQuery('documents').catch(() => []);
    const docMap = new Map();
    for (const d of docs) if (!docMap.has(d.transactionId)) docMap.set(d.transactionId, d);

    mainEl.innerHTML = \`
      <div style="max-width:1000px; margin:0 auto;">
        <div class="card" style="margin-bottom:16px; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <h1 style="font-size:20px; margin:0 0 4px 0;">Receipt Vault</h1>
              <p style="color:var(--muted); font-size:13px; margin:0;">Saved bills and documents in IndexedDB.</p>
            </div>
            <a href="#/scan" class="btn btn-primary btn-sm">+ Scan New Bill</a>
          </div>
          <div style="display:flex; gap:12px; margin-top:14px; flex-wrap:wrap;">
            <input type="text" class="form-control form-control-sm" id="vlt-v" placeholder="Filter by Vendor..." style="width:200px;">
            <select class="form-control form-control-sm" id="vlt-s" style="width:140px;">
              <option value="all">All Statuses</option>
              <option value="draft">Drafts Only</option>
              <option value="confirmed">Confirmed Only</option>
            </select>
          </div>
        </div>
        <div id="vlt-grid" class="grid-3" style="gap:16px;"></div>
      </div>
    \`;

    function update() {
      const vf = document.getElementById('vlt-v')?.value.toLowerCase().trim() || '';
      const sf = document.getElementById('vlt-s')?.value || 'all';
      const filtered = txs.filter(t => {
        if (vf && !t.vendorName?.toLowerCase().includes(vf)) return false;
        if (sf !== 'all' && t.status !== sf) return false;
        return true;
      });
      const grid = document.getElementById('vlt-grid');
      if (!grid) return;
      if (filtered.length === 0) {
        grid.innerHTML = \`
          <div class="card" style="grid-column:1/-1; text-align:center; padding:48px 24px;">
            <div style="font-size:36px; margin-bottom:8px;">📁</div>
            <h3>No Bills Found</h3>
            <p style="color:var(--muted); font-size:13px;">No bills matched your filter.</p>
            <div style="margin-top:14px;"><a href="#/scan" class="btn btn-primary btn-sm">Scan Bill</a></div>
          </div>
        \`;
        return;
      }
      grid.innerHTML = filtered.map(t => {
        const d = docMap.get(t.id);
        const th = d?.thumbnailUrl || '';
        return \`
          <div class="card vlt-card" data-txid="\${t.id}" style="cursor:pointer; padding:0; overflow:hidden; display:flex; flex-direction:column;">
            <div style="height:140px; background:#111; overflow:hidden; display:flex; align-items:center; justify-content:center;">
              \${th ? \`<img src="\${th}" style="width:100%; height:100%; object-fit:cover;" alt="Receipt">\` : '<span style="font-size:28px;">📄</span>'}
            </div>
            <div style="padding:12px; flex:1; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                  <strong style="font-size:14px;">\${escapeHTML(t.vendorName)}</strong>
                  <span class="pill \${t.status==='confirmed'?'pill-success':'pill-neutral'}" style="font-size:10px; padding:2px 6px;">\${t.status.toUpperCase()}</span>
                </div>
                <div style="font-size:11px; color:var(--muted); margin-bottom:6px;">\${t.date} \${t.billNumber ? \`&bull; #\${escapeHTML(t.billNumber)}\` : ''}</div>
              </div>
              <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:8px;">
                <span style="font-size:11px; color:var(--muted);">\${t.lineCount||0} items</span>
                <strong style="font-size:15px; color:var(--primary);">\${formatMoney(t.grandTotalMinor, t.currency)}</strong>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    document.getElementById('vlt-v')?.addEventListener('input', update);
    document.getElementById('vlt-s')?.addEventListener('change', update);
    update();
  }
`;

// Insert phase2Block right before "  // =========================================================================\n  // 14. ROUTER & SHELL INTEGRATION"
const routerAnchor = "  // =========================================================================\n  // 14. ROUTER & SHELL INTEGRATION";
if (code.includes(routerAnchor)) {
  code = code.replace(routerAnchor, phase2Block + '\n' + routerAnchor);
} else {
  console.error('Could not find router anchor');
}

// 3. Add Settings tabs for AI and Scan Quality in renderSettingsView
code = code.replace(
  "{ id: 'about', label: 'About' },",
  "{ id: 'ai', label: 'AI Provider' },\n        { id: 'scan_quality', label: 'Scan Quality Gate' },\n        { id: 'about', label: 'About' },"
);

// Add Tab content rendering for 'ai' and 'scan_quality'
const aiSettingsBlock = `
    } else if (activeSettingsTab === 'ai') {
      const ai = (await get('settings', 'ai'))?.value || { provider: 'gemini', apiKey: '', model: 'gemini-1.5-flash', monthlyLimitRequests: 100 };
      pane.innerHTML = \`
        <div class="card" style="max-width:680px; margin-bottom:20px;">
          <div class="card-header"><h3 class="card-title">Google Gemini Vision API Setup</h3><span class="pill pill-primary">BYOK (Bring Your Own Key)</span></div>
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
            Configure your free Gemini API key to enable instant structured bill scanning.
          </p>
          <div class="form-group">
            <label class="form-label">Active Provider</label>
            <select class="form-control" id="cfg-ai-prov">
              <option value="gemini" selected>Google Gemini (Vision)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Gemini API Key</label>
            <input type="password" class="form-control" id="cfg-ai-key" value="\${escapeHTML(ai.apiKey || '')}" placeholder="AIzaSy...">
          </div>
          <div class="form-group">
            <label class="form-label">Model Name</label>
            <input type="text" class="form-control" id="cfg-ai-model" value="\${escapeHTML(ai.model || 'gemini-1.5-flash')}">
            <span style="font-size:11px; color:var(--muted);">Default: gemini-1.5-flash (fast, economical). Refer to Google AI documentation for current model identifiers.</span>
          </div>
          <div class="form-group">
            <label class="form-label">Monthly Request Quota Limit</label>
            <input type="number" class="form-control" id="cfg-ai-limit" value="\${ai.monthlyLimitRequests || 100}" style="width:140px;">
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:20px; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-test-ai">Test Connection & CORS</button>
            <button type="button" class="btn btn-primary" id="btn-save-ai">Save AI Settings</button>
          </div>
          <div id="ai-test-result" style="margin-top:12px; font-size:13px; display:none;"></div>
        </div>
      \`;

      document.getElementById('btn-save-ai')?.addEventListener('click', async () => {
        const apiKey = document.getElementById('cfg-ai-key')?.value.trim();
        const model = document.getElementById('cfg-ai-model')?.value.trim() || 'gemini-1.5-flash';
        const limit = parseInt(document.getElementById('cfg-ai-limit')?.value, 10) || 100;
        await put('settings', { key: 'ai', value: { provider: 'gemini', apiKey, model, monthlyLimitRequests: limit } });
        toast.success('AI settings saved.');
      });

      document.getElementById('btn-test-ai')?.addEventListener('click', async () => {
        const key = document.getElementById('cfg-ai-key')?.value.trim();
        const model = document.getElementById('cfg-ai-model')?.value.trim() || 'gemini-1.5-flash';
        const resEl = document.getElementById('ai-test-result');
        resEl.style.display = 'block';
        resEl.innerHTML = '<span class="pill pill-neutral">Testing...</span>';
        const res = await testGeminiConnection(key, model);
        resEl.innerHTML = \`<span class="pill \${res.success ? 'pill-success' : 'pill-error'}">\${res.message}</span>\`;
      });

    } else if (activeSettingsTab === 'scan_quality') {
      pane.innerHTML = \`
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
      \`;
      document.getElementById('btn-reset-q')?.addEventListener('click', () => {
        document.getElementById('cfg-q-blur').value = '80';
        document.getElementById('cfg-q-res').value = '600';
        document.getElementById('cfg-q-dist').value = '10';
        toast.info('Reset to default thresholds.');
      });
      document.getElementById('btn-save-q')?.addEventListener('click', async () => {
        toast.success('Scan Quality settings saved.');
      });
`;

code = code.replace(
  "} else if (activeSettingsTab === 'about') {",
  aiSettingsBlock + "\n    } else if (activeSettingsTab === 'about') {"
);

// 4. Update handleRouting() for #/scan and #/vault
code = code.replace(
  "} else if (hash === '#/system-check') {\n      document.getElementById('breadcrumb-title').textContent = t('nav_system_check');\n      await renderSystemCheckView();",
  "} else if (hash === '#/system-check') {\n      document.getElementById('breadcrumb-title').textContent = t('nav_system_check');\n      await renderSystemCheckView();\n    } else if (hash === '#/scan') {\n      document.getElementById('breadcrumb-title').textContent = t('mod_scan');\n      await renderScanView();\n    } else if (hash === '#/vault') {\n      document.getElementById('breadcrumb-title').textContent = t('mod_vault');\n      await renderVaultView();"
);

// 5. Update bottom nav highlight for scan
code = code.replace(
  "document.getElementById('bottom-nav-settings')?.classList.toggle('active', currentHash === '#/settings');",
  "document.getElementById('bottom-nav-settings')?.classList.toggle('active', currentHash === '#/settings');\n    document.getElementById('bottom-nav-scan')?.classList.toggle('active', currentHash === '#/scan');"
);

// 6. Update diagnostics links in renderSystemCheckView
code = code.replace(
  '<a href="./tests/auth-shifts.test.html" target="_blank" class="btn btn-secondary btn-sm">🔐 Auth & Shifts Tests</a>',
  '<a href="./tests/auth-shifts.test.html" target="_blank" class="btn btn-secondary btn-sm">🔐 Auth & Shifts Tests</a>\n            <a href="./tests/scan-pipeline.test.html" target="_blank" class="btn btn-primary btn-sm">📸 Scan Pipeline Tests (13)</a>'
);

fs.writeFileSync(standalonePath, code, 'utf8');
console.log('Successfully updated app.standalone.js with Phase 2 capabilities!');
