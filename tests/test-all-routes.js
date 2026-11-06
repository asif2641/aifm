const { spawn } = require('child_process');
const http = require('http');

const port = 9560;
const p = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--remote-debugging-port=' + port,
  '--user-data-dir=e:\\temp_chrome_audit_routes',
  'file:///E:/project/aifm/index.html'
]);

const routesToTest = [
  '#/',
  '#/scan',
  '#/manual-bill',
  '#/vault',
  '#/audit',
  '#/items',
  '#/inventory',
  '#/parties',
  '#/vendors',
  '#/customers',
  '#/purchase-orders',
  '#/sales',
  '#/ledger',
  '#/tax-reports',
  '#/quick-add',
  '#/budgets',
  '#/recurring',
  '#/shifts',
  '#/settings',
  '#/system-check'
];

async function testAllRoutes() {
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

  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push({
        type: 'EXCEPTION',
        desc: msg.params.exceptionDetails.text,
        line: msg.params.exceptionDetails.lineNumber,
        col: msg.params.exceptionDetails.columnNumber
      });
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push({
        type: 'CONSOLE_ERROR',
        msg: msg.params.args.map(a => a.value || a.description).join(' ')
      });
    }
  };

  ws.onopen = async () => {
    await send('Runtime.enable');
    await send('Console.enable');

    const results = [];
    for (const r of routesToTest) {
      await send('Runtime.evaluate', { expression: `window.location.hash = "${r}"` });
      await new Promise(res => setTimeout(res, 350));
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const mc = document.getElementById('main-content');
            return {
              route: "${r}",
              hasContent: mc ? mc.children.length > 0 : false,
              heading: mc ? (mc.querySelector('h1, h2, h3')?.innerText || '') : '',
              textSnippet: mc ? mc.innerText.substring(0, 80).replace(/\\n/g, ' ') : ''
            };
          })()
        `,
        returnByValue: true
      });
      results.push(evalRes.result?.value);
    }

    console.log('ROUTE TEST RESULTS:');
    console.table(results);
    console.log('ERRORS ENCOUNTERED:', errors.length);
    if (errors.length > 0) {
      console.log(errors);
    }

    ws.close();
    p.kill();
    process.exit(0);
  };
}

testAllRoutes().catch(err => {
  console.error(err);
  p.kill();
  process.exit(1);
});
