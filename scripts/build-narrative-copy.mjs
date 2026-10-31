import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(ROOT, 'docs/canonical/case-01-narrative-draft.md');
const outputPath = path.join(ROOT, 'src/narrative/narrative-copy.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r/g, '');

function sectionAfter(index, headingPattern = /^#{2,3} /m) {
  const tail = source.slice(index);
  const bodyStart = tail.indexOf('\n') + 1;
  const next = tail.slice(bodyStart).search(headingPattern);
  return next < 0 ? tail : tail.slice(0, bodyStart + next);
}

function tidy(lines) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const actionScenes = {};
for (const match of source.matchAll(/^## (A(?:0[1-9]|1[0-2])) (.+)$/gm)) {
  const actionId = match[1];
  const actionBlock = sectionAfter(match.index, /^## /m);
  const scene = actionBlock.match(/### 畫面文本與CLI序列\n([\s\S]*?)(?=\n### )/);
  if (!scene) continue;
  const fence = scene[1].match(/([\s\S]*?)```text\n([\s\S]*?)```/);
  actionScenes[actionId] = {
    intro: tidy((fence?.[1] ?? scene[1]).split('\n')),
    transcript: tidy((fence?.[2] ?? '').split('\n')),
  };
}

const eventCopy = {};
for (const match of source.matchAll(/^### (A(?:0[1-9]|1[01])-[A-D]) (.+)$/gm)) {
  const id = match[1];
  const block = sectionAfter(match.index).split('\n').slice(1);
  const visible = block.filter((line) => !/^(作者條件|產物|狀態|後續)：/.test(line.trim()));
  eventCopy[id] = { title: match[2].trim(), story: tidy(visible) };
}

if (Object.keys(eventCopy).length !== 34) throw new Error(`預期 34 個事件，實際 ${Object.keys(eventCopy).length}`);
if (Object.keys(actionScenes).length !== 12) throw new Error(`預期 12 組工作演出，實際 ${Object.keys(actionScenes).length}`);
const playerText = JSON.stringify({ actionScenes, eventCopy });
for (const forbidden of ['作者條件：', '產物：', '狀態：', '後續：']) {
  if (playerText.includes(forbidden)) throw new Error(`玩家文字含內部欄位：${forbidden}`);
}

const generated = `// Generated from docs/canonical/case-01-narrative-draft.md by scripts/build-narrative-copy.mjs.\n// Do not hand-edit: the canonical draft is the reviewed source of player-facing prose.\nexport const ACTION_SCENES = Object.freeze(${JSON.stringify(actionScenes, null, 2)});\n\nexport const EVENT_COPY = Object.freeze(${JSON.stringify(eventCopy, null, 2)});\n`;
fs.writeFileSync(outputPath, generated, 'utf8');
console.log(`wrote ${path.relative(ROOT, outputPath)}: ${Object.keys(actionScenes).length} actions, ${Object.keys(eventCopy).length} events`);
