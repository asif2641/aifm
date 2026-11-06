const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');

const testFiles = [
  'money.test.html',
  'db.test.html',
  'auth-shifts.test.html',
  'scan-pipeline.test.html',
  'audit.test.html',
  'business.test.html',
  'extras-analytics.test.html',
  'release-qa.test.html'
];

function findBrowserPath() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const platform = process.platform;
  if (platform === 'win32') {
    const candidates = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else if (platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else {
    const candidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    for (const bin of candidates) {
      try {
        const p = execSync(`which ${bin} 2>/dev/null`).toString().trim();
        if (p && fs.existsSync(p)) return p;
      } catch {}
    }
  }
  return 'chrome';
}

async function runTest(file) {
  return new Promise((resolve) => {
    const port = 9300 + Math.floor(Math.random() * 500);
    const browserPath = findBrowserPath();
    const tempDir = path.join(os.tmpdir(), 'chrome_aifm_' + port);
    const testUrl = pathToFileURL(path.resolve(__dirname, file)).href;

    const cleanup = () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    };

    const p = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + tempDir,
      testUrl
    ]);

    const timer = setTimeout(() => {
      try { p.kill(); } catch (e) {}
      cleanup();
      resolve({ file, error: 'TIMEOUT' });
    }, 12000);

    setTimeout(async () => {
      try {
        const list = await new Promise((res, rej) => {
          http.get('http://localhost:' + port + '/json', r => {
            let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
          }).on('error', rej);
        });
        const target = list.find(t => t.url.includes(file));
        if (!target) {
          clearTimeout(timer);
          p.kill();
          cleanup();
          return resolve({ file, error: 'Target not found' });
        }
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
          setTimeout(() => {
            ws.send(JSON.stringify({
              id: 2,
              method: 'Runtime.evaluate',
              params: {
                expression: 'document.getElementById("stats") ? document.getElementById("stats").innerText : (document.body ? document.body.innerText.substring(0, 300) : "no body")'
              }
            }));
          }, 1800);
        };
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === 2) {
            clearTimeout(timer);
            const val = m.result.result.value;
            ws.close();
            p.kill();
            cleanup();
            resolve({ file, stats: val });
          }
        };
      } catch (e) {
        clearTimeout(timer);
        p.kill();
        cleanup();
        resolve({ file, error: e.message });
      }
    }, 1200);
  });
}

