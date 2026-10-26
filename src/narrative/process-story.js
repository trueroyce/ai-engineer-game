const scene = (player, response, followUp) => Object.freeze({ player, response, followUp });

// Every event owns its causal process.  Do not infer meaning from an A/B/C suffix:
// several B/C events are useful outcomes and several "successful" actions preserve gaps.
const EVENT_PROCESS = Object.freeze({
  'A01-A': scene(
    '你沒有先喊「做個待辦」。你問：「完成是保留還是消失？重新整理後要在嗎？兩筆同名時刪除哪一筆？」',
    'Claude 把問題排成可回答清單。客戶回覆：完成可取消、刪除只動一筆、同一瀏覽器重開仍要保留。',
    '你逐句回讀答案，請客戶確認；需求終於從「你懂的」升級成「大家懂同一件事」。',
  ),
  'A01-B': scene(
    '你問：「想要怎樣的生命週期與體驗？」這句很專業，也很像在問霧想住哪一區。',
    'Claude 產出一份術語完整的草稿，客戶只說「很專業」，沒有回答保存與完成的差別。',
    '你把未回答問題留下，沒有把點頭表情翻譯成驗收答案。下次可以用更具體的操作重新問。',
  ),
  'A01-C': scene(
    '你問客戶什麼最重要，得到「打開會覺得很好用」。你再追保存，至少聽到「明天最好還在」。',
    'Claude 只把保存線索寫成假設，沒有替客戶補上完成、取消完成與刪除規則。',
    '你保留那幾個問號；需求比剛才前進半步，但還不夠拿去宣誓就職。',
  ),
  'A01-D': scene(
    '你一口氣問功能邊界，客戶靈感大爆發：「登入、同事共用、主管報表，再加一點 AI？」',
    'Claude 把新願望放進待協商區，而不是把它們混進本案的六項功能；原需求仍沒有因此變清楚。',
    '你說明新增願望要另談成本與期限。帳篷先收起來，問號仍留在原位等真正答案。',
  ),
  'A02-A': scene(
    '你要求把「終態可逆」改成人能操作的句子，並把沒有答案的地方明寫成待確認。',
    'Claude 寫成「完成後仍顯示，再點可取消完成」，保存問題則誠實留白。',
    '你用 /diff 核對原意；文件變好讀，但沒有冒充已被客戶確認。',
  ),
  'A02-B': scene(
    '你叫 Claude 把草稿翻成人話，卻沒有先指出那條「完成即移除」其實只是猜測。',
    'Claude 忠實翻譯出一句很清楚的錯話：「完成後系統會刪除。」數位火葬場取得正式文案。',
    '你在文件裡標出錯誤假設，沒有宣稱程式已經有同一個缺陷；現在需要訂正文稿。',
  ),
  'A02-C': scene(
    '你要求少一點術語，沒有要求補上可觀察行為。',
    'Claude 把「持久化認知閉環」換成「長期保留互動閉環」，省了難字，沒省下困惑。',
    '你確認歧義仍在，沒有因句子變短就發 XP 給保存功能。',
  ),
  'A03-A': scene(
    '你把本次交付與未來願望分開，請客戶只確認單頁、本機、單人是否足夠。',
    '客戶同意登入、多人與主管報表先停車；Claude 把延後項目寫成非承諾。',
    '你回讀邊界，讓「以後」真的不是今天晚上十一點五十九分。',
  ),
  'A03-B': scene(
    '你提出縮案，客戶說還要問主管。主管沒有出現，只有冷氣很有領導力地運轉。',
    'Claude 沒有替缺席者決定，也沒有偷偷新增登入或報表。協商原地待命。',
    '你記錄等待回覆；沒有進展也比虛構同意可靠。',
  ),
  'A03-C': scene(
    '你把「像某產品一樣」拆成字體、留白與單頁結構，逐項問哪些只是外觀參考。',
    '客戶確認只要乾淨，不要複製整套設計系統；六項功能範圍維持不變。',
    '你刪掉十二頁外觀願景，保留可驗收功能。這次縮的是範圍，不是字級。',
  ),
  'A04-A': scene(
    '你把新增、完成、取消完成、單筆刪除、重新整理與重開寫成操作步驟。',
    'Claude 用「買牛奶」跑過每句規格的可讀性檢查，客戶逐條確認。',
    '你標記文件已確認，同時提醒：文字通過不是功能通過，牛奶目前仍只活在文件裡。',
  ),
  'A04-B': scene(
    '你整理驗收條件時，把「不用登入」誤寫成「所有訪客共用一份清單」。',
    'Claude 的 /diff 讓這個宇宙共用待辦在確認前現形；客戶沒有同意。',
    '你留下待訂正標記，拒絕讓錯誤文件穿著「已確認」制服混進實作。',
  ),
  'A04-C': scene(
    '你把現有答案整理得很漂亮，但檢查後仍有一段無法確認：可能是尚待回答，也可能是既有誤解還沒訂正。',
    'Claude 把待處理標記保留下來，沒有把空白或錯誤欄位自動補成「大概可以」。',
    '你留下明確的文件缺口；它沒有冒充已確認，也還不能拿去當正式交付依據。',
  ),
  'A05-A': scene(
    '你指定只做新增、完成與單筆刪除的互動核心，先不碰保存。',
    'Claude 做出可操作核心：兩筆同名仍能分別處理；它也明說重新整理會失憶。',
    '你實際操作核心並把保存缺口寫在結果旁。這個原型能證明手感，還不能正式交付。',
  ),
  'A05-B': scene(
    '你要求一個最小原型，但沒有先約定畫面更新要怎麼驗。',
    'Claude 的資料層說新增成功，畫面沒有跟上。主控台兩票贊成，客戶的一雙眼睛否決。',
    '你留下「畫面未更新」的可重現問題；沒有把它嫁禍給尚未實作的保存。',
  ),
  'A05-C': scene(
    '你說「先做個能看的」，CSS 聽見召喚，比功能早半小時到公司。',
    'Claude 交出陰影、圓角與標語，新增按鈕仍像辦公室盆栽，只負責存在。',
    '你把成果標成外觀展示，沒有把漂亮畫面寫成可用原型。',
  ),
  'A06-A': scene(
    '你讓客戶操作原型，具體問：「完成後留著嗎？重新整理後呢？」',
    '客戶確認完成項應保留；畫面一重新整理就清空，保存缺口也當場現形。',
    '你把客戶答案寫回需求，把實際觀察寫進缺口；回答與證據各坐各的位子。',
  ),
  'A06-B': scene(
    '你用可操作畫面分開問功能與外觀，不再用一句「這樣可以嗎」把兩者綁架。',
    '客戶確認完成要保留、刪除要獨立；按鈕位置則留待以後。',
    '你把核心需求標清楚，外觀未決不再阻擋驗收。',
  ),
  'A06-C': scene(
    '客戶看到畫面後問手機能不能同步。你先確認這是新願望，不是原本的本機保存。',
    'Claude 將同步放進待協商區，沒有替所有裝置建立一個免費的共同大腦。',
    '你保留原六項需求，提醒後續若接受同步要另算範圍。',
  ),
  'A07-A': scene(
    '你鎖定「{target}」，列出本次會改的部分與重驗範圍。',
    'Claude 完成指定範圍：{targetOutcome}',
    '你檢查 diff，將受影響舊證據標成待重驗。功能完成不代表驗證也自動續約。',
  ),
  'A07-B': scene(
    '你要求處理「{target}」，但仍有一條含糊規則沒有釐清。',
    'Claude 依現有文件完成指定範圍；完成切換的相鄰行為出現缺陷，其他沒碰的功能沒有被宣告歸零。',
    '你記下真正受影響的完成操作，沒有把無關的保存或刪除一起判死刑。',
  ),
  'A07-C': scene(
    '你處理「{target}」時順手碰到單筆刪除的邊界；本次是否真的操作兩筆同名項目，決定你能知道多少。',
    'Claude 完成指定範圍，但改動碰到相鄰的刪除邊界；目前只能確定它需要檢查。',
    '你只失效受影響證據，不把尚未操作的風險寫成已知缺陷。',
  ),
  'A08-A': scene(
    '你按順序操作新增、完成、重新整理、取消完成、重開與單筆刪除，不讓按鈕只接受拍照。',
    'Claude 執行相同檢查並留下現行版本證據；每個通過都對應實際操作。',
    '你只為本版真正通過的項目蓋章，舊版綠燈沒有來代班。',
  ),
  'A08-B': scene(
    '你先測核心操作，再重新整理與重開；前半段很順，後半段突然像第一次見面。',
    'Claude 記錄核心通過、保存失敗或未完成，沒有把四項綠燈平均成「大致全綠」。',
    '你建立保存缺口，保留核心證據；接下來可處理保存，而不是重寫整個宇宙。',
  ),
  'A08-C': scene(
    '你要求完整檢查，但目前成果並沒有讓每個步驟都能上場。',
    'Claude 分開通過、失敗與未執行。終端機沒有替缺席項目鼓掌。',
    '你保留未測狀態，拒絕把「這次沒跑」翻譯成「應該沒事」。',
  ),
  'A09-A': scene(
    '你要求另一雙眼睛逐項找可重現問題，並真的拿兩筆同名待辦操作。',
    '審查發現刪除靠文字找目標；刪第二筆時第一筆也消失，缺陷終於從可能性變成證據。',
    '你記錄單筆刪除失敗與重現步驟，沒有擴大聲稱其他功能也壞了。',
  ),
  'A09-B': scene(
    '審查懷疑完成狀態沒保存，你沒有直接相信，照建議步驟重開驗證。',
    '狀態好好留著；推測未重現。Claude 沒為了尊重審查而把正常功能改壞。',
    '你把意見標成不適用，現有保存證據維持原判。',
  ),
  'A09-C': scene(
    '你要求檢查高風險行為，但這輪只找到兩個令人想起凌晨三點的變數名稱。',
    'Claude 把它們列成維護建議，沒有冒充阻擋交付的功能缺陷。',
    '你保留審查範圍與限制；沒找到大洞不等於自動取得操作證據。',
  ),
  'A10-A': scene(
    '你先用 /context 查看脈絡，再指定保留已確認需求、現況、問題與下一步。',
    'Claude 用 /compact 做出新摘要版本，待協商願望與問號仍在，沒有被字數限制吞掉。',
    '你核對摘要來源；桌面清了，功能與證據沒有因此改變。',
  ),
  'A10-B': scene(
    '你要求縮短對話，卻沒列出「準備做」與「已完成」必須分開。',
    'Claude 的摘要把保存準備工作寫成保存已完成；這是摘要錯，不是程式突然長出功能。',
    '你標記摘要需訂正，保持實作與證據原狀。',
  ),
  'A10-C': scene(
    '你只執行 /compact，把長對話縮成一頁，沒有修改任何需求、程式或測試。',
    'Claude 產生新的摘要版本；保存缺口依然原封不動，沒有因句子變短而變小。',
    '你記下摘要版本前進一次，功能、證據與 XP 都不動。',
  ),
  'A11-A': scene(
    '你鎖定已知問題，要求最小修正、重現原案例並重驗受影響項目。',
    'Claude 讓每筆待辦使用獨立識別；刪第二筆時第一筆終於不用陪葬。',
    '你重跑相鄰操作，將修復與現行證據一起記錄。',
  ),
  'A11-B': scene(
    '你修正刪除識別，卻沒有先檢查完成狀態是否共用同一套新識別。',
    'Claude 補好錯刪，完成狀態的保存卻在相鄰處咳嗽；一個洞補上，旁邊探頭。',
    '你只失效完成與保存相關證據，建立新的相鄰問題等待處理。',
  ),
  'A11-C': scene(
    '你選擇回到最近 checkpoint，明確說只回復程式與功能狀態。',
    'Claude 恢復當時的成果快照，再建立新的版本；時間、Token、承諾與人生閱歷一概不退款。',
    '你將回復後的證據標成待重驗，接下來可重新做工作，但不能重領舊里程碑。',
  ),
});

