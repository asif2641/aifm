// =========================================================================
// GUIDED INTERACTIVE TOUR (9-STEP WALKTHROUGH OVERLAY)
// Editorial Flat Luxury Onboarding Tour. 100% Client-Side.
// =========================================================================

const TOUR_STORAGE_KEY = 'smart_auditor_tour_completed';

const TOUR_STEPS = [
  {
    id: 'step_dashboard',
    step: 1,
    title: '360° Financial Dashboard',
    content: 'Live financial situation awareness. Real-time monthly turnover, expenses, and net profit calculated with integer precision.',
    target: '#topbar-user-area',
    targetHash: '#/'
  },
  {
    id: 'step_scan',
    step: 2,
    title: 'Instant Scan & Quality Gate',
    content: 'High-throughput receipt ingestion. Evaluates blur, lighting, and duplicate detection locally on-device in milliseconds.',
    target: '#nav-scan',
    targetHash: '#/scan'
  },
  {
    id: 'step_editor',
    step: 3,
    title: 'Split-Screen Visual Verification',
    content: 'Side-by-side bill image inspection and live table editing. Click any line item to zoom into the exact receipt section.',
    target: '#main-content',
    targetHash: '#/vault'
  },
  {
    id: 'step_audit',
    step: 4,
    title: 'Automated Fraud & Audit Engine',
    content: '5-layer automated math verification. Flags vendor math overcharges, price hikes, and duplicate submissions with one-click fixes.',
    target: '#nav-audit',
    targetHash: '#/audit'
  },
  {
    id: 'step_parties',
    step: 5,
    title: 'Party 360 & Aging Ledger',
    content: 'Manage vendors and customers with FIFO aging buckets (0-30, 31-60, 61-90, 90+ days) and instant WhatsApp reminder generation.',
    target: '#nav-vendors',
    targetHash: '#/vendors'
  },
  {
    id: 'step_inventory',
    step: 6,
    title: 'Smart Stock & WAC Valuation',
    content: 'Mathematically derived inventory counts with Weighted Average Cost (WAC) tracking and one-click Purchase Orders for depleted items.',
    target: '#nav-inventory',
    targetHash: '#/inventory'
  },
  {
    id: 'step_sales',
    step: 7,
    title: 'Sales POS & Real-Time Margin',
    content: 'High-speed counter sales with instant change calculation, barcode support, and live profit margin protection.',
    target: '#nav-sales',
    targetHash: '#/sales'
  },
  {
    id: 'step_budgets',
    step: 8,
    title: 'Category Budgets & Subscriptions',
    content: 'Track monthly category spending caps with live progress bars and monitor recurring bill commitments before overspending.',
    target: '#nav-budgets',
    targetHash: '#/budgets'
  },
  {
    id: 'step_security',
    step: 9,
    title: '100% Offline & Private',
    content: 'Zero cloud leaks. PBKDF2 PIN encryption, encrypted JSON backups, and complete sovereign ownership over your financial records.',
    target: '#topbar-mode-badge',
    targetHash: '#/settings'
  }
];

let currentTourIndex = 0;
let tourOverlayEl = null;

const GuidedTour = {
  getSteps() {
    return TOUR_STEPS;
  },

  isCompleted() {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  },

  markCompleted() {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {}
  },

  resetStatus() {
    try {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {}
  },

  start(onFinished) {
    currentTourIndex = 0;
    this.renderTourModal(onFinished);
  },

  next(onFinished) {
    if (currentTourIndex < TOUR_STEPS.length - 1) {
      currentTourIndex++;
      this.renderTourModal(onFinished);
    } else {
      this.dismiss();
      this.markCompleted();
      if (typeof onFinished === 'function') onFinished();
    }
  },

  prev(onFinished) {
    if (currentTourIndex > 0) {
      currentTourIndex--;
      this.renderTourModal(onFinished);
    }
  },

  dismiss() {
    if (tourOverlayEl && tourOverlayEl.parentNode) {
      tourOverlayEl.parentNode.removeChild(tourOverlayEl);
      tourOverlayEl = null;
    }
  },

  renderTourModal(onFinished) {
    this.dismiss();
    const s = TOUR_STEPS[currentTourIndex];
    if (s.targetHash && window.location && window.location.hash !== s.targetHash) {
      window.location.hash = s.targetHash;
    }

    tourOverlayEl = document.createElement('div');
    tourOverlayEl.id = 'tour-interactive-overlay';
    tourOverlayEl.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(30, 32, 30, 0.65);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    `;

    tourOverlayEl.innerHTML = `
      <div style="background:#FAF8F5; border:2px solid #1E201E; max-width:480px; width:100%; padding:24px; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #1E201E; padding-bottom:8px;">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; background:#2F5D50; color:#FFFFFF; padding:2px 8px;">
            Step ${s.step} of ${TOUR_STEPS.length}
          </span>
          <button type="button" id="tour-btn-close" style="background:none; border:none; font-size:16px; font-weight:700; cursor:pointer; color:#1E201E;">✕</button>
        </div>
        <h3 style="font-size:18px; font-weight:700; margin:0 0 8px 0; color:#1E201E;">${s.title}</h3>
        <p style="font-size:13px; color:#686D68; line-height:1.6; margin:0 0 20px 0;">${s.content}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button type="button" id="tour-btn-prev" class="btn btn-secondary btn-sm" ${currentTourIndex === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>← Previous</button>
          <div style="display:flex; gap:8px;">
            <button type="button" id="tour-btn-skip" class="btn btn-secondary btn-sm">Skip Tour</button>
            <button type="button" id="tour-btn-next" class="btn btn-primary btn-sm">${currentTourIndex === TOUR_STEPS.length - 1 ? 'Finish Tour 🎉' : 'Next Step →'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(tourOverlayEl);

    document.getElementById('tour-btn-close')?.addEventListener('click', () => this.dismiss());
    document.getElementById('tour-btn-skip')?.addEventListener('click', () => {
      this.dismiss();
      this.markCompleted();
    });
    document.getElementById('tour-btn-prev')?.addEventListener('click', () => this.prev(onFinished));
    document.getElementById('tour-btn-next')?.addEventListener('click', () => this.next(onFinished));
  }
};

if (typeof window !== 'undefined') {
  window.GuidedTour = GuidedTour;
  window.startGuidedTour = (fn) => GuidedTour.start(fn);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GuidedTour, TOUR_STEPS };
}
