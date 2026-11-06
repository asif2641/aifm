/**
 * @file image-viewer.js
 * @description High-performance pan, zoom, and rotate image viewer for split-screen bill inspection.
 * Works seamlessly with mouse wheel, drag-to-pan, touch pinch-zoom, and multi-page switching.
 */

import { extractImageFromPdfDataUrl } from '../core/utils.js';

export class ImageViewer {
  /**
   * @param {HTMLElement} container 
   * @param {Object} options 
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      minZoom: 0.5,
      maxZoom: 5.0,
      zoomStep: 0.2,
      onPageChange: null,
      ...options
    };

    this.pages = []; // Array of { id, dataUrl, pageIndex }
    this.currentPageIndex = 0;
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0; // 0, 90, 180, 270

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="image-viewer-root" style="display:flex; flex-direction:column; height:100%; position:relative; background: #242624; border: 1px solid var(--border); overflow:hidden; user-select:none;">
        <!-- Top Toolbar -->
        <div class="viewer-toolbar" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background: rgba(0,0,0,0.6); color:white; font-size:12px; z-index:10;">
          <!-- Page Tabs -->
          <div class="viewer-page-tabs" id="viewer-page-tabs" style="display:flex; gap:4px; overflow-x:auto;"></div>
          <!-- Controls -->
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-out" style="padding:2px 8px; font-weight:bold;" title="Zoom Out">−</button>
            <span id="viewer-zoom-level" style="min-width:44px; text-align:center; font-family:monospace;">100%</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-in" style="padding:2px 8px; font-weight:bold;" title="Zoom In">+</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-zoom-reset" style="padding:2px 8px;" title="Fit / Reset">Fit</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-rotate" style="padding:2px 8px;" title="Rotate 90°">↻</button>
          </div>
        </div>

        <!-- Canvas Area -->
        <div class="viewer-stage" id="viewer-stage" style="flex:1; width:100%; height:100%; position:relative; overflow:hidden; cursor:grab; display:flex; align-items:center; justify-content:center;">
          <img id="viewer-img" src="" alt="Bill Scan" style="max-width:none; position:absolute; transform-origin:center center; transition: transform 0.05s ease-out; pointer-events:none;" />
        </div>
      </div>
    `;

    this.stage = this.container.querySelector('#viewer-stage');
    this.imgEl = this.container.querySelector('#viewer-img');
    this.tabsContainer = this.container.querySelector('#viewer-page-tabs');
    this.zoomLabel = this.container.querySelector('#viewer-zoom-level');

    // Controls listeners
    this.container.querySelector('#btn-zoom-in').addEventListener('click', () => this.zoom(this.options.zoomStep));
    this.container.querySelector('#btn-zoom-out').addEventListener('click', () => this.zoom(-this.options.zoomStep));
    this.container.querySelector('#btn-zoom-reset').addEventListener('click', () => this.resetTransform());
    this.container.querySelector('#btn-rotate').addEventListener('click', () => this.rotate());

    // Mouse Drag Pan
    this.stage.addEventListener('mousedown', (e) => {
      if (!this.imgEl) return;
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      this.stage.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.imgEl) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.stage && this.imgEl) this.stage.style.cursor = 'grab';
      }
    });

    // Mouse Wheel Zoom
    this.stage.addEventListener('wheel', (e) => {
      if (!this.imgEl) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? this.options.zoomStep : -this.options.zoomStep;
      this.zoom(delta);
    }, { passive: false });

    // Touch support for mobile pinch-zoom
    let lastTouchDist = 0;
    this.stage.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
          const diff = (dist - lastTouchDist) * 0.005;
          this.zoom(diff);
        }
        lastTouchDist = dist;
      }
    }, { passive: false });

    this.stage.addEventListener('touchend', () => { lastTouchDist = 0; });
  }

  setPages(pages = []) {
    this.pages = pages;
    this.currentPageIndex = 0;
    this.renderTabs();
    this.loadCurrentPage();
  }

  goToPage(pageNumber) {
    const idx = Math.max(0, Math.min(this.pages.length - 1, pageNumber - 1));
    if (idx !== this.currentPageIndex) {
      this.currentPageIndex = idx;
      this.renderTabs();
      this.loadCurrentPage();
      if (typeof this.options.onPageChange === 'function') {
        this.options.onPageChange(pageNumber);
      }
    }
  }

  loadCurrentPage() {
    if (!this.pages || this.pages.length === 0) {
      if (this.imgEl) this.imgEl.style.display = 'none';
      return;
    }
    const cur = this.pages[this.currentPageIndex];
    let dataUrl = cur.dataUrl || cur.url || cur.base64 || '';
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

    // Attempt on-the-fly photo extraction from scanned PDF
    if (isPdf && typeof dataUrl === 'string' && dataUrl.startsWith('data:application/pdf')) {
      const extracted = extractImageFromPdfDataUrl(dataUrl);
      if (extracted) {
        cur.rawPdfDataUrl = cur.rawPdfDataUrl || dataUrl;
        cur.dataUrl = extracted;
        dataUrl = extracted;
        cur.mimeType = 'image/jpeg';
        isPdf = false;
      }
    }

    const controls = this.container.querySelector('.image-viewer-controls');

    if (isPdf) {
      if (controls) controls.style.display = 'none';
      this.stage.style.cursor = 'default';
      const pdfUrl = dataUrl.includes('#') ? dataUrl : (dataUrl + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
      this.stage.innerHTML = `
        <div style="width:100%; height:100%; display:flex; flex-direction:column; position:relative; background:#fff; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; background:#f0f4f2; border-bottom:1px solid #d0d7d3; font-size:12px; color:#2F5D50; flex-shrink:0;">
            <span style="font-weight:600; display:flex; align-items:center; gap:6px;">📄 ${cur.name || 'PDF Document'}</span>
            <a href="${cur.rawPdfDataUrl || dataUrl}" target="_blank" download="${cur.name || 'bill.pdf'}" class="btn btn-secondary btn-xs" style="background:#fff; color:#2F5D50; border:1px solid #2F5D50; text-decoration:none; display:inline-flex; align-items:center; gap:4px; padding:3px 8px; font-size:11px; font-weight:600;">↗ Open / Download PDF</a>
          </div>
          <iframe src="${pdfUrl}" style="flex:1; width:100%; height:100%; border:none; background:#fff; overflow:hidden;" title="PDF Preview"></iframe>
        </div>
      `;
      this.imgEl = null;
      return;
    }

    if (controls) controls.style.display = 'flex';
    this.stage.style.cursor = 'grab';
    this.stage.innerHTML = `<img class="image-viewer-target" src="${dataUrl}" alt="Scan Document" style="max-width:none; position:absolute; pointer-events:none; transition:transform 0.05s ease-out;" />`;
    this.imgEl = this.stage.querySelector('.image-viewer-target');
    this.resetTransform();
  }

  renderTabs() {
    if (!this.tabsContainer) return;
    if (this.pages.length <= 1) {
      this.tabsContainer.innerHTML = '<span style="color:#aaa;">Page 1 of 1</span>';
      return;
    }

    this.tabsContainer.innerHTML = this.pages.map((p, idx) => `
      <button type="button" class="btn ${idx === this.currentPageIndex ? 'btn-primary' : 'btn-secondary'} btn-sm"
              style="padding: 2px 8px; font-size: 11px;" data-page-idx="${idx}">
        Page ${idx + 1}
      </button>
    `).join('');

    this.tabsContainer.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-page-idx'), 10);
        this.goToPage(idx + 1);
      });
    });
  }

  zoom(delta) {
    this.scale = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, this.scale + delta));
    this.applyTransform();
  }

  rotate() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyTransform();
  }

  resetTransform() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.applyTransform();
  }

  applyTransform() {
    if (!this.imgEl) return;
    this.imgEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    if (this.zoomLabel) {
      this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }
}
