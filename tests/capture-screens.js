const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const userPdfBuf = fs.readFileSync('e:/project/aifm/tests/user-scan.pdf');
const userPdfDataUrl = 'data:application/pdf;base64,' + userPdfBuf.toString('base64');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--remote-debugging-port=9241',
  '--user-data-dir=e:\\temp_chrome_cdp_screens2',
  'file:///E:/project/aifm/index.html'
]);

setTimeout(async () => {
  try {
    const list = await new Promise((res, rej) => {
      http.get('http://localhost:9241/json', r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
      }).on('error', rej);
    });
    const target = list.find(t => t.url.includes('index.html'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 1) {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `
              Promise.all([
                window.db.put('transactions', {
                  id: 'tx_vault_test',
                  type: 'purchase',
                  status: 'confirmed',
                  currency: 'PKR',
                  vendorName: 'DAWAT-E-ISLAMI',
                  billNumber: '030146',
                  date: '2025-11-03',
                  paymentMode: 'cash',
                  subtotalMinor: 10000000,
                  grandTotalMinor: 10000000,
                  lineCount: 1,
                  createdAt: new Date().toISOString()
                }),
                window.db.put('transactionLines', {
                  id: 'line_vault_1',
                  transactionId: 'tx_vault_test',
                  nameRaw: 'زكوة',
                  qtyBilled: 1,
                  unit: 'pcs',
                  unitPriceMinor: 10000000,
                  lineTotalMinor: 10000000
                }),
                window.db.put('documents', {
                  id: 'doc_vault_1',
                  transactionId: 'tx_vault_test',
                  pageIndex: 1,
                  dataUrl: ${JSON.stringify(userPdfDataUrl)},
                  thumbnailUrl: ${JSON.stringify(userPdfDataUrl)},
                  mimeType: 'application/pdf',
                  fileName: 'Whatsapp Scan 5 November 2025 at 16.29.24.pdf'
                })
              ]).then(() => {
                window.location.hash = '#/vault';
                return 'done';
              });
            `,
            awaitPromise: true
          }
        }));
      } else if (msg.id === 2) {
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: { expression: 'document.querySelector(".vlt-card[data-txid=\\"tx_vault_test\\"]").click(); "clicked";' }
          }));
        }, 1200);
      } else if (msg.id === 3) {
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 4,
            method: 'Page.captureScreenshot',
            params: { format: 'png' }
          }));
        }, 1200);
      } else if (msg.id === 4) {
        fs.writeFileSync('e:/project/aifm/tests/screenshot-vault-bill.png', Buffer.from(msg.result.data, 'base64'));
        console.log('Saved screenshot-vault-bill.png');
        ws.send(JSON.stringify({
          id: 5,
          method: 'Runtime.evaluate',
          params: { expression: 'window.location.hash = "#/manual-bill"; "navigated";' }
        }));
      } else if (msg.id === 5) {
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 6,
            method: 'Page.captureScreenshot',
            params: { format: 'png' }
          }));
        }, 1200);
      } else if (msg.id === 6) {
        fs.writeFileSync('e:/project/aifm/tests/screenshot-manual-bill.png', Buffer.from(msg.result.data, 'base64'));
        console.log('Saved screenshot-manual-bill.png');
        ws.close();
        p.kill();
        process.exit(0);
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 100, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 101, method: 'Page.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '"start"' } }));
      }, 1000);
    };
  } catch(e) {
    console.error(e);
    p.kill();
    process.exit(1);
  }
}, 1500);
