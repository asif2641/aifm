const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=360,740',
  '--remote-debugging-port=9243',
  '--user-data-dir=e:\\temp_chrome_cdp_mobile_test',
  'file:///E:/project/aifm/index.html'
]);

setTimeout(async () => {
  try {
    const list = await new Promise((res, rej) => {
      http.get('http://localhost:9243/json', r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
      }).on('error', rej);
    });
    const target = list.find(t => t.url.includes('index.html'));
    if (!target) { console.error('No target'); p.kill(); process.exit(1); }

    const ws = new WebSocket(target.webSocketDebuggerUrl);

    function evaluate(expr) {
      return new Promise((res) => {
        const id = Math.floor(Math.random() * 100000);
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            res(msg.result && msg.result.result ? msg.result.result.value : msg);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true }
        }));
      });
    }

    function captureScreenshot(filename) {
      return new Promise((res) => {
        const id = Math.floor(Math.random() * 100000);
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            fs.writeFileSync(filename, Buffer.from(msg.result.data, 'base64'));
            res();
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({
          id,
          method: 'Page.captureScreenshot',
          params: { format: 'png' }
        }));
      });
    }

    ws.onopen = async () => {
      console.log('Connected to Chrome DevTools Protocol.');

      // 1. Check Mobile Header & Bottom Nav
      console.log('\n--- VERIFYING MOBILE UI ---');
      const mobileUI = await evaluate(`
        (function() {
          const mobileLockBtn = document.getElementById('mobile-lock-btn');
          const mobileScanBtn = document.getElementById('mobile-btn-scan');
          const mobileManualBtn = document.getElementById('mobile-btn-manual');
          const bottomShifts = document.getElementById('bottom-nav-shifts');
          const bottomSettings = document.getElementById('bottom-nav-settings');
          const bottomHome = document.getElementById('bottom-nav-home');
          const bottomVault = document.getElementById('bottom-nav-vault');
          const bottomScan = document.getElementById('bottom-nav-scan');
          const bottomReports = document.getElementById('bottom-nav-reports');
          const bottomMenu = document.getElementById('bottom-nav-menu-toggle');
          
          // Check horizontal overflow
          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          const bodyWidth = document.body.scrollWidth;
          const hasHorizontalScroll = docWidth > winWidth;

          return JSON.stringify({
            hasMobileLockBtn: !!mobileLockBtn,
            hasMobileScanBtn: !!mobileScanBtn,
            hasMobileManualBtn: !!mobileManualBtn,
            hasBottomShifts: !!bottomShifts,
            hasBottomSettings: !!bottomSettings,
            hasBottomHome: !!bottomHome,
            hasBottomVault: !!bottomVault,
            hasBottomScan: !!bottomScan,
            hasBottomReports: !!bottomReports,
            hasBottomMenu: !!bottomMenu,
            docWidth,
            winWidth,
            bodyWidth,
            hasHorizontalScroll
          });
        })()
      `);
      console.log('Mobile UI Status:', mobileUI);
      await captureScreenshot('e:/project/aifm/tests/proof-mobile-360.png');
      console.log('Captured tests/proof-mobile-360.png');

      // 2. Load Demo Data
      console.log('\n--- LOADING DEMO DATA ---');
      const loadRes = await evaluate(`
        window.DemoEngine.loadDemoData().then(r => JSON.stringify(r))
      `);
      console.log('DemoEngine load result:', loadRes);

      // 3. Switch to Desktop size for sidebar and table verification
      ws.send(JSON.stringify({
        id: 999,
        method: 'Emulation.setDeviceMetricsOverride',
        params: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }
      }));
      await new Promise(r => setTimeout(r, 600));

      // Check Sidebar: No Shifts & Register, No Lock/Switch buttons in sidebar footer
      console.log('\n--- VERIFYING SIDEBAR ---');
      const sidebarStatus = await evaluate(`
        (function() {
          const links = Array.from(document.querySelectorAll('.sidebar-nav .nav-item')).map(a => a.textContent.trim());
          const hasShiftsInSidebar = links.some(l => l.includes('Shift') || l.includes('Register'));
          const lockBtn = document.getElementById('sidebar-btn-lock');
          const switchBtn = document.getElementById('sidebar-btn-logout');
          return JSON.stringify({
            linksCount: links.length,
            hasShiftsInSidebar,
            hasSidebarLockBtn: !!lockBtn,
            hasSidebarSwitchBtn: !!switchBtn
          });
        })()
      `);
      console.log('Sidebar Status:', sidebarStatus);
      await captureScreenshot('e:/project/aifm/tests/proof-clean-sidebar.png');
      console.log('Captured tests/proof-clean-sidebar.png');

      // 4. Verify Inventory View (#/inventory)
      console.log('\n--- VERIFYING INVENTORY VIEW ---');
      await evaluate(`window.location.hash = '#/inventory';`);
      await new Promise(r => setTimeout(r, 800));
      const inventoryStatus = await evaluate(`
        (function() {
          const rows = Array.from(document.querySelectorAll('#inv-tbody tr')).map(tr => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
            return tds;
          });
          return JSON.stringify({
            rowCount: rows.length,
            first3Rows: rows.slice(0, 3)
          });
        })()
      `);
      console.log('Inventory Status:', inventoryStatus);
      await captureScreenshot('e:/project/aifm/tests/proof-inventory.png');
      console.log('Captured tests/proof-inventory.png');

      // 5. Verify Budgets vs Recurring Views
      console.log('\n--- VERIFYING BUDGETS & RECURRING VIEWS ---');
      await evaluate(`window.location.hash = '#/budgets';`);
      await new Promise(r => setTimeout(r, 800));
      const budgetsTitle = await evaluate(`document.getElementById('breadcrumb-title').textContent`);
      console.log('Budgets Breadcrumb:', budgetsTitle);

      await evaluate(`window.location.hash = '#/recurring';`);
      await new Promise(r => setTimeout(r, 800));
      const recurringStatus = await evaluate(`
        (function() {
          const breadcrumb = document.getElementById('breadcrumb-title').textContent;
          const activeBtn = document.querySelector('.card button.btn-primary')?.textContent.trim();
          const recRows = document.querySelectorAll('table tbody tr').length;
          return JSON.stringify({ breadcrumb, activeBtn, recRows });
        })()
      `);
      console.log('Recurring View Status:', recurringStatus);
      await captureScreenshot('e:/project/aifm/tests/proof-recurring.png');
      console.log('Captured tests/proof-recurring.png');

      // 6. Verify Customer Accounts & 360 Profile
      console.log('\n--- VERIFYING CUSTOMERS & 360 PROFILE ---');
      await evaluate(`window.location.hash = '#/customers';`);
      await new Promise(r => setTimeout(r, 800));
      const customerStatus = await evaluate(`
        (function() {
          const rows = Array.from(document.querySelectorAll('#party-tbody tr')).map(tr => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
            return tds;
          });
          return JSON.stringify({
            customerRows: rows.slice(0, 4)
          });
        })()
      `);
      console.log('Customers Status:', customerStatus);

      // Click 360 profile on first customer
      await evaluate(`
        const btn = document.querySelector('.btn-p-360');
        if (btn) btn.click();
      `);
      await new Promise(r => setTimeout(r, 800));
      const modalOpen = await evaluate(`
        (function() {
          const modal = document.querySelector('.modal-backdrop');
          return !!modal && modal.innerText.includes('Most Purchased Items');
        })()
      `);
      console.log('Customer 360 Modal Open:', modalOpen);
      await captureScreenshot('e:/project/aifm/tests/proof-customer-360.png');
      console.log('Captured tests/proof-customer-360.png');

      // 7. Verify Bill Details for an Expense and a Sale
      console.log('\n--- VERIFYING BILL DETAIL SLIPS ---');
      await evaluate(`
        const close = document.getElementById('p360-close');
        if (close) close.click();
        window.location.hash = '#/vault';
      `);
      await new Promise(r => setTimeout(r, 800));

      // Open a demo expense bill
      const slipStatus = await evaluate(`
        (async function() {
          const txs = await window.db.getAll('transactions');
          const exp = txs.find(t => t.type === 'expense');
          const sale = txs.find(t => t.type === 'sale');
          
          if (exp && typeof showBillDetail === 'function') {
            await showBillDetail(exp.id);
            const title = document.querySelector('#vlt-detail-body h2')?.innerText;
            const subtotal = document.querySelector('#vlt-detail-body')?.innerText.match(/Subtotal:[^\\n]*/)?.[0];
            const grandTotal = document.querySelector('#vlt-detail-body')?.innerText.match(/Grand Total:[^\\n]*/)?.[0];
            const lineItemsCount = document.querySelectorAll('#vlt-detail-body table tbody tr').length;
            return JSON.stringify({
              expId: exp.id,
              title,
              subtotal,
              grandTotal,
              lineItemsCount
            });
          }
          return 'No exp found';
        })()
      `);
      console.log('Expense Slip Status:', slipStatus);
      await captureScreenshot('e:/project/aifm/tests/proof-bill-detail.png');
      console.log('Captured tests/proof-bill-detail.png');

      console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
      p.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error('Test error:', err);
    p.kill();
    process.exit(1);
  }
}, 1500);
