const IMPLEMENTATION = Object.freeze({
  core: Object.freeze({ id: 'implementation-core', title: '核心先站穩，順便先排隊', text: '你把新增、完成與取消守在核心範圍；沒有把「順便」當免費，也沒有把未承諾功能寫成已交付。' }),
  delete: Object.freeze({ id: 'implementation-delete', title: '刪除鍵繫上安全帶', text: '你只改動刪除路徑並保留受影響證據；沒有順手重寫保存與核心操作，後續驗證也知道該看哪裡。' }),
  persistence: Object.freeze({ id: 'implementation-persistence', title: '資料留下來，責任也留下來', text: '你選擇保存與重開路線，並讓相應證據跟著版本前進；這個選擇在結案時仍可追溯。' }),
});

const IMPLEMENTATION_SCAR = Object.freeze({
  title: '功能送進去，兩個坑跟著搬家',
  text: '你沒有把這次實作說成完成：選定範圍真的改了，但刪除與相鄰行為的風險也被帶到結案限制裡。',
});

const STORY = Object.freeze({
  steady: Object.freeze({
    id: 'route-steady',
    title: '先穩住，再讓明天有得改',
    resolved: '你選擇鎖住已驗證範圍，後來的承諾追問也用紀錄接住；沒有多炫，但沒有把今天的成功拿去賭明天。',
    unresolved: '你選擇鎖住已驗證範圍；這份承諾仍會在後續追問中回來，結案沒有假裝它已經消失。',
    legacy: '你選擇鎖住已驗證範圍；後續承諾仍由紀錄接住，不會在結案時被假裝成已經消失。',
  }),
  expand: Object.freeze({
    id: 'route-expand',
    title: '順手多做一點，差點順手多做一案',
    resolved: '你曾把成功拿去擴張，後來也真的付成本收回或補驗；結局記得這次貪心，不把它藏在漂亮成果後面。',
    unresolved: '你把成功拿去追加範圍，但新增承諾尚未完整收尾；主要交付結果不會替這筆風險美化。',
    legacy: '你把成功拿去追加範圍；新增承諾與驗證成本仍留在結案紀錄裡。',
  }),
  prototype: Object.freeze({
    id: 'route-prototype',
    title: '先做能丟的，才沒把正式版一起丟掉',
    resolved: '你用原型換到理解，再把原型留下的承諾邊界處理完；它幫忙學習，沒有冒充正式交付。',
    unresolved: '你用原型換到理解，但原型造成的承諾邊界仍待處理；結局把這個限制留在檯面上。',
    legacy: '你用原型換到理解；原型造成的承諾邊界仍留在檯面上，不會冒充正式交付。',
  }),
  trim: Object.freeze({
    id: 'route-trim',
    title: '砍的是範圍，不是事實',
    resolved: '你把失敗轉成可核准的小範圍，後續也依新邊界補齊證據；少做一些，但每一項都說得清楚。',
    unresolved: '你縮小範圍救回可交付核心，但新的邊界還需要後續確認；結局不把有限版叫成完整版。',
    legacy: '你縮小範圍救回可交付核心；新的邊界與待確認工作仍誠實保留。',
  }),
  force: Object.freeze({
    id: 'route-force',
    title: '硬做有做完，技術債也有打卡',
    resolved: '你曾選擇硬做，後來也付出修補與驗證成本；債沒有靠一句「先上再說」自動蒸發。',
    unresolved: '你選擇硬做留下公開風險；即使主流程能跑，這筆未解問題仍會跟著交付說明。',
    legacy: '你選擇硬做；即使主流程能跑，修補與驗證責任仍會跟著交付說明。',
  }),
});

const SUPPORTING = Object.freeze({
  recovered: Object.freeze({ id: 'recovered', title: '從火場帶著測試報告走出來', text: '你真的遇過問題、修過問題，也重新驗證過；這不是沒摔倒，是摔倒後把坑畫進地圖。' }),
  'high-stress': Object.freeze({ id: 'high-stress', title: '案子活了，你沒了', text: '交付成功，但你的壓力表看起來像準備申請獨立戶籍。' }),
  'on-time': Object.freeze({ id: 'on-time', title: '準時下班的都市傳說', text: '你在期限前交出能說明、能驗證的成果；同業群組暫時不相信這是真的。' }),
  'token-rich': Object.freeze({ id: 'token-rich', title: 'Token 守財奴', text: '成果是真的，剩下的 Token 也是真的；你沒有把省下來的額度誤認成完成度。' }),
  'token-gravekeeper': Object.freeze({ id: 'token-gravekeeper', title: '額度的守墓人', text: 'Token 留得很漂亮，可惜工作沒有跟著完成；額度全身而退，案件沒有。' }),
});

const copy = (facet) => facet ? { id: facet.id, title: facet.title, text: facet.text } : null;

export function implementationEndingFacet(target, failed = false) {
  if (!IMPLEMENTATION[target]) return null;
  return failed
    ? { id: `implementation-${target}-scar`, ...IMPLEMENTATION_SCAR }
    : copy(IMPLEMENTATION[target]);
}

export function storyEndingFacet(route, resolved) {
  const facet = STORY[route];
  if (!facet) return null;
  return { id: facet.id, title: facet.title, text: resolved ? facet.resolved : facet.unresolved };
}

export function supportingEndingFacet(id) {
  return copy(SUPPORTING[id]);
}

export function legacyEndingFacet(id) {
  const implementation = Object.values(IMPLEMENTATION).find((facet) => facet.id === id);
  if (implementation) return copy(implementation);
  const scarTarget = /^implementation-(core|delete|persistence)-scar$/.exec(id)?.[1];
  if (scarTarget) return implementationEndingFacet(scarTarget, true);
  const story = Object.values(STORY).find((facet) => facet.id === id);
  if (story) return { id: story.id, title: story.title, text: story.legacy };
  return supportingEndingFacet(id);
}
