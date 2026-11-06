const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9231',
  'file:///E:/project/aifm/index.html'
]);

setTimeout(async () => {
  try {
    const list = await new Promise((res, rej) => {
      http.get('http://localhost:9231/json', r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
      }).on('error', rej);
    });
    const target = list.find(t => t.url.includes('index.html'));
    if (!target) { p.kill(); process.exit(1); }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `Promise.all([getAll('transactions'), getAll('documents')]).then(([txs, docs]) => JSON.stringify({ txs: txs.map(t=>({id:t.id, vendor:t.vendorName, billNo:t.billNumber})), docs: docs.map(d=>({id:d.id, txId:d.transactionId, name:d.fileName, mime:d.mimeType, dataLen: d.dataUrl ? d.dataUrl.length : 0})) }))`,
            awaitPromise: true
          }
        }));
      }, 2000);
    };
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === 2 && msg.result) {
        console.log('DB RESULT:', msg.result.result.value);
        ws.close();
        p.kill();
        process.exit(0);
      }
    };
  } catch (e) {
    console.error(e);
    p.kill();
    process.exit(1);
  }
}, 1500);
