import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../scripts/serve.mjs';

function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('靜態伺服器：只綁 127.0.0.1，提供 index.html 與 ES module，拒絕路徑穿越', async (t) => {
  const server = await startServer({ port: 0, quiet: true });
  t.after(() => new Promise((r) => server.close(r)));
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');

  const index = await rawGet(port, '/index.html');
  assert.equal(index.status, 200);
  assert.match(index.type, /^text\/html/);

  const root = await rawGet(port, '/');
  assert.equal(root.status, 200);
  assert.match(root.type, /^text\/html/);

  const mod = await rawGet(port, '/src/core/rules.js');
  assert.equal(mod.status, 200);
  assert.match(mod.type, /^text\/javascript/);

  const css = await rawGet(port, '/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.type, /^text\/css/);

  for (const evil of ['/../package.json', '/%2e%2e/package.json', '/src/..%2f..%2fpackage.json', '/..\\package.json']) {
    const r = await rawGet(port, evil);
    assert.equal(r.status, 403, `${evil} 應以 403 拒絕，得到 ${r.status}`);
    assert.doesNotMatch(r.body, /"scripts"/);
  }

  const missing = await rawGet(port, '/nope.js');
  assert.equal(missing.status, 404);
});