const targetLabel = (target) => ({ core: '新增、完成與刪除', persistence: '保存與重新開啟', delete: '單筆刪除' }[target] ?? '目前範圍');
const clarityLabel = (value) => ({ unknown: '仍待具體回答', ambiguous: '已有線索但仍有歧義', fuzzy: '已有線索但仍有歧義', clear: '已能驗收' }[value] ?? '未改變');
const scopeLabel = (value) => ({ bounded: '邊界已確認', pending_change: '有新願望待協商', unknown: '邊界仍待確認' }[value] ?? '未改變');

function fill(text, options) {
  const targetOutcome = ({
    core: '新增、完成與取消完成被接成可操作核心，沒有冒充已完成保存。',
    persistence: '保存被接到既有可操作核心上，重新整理與重開現在有實作可驗。',
    delete: '單筆刪除路徑被獨立完成，其他核心與保存範圍沒有被冒稱一起完成。',
  }[options?.target] ?? '選定範圍完成，其他範圍維持原狀。');
  return text.replaceAll('{target}', targetLabel(options?.target)).replaceAll('{targetOutcome}', targetOutcome);
}

function describeStateChange(before, after) {
  if (!before || !after) return '';
  const changes = [];
  if (before.requirement?.clarity !== after.requirement?.clarity) changes.push(`需求由「${clarityLabel(before.requirement?.clarity)}」變成「${clarityLabel(after.requirement?.clarity)}」`);
  if (before.requirement?.scope !== after.requirement?.scope) changes.push(`範圍由「${scopeLabel(before.requirement?.scope)}」變成「${scopeLabel(after.requirement?.scope)}」`);
  if (before.artifact?.revision !== after.artifact?.revision) changes.push(`成果進入新版本 ${after.artifact?.revision}`);
  const beforeIssues = before.knownIssues?.filter((issue) => issue.status !== 'fixed').length ?? 0;
  const afterIssues = after.knownIssues?.filter((issue) => issue.status !== 'fixed').length ?? 0;
  if (beforeIssues !== afterIssues) changes.push(`玩家已知的待修問題由 ${beforeIssues} 個變成 ${afterIssues} 個`);
  const passCount = (state) => Object.values(state.evidence ?? {}).filter((item) => item.result === 'pass' && item.artifactRevision === state.artifact?.revision).length;
  if (passCount(before) !== passCount(after)) changes.push(`現行通過證據由 ${passCount(before)} 項變成 ${passCount(after)} 項`);
  return changes.length ? `你在案件面板看見：${changes.join('；')}。` : '案件面板沒有假裝長出新進度；這次留下的是如實的工作紀錄。';
}

