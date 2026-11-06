const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9247',
  '--user-data-dir=e:\\temp_chrome_cdp_bill_test2',
  'file:///E:/project/aifm/index.html'
]);

setTimeout(async () => {
  const list = await new Promise((res, rej) => {
    http.get('http://localhost:9247/json', r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
  const target = list.find(t => t.url.includes('index.html'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  function evalPromise(expr) {
    return new Promise(res => {
      const id = Math.floor(Math.random() * 100000);
      const h = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === id) { ws.removeEventListener('message', h); res(m.result.result.value); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true } }));
    });
  }

  ws.onopen = async () => {
    await evalPromise('window.DemoEngine.loadDemoData()');
    const expInfo = await evalPromise(`
      (async () => {
        await showBillDetail('demo_expense_050');
        const h2 = document.querySelector('#vlt-detail-body h2')?.innerText;
        const lineCols = Array.from(document.querySelectorAll('#vlt-detail-body table tbody tr:first-child td')).map(td => td.innerText.trim());
        const cards = Array.from(document.querySelectorAll('#vlt-detail-body .card')).map(c => c.innerText);
        return JSON.stringify({
          h2,
          lineCols,
          totalsCard: cards[cards.length - 1]
        });
      })()
    `);
    console.log('EXPENSE SLIP:', expInfo);

    const saleInfo = await evalPromise(`
      (async () => {
        await showBillDetail('demo_sale_044');
        const h2 = document.querySelector('#vlt-detail-body h2')?.innerText;
        const lineCols = Array.from(document.querySelectorAll('#vlt-detail-body table tbody tr:first-child td')).map(td => td.innerText.trim());
        const cards = Array.from(document.querySelectorAll('#vlt-detail-body .card')).map(c => c.innerText);
        return JSON.stringify({
          h2,
          lineCols,
          totalsCard: cards[cards.length - 1]
        });
      })()
    `);
    console.log('SALE SLIP:', saleInfo);

    p.kill();
    process.exit(0);
  };
}, 1500);