(async () => {
  // 0. Validate app.standalone.js syntax
  const appPath = path.resolve(__dirname, '..', 'app.standalone.js');
  try {
    execSync(`node -c "${appPath}"`);
    console.log('app.standalone.js syntax check: PASS (Clean)');
  } catch (err) {
    console.error('FATAL: app.standalone.js has syntax error!', err.message);
    process.exit(1);
  }

  // 1. Direct standalone integration unit tests against actual app.standalone.js
  console.log('\n--- DIRECT INTEGRATION TESTS: app.standalone.js AppCore ---');
  const { AppCore } = require('../app.standalone.js');
  let directPassed = 0;
  let directTotal = 0;

  function assert(title, condition) {
    directTotal++;
    if (condition) {
      directPassed++;
      console.log(`  ✓ [PASS] ${title}`);
    } else {
      console.error(`  ✗ [FAIL] ${title}`);
    }
  }

  assert('AppCore exports required audit and math methods', Boolean(AppCore && AppCore.auditRowMath && AppCore.runCompleteAudit));
  assert('parseMoney converts Rs 1,500.00 to 150000 minor units', AppCore.parseMoney('1,500.00', 'PKR') === 150000);
  assert('formatMoney formats 150000 minor units to Rs. 1,500.00', AppCore.formatMoney(150000, 'PKR') === 'Rs. 1,500.00');
  assert('lineTotal calculates 10 pcs * 500.00 = 5000.00', AppCore.lineTotal(10000, 50000) === 500000);
  
  // Test manual discrepancy detection: Qty = 1, Rate = 1500, Printed Total = 1600
  const discLine = { id: 'l_test', qtyBilled: 1, unitPriceMinor: 150000, printedLineTotalMinor: 160000 };
  const discFinding = AppCore.auditRowMath(discLine, { currency: 'PKR' });
  assert('auditRowMath flags manual total discrepancy (Printed: 1600 vs Calc: 1500)', discFinding && discFinding.diff === -10000);
  assert('auditRowMath suggests fix_total = 150000', discFinding?.suggestedFixes?.some(f => f.type === 'SET_TOTAL' && f.value === 150000));

  // Test Obfuscation
  const testKey = 'AIzaSyDemoSecureKey12345';
  const obfuscated = AppCore.obfuscateSecret(testKey);
  assert('Secret obfuscation hides plaintext and starts with enc:', obfuscated.startsWith('enc:') && !obfuscated.includes(testKey));
  assert('Secret deobfuscation accurately restores original key', AppCore.deobfuscateSecret(obfuscated) === testKey);

  // Test Urdu recognition & Line Normalizer
  assert('containsUrdu accurately detects Urdu characters', AppCore.containsUrdu('کوکنگ آئل') === true && AppCore.containsUrdu('Cooking Oil') === false);
  const normalizedUrduLine = AppCore.normalizeLineItem({ nameRaw: 'انڈے 24 عدد 520', qty: 24, unit: 'pcs', lineTotal: 520 }, 'PKR', 1);
  assert('normalizeLineItem cleans Urdu raw name and extracts nameUrdu', normalizedUrduLine.nameRaw === 'انڈے' && normalizedUrduLine.nameUrdu === 'انڈے');

  assert('AppCore exports openSellerPanelModal for demo mode presentation', typeof AppCore.openSellerPanelModal === 'function');

  // Test School Fee Slip / Non-Standard Date Normalization
  assert('normalizeDate accurately converts 1-APRIL-2026 to 2026-04-01', AppCore.normalizeDate('1-APRIL-2026') === '2026-04-01');
  assert('normalizeDate accurately converts 10-APRIL-2026 to 2026-04-10', AppCore.normalizeDate('10-APRIL-2026') === '2026-04-10');
  assert('normalizeDate accurately converts 01-04-2026 to 2026-04-01', AppCore.normalizeDate('01-04-2026') === '2026-04-01');

  // Test School Fee Slip Extraction Mapping with Array Unwrapping
  const mockSchoolFeeSlipRaw = [
    {
      vendor: { name: 'Lahore Cantt Public High School (Rab-e-Danish)', phone: '03244029269' },
      customer: { name: 'FARWA ASIM' },
      billNumber: '1663',
      date: '1-APRIL-2026',
      printedGrandTotal: 5000,
      lines: [
        { nameRaw: 'Registration fee', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 },
        { nameRaw: 'Admission fee', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 },
        { nameRaw: 'Tuition fee', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 },
        { nameRaw: 'Generator fee', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 },
        { nameRaw: 'Annual funds', qty: 1, unit: 'fee', unitPrice: 5000, lineTotal: 5000 },
        { nameRaw: 'Others', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 },
        { nameRaw: 'Arreras', qty: 1, unit: 'fee', unitPrice: 0, lineTotal: 0 }
      ]
    }
  ];

  const normalizedDraft = AppCore.normalizeDraftTransaction(mockSchoolFeeSlipRaw, 'PKR');
  assert('normalizeDraftTransaction unwraps array response and maps vendor', normalizedDraft.vendorName === 'Lahore Cantt Public High School (Rab-e-Danish)');
  assert('normalizeDraftTransaction maps student name to customerName', normalizedDraft.customerName === 'FARWA ASIM');
  assert('normalizeDraftTransaction maps admission # to billNumber', normalizedDraft.billNumber === '1663');
  assert('normalizeDraftTransaction normalizes date to 2026-04-01', normalizedDraft.date === '2026-04-01');
  assert('normalizeDraftTransaction preserves all 7 fee line items', normalizedDraft.lines.length === 7);
  assert('normalizeDraftTransaction captures Annual funds 5,000.00 minor units', normalizedDraft.lines[4].printedLineTotalMinor === 500000);
  assert('normalizeDraftTransaction captures grand total 5,000.00 minor units', normalizedDraft.printedGrandTotalMinor === 500000);

  // Test Nested Cache Structure Unwrapping
  const nestedPageResults = [
    [
      {
        vendor: { name: 'Lahore Cantt Public High School' },
        customer: { name: 'FARWA ASIM' },
        billNumber: '1663',
        printedGrandTotal: 5000,
        lines: [{ nameRaw: 'Annual funds', qty: 1, lineTotal: 5000 }]
      }
    ]
  ];
  const mergedFromNested = AppCore.mergeMultiPageExtractions(nestedPageResults, [], 'PKR');
  assert('mergeMultiPageExtractions unflattens nested cache arrays and extracts vendor', mergedFromNested.mergedDraft.vendorName === 'Lahore Cantt Public High School');
  assert('mergeMultiPageExtractions unflattens nested cache arrays and extracts customer', mergedFromNested.mergedDraft.customerName === 'FARWA ASIM');
  assert('mergeMultiPageExtractions unflattens nested cache arrays and extracts line items', mergedFromNested.mergedDraft.lines.length === 1 && mergedFromNested.mergedDraft.lines[0].printedLineTotalMinor === 500000);

  console.log(`Direct app.standalone.js tests: ${directPassed}/${directTotal} passed.\n`);

  console.log('--- BROWSER INTEGRATION TEST SUITES (CHROME ENGINE) ---');
  for (const f of testFiles) {
    const res = await runTest(f);
    console.log(f + ' -> ' + (res.stats || res.error));
  }

  // 3. True Real Browser End-to-End Suite against actual index.html & DOM
  const { runE2ETests } = require('./e2e-app-test.js');
  const e2eResult = await runE2ETests();
  if (e2eResult.failed > 0) {
    console.error(`E2E tests had ${e2eResult.failed} failures.`);
    process.exit(1);
  }
})();
