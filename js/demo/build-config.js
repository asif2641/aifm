// =========================================================================
// BUILD CONFIGURATION & RELEASE METADATA
// Controls Demo Build vs Customer Build editions
// =========================================================================

const BUILD_CONFIG = {
  APP_NAME: 'Smart Bill Auditor & Expense Suite',
  APP_VERSION: '1.1.0',
  RELEASE_DATE: '2026-11-06',
  
  // 'demo': includes Seller Panel (Alt+Shift+D), demo data loader, tour overlay
  // 'customer': pure client build, no demo code reachable, clean onboarding
  BUILD_MODE: 'demo',

  features: {
    sellerPanel: true,
    demoData: true,
    guidedTour: true,
    syntheticBills: true,
    barcodeScanner: true,
    voiceEntry: true,
    encryptedBackup: true
  },

  PWA: {
    cacheVersion: 'v1.1.0',
    themeColor: '#2F5D50',
    backgroundColor: '#FAF8F5'
  },

  isDemoBuild() {
    return this.BUILD_MODE === 'demo';
  },

  isCustomerBuild() {
    return this.BUILD_MODE === 'customer';
  },

  toggleBuildMode() {
    this.BUILD_MODE = (this.BUILD_MODE === 'demo') ? 'customer' : 'demo';
    return this.BUILD_MODE;
  }
};

function isDemoBuild() {
  return BUILD_CONFIG.isDemoBuild();
}

function isCustomerBuild() {
  return BUILD_CONFIG.isCustomerBuild();
}

if (typeof window !== 'undefined') {
  window.BuildConfig = BUILD_CONFIG;
  window.isDemoBuild = isDemoBuild;
  window.isCustomerBuild = isCustomerBuild;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILD_CONFIG, isDemoBuild, isCustomerBuild };
}