export function buildProcess({ event, options = {}, stateBefore, stateAfter }) {
  const copy = EVENT_PROCESS[event.id];
  if (!copy) throw new Error(`缺少事件過程語意：${event.id}`);
  let player = fill(copy.player, options);
  let response = fill(copy.response, options);
  let followUp = fill(copy.followUp, options);
  if (event.id === 'A06-A') {
    const persistenceReady = ['R4', 'R5'].every((id) => stateBefore?.functionState?.[id] === 'correct');
    if (persistenceReady) {
      response = '你當場關掉再開。重新開啟後資料還在；客戶確認完成項應保留，保存行為也符合這次示範。';
      followUp = '你把這個實際觀察寫回需求；驗收證據仍標待重驗，不把客戶示範升格成正式驗收。';
    } else {
      response = '你當場關掉再開。重新開啟後清單是空的；客戶確認完成項應保留，保存缺口也當場現形。';
      followUp = '你把「重新開啟後仍要保留」寫成明確需求；驗收證據仍標待重驗，不把客戶示範升格成正式驗收。';
    }
  }
  if (event.id.startsWith('A11-') && event.id !== 'A11-C') {
    const beforeOpen = stateBefore?.knownIssues?.filter((issue) => issue.status !== 'fixed') ?? [];
    const afterOpen = stateAfter?.knownIssues?.filter((issue) => issue.status !== 'fixed') ?? [];
    const attempted = beforeOpen[0];
    const attemptedText = attempted?.text ?? '目前面板上的第一個已確認問題';
    const stillOpen = attempted && afterOpen.some((issue) => issue.code === attempted.code);
    const newIssue = afterOpen.find((issue) => !beforeOpen.some((before) => before.code === issue.code));
    const closedIssues = beforeOpen.filter((issue) => !afterOpen.some((after) => after.code === issue.code));
    player = `你優先處理「${attemptedText}」，先重現，再要求最小修正；回歸後必須逐項列出本次實際關閉的公開問題。`;
    if (event.id === 'A11-A') {
      const closedText = closedIssues.length
        ? closedIssues.map((issue) => `「${issue.text}」`).join('、')
        : '沒有公開問題被列為已關閉';
      response = `Claude 完成本次修訂；回歸後實際關閉 ${closedIssues.length} 個公開問題：${closedText}。`;
      followUp = '你保存本次實際關閉的公開問題清單，也保留這次新產生的現行通過證據；其他通過檢查不會被倒推成先前已知缺陷。';
    } else {
      const attemptedOutcome = stillOpen ? `「${attemptedText}」仍未解決` : `「${attemptedText}」已處理`;
      const neighborOutcome = newIssue
        ? `；回歸同時新增了另一個已確認問題：「${newIssue.text}」`
        : '；回歸後仍有已確認問題留在清單';
      response = `這次改動確實執行了，但${attemptedOutcome}${neighborOutcome}。`;
      followUp = `${options.repairDraft ? '這是新的付費嘗試，不是上次結果重播；' : ''}本次回歸仍然失敗。你保存這次紀錄，沒有因為按了修復就把紅燈塗成綠色。`;
    }
  }
  if (event.id === 'A07-C') {
    if (options.checkDelete) {
      response = `${response} 你實際用兩筆同名項目操作，畫面確認刪除認錯了人。`;
      followUp = '你把已重現的錯刪列為已知問題，並保留真正的操作步驟。';
    } else {
      response = `${response} 這輪沒有操作兩筆同名項目，因此不能知道刪除是否真的有缺陷。`;
      followUp = '你把刪除標成待檢查；尚未觀察到的事，不提前寫進缺陷名冊。';
    }
  }
  const notes = [];
  if (options.useC2) notes.push('你啟用快速原型，省下成本，也接受較高的返工風險。');
  if (options.useC3) notes.push('你加做交叉檢查，用額外 Token 換取更完整的審查視野。');
  if (options.checkDelete) notes.push('你確實用兩筆同名項目檢查單筆刪除，而不是只勾一個選項就算測過。');
  const repeatedFailureIds = new Set(['A01-B', 'A01-C', 'A01-D', 'A04-B', 'A04-C', 'A06-C', 'A10-B']);
  if ((options.repairDraft || options.newRevision) && repeatedFailureIds.has(event.id)) {
    followUp = `${followUp} 這是新的付費嘗試，不是舊結果重播；這次仍然沒有解決原本的缺口。`;
  }
  return {
    player,
    response,
    followUp: `${followUp}${notes.length ? ` ${notes.join(' ')}` : ''}`,
    consequence: `${event.story}\n\n${describeStateChange(stateBefore, stateAfter)}`,
  };
}

export const PROCESS_ACTION_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`));
export const PROCESS_EVENT_IDS = Object.freeze(Object.keys(EVENT_PROCESS));
