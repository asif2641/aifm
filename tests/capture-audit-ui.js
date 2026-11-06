const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 9555;
const p = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--remote-debugging-port=' + port,
  '--user-data-dir=e:\\temp_chrome_audit_ui',
  'file:///E:/project/aifm/index.html'
]);

async function capture() {
  await new Promise(r => setTimeout(r, 2000));
  const list = await new Promise((res, rej) => {
    http.get('http://localhost:' + port + '/json', r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
  const target = list.find(t => t.url.includes('index.html'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let idSeq = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = idSeq++;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onopen = async () => {
    await send('Runtime.enable');
    await send('Page.enable');

    // Load demo data so screens have realistic data
    console.log('Loading demo data...');
    await send('Runtime.evaluate', {
      expression: 'window.DemoEngine ? window.DemoEngine.loadDemoData({ silent: true }) : Promise.resolve()',
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 800));

    // Capture 1: Dashboard
    console.log('Capturing Dashboard...');
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('e:/project/aifm/tests/audit-snap-dashboard.png', Buffer.from(snap.data, 'base64'));

    // Capture 2: Manual Bill
    console.log('Capturing Manual Bill...');
    await send('Runtime.evaluate', { expression: 'window.location.hash = "#/manual-bill"' });
    await new Promise(r => setTimeout(r, 800));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('e:/project/aifm/tests/audit-snap-manual-bill.png', Buffer.from(snap.data, 'base64'));

    // Capture 3: Audit View
    console.log('Capturing Audit View...');
    await send('Runtime.evaluate', { expression: 'window.location.hash = "#/audit"' });
    await new Promise(r => setTimeout(r, 800));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('e:/project/aifm/tests/audit-snap-audit.png', Buffer.from(snap.data, 'base64'));

    // Capture 4: Vault View
    console.log('Capturing Vault View...');
    await send('Runtime.evaluate', { expression: 'window.location.hash = "#/vault"' });
    await new Promise(r => setTimeout(r, 800));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('e:/project/aifm/tests/audit-snap-vault.png', Buffer.from(snap.data, 'base64'));

    // Capture 5: Mobile Viewport Dashboard
    console.log('Capturing Mobile Dashboard...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send('Runtime.evaluate', { expression: 'window.location.hash = "#/"' });
    await new Promise(r => setTimeout(r, 800));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('e:/project/aifm/tests/audit-snap-mobile.png', Buffer.from(snap.data, 'base64'));

    console.log('All screenshots captured successfully.');
    ws.close();
    p.kill();
    process.exit(0);
  };
}

capture().catch(err => {
  console.error(err);
  p.kill();
  process.exit(1);
});
