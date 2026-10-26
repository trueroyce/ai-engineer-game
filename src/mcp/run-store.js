import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { RUN_LIMITS, validateRunRecord } from '../postgame/run-schema.js';

const RUN_ID = /^[a-z0-9][a-z0-9_-]{7,63}$/;
const decoder = new TextDecoder('utf-8', { fatal: true });

export class RunStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunStoreError';
    this.code = code;
  }
}

function safeError(code, message) { return new RunStoreError(code, message); }
function samePath(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameIdentity(a, b) {
  if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) return false;
  if (a.dev && a.ino && b.dev && b.ino) return a.dev === b.dev && a.ino === b.ino;
  return a.birthtimeMs === b.birthtimeMs;
}

export function isDirectRegularJsonEntry(entry) {
  return Boolean(entry)
    && typeof entry.name === 'string'
    && entry.name.toLowerCase().endsWith('.json')
    && !entry.isSymbolicLink()
    && entry.isFile();
}

async function boundedRead(candidate, canonicalRoot) {
  const beforeLink = await fs.lstat(candidate);
  if (beforeLink.isSymbolicLink() || !beforeLink.isFile()) throw safeError('unsafe_entry', 'runs 內含連結或非一般 JSON 檔案');
  if (beforeLink.size > RUN_LIMITS.maxFileBytes) throw safeError('file_too_large', `局紀錄超過 ${RUN_LIMITS.maxFileBytes} bytes`);
  const beforeReal = await fs.realpath(candidate);
  if (!samePath(path.dirname(beforeReal), canonicalRoot)) throw safeError('path_escape', '局紀錄解析後超出 runs 目錄');

  const handle = await fs.open(beforeReal, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > RUN_LIMITS.maxFileBytes) throw safeError('file_too_large', '局紀錄不是可接受的一般檔案');
    const buffer = Buffer.alloc(Math.min(RUN_LIMITS.maxFileBytes + 1, opened.size + 1));
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > RUN_LIMITS.maxFileBytes) throw safeError('file_too_large', `局紀錄超過 ${RUN_LIMITS.maxFileBytes} bytes`);

    const afterLink = await fs.lstat(candidate);
    const afterReal = await fs.realpath(candidate);
    const afterOpened = await handle.stat();
    if (afterLink.isSymbolicLink() || !afterLink.isFile() || !samePath(beforeReal, afterReal) || !sameIdentity(opened, afterOpened)) {
      throw safeError('file_changed', '局紀錄在讀取期間改變或變成連結');
    }
    let text;
    try { text = decoder.decode(buffer.subarray(0, total)); }
    catch { throw safeError('invalid_utf8', '局紀錄不是有效 UTF-8'); }
    return text;
  } finally {
    await handle.close();
  }
}

function parseRecord(text) {
  let record;
  try { record = JSON.parse(text); }
  catch { throw safeError('invalid_json', '局紀錄不是有效 JSON'); }
  try { validateRunRecord(record); }
  catch (error) { throw safeError(error.code ?? 'invalid_schema', error.message); }
  return record;
}

export function createRunStore(runsDir) {
  const requestedRoot = path.resolve(runsDir);

  async function scan() {
    let rootLink;
    try { rootLink = await fs.lstat(requestedRoot); }
    catch (error) {
      if (error.code === 'ENOENT') throw safeError('runs_unavailable', 'runs 目錄不存在');
      throw safeError('runs_unavailable', 'runs 目錄無法讀取');
    }
    if (rootLink.isSymbolicLink() || !rootLink.isDirectory()) throw safeError('unsafe_root', 'runs 根目錄不得是連結或非目錄');
    const canonicalRoot = await fs.realpath(requestedRoot);
    const entries = await fs.readdir(canonicalRoot, { withFileTypes: true });
    const jsonEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
    const records = [];
    const seen = new Set();
    for (const entry of jsonEntries) {
      if (!isDirectRegularJsonEntry(entry)) throw safeError('unsafe_entry', 'runs 內含連結或非一般 JSON 檔案');
      const candidate = path.join(canonicalRoot, entry.name);
      const record = parseRecord(await boundedRead(candidate, canonicalRoot));
      if (seen.has(record.runId)) throw safeError('duplicate_run_id', `重複的 run ID：${record.runId}`);
      seen.add(record.runId);
      records.push(record);
    }
    return records;
  }

  return Object.freeze({
    root: requestedRoot,
    async list(limit = 20) {
      const records = await scan();
      return records.slice(0, limit);
    },
    async get(runId) {
      if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw safeError('invalid_run_id', 'run_id 只接受 8–64 位小寫英數、底線與連字號');
      const records = await scan();
      const record = records.find((item) => item.runId === runId);
      if (!record) throw safeError('run_not_found', `找不到局紀錄：${runId}`);
      return record;
    },
  });
}
