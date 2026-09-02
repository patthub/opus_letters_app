// Zrzut ekranu przez CDP: zwykly --screenshot strzela za wczesnie, a --virtual-time-budget
// przewija zegar i psuje polaczenia po WebSocket (bolt). Tu czekamy realny czas.
const [url, out, waitMs = 20000, w = 1700, h = 1150] = process.argv.slice(2);
const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const dir = fs.mkdtempSync(os.tmpdir() + '/cdp-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--remote-debugging-port=9222',
   `--window-size=${w},${h}`, `--user-data-dir=${dir}`, 'about:blank'],
  { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) {
  try { list = await (await fetch('http://127.0.0.1:9222/json/list')).json(); break; }
  catch { await sleep(500); }
}
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const waiting = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(r => {
  const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
await send('Page.enable');
// Bledy strony trafiaja do stdout — bez tego diagnoza konczy sie zgadywaniem
await send('Runtime.enable');
await send('Log.enable');
const problemy = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problemy.push('WYJATEK: ' + (d.exception?.description || d.text || '').split('\n')[0]);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    problemy.push('BLAD: ' + m.params.entry.text.slice(0, 200));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problemy.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
  }
});
// bez tego react-grid-layout mierzy szerokosc okna sprzed resize i uklada sie na polowie ekranu
await send('Emulation.setDeviceMetricsOverride',
  { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(Number(waitMs));
if (process.env.EVAL) {
  const r = await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true, awaitPromise: true });
  console.log('EVAL', JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description ?? r));
}
if (problemy.length) console.log('--- problemy strony ---\n' + [...new Set(problemy)].join('\n'));
const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log(out, fs.statSync(out).size);
ws.close(); chrome.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(0);
