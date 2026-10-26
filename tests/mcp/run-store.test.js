import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRunStore, isDirectRegularJsonEntry } from '../../src/mcp/run-store.js';
import { RUN_LIMITS } from '../../src/postgame/run-schema.js';
import { syntheticRun } from './fixtures.js';

async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aieg-mcp-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeRecord(dir, name, record) {
  await fs.writeFile(path.join(dir, name), `${JSON.stringify(record)}\n`, 'utf8');
}

test('empty store lists no runs and valid missing ID is a business data error', async (t) => {
  const dir = await temp(t);
  const store = createRunStore(dir);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(store.get('case01-deadbeef'), (error) => error.code === 'run_not_found');
});

test('normal UTF-8 run is read and path-shaped IDs are rejected before any lookup', async (t) => {
  const dir = await temp(t);
  const record = syntheticRun({ seed: 'store-normal' });
  await writeRecord(dir, 'normal.json', record);
  const store = createRunStore(dir);
  assert.equal((await store.list())[0].ending.title, record.ending.title);
  assert.deepEqual(await store.get(record.runId), record);
  for (const attack of ['../secret', '..\\secret', 'C:\\secret', '%2e%2e%2fsecret', 'file:///secret']) {
    await assert.rejects(store.get(attack), (error) => error.code === 'invalid_run_id');
  }
});

test('invalid JSON, unsupported game schema/rule and duplicate run IDs invalidate the dataset', async (t) => {
  const badJson = await temp(t);
  await fs.writeFile(path.join(badJson, 'bad.json'), '{oops', 'utf8');
  await assert.rejects(createRunStore(badJson).list(), (error) => error.code === 'invalid_json');

  const badSchema = await temp(t);
  const unsupported = syntheticRun({ seed: 'store-schema' });
  unsupported.schemaVersion = 'ai-engineer-game.run.v9';
  await writeRecord(badSchema, 'schema.json', unsupported);
  await assert.rejects(createRunStore(badSchema).list(), (error) => error.code === 'unsupported_schema');

  const badRule = await temp(t);
  const unsupportedRule = syntheticRun({ seed: 'store-rule' });
  unsupportedRule.gameRuleVersion = 'case-01-narrative@999';
  await writeRecord(badRule, 'rule.json', unsupportedRule);
  await assert.rejects(createRunStore(badRule).list(), (error) => error.code === 'unsupported_rule_version');

  const duplicate = await temp(t);
  const repeated = syntheticRun({ seed: 'store-duplicate' });
  await writeRecord(duplicate, 'first.json', repeated);
  await writeRecord(duplicate, 'second.json', repeated);
  await assert.rejects(createRunStore(duplicate).list(), (error) => error.code === 'duplicate_run_id');
});

test('oversized files are rejected before JSON parsing and non-files are rejected', async (t) => {
  const huge = await temp(t);
  await fs.writeFile(path.join(huge, 'huge.json'), Buffer.alloc(RUN_LIMITS.maxFileBytes + 1, 0x20));
  await assert.rejects(createRunStore(huge).list(), (error) => error.code === 'file_too_large');

  const directoryEntry = await temp(t);
  await fs.mkdir(path.join(directoryEntry, 'fake.json'));
  await assert.rejects(createRunStore(directoryEntry).list(), (error) => error.code === 'unsafe_entry');
});

test('file symlink escape is rejected by canonical containment', async (t) => {
  const dir = await temp(t);
  const outside = path.join(await temp(t), 'outside.json');
  await fs.writeFile(outside, JSON.stringify(syntheticRun({ seed: 'store-link' })), 'utf8');
  try {
    await fs.symlink(outside, path.join(dir, 'escape.json'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      assert.equal(isDirectRegularJsonEntry({ name: 'escape.json', isSymbolicLink: () => true, isFile: () => false }), false);
      t.diagnostic(`此 Windows 帳號不能建立 file symlink（${error.code}）；已測直接 symlink gate，另有實際 junction/reparse escape 整合測試。`);
      return;
    }
    throw error;
  }
  await assert.rejects(createRunStore(dir).list(), (error) => error.code === 'unsafe_entry');
});

test('directory junction named .json is rejected as a non-regular entry', async (t) => {
  const dir = await temp(t);
  const outsideDir = await temp(t);
  try {
    await fs.symlink(outsideDir, path.join(dir, 'escape.json'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`此 Windows 帳號不能建立測試 junction：${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(createRunStore(dir).list(), (error) => error.code === 'unsafe_entry');
});
