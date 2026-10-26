// 零依賴的 Chrome DevTools Protocol 驅動：用 Node 內建 WebSocket 與 child_process 操作使用者已安裝的
// Chrome／Edge。輸入透過 Input.dispatchMouseEvent／dispatchKeyEvent 送出，等同真實滑鼠鍵盤事件。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findBrowser() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('找不到 Chrome 或 Edge；可用環境變數 CHROME_PATH 指定');
  return found;
}

class Client {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (msg) => {
      const data = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(`${data.error.message} (${data.error.code})`));
        else resolve(data.result);
      } else if (data.method) {
        for (const l of this.listeners) l(data);
      }
    });
  }

  // 每個指令最多等 30 秒，卡住時以錯誤浮現，不讓回歸無限期掛住。
  send(method, params = {}, timeout = 30000) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 逾時 ${timeout}ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  on(fn) {
    this.listeners.push(fn);
  }

  close() {
    this.ws.close();
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(new Client(ws)));
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket 連線失敗：${e.message ?? url}`)));
  });
}

// headed=true 時不傳 --headless=new，會開出可見的瀏覽器視窗；兩種模式都用臨時 profile、只連 127.0.0.1 的 DevTools。
export async function launch({ executable = findBrowser(), width = 1280, height = 900, headed = false } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aieg-cdp-'));
  const args = [
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', `--window-size=${width},${height}`, 'about:blank',
  ];
  if (!headed) args.unshift('--headless=new');
  const proc = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('瀏覽器 15 秒內未回報 DevTools 位址')), 15000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`瀏覽器提前結束（${code}）`)); });
  });
  const port = new URL(wsUrl).port;
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const client = await connect(pageTarget.webSocketDebuggerUrl);
  const page = new Page(client);
  await page.init();
  return {
    executable,
    version,
    headed,
    args,
    userDataDir,
    page,
    async close() {
      client.close();
      proc.kill();
      await new Promise((r) => setTimeout(r, 300));
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 瀏覽器可能仍鎖住暫存檔 */ }
    },
  };
}

const KEYS = {
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  ' ': { code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
};
const SHIFT = 8;

export class Page {
  constructor(client) {
    this.client = client;
    this.requests = [];
    this.errors = [];
    this.initScripts = [];
  }

  async init() {
    this.dialogs = [];
    this.dialogResponse = false;
    this.client.on((m) => {
      if (m.method === 'Page.javascriptDialogOpening') {
        this.dialogs.push(m.params.type);
        this.client.send('Page.handleJavaScriptDialog', { accept: this.dialogResponse }).catch(() => {});
      }
      if (m.method === 'Network.requestWillBeSent') this.requests.push(m.params.request.url);
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    });
    await this.client.send('Page.enable');
    await this.client.send('Runtime.enable');
    await this.client.send('Network.enable');
  }

  async setInitScript(source) {
    for (const id of this.initScripts) await this.client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id });
    this.initScripts = [];
    if (source) {
      const { identifier } = await this.client.send('Page.addScriptToEvaluateOnNewDocument', { source });
      this.initScripts.push(identifier);
    }
  }

  async goto(url) {
    const loaded = new Promise((resolve) => {
      const l = (m) => { if (m.method === 'Page.loadEventFired') { resolve(); } };
      this.client.on(l);
    });
    await this.client.send('Page.navigate', { url });
    await loaded;
    await this.waitFor('document.querySelector("#app h1") !== null');
  }

  async reload() {
    const loaded = new Promise((resolve) => this.client.on((m) => { if (m.method === 'Page.loadEventFired') resolve(); }));
    await this.client.send('Page.reload', { ignoreCache: true });
    await loaded;
    await this.waitFor('document.querySelector("#app h1") !== null');
  }

  async eval(expression) {
    const r = await this.client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`頁面執行錯誤：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async waitFor(expression, timeout = 5000) {
    const start = Date.now();
    for (;;) {
      if (await this.eval(`Boolean(${expression})`)) return;
      if (Date.now() - start > timeout) throw new Error(`等待逾時：${expression}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async center(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`找不到元素：${selector}`);
    return box;
  }

  async click(selector, { clickCount = 1 } = {}) {
    const { x, y } = await this.center(selector);
    await this.client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (let i = 1; i <= clickCount; i++) {
      await this.client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i });
      await this.client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i });
    }
  }

  async press(key, { shift = false } = {}) {
    const k = KEYS[key];
    if (!k) throw new Error(`未定義的按鍵 ${key}`);
    const modifiers = shift ? SHIFT : 0;
    const down = { type: k.text && !shift ? 'keyDown' : 'rawKeyDown', key, modifiers, ...k };
    if (shift) delete down.text;
    await this.client.send('Input.dispatchKeyEvent', down);
    await this.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
  }

  // 只用 Tab／Shift+Tab 把焦點移到 selector（依 DOM 先後決定方向），回傳按鍵次數。
  async tabTo(selector, max = 80) {
    for (let i = 0; i <= max; i++) {
      const where = await this.eval(`(() => {
        const t = document.querySelector(${JSON.stringify(selector)});
        if (!t) return 'missing';
        const a = document.activeElement;
        if (a === t) return 'here';
        if (!a || a === document.body) return 'after';
        return (a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'after' : 'before';
      })()`);
      if (where === 'missing') throw new Error(`找不到元素：${selector}`);
      if (where === 'here') return i;
      await this.press('Tab', { shift: where === 'before' });
    }
    throw new Error(`Tab ${max} 次仍未到達 ${selector}`);
  }

  async focusInfo() {
    return this.eval(`(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      return { cmd: a.dataset?.cmd ?? null, tag: a.tagName, outline: cs.outlineStyle, outlineWidth: cs.outlineWidth, focusVisible: a.matches(':focus-visible') };
    })()`);
  }

  async setViewport(width, height, mobile = false) {
    this.emulating = Boolean(width);
    if (!width) return this.client.send('Emulation.clearDeviceMetricsOverride');
    return this.client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async allowDownloads(dir) {
    fs.mkdirSync(dir, { recursive: true });
    await this.client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  }

  async typeInto(selector, text) {
    await this.click(selector);
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).select()`);
    await this.client.send('Input.insertText', { text });
    await this.press('Tab');
  }

  async text() {
    return this.eval('document.body.innerText');
  }

  async html() {
    return this.eval('document.documentElement.outerHTML');
  }

  async screenshot(file) {
    // 模擬行動裝置尺寸時只截可視範圍（captureBeyondViewport 在裝置模擬下可能不回應）。
    const { data } = await this.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !this.emulating });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
}
