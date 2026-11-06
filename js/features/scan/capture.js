/**
 * @file capture.js
 * @description Camera & upload capture interface with 1-10 page multi-page tray,
 * real-time quality check, and seamless fallback between live camera and file picker.
 */

import { downscaleImage, createThumbnail } from './image-prep.js';
import { evaluateQuality } from './quality-gate.js';
import { computeSHA256, computeDHash9x8, findDuplicateMatch } from './duplicate-detector.js';
import { getAll } from '../../core/db.js';
import { escapeHTML, extractJpegImagesFromPdf, uint8ArrayToDataUrl } from '../../core/utils.js';

export class ScanCaptureSession {
  /**
   * @param {HTMLElement} container 
   * @param {Object} options { onScanProceed: Function, onManualEntry: Function, maxPages: number }
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      maxPages: 10,
      onScanProceed: null,
      onManualEntry: null,
      ...options
    };

    this.pages = []; // Array of { id, dataUrl, thumbnail, blob, sha256, dHash, quality, duplicate }
    this.videoStream = null;
    this.activeMode = 'camera'; // 'camera' | 'upload'
    this.hasTorch = false;
    this.isTorchOn = false;

    this.initDOM();
    this.startCamera();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="capture-session-root" style="max-width: 900px; margin: 0 auto;">
        <!-- Top Mode Selector & Counter -->
        <div class="card" style="margin-bottom: 16px; padding: 12px 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-mode-camera">📷 Live Camera</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-mode-upload">📁 Upload Photos / PDF</button>
            </div>
            <div style="font-size:13px; font-weight:600; color:var(--muted);">
              Pages: <span id="capture-page-count" style="color:var(--text); font-weight:bold;">0 / ${this.options.maxPages}</span>
            </div>
          </div>
        </div>

        <!-- Camera View Area -->
        <div id="camera-panel" class="card" style="padding:0; overflow:hidden; position:relative; background:#111; margin-bottom:16px;">
          <div style="position:relative; width:100%; min-height:360px; max-height:480px; display:flex; align-items:center; justify-content:center;">
            <video id="camera-video" playsinline autoplay muted style="width:100%; height:100%; object-fit:contain;"></video>
            
            <!-- Target Framing Overlay -->
            <div style="position:absolute; inset: 24px; border: 2px dashed rgba(255,255,255,0.4); pointer-events:none; border-radius:4px; display:flex; align-items:flex-end; justify-content:center; padding-bottom:12px;">
              <span style="background:rgba(0,0,0,0.6); color:white; font-size:12px; padding:4px 10px; border-radius:2px;">Align bill inside frame</span>
            </div>

            <!-- Fallback Input if Camera is restricted -->
            <div id="camera-fallback-msg" style="display:none; position:absolute; inset:0; background:var(--canvas); padding:24px; text-align:center; flex-direction:column; align-items:center; justify-content:center;">
              <div style="font-size:32px; margin-bottom:12px;">📷</div>
              <h3 style="margin-bottom:8px;">Camera Direct Access Unavailable</h3>
              <p style="color:var(--muted); font-size:13px; max-width:400px; margin-bottom:16px;">
                Browser security requires HTTPS or localhost for live camera. Use the photo capture button below to take a picture:
              </p>
              <label class="btn btn-primary" style="cursor:pointer;">
                <span>Take Photo / Choose Image</span>
                <input type="file" id="camera-fallback-file" accept="image/*" capture="environment" style="display:none;">
              </label>
            </div>
          </div>

          <!-- Camera Controls Bar -->
          <div style="padding:12px 16px; background:var(--card); display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-torch" style="display:none;">🔦 Torch</button>
            <div style="flex:1; display:flex; justify-content:center;">
              <button type="button" class="btn btn-primary" id="btn-shutter" style="padding: 10px 24px; font-weight:bold; font-size:15px;">
                📸 Snap Page
              </button>
            </div>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer; margin:0;">
              <span>+ Add Photo</span>
              <input type="file" id="camera-extra-file" accept="image/*" multiple style="display:none;">
            </label>
          </div>
        </div>

        <!-- File Upload Area (Alternative Mode) -->
        <div id="upload-panel" class="card" style="display:none; padding:32px 24px; text-align:center; border:2px dashed var(--border); margin-bottom:16px;">
          <div style="font-size:36px; margin-bottom:12px;">📄</div>
          <h3 style="margin-bottom:8px;">Drag & Drop Bill Photos or PDF</h3>
          <p style="color:var(--muted); font-size:13px; margin-bottom:20px;">Supports JPG, PNG, WEBP, and multi-page receipts (up to ${this.options.maxPages} pages)</p>
          <label class="btn btn-primary" style="cursor:pointer;">
            <span>Browse Files</span>
            <input type="file" id="upload-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style="display:none;">
          </label>
        </div>

        <!-- Multi-Page Thumbnail Tray -->
        <div class="card" id="tray-card" style="margin-bottom: 24px; display:none;">
          <div class="card-header" style="margin-bottom: 12px;">
            <h4 class="card-title" style="font-size:14px;">Multi-Page Bill Tray</h4>
            <span class="pill pill-neutral" id="tray-summary-pill">0 Pages</span>
          </div>

          <div id="tray-thumbnails-container" style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px;"></div>
        </div>

        <!-- Action Buttons -->
        <div class="card" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-scan">Cancel</button>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-secondary" id="btn-manual-entry" style="display:none;">
              ✏️ Manual Entry
            </button>
            <button type="button" class="btn btn-primary" id="btn-proceed-ai" style="display:none;">
              ⚡ Scan with AI &rarr;
            </button>
          </div>
        </div>
      </div>
    `;

    this.wireListeners();
  }

  wireListeners() {
    const root = this.container;

    // Mode Toggle
    root.querySelector('#btn-mode-camera').addEventListener('click', () => this.switchMode('camera'));
    root.querySelector('#btn-mode-upload').addEventListener('click', () => this.switchMode('upload'));

    // Shutter button
    root.querySelector('#btn-shutter').addEventListener('click', () => this.captureCameraFrame());

    // Torch button
    root.querySelector('#btn-torch').addEventListener('click', () => this.toggleTorch());

    // Fallback file input
    root.querySelector('#camera-fallback-file').addEventListener('change', (e) => {
      this.handleFilesSelected(e.target.files);
      e.target.value = '';
    });
    root.querySelector('#camera-extra-file').addEventListener('change', (e) => {
      this.handleFilesSelected(e.target.files);
      e.target.value = '';
    });
    root.querySelector('#upload-file-input').addEventListener('change', (e) => {
      this.handleFilesSelected(e.target.files);
      e.target.value = '';
    });

    // Drag and Drop
    const uploadPanel = root.querySelector('#upload-panel');
    uploadPanel.addEventListener('dragover', (e) => { e.preventDefault(); uploadPanel.style.borderColor = 'var(--primary)'; });
    uploadPanel.addEventListener('dragleave', () => { uploadPanel.style.borderColor = 'var(--border)'; });
    uploadPanel.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadPanel.style.borderColor = 'var(--border)';
      if (e.dataTransfer.files) this.handleFilesSelected(e.dataTransfer.files);
    });

    // Actions
    root.querySelector('#btn-cancel-scan').addEventListener('click', () => this.cancelSession());
    root.querySelector('#btn-manual-entry').addEventListener('click', () => {
      if (typeof this.options.onManualEntry === 'function') {
        this.options.onManualEntry(this.pages);
      }
    });
    root.querySelector('#btn-proceed-ai').addEventListener('click', () => {
      if (typeof this.options.onScanProceed === 'function') {
        this.options.onScanProceed(this.pages);
      }
    });
  }

  switchMode(mode) {
    this.activeMode = mode;
    const root = this.container;
    const camPanel = root.querySelector('#camera-panel');
    const upPanel = root.querySelector('#upload-panel');
    const camBtn = root.querySelector('#btn-mode-camera');
    const upBtn = root.querySelector('#btn-mode-upload');

    if (mode === 'camera') {
      camPanel.style.display = 'block';
      upPanel.style.display = 'none';
      camBtn.className = 'btn btn-primary btn-sm';
      upBtn.className = 'btn btn-secondary btn-sm';
      this.startCamera();
    } else {
      camPanel.style.display = 'none';
      upPanel.style.display = 'block';
      camBtn.className = 'btn btn-secondary btn-sm';
      upBtn.className = 'btn btn-primary btn-sm';
      this.stopCamera();
    }
  }

  async startCamera() {
    const video = this.container.querySelector('#camera-video');
    const fallback = this.container.querySelector('#camera-fallback-msg');
    const torchBtn = this.container.querySelector('#btn-torch');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (fallback) fallback.style.display = 'flex';
      return;
    }

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      if (video) {
        video.srcObject = this.videoStream;
        if (fallback) fallback.style.display = 'none';
      }

      // Check torch capabilities
      const track = this.videoStream.getVideoTracks()[0];
      const caps = track?.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) {
        this.hasTorch = true;
        if (torchBtn) torchBtn.style.display = 'inline-block';
      }
    } catch (err) {
      console.warn('getUserMedia camera access prevented or unavailable:', err);
      if (fallback) fallback.style.display = 'flex';
    }
  }

  stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(t => t.stop());
      this.videoStream = null;
    }
  }

  async toggleTorch() {
    if (!this.hasTorch || !this.videoStream) return;
    const track = this.videoStream.getVideoTracks()[0];
    this.isTorchOn = !this.isTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: this.isTorchOn }] });
      const torchBtn = this.container.querySelector('#btn-torch');
      if (torchBtn) {
        torchBtn.className = this.isTorchOn ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      }
    } catch (e) {
      console.warn('Torch constraint failed:', e);
    }
  }

  async captureCameraFrame() {
    if (this.pages.length >= this.options.maxPages) {
      alert(`Maximum limit of ${this.options.maxPages} pages reached for one bill.`);
      return;
    }

    const video = this.container.querySelector('#camera-video');
    if (!video || !video.videoWidth) {
      alert('Camera feed is not ready. Please use the Add Photo option.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    await this.addPageFromBlob(blob);
  }

  async handleFilesSelected(fileList) {
    if (!fileList || fileList.length === 0) return;
    for (let i = 0; i < fileList.length; i++) {
      if (this.pages.length >= this.options.maxPages) break;
      const file = fileList[i];
      await this.addPageFromBlob(file);
    }
  }

  async addPageFromBlob(blob) {
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
          for (let idx = 0; idx < extractedJpegs.length; idx++) {
            if (this.pages.length >= this.options.maxPages) break;
            const imgBytes = extractedJpegs[idx];
            const imgDataUrl = uint8ArrayToDataUrl(imgBytes, 'image/jpeg');

            const img = new Image();
            await new Promise((res) => {
              img.onload = res;
              img.onerror = () => res();
              setTimeout(res, 3000);
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

            const duplicateMatch = findDuplicateMatch({ sha256, dHash, pageIndex: this.pages.length + 1 }, existingDocs);

            this.pages.push({
              id: 'page_' + Math.random().toString(36).slice(2, 9),
              pageIndex: this.pages.length + 1,
              blob: blob,
              dataUrl: finalDataUrl,
              rawPdfDataUrl: dataUrl,
              thumbnailUrl: thumbUrl,
              base64: finalDataUrl,
              mimeType: 'image/jpeg',
              fileName: extractedJpegs.length > 1 ? `${fileName} (P${idx + 1})` : fileName,
              sha256,
              dHash,
              quality,
              duplicateMatch
            });
          }
          this.renderTray();
          return;
        }

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

        const duplicateMatch = findDuplicateMatch({ sha256, dHash: null, pageIndex: this.pages.length + 1 }, existingDocs);

        const pageItem = {
          id: 'page_' + Math.random().toString(36).slice(2, 9),
          pageIndex: this.pages.length + 1,
          blob: blob,
          dataUrl: dataUrl,
          thumbnailUrl: thumbnailUrl,
          base64: dataUrl,
          mimeType: 'application/pdf',
          fileName: fileName,
          sha256,
          dHash: 'pdf_' + sha256.slice(0, 12),
          quality: { pass: true, canScanAnyway: true, issues: [], metrics: { isPdf: true } },
          duplicateMatch
        };

        this.pages.push(pageItem);
        this.renderTray();
        return;
      }

      // 1. Downscale to max 2000px
      const img = new Image();
      const url = URL.createObjectURL(blob);
      try {
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error('Cannot decode image. Please select JPG, PNG, or WEBP photo.'));
          setTimeout(() => rej(new Error('Image decode timed out.')), 10000);
          img.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }

      const downscaled = await downscaleImage(img, 2000, 0.85);
      const thumb = await createThumbnail(downscaled.canvas, 240);

      // 2. Pre-scan Quality Check (100% local, free)
      const quality = evaluateQuality(downscaled.canvas);

      // 3. Pre-scan Duplicate Check (Layer 1 SHA-256 + Layer 2 dHash 9x8)
      const arrayBuf = await downscaled.blob.arrayBuffer();
      const sha256 = await computeSHA256(arrayBuf);
      const dHash = computeDHash9x8(thumb.canvas);

      const existingDocs = await getAll('documents').catch(() => []);
      const duplicateMatch = findDuplicateMatch({ sha256, dHash, pageIndex: this.pages.length + 1 }, existingDocs);

      const pageItem = {
        id: 'page_' + Math.random().toString(36).slice(2, 9),
        pageIndex: this.pages.length + 1,
        blob: downscaled.blob,
        dataUrl: downscaled.dataUrl,
        thumbnailUrl: thumb.dataUrl,
        base64: downscaled.dataUrl,
        sha256,
        dHash,
        quality,
        duplicateMatch
      };

      this.pages.push(pageItem);
      this.renderTray();
    } catch (err) {
      console.error('Error adding page:', err);
      alert('Failed to process image: ' + err.message);
    }
  }

  renderTray() {
    const root = this.container;
    const trayCard = root.querySelector('#tray-card');
    const trayContainer = root.querySelector('#tray-thumbnails-container');
    const counter = root.querySelector('#capture-page-count');
    const summaryPill = root.querySelector('#tray-summary-pill');
    const proceedBtn = root.querySelector('#btn-proceed-ai');
    const manualBtn = root.querySelector('#btn-manual-entry');

    if (counter) counter.textContent = `${this.pages.length} / ${this.options.maxPages}`;
    if (summaryPill) summaryPill.textContent = `${this.pages.length} Page${this.pages.length === 1 ? '' : 's'}`;

    if (this.pages.length === 0) {
      if (trayCard) trayCard.style.display = 'none';
      if (proceedBtn) proceedBtn.style.display = 'none';
      if (manualBtn) manualBtn.style.display = 'none';
      return;
    }

    if (trayCard) trayCard.style.display = 'block';
    if (proceedBtn) proceedBtn.style.display = 'inline-flex';
    if (manualBtn) manualBtn.style.display = 'inline-flex';

    trayContainer.innerHTML = this.pages.map((p, idx) => {
      p.pageIndex = idx + 1;
      let badgeHtml = '<span class="pill pill-success" style="font-size:10px; padding:2px 6px;">Ready</span>';
      if (p.duplicateMatch) {
        badgeHtml = `<span class="pill pill-error" style="font-size:10px; padding:2px 6px;">Duplicate (${p.duplicateMatch.layer === 1 ? 'L1' : 'L2'})</span>`;
      } else if (!p.quality.pass) {
        const warnType = p.quality.issues[0]?.type || 'warning';
        badgeHtml = `<span class="pill pill-error" style="font-size:10px; padding:2px 6px;">⚠️ ${warnType}</span>`;
      }

      return `
        <div class="tray-thumb-card" style="min-width: 120px; max-width: 140px; border: 1px solid var(--border); background: var(--card); padding: 8px; border-radius: 2px; position:relative; flex-shrink:0;">
          <div style="font-size:11px; font-weight:600; margin-bottom:4px; display:flex; justify-content:space-between;">
            <span>Page ${idx + 1}</span>
            <button type="button" class="btn-delete-page" data-idx="${idx}" style="background:none; border:none; color:var(--error-text); cursor:pointer; font-weight:bold; padding:0 4px;" title="Delete">✕</button>
          </div>
          <div style="width:100%; height:120px; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:6px;">
            <img src="${p.thumbnailUrl}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="Thumb P${idx+1}">
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${badgeHtml}
            <div style="display:flex; justify-content:space-between; margin-top:2px;">
              <button type="button" class="btn btn-secondary btn-sm btn-move-left" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} style="padding:2px 6px; font-size:10px;">◀</button>
              <button type="button" class="btn btn-secondary btn-sm btn-move-right" data-idx="${idx}" ${idx === this.pages.length - 1 ? 'disabled' : ''} style="padding:2px 6px; font-size:10px;">▶</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach tray actions
    trayContainer.querySelectorAll('.btn-delete-page').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        this.pages.splice(idx, 1);
        this.renderTray();
      });
    });

    trayContainer.querySelectorAll('.btn-move-left').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        if (idx > 0) {
          const temp = this.pages[idx - 1];
          this.pages[idx - 1] = this.pages[idx];
          this.pages[idx] = temp;
          this.renderTray();
        }
      });
    });

    trayContainer.querySelectorAll('.btn-move-right').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        if (idx < this.pages.length - 1) {
          const temp = this.pages[idx + 1];
          this.pages[idx + 1] = this.pages[idx];
          this.pages[idx] = temp;
          this.renderTray();
        }
      });
    });
  }

  cancelSession() {
    this.stopCamera();
    this.pages = [];
    if (window.location.hash !== '#/') {
      window.location.hash = '#/';
    }
  }
}
