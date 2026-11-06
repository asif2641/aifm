const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9226',
  '--user-data-dir=e:\\temp_chrome_cdp5',
  'file:///E:/project/aifm/index.html'
]);

setTimeout(async () => {
  try {
    const list = await new Promise((res, rej) => {
      http.get('http://localhost:9226/json', r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b)));
      }).on('error', rej);
    });
    const target = list.find(t => t.url.includes('index.html'));
    if (!target) { console.log('Target not found'); p.kill(); process.exit(1); }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('PAGE EXCEPTION:', JSON.stringify(msg.params.exceptionDetails, null, 2));
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('CONSOLE [' + msg.params.type + ']:', msg.params.args.map(a => a.value || a.description).join(' '));
      } else if (msg.id === 10) {
        console.log('EVAL RESULT:', msg.result.result.value);
        ws.close();
        p.kill();
        process.exit(0);
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));
      ws.send(JSON.stringify({ id: 4, method: 'Page.reload' }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 10,
          method: 'Runtime.evaluate',
          params: { expression: 'document.getElementById("main-content") ? document.getElementById("main-content").innerText : "NO MAIN CONTENT"' }
        }));
      }, 2000);
    };
  } catch (err) {
    console.error('Error:', err);
    p.kill();
    process.exit(1);
  }
}, 1500);
