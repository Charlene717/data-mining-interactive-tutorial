/* Data Mining 互動考題 · Engine
 * Vanilla JS, no external libraries.
 * Reads window.QUIZ_DATA (flat array) and window.QUIZ_CHAPTERS (chapter metadata).
 *
 * Question format:
 *   { ch, type:'single'|'multi'|'tf',
 *     stem_zh, stem_en,
 *     options_zh:[..], options_en:[..],   // single/multi
 *     answer: int | int[] | 0|1,           // tf: 0=False, 1=True
 *     exp_zh, exp_en }
 *
 * localStorage keys (per profile):
 *   dmquiz_profiles_v1, dmquiz_active_v1, dmquiz_lang
 *   dmquiz_progress_v1_{profile}   // {ch: {qIdx: answer}}
 *   dmquiz_marks_v1_{profile}      // {ch: {qIdx: true}}
 *   dmquiz_wrong_v1_{profile}      // {ch: {qIdx: true}}   tracks history of any wrong answer
 *   dmquiz_shuffle_v1_{profile}    // {ch: [order...]}
 *   dmquiz_exam_v1_{profile}       // {ch: {tentative:{qIdx:ans}, startedAt}, full:{...}}
 */
(function(){
  'use strict';

  if(!window.QUIZ_DATA || !window.QUIZ_CHAPTERS){
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#c92a2a">⚠️ 找不到題庫檔 quiz-data.js</div>';
    return;
  }
  const DATA = window.QUIZ_DATA;
  const CHAPTERS = window.QUIZ_CHAPTERS;

  // Build chapter index → ordered question indices (within DATA)
  const QBY_CH = {};
  CHAPTERS.forEach(c=>QBY_CH[c.id]=[]);
  DATA.forEach((q,i)=>{ if(QBY_CH[q.ch]) QBY_CH[q.ch].push(i); });

  /* ===================== i18n ===================== */
  const LANG_KEY = 'dmquiz_lang';
  let lang = localStorage.getItem(LANG_KEY) || 'en';
  const STR = {
    appTitle:        {zh:"資料探勘考題", en:"Data Mining Quiz"},
    defaultUser:     {zh:"預設使用者", en:"Default user"},
    answeredOf:      {zh:(a,t)=>'已答 <strong>'+a+'</strong> / '+t, en:(a,t)=>'Answered <strong>'+a+'</strong> / '+t},
    notStarted:      {zh:"尚未開始作答", en:"Not started"},
    progressLine:    {zh:(a,t,c)=>a+'/'+t+' · 答對 '+c+' · 正確率 '+(a?Math.round(c/a*100):0)+'%', en:(a,t,c)=>a+'/'+t+' · Correct '+c+' · '+(a?Math.round(c/a*100):0)+'%'},
    examOngoing:     {zh:(n,t)=>'📋 考試進行中 '+n+'/'+t, en:(n,t)=>'📋 Exam in progress '+n+'/'+t},
    chapterDone:     {zh:(c,t)=>'✓ 已完成 · 對 '+c+'/'+t, en:(c,t)=>'✓ Completed · '+c+'/'+t+' correct'},
    practicing:      {zh:(a,t,c)=>'📝 練習中 '+a+'/'+t+' · 對 '+c, en:(a,t,c)=>'📝 Practicing '+a+'/'+t+' · '+c+' correct'},
    notAnswered:     {zh:"尚未作答", en:"Not answered"},
    qCount:          {zh:n=>'('+n+' 題)', en:n=>'('+n+' Q)'},
    practiceMode:    {zh:"📝 練習模式", en:"📝 Practice Mode"},
    examMode:        {zh:"📋 考試模式", en:"📋 Exam Mode"},
    chooseAnswer:    {zh:"請先選擇答案", en:"Please select an answer first"},
    submitAnswer:    {zh:"📤 送出答案", en:"📤 Submit Answer"},
    clearChoice:     {zh:"清除選擇", en:"Clear"},
    multiHint:       {zh:n=>'已勾選 '+n+' 個（多選題請勾選所有正確選項）', en:n=>n+' selected (select all correct options)'},
    tfHint:          {zh:"選擇後點「送出答案」鎖定本題", en:'Click "Submit Answer" after choosing to lock this question'},
    singleHint:      {zh:"選擇後點「送出答案」鎖定本題", en:'Click "Submit Answer" after choosing to lock this question'},
    examHintBanner:  {zh:'📋 <strong>考試模式</strong>：可隨時修改答案，全部答完後請點側邊欄或最後一題的「<strong>交卷查看結果</strong>」按鈕。', en:'📋 <strong>Exam Mode</strong>: you may change your answers anytime. When done, click "<strong>Submit & See Results</strong>" in the sidebar or on the last question.'},
    correct:         {zh:"✓ 答對", en:"✓ Correct"},
    incorrect:       {zh:"✗ 答錯", en:"✗ Incorrect"},
    correctAnswer:   {zh:"正解：", en:"Answer: "},
    yourAnswer:      {zh:" · 你的答案：", en:" · Your answer: "},
    noExp:           {zh:"（此題未附解析）", en:"(No explanation provided)"},
    qNum:            {zh:(i,n)=>'第 '+i+' 題 / '+n, en:(i,n)=>'Q '+i+' / '+n},
    typeSingle:      {zh:"單選", en:"Single"},
    typeMulti:       {zh:"多選", en:"Multi"},
    typeTF:          {zh:"是非", en:"T/F"},
    markBtn:         {zh:"🔖 標記", en:"🔖 Mark"},
    markedBtn:       {zh:"🔖 已標記", en:"🔖 Marked"},
    prev:            {zh:"← 上一題", en:"← Previous"},
    next:            {zh:"下一題 →", en:"Next →"},
    redo:            {zh:"↺ 重做本題", en:"↺ Redo"},
    submitExamSidebarN:{zh:(a,t)=>'📋 交卷查看結果（已答 '+a+'/'+t+'）', en:(a,t)=>'📋 Submit & See Results ('+a+'/'+t+')'},
    submitExamInline:{zh:"📋 交卷查看結果", en:"📋 Submit & See Results"},
    sbTotalExam:     {zh:(a,t)=>'📋 已作答 '+a+'/'+t, en:(a,t)=>'📋 Answered '+a+'/'+t},
    sbTotal:         {zh:(t,a,c)=>'題號（共 '+t+' 題）· 已答 '+a+(a?' · 對 '+c:''), en:(t,a,c)=>'Questions (total '+t+') · Answered '+a+(a?' · '+c+' correct':'')},
    legendCorrect:   {zh:"答對", en:"Correct"},
    legendWrong:     {zh:"答錯", en:"Wrong"},
    legendAnswered:  {zh:"已作答", en:"Answered"},
    legendMarked:    {zh:"已標記", en:"Marked"},
    summaryTitle:    {zh:"📊 本卷總結", en:"📊 Quiz Summary"},
    examResultTitle: {zh:"📋 考試結果", en:"📋 Exam Result"},
    examSubmittedPill:{zh:"📋 考試已交卷", en:"📋 Exam Submitted"},
    examModePill:    {zh:"📋 考試模式", en:"📋 Exam Mode"},
    practicePill:    {zh:"📝 練習模式", en:"📝 Practice Mode"},
    retryPill:       {zh:"🎲 重答", en:"🎲 Retry"},
    points:          {zh:" 分", en:" pts"},
    qTotal:          {zh:"總題數", en:"Total"},
    correctN:        {zh:"答對", en:"Correct"},
    wrongN:          {zh:"答錯", en:"Wrong"},
    unansN:          {zh:"未作答", en:"Unanswered"},
    markedN:         {zh:"已標記", en:"Marked"},
    wrongList:       {zh:"錯題清單（點選跳到該題）", en:"Wrong questions (click to jump)"},
    backToQuiz:      {zh:"← 返回作答", en:"← Back to quiz"},
    backHomeBtn:     {zh:"回首頁", en:"Home"},
    exportThisQuiz:  {zh:"📤 匯出本卷", en:"📤 Export this quiz"},
    youLabel:        {zh:"你：", en:"You: "},
    answerLabel:     {zh:"正解：", en:"Answer: "},
    chooseFile:      {zh:"請先選擇 JSON 檔案", en:"Please select a JSON file first"},
    readFail:        {zh:"讀檔失敗", en:"Failed to read file"},
    pasteEmpty:      {zh:"貼上區是空的", en:"Paste area is empty"},
    parseFail:       {zh:e=>'⚠️ JSON 解析失敗：'+e, en:e=>'⚠️ JSON parse failed: '+e},
    notRecognised:   {zh:"此 JSON 不像是本系統匯出的備份，是否仍嘗試匯入？", en:"This JSON doesn't look like a backup from this system. Import anyway?"},
    importDone:      {zh:"✓ 已匯入完成", en:"✓ Import complete"},
    nothingToPick:   {zh:"沒有可抽取的題目", en:"No questions to pick"},
    noWrong:         {zh:"目前沒有錯題～", en:"No wrong questions yet"},
    noMarked:        {zh:"目前沒有標記題～", en:"No marked questions yet"},
    confirmReset:    {zh:n=>'確定要清除「'+n+'」的所有作答記錄？\n（包含考試進行中的暫存）', en:n=>'Clear all answers for "'+n+'" ?\n(Including ongoing exam drafts)'},
    confirmClearMk:  {zh:"確定要清除所有 🔖 標記？", en:"Clear all 🔖 marks?"},
    confirmDelUser:  {zh:n=>'確定要刪除使用者「'+n+'」？相關進度也會一併移除。', en:n=>'Delete user "'+n+'" ? All progress will be removed.'},
    confirmResetSec: {zh:"確定要重置本卷的所有作答？", en:"Reset all answers for this quiz?"},
    confirmResetExam:{zh:"確定要重置本卷考試？將清空所有作答。", en:"Reset this exam? All answers will be cleared."},
    confirmEnterExamCleansec:{zh:n=>'進入考試模式將清除本章節現有的 '+n+' 題作答記錄，是否繼續？', en:n=>'Entering Exam Mode will clear '+n+' existing answers for this section. Continue?'},
    confirmContExam: {zh:n=>'此章節有未交卷的考試（已作答 '+n+'）。\n\n按確定繼續未完成的考試；按取消放棄並重新開始。', en:n=>'There is an unsubmitted exam for this section ('+n+' answered).\n\nOK to resume; Cancel to abandon and restart.'},
    confirmRestartExam:{zh:"確定要重新開始考試？", en:"Restart the exam?"},
    confirmEnterPracticeFromExam:{zh:n=>'此章節有未交卷的考試（已作答 '+n+'）。\n\n進入練習模式會放棄考試進度，是否繼續？', en:n=>'There is an unsubmitted exam for this section ('+n+' answered).\n\nEntering Practice Mode will discard the exam. Continue?'},
    confirmSubmitExam:{zh:(t,a,u)=>'確定要交卷？\n\n本卷共 '+t+' 題，已作答 '+a+' 題（'+u+' 題未答將計為錯）。\n交卷後將顯示成績與每題對錯。', en:(t,a,u)=>'Submit your exam?\n\nTotal '+t+' questions, '+a+' answered ('+u+' unanswered will count as wrong).\nAfter submission you will see your score and per-question results.'},
    toastResetDone:  {zh:"已重置作答", en:"Answers reset"},
    toastClearMk:    {zh:"已清除標記", en:"Marks cleared"},
    toastSwitched:   {zh:n=>'已切換到 '+n, en:n=>'Switched to '+n},
    toastCreated:    {zh:n=>'已建立並切換到 '+n, en:n=>'Created and switched to '+n},
    toastShuffled:   {zh:"已切換為隨機順序", en:"Order shuffled"},
    toastUnshuffled: {zh:"已恢復原始順序", en:"Original order restored"},
    toastNoExam:     {zh:"找不到考試資料", en:"Exam data not found"},
    toastEnterName:  {zh:"請輸入名字", en:"Please enter a name"},
    toastExpJSON:    {zh:"已匯出 JSON 進度", en:"JSON progress exported"},
    toastExpScore:   {zh:"已匯出 HTML 成績單", en:"HTML score sheet exported"},
    toastExpErrata:  {zh:"已匯出 HTML 錯題講義", en:"HTML errata sheet exported"},
    toastCorrect:    {zh:"✓ 答對", en:"✓ Correct"},
    rangeAll:        {zh:"全部 20 章", en:"All 20 chapters"},
    rangeUserLabel:  {zh:"使用者：", en:"User: "},
    rangeScopeLabel: {zh:" · 範圍：", en:" · Scope: "},
    importThisRange: {zh:"📥 僅匯入本範圍", en:"📥 Import this scope only"},
    importThisRangeBig:{zh:"📥 僅匯入有資料的章節", en:"📥 Import chapters with data only"},
    importAll:       {zh:"📥 完整還原", en:"📥 Full restore"},
    importJsonRestore:{zh:"📥 匯入 JSON 還原", en:"📥 Import JSON to restore"},
    expHeaderQuiz:   {zh:"📤 匯入 / 匯出本卷", en:"📤 Import / Export this quiz"},
    expHeaderAll:    {zh:"📤 匯入 / 匯出全部", en:"📤 Import / Export all"},
    rndPickerTitle:  {zh:"🎲 隨機練習", en:"🎲 Random practice"},
    wrongPickerTitle:{zh:"📝 錯題複習", en:"📝 Wrong question review"},
    markedPickerTitle:{zh:"🔖 標記題複習", en:"🔖 Marked question review"},
    fullExamTitle:   {zh:"📋 全範圍模擬考 (200 題)", en:"📋 Full Mock Exam (200 Q)"},
    poolAvail:       {zh:n=>'可用 '+n+' 題', en:n=>'Pool: '+n+' Q'},
    poolEmptyAll:    {zh:"題庫為空", en:"Question bank is empty"},
    poolEmptyWrong:  {zh:"目前沒有錯題", en:"No wrong questions"},
    poolEmptyMarked: {zh:"目前沒有標記題", en:"No marked questions"},
    titleRandomPrefix:{zh:"🎲 隨機練習", en:"🎲 Random practice"},
    titleWrongPrefix:{zh:"📝 錯題複習", en:"📝 Wrong review"},
    titleMarkedPrefix:{zh:"🔖 標記題複習", en:"🔖 Marked review"},
    titleFullExam:   {zh:"📋 全範圍模擬考", en:"📋 Full Mock Exam"},
    srcAll:          {zh:"全題", en:"All"},
    srcWrong:        {zh:"錯題", en:"Wrong"},
    srcMarked:       {zh:"標記題", en:"Marked"},
    quesUnit:        {zh:n=>'（'+n+' 題）', en:n=>'('+n+' Q)'},
    summaryHeader:   {zh:"📊 總結 · ", en:"📊 Summary · "},
    examResultHeader:{zh:"📋 考試結果 · ", en:"📋 Exam Result · "},
    summaryMode:     {zh:"總結模式", en:"Summary mode"},
    examScoreSheet:  {zh:" · 成績單", en:" · Score Sheet"},
    examErrataSheet: {zh:" · 錯題講義", en:" · Errata Sheet"},
    quizAllChapters: {zh:"資料探勘考題（全部章節）", en:"Data Mining Quiz (All Chapters)"},
    quizErrataTitle: {zh:"資料探勘考題", en:"Data Mining Quiz"},
    exportTimeLabel: {zh:" · 匯出時間：", en:" · Exported: "},
    userLabel:       {zh:"使用者：", en:"User: "},
    countWrong:      {zh:n=>' · 共 '+n+' 題錯題', en:n=>' · '+n+' wrong questions'},
    noErrataMsg:     {zh:"🎉 沒有錯題，太棒了！", en:"🎉 No wrong questions — well done!"},
    statusUnans:     {zh:"未作答", en:"Not answered"},
    statusRight:     {zh:"✓ 答對", en:"✓ Correct"},
    statusWrong:     {zh:"✗ 答錯", en:"✗ Wrong"},
    columnNum:       {zh:"#", en:"#"},
    columnType:      {zh:"類型", en:"Type"},
    columnQ:         {zh:"題目", en:"Question"},
    columnYourAns:   {zh:"你的答案", en:"Your answer"},
    columnAns:       {zh:"正解", en:"Answer"},
    columnStatus:    {zh:"狀態", en:"Status"},
    expLabelStrong:  {zh:"解析：", en:"Explanation: "},
    yourAnsErrata:   {zh:"　·　你的答案：", en:" · Your answer: "}
  };
  function L(){return lang;}
  function t(k){
    const e = STR[k]; if(!e) return k;
    const v = e[lang] != null ? e[lang] : e.zh;
    if(typeof v === 'function'){
      const args = Array.prototype.slice.call(arguments,1);
      return v.apply(null, args);
    }
    return v;
  }
  function applyLang(l){
    lang = l;
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l==='zh' ? 'zh-Hant' : 'en';
    document.querySelectorAll('[data-lang]').forEach(el=>{
      el.style.display = el.dataset.lang === l ? '' : 'none';
    });
    document.querySelectorAll('[data-zh][data-en]').forEach(el=>{
      el.textContent = el.dataset[l];
    });
    document.querySelectorAll('[data-zh-ph][data-en-ph]').forEach(el=>{
      el.placeholder = el.dataset[(l==='zh'?'zhPh':'enPh')];
    });
    const btn = document.getElementById('langToggle');
    if(btn) btn.textContent = l==='zh' ? 'EN' : '中文';
    render();
  }
  function toggleLang(){ applyLang(lang==='zh' ? 'en' : 'zh'); }

  /* per-question accessors honoring lang */
  function chName(c){ return lang==='en' ? c.en : c.zh; }
  function chById(id){ return CHAPTERS.find(c=>c.id===id); }
  function getStem(q){ return lang==='en' ? q.stem_en : q.stem_zh; }
  function getExp(q){ return lang==='en' ? q.exp_en : q.exp_zh; }
  function getOpts(q){ return lang==='en' ? q.options_en : q.options_zh; }

  /* ===================== Profiles & storage ===================== */
  const KEY_PROFILES = 'dmquiz_profiles_v1';
  const KEY_ACTIVE   = 'dmquiz_active_v1';
  function loadJSON(k, def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){ return def; } }
  function saveJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function nowISO(){ return new Date().toISOString(); }
  function genId(){ return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  let profiles = loadJSON(KEY_PROFILES, null);
  let activeId = localStorage.getItem(KEY_ACTIVE);
  if(!profiles){
    profiles = {};
    const id = genId();
    profiles[id] = { name:"預設使用者", createdAt: nowISO() };
    saveJSON(KEY_PROFILES, profiles);
    localStorage.setItem(KEY_ACTIVE, id);
    activeId = id;
  }
  if(!activeId || !profiles[activeId]){
    activeId = Object.keys(profiles)[0];
    localStorage.setItem(KEY_ACTIVE, activeId);
  }
  function pkey(base){ return base + '_' + activeId; }
  function loadActive(base, def){ return loadJSON(pkey(base), def); }
  function saveActive(base, v){ saveJSON(pkey(base), v); }

  let progress = loadActive('dmquiz_progress_v1', {});  // {ch:{qIdx:ans}}
  let marks    = loadActive('dmquiz_marks_v1', {});      // {ch:{qIdx:true}}
  let wrongHistory = loadActive('dmquiz_wrong_v1', {}); // {ch:{qIdx:true}}
  let shuffle  = loadActive('dmquiz_shuffle_v1', {});    // {ch:[order]}
  let examOngoing = loadActive('dmquiz_exam_v1', {});    // {ch:{tentative:{qIdx:ans},startedAt}}; 'full' key for full-exam state

  function reloadActiveData(){
    progress     = loadActive('dmquiz_progress_v1', {});
    marks        = loadActive('dmquiz_marks_v1', {});
    wrongHistory = loadActive('dmquiz_wrong_v1', {});
    shuffle      = loadActive('dmquiz_shuffle_v1', {});
    examOngoing  = loadActive('dmquiz_exam_v1', {});
  }

  /* ===================== Helpers ===================== */
  function escHTML(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function $(id){ return document.getElementById(id); }
  function setHidden(el,h){ el.classList.toggle('hidden', h); }
  function shuffleArr(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function eqAns(a,b){
    if(Array.isArray(a) && Array.isArray(b)){
      if(a.length!==b.length) return false;
      const sa = a.slice().sort(), sb = b.slice().sort();
      for(let i=0;i<sa.length;i++) if(sa[i]!==sb[i]) return false;
      return true;
    }
    return a===b;
  }
  function letterFor(i){ return String.fromCharCode(65+i); }  // 0→A, 1→B...
  function fmtAns(q){
    if(q.type==='multi') return Array.isArray(q.answer)?q.answer.slice().sort().map(letterFor).join('、'):'';
    if(q.type==='tf') return q.answer===1 ? (lang==='zh'?'○ 正確':'○ True') : (lang==='zh'?'✕ 錯誤':'✕ False');
    return letterFor(q.answer);
  }
  function fmtUserAns(q, ua){
    if(ua==null) return lang==='zh' ? '（未作答）' : '(no answer)';
    if(q.type==='multi') return Array.isArray(ua) ? (ua.length?ua.slice().sort().map(letterFor).join('、'):(lang==='zh'?'（未勾選）':'(none)')) : String(ua);
    if(q.type==='tf') return ua===1 ? (lang==='zh'?'○ 正確':'○ True') : (lang==='zh'?'✕ 錯誤':'✕ False');
    return letterFor(ua);
  }

  /* chapter accessors */
  function chQs(chId){ return QBY_CH[chId] || []; }   // array of indices into DATA, ordered
  function getChAns(chId){ return progress[chId] || {}; }
  function setChAns(chId, qIdx, ans){
    progress[chId] = progress[chId] || {};
    progress[chId][qIdx] = ans;
    saveActive('dmquiz_progress_v1', progress);
    // Update wrong history if a wrong answer
    const q = DATA[qIdx];
    if(!eqAns(ans, q.answer)){
      wrongHistory[chId] = wrongHistory[chId] || {};
      wrongHistory[chId][qIdx] = true;
      saveActive('dmquiz_wrong_v1', wrongHistory);
    } else {
      // correct: clear from wrong history (retry mode)
      if(wrongHistory[chId] && wrongHistory[chId][qIdx]){
        delete wrongHistory[chId][qIdx];
        if(Object.keys(wrongHistory[chId]).length===0) delete wrongHistory[chId];
        saveActive('dmquiz_wrong_v1', wrongHistory);
      }
    }
  }
  function clearChAns(chId){
    if(progress[chId]){ delete progress[chId]; saveActive('dmquiz_progress_v1', progress); }
  }
  function isMarked(chId, qIdx){ return !!((marks[chId]||{})[qIdx]); }
  function toggleMark(chId, qIdx){
    marks[chId] = marks[chId] || {};
    if(marks[chId][qIdx]) delete marks[chId][qIdx]; else marks[chId][qIdx] = true;
    saveActive('dmquiz_marks_v1', marks);
  }
  function getShuffleOrder(chId){ return shuffle[chId] || null; }
  function setShuffleOrder(chId, arr){
    if(arr) shuffle[chId] = arr;
    else if(shuffle[chId]) delete shuffle[chId];
    saveActive('dmquiz_shuffle_v1', shuffle);
  }
  function getExamOngoing(chId){ return examOngoing[chId] || null; }
  function setExamOngoing(chId, obj){
    if(obj) examOngoing[chId] = obj;
    else if(examOngoing[chId]) delete examOngoing[chId];
    saveActive('dmquiz_exam_v1', examOngoing);
  }

  /* counts */
  function totalQs(){ return DATA.length; }
  function answeredCount(){
    let n=0;
    Object.keys(progress).forEach(ch=>{ n += Object.keys(progress[ch]).length; });
    return n;
  }
  function correctCount(){
    let n=0;
    Object.keys(progress).forEach(ch=>{
      Object.keys(progress[ch]).forEach(qi=>{
        if(eqAns(progress[ch][qi], DATA[+qi].answer)) n++;
      });
    });
    return n;
  }
  function wrongHistList(){
    const out=[];
    Object.keys(wrongHistory).forEach(ch=>{
      Object.keys(wrongHistory[ch]).forEach(qi=>{
        // include even if no current answer (history); also include current wrongs
        out.push({ ch:+ch, qi:+qi, q:DATA[+qi] });
      });
    });
    // also include current wrong answers not yet captured (defensive)
    Object.keys(progress).forEach(ch=>{
      Object.keys(progress[ch]).forEach(qi=>{
        if(!eqAns(progress[ch][qi], DATA[+qi].answer)){
          if(!out.some(o=>o.ch===+ch && o.qi===+qi)) out.push({ch:+ch,qi:+qi,q:DATA[+qi]});
        }
      });
    });
    return out;
  }
  function markedAllList(){
    const out=[];
    Object.keys(marks).forEach(ch=>{
      Object.keys(marks[ch]).forEach(qi=>{
        out.push({ ch:+ch, qi:+qi, q:DATA[+qi] });
      });
    });
    return out;
  }
  function allItemsList(){
    return DATA.map((q,qi)=>({ ch:q.ch, qi, q }));
  }

  /* ===================== Toast ===================== */
  let toastT=null;
  function toast(msg){
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(()=>el.classList.remove('show'), 1800);
  }

  /* ===================== State ===================== */
  const state = { view:'home', quiz:null };
  /* quiz: {
       type:'chapter'|'random'|'wrong'|'marked'|'full',
       mode:'practice'|'exam'|'exam_review',
       title, items:[{ch,qi,q}],
       chapterId? (for type==='chapter'),
       idx:0,
       draft:{},                // practice tentative
       examTentative:{},        // non-chapter exam scratch
       retryMode, retried       // for review-style practice
     } */

  /* ===================== Render dispatcher ===================== */
  function render(){
    if(state.view==='home') renderHome();
    else if(state.view==='quiz') renderQuiz();
    else if(state.view==='summary') renderSummary();
  }

  /* ===================== Home ===================== */
  function renderHome(){
    setHidden($('homeView'), false);
    setHidden($('quizView'), true);
    $('homeBtn').classList.add('hidden');
    $('hdrTitle').textContent = t('appTitle');
    $('hdrModePill').innerHTML = '';
    $('profileName').textContent = (profiles[activeId]?.name === '預設使用者' || !profiles[activeId]?.name) ? t('defaultUser') : profiles[activeId].name;
    $('totalCount').textContent = totalQs();

    const total = totalQs(), ans = answeredCount(), correct = correctCount();
    $('gpFill').style.width = (total ? (ans/total*100) : 0) + '%';
    $('gpText').textContent = ans===0 ? t('notStarted') : t('progressLine', ans, total, correct);
    $('stat').innerHTML = t('answeredOf', ans, total);

    $('wrongBadge').textContent = wrongHistList().length;
    $('markBadge').textContent  = markedAllList().length;

    // Render chapter cards into chaptersContainer (one panel grouping all chapters)
    const c = $('chaptersContainer'); c.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2 data-zh="20 個章節" data-en="20 Chapters">'+(lang==='zh'?'20 個章節':'20 Chapters')+'</h2><div class="cards" id="chCards"></div>';
    c.appendChild(panel);
    const cardsEl = panel.querySelector('#chCards');

    CHAPTERS.forEach(ch=>{
      const arr = chQs(ch.id);
      const ans = getChAns(ch.id);
      const ansN = Object.keys(ans).length;
      const tot = arr.length;
      const correctN = arr.reduce((acc,qi)=>acc+(ans[qi]!=null && eqAns(ans[qi], DATA[qi].answer)?1:0),0);
      const examOn = getExamOngoing(ch.id);
      let statusBadge='';
      if(examOn){
        const tn = Object.keys(examOn.tentative||{}).length;
        statusBadge = '<span class="badge-status exam-ip">'+t('examOngoing', tn, tot)+'</span>';
      } else if(ansN===0){
        statusBadge = '<span style="color:var(--soft)">'+t('notAnswered')+'</span>';
      } else if(ansN===tot){
        statusBadge = '<span class="badge-status done">'+t('chapterDone', correctN, tot)+'</span>';
      } else {
        statusBadge = '<span class="badge-status ip">'+t('practicing', ansN, tot, correctN)+'</span>';
      }
      const yc = document.createElement('div');
      yc.className = 'ycard';
      yc.innerHTML =
        '<div class="ytitle"><span>'+escHTML('Ch.'+ch.id+' '+chName(ch))+'</span> <span class="ycount">'+t('qCount',tot)+'</span></div>'+
        '<div class="ystatus">'+statusBadge+'</div>'+
        '<div class="action-row">'+
          '<button class="chip practice" data-act="practice">'+t('practiceMode')+'</button>'+
          '<button class="chip exam" data-act="exam">'+t('examMode')+'</button>'+
        '</div>';
      cardsEl.appendChild(yc);
      yc.querySelector('[data-act="practice"]').onclick = ()=>enterChapter(ch.id, 'practice');
      yc.querySelector('[data-act="exam"]').onclick    = ()=>enterChapter(ch.id, 'exam');
    });
  }

  /* ===================== Chapter entry ===================== */
  function enterChapter(chId, mode){
    const arr = chQs(chId);
    const order = getShuffleOrder(chId);
    const indices = order && order.length===arr.length ? order : arr.slice();
    const items = indices.map(qi=>({ ch:chId, qi, q:DATA[qi] }));

    if(mode==='exam'){
      const existingProgress = Object.keys(getChAns(chId)).length;
      const examOn = getExamOngoing(chId);
      if(examOn){
        if(!confirm(t('confirmContExam', Object.keys(examOn.tentative||{}).length+'/'+arr.length))){
          setExamOngoing(chId, null);
          if(!confirm(t('confirmRestartExam'))) return;
          clearChAns(chId);
          setExamOngoing(chId, { tentative:{}, startedAt: nowISO() });
        }
      } else {
        if(existingProgress>0){
          if(!confirm(t('confirmEnterExamCleansec', existingProgress))) return;
          clearChAns(chId);
        }
        setExamOngoing(chId, { tentative:{}, startedAt: nowISO() });
      }
    } else {
      // practice mode
      const examOn = getExamOngoing(chId);
      if(examOn){
        if(!confirm(t('confirmEnterPracticeFromExam', Object.keys(examOn.tentative||{}).length+'/'+arr.length))) return;
        setExamOngoing(chId, null);
      }
    }
    const ch = chById(chId);
    enterQuiz({
      type:'chapter', mode,
      chapterId: chId,
      title: 'Ch.'+chId+' '+chName(ch),
      items
    });
  }
  function enterQuiz(quiz){
    state.view = 'quiz';
    state.quiz = Object.assign({ idx:0, draft:{}, examTentative:{}, retried:{} }, quiz);
    render();
    window.scrollTo(0,0);
  }

  /* ===================== Quiz render ===================== */
  function renderQuiz(){
    setHidden($('homeView'), true);
    setHidden($('quizView'), false);
    $('homeBtn').classList.remove('hidden');
    const quiz = state.quiz; const items = quiz.items;
    const isExam = quiz.mode==='exam';

    // Refresh title based on lang (chapter title)
    if(quiz.type==='chapter' && quiz.chapterId){
      const ch = chById(quiz.chapterId);
      quiz.title = 'Ch.'+ch.id+' '+chName(ch);
    } else if(quiz.type==='full'){
      quiz.title = t('titleFullExam');
    }

    $('hdrTitle').textContent = quiz.title || t('appTitle');
    $('hdrModePill').innerHTML = isExam
      ? '<span class="mode-pill exam">'+t('examModePill')+'</span>'
      : (quiz.retryMode
          ? '<span class="mode-pill practice">'+t('retryPill')+'</span>'
          : '<span class="mode-pill practice">'+t('practicePill')+'</span>');

    if(!items.length){
      $('quizMain').innerHTML = '<div class="card empty">No questions.</div>';
      $('grid').innerHTML = '';
      return;
    }

    $('sidebar').classList.toggle('exam', isExam);

    // For chapter quizzes, exam tentative is persisted per chapter; otherwise use in-memory
    const isChapter = quiz.type==='chapter';
    const isFull = quiz.type==='full';
    const examOn = isExam ? (
      isChapter ? (getExamOngoing(quiz.chapterId) || { tentative:{} })
      : isFull   ? (getExamOngoing('full') || { tentative:{} })
      : { tentative: (quiz.examTentative = quiz.examTentative || {}) }
    ) : null;

    // Build grid
    const grid = $('grid'); grid.innerHTML = '';
    let ansN=0, correctN=0;
    items.forEach((it,i)=>{
      let stored, isCorrect=false, isWrong=false, isAnsweredExam=false;
      if(isExam){
        // chapter exam keys by it.qi; full exam keys by i (since same qi can appear once); same as chapter use qi
        const key = (isChapter||isFull) ? it.qi : i;
        stored = examOn.tentative[key];
        if(stored!=null && (Array.isArray(stored)?stored.length>0:true)){
          ansN++; isAnsweredExam = true;
        }
      } else {
        const a = getChAns(it.ch)[it.qi];
        const retried = quiz.retryMode && quiz.retried && quiz.retried[i];
        const showState = !quiz.retryMode || retried;
        isCorrect = showState && a!=null && eqAns(a, it.q.answer);
        isWrong   = showState && a!=null && !eqAns(a, it.q.answer);
        if(showState && a!=null){ ansN++; if(isCorrect) correctN++; }
      }
      const b = document.createElement('button');
      b.className = 'gbtn'
        + (i===quiz.idx?' cur':'')
        + (isCorrect?' right':'')
        + (isWrong?' wrong':'')
        + (isAnsweredExam?' answered-exam':'')
        + (isMarked(it.ch,it.qi)?' marked':'');
      b.textContent = String(i+1);
      b.onclick = ()=>{ quiz.idx=i; render(); };
      grid.appendChild(b);
    });

    if(isExam){
      $('sbTotal').textContent = t('sbTotalExam', ansN, items.length);
      $('sbLegend').innerHTML = '<span><i class="dot exam"></i>'+t('legendAnswered')+'</span><span style="color:var(--yellow)">★ '+t('legendMarked')+'</span>';
    } else {
      $('sbTotal').textContent = t('sbTotal', items.length, ansN, correctN);
      $('sbLegend').innerHTML = '<span><i class="dot r"></i>'+t('legendCorrect')+'</span><span><i class="dot w"></i>'+t('legendWrong')+'</span><span style="color:var(--yellow)">★ '+t('legendMarked')+'</span>';
    }

    // sidebar buttons
    $('resetBtn').style.display = (isChapter || isFull || isExam) ? '' : 'none';
    $('shuffleBtn').style.display = isChapter ? '' : 'none';
    $('submitExamBtn').classList.toggle('hidden', !isExam);
    $('exportQuizBtn').classList.toggle('hidden', !isChapter);
    $('submitExamBtn').textContent = t('submitExamSidebarN', ansN, items.length);

    $('resetBtn').onclick = ()=>{
      if(isExam){
        if(!confirm(t('confirmResetExam'))) return;
        if(isChapter){ setExamOngoing(quiz.chapterId, { tentative:{}, startedAt: nowISO() }); }
        else if(isFull){ setExamOngoing('full', { tentative:{}, startedAt: nowISO() }); }
        else { quiz.examTentative = {}; }
        render();
      } else {
        if(isChapter){
          if(!confirm(t('confirmResetSec'))) return;
          clearChAns(quiz.chapterId); render();
        }
      }
    };
    $('shuffleBtn').onclick = ()=>{
      if(!isChapter) return;
      const arr = chQs(quiz.chapterId);
      const cur = getShuffleOrder(quiz.chapterId);
      if(cur){ setShuffleOrder(quiz.chapterId, null); toast(t('toastUnshuffled')); }
      else   { setShuffleOrder(quiz.chapterId, shuffleArr(arr.slice())); toast(t('toastShuffled')); }
      enterChapter(quiz.chapterId, quiz.mode);
    };
    $('summaryBtn').onclick = ()=>renderSummary();
    $('exportQuizBtn').onclick = ()=>openExportModal({ scope:'quiz', chId: quiz.chapterId });
    $('submitExamBtn').onclick = ()=>submitExam();

    renderCurrentQuestion();
  }

  function renderCurrentQuestion(){
    const quiz = state.quiz; const items = quiz.items;
    const isExam = quiz.mode==='exam';
    const it = items[quiz.idx], q = it.q;
    const isChapter = quiz.type==='chapter';
    const isFull = quiz.type==='full';
    const examOn = isExam ? (
      isChapter ? (getExamOngoing(quiz.chapterId) || { tentative:{} })
      : isFull   ? (getExamOngoing('full') || { tentative:{} })
      : { tentative: (quiz.examTentative = quiz.examTentative || {}) }
    ) : null;

    let stored, locked, draft;
    if(isExam){
      const key = (isChapter||isFull) ? it.qi : quiz.idx;
      stored = examOn.tentative[key];
      locked = false;
      draft = stored;
    } else {
      stored = getChAns(it.ch)[it.qi];
      const retriedHere = quiz.retryMode && quiz.retried && quiz.retried[quiz.idx];
      locked = quiz.retryMode ? !!retriedHere : (stored!=null);
      draft = locked ? stored : (quiz.draft && quiz.draft[quiz.idx]);
    }

    const qtype = q.type;
    const opts = getOpts(q);

    /* Build option HTML */
    let optsHTML = '';
    if(qtype==='single'){
      opts.forEach((txt,i)=>{
        let cls = 'opt';
        if(locked){ cls += ' locked'; if(i===q.answer) cls+=' correct'; else if(i===stored) cls+=' wrong'; }
        else if(!isExam && draft===i){ cls+=' selected'; }
        else if(isExam && stored===i){ cls+=' selected'; }
        optsHTML += '<button class="'+cls+'" data-k="'+i+'" '+(locked?'disabled':'')+'>'
          + '<span class="label">'+letterFor(i)+'.</span><span>'+escHTML(txt)+'</span></button>';
      });
    } else if(qtype==='multi'){
      const draftSet = Array.isArray(draft) ? draft : [];
      const selectedSet = isExam ? (Array.isArray(stored)?stored:[]) : draftSet;
      const ansSet = Array.isArray(q.answer) ? q.answer : [];
      opts.forEach((txt,i)=>{
        let cls = 'opt';
        const inSel = selectedSet.includes(i);
        if(locked){
          cls += ' locked';
          if(ansSet.includes(i)) cls+=' correct';
          else if(Array.isArray(stored) && stored.includes(i)) cls+=' wrong';
        } else if(inSel){ cls+=' selected'; }
        optsHTML += '<button class="'+cls+'" data-k="'+i+'" '+(locked?'disabled':'')+'>'
          + '<span class="label">'+(inSel?'☑':'☐')+' '+letterFor(i)+'.</span><span>'+escHTML(txt)+'</span></button>';
      });
    } else if(qtype==='tf'){
      const labs = lang==='zh' ? [['T','○ 正確'],['F','✕ 錯誤']] : [['T','○ True'],['F','✕ False']];
      // T = 1, F = 0
      labs.forEach((pair, idx)=>{
        const k = idx===0 ? 1 : 0;  // T first → answer 1; F → 0
        const lab = pair[1];
        let cls = 'opt';
        if(locked){ cls += ' locked'; if(k===q.answer) cls+=' correct'; else if(k===stored) cls+=' wrong'; }
        else if(!isExam && draft===k){ cls+=' selected'; }
        else if(isExam && stored===k){ cls+=' selected'; }
        optsHTML += '<button class="'+cls+'" data-k="'+k+'" '+(locked?'disabled':'')+'>'
          + '<span class="label">'+pair[0]+'.</span><span>'+escHTML(lab)+'</span></button>';
      });
    }

    // Submit row (practice only, unlocked)
    let submitRowHTML = '';
    if(!isExam && !locked){
      let hint;
      if(qtype==='multi'){
        const n = Array.isArray(draft) ? draft.length : 0;
        hint = t('multiHint', n);
      } else if(qtype==='tf'){ hint = t('tfHint'); }
      else { hint = t('singleHint'); }
      const canSubmit = (qtype==='multi') ? (Array.isArray(draft)&&draft.length>0) : (draft!=null);
      submitRowHTML = '<div class="submit-row">'
        + '<button class="btn submit-btn" id="submitAnsBtn" '+(canSubmit?'':'disabled')+'>'+t('submitAnswer')+'</button>'
        + '<button class="btn ghost" id="clearDraftBtn" '+(draft==null||(Array.isArray(draft)&&draft.length===0)?'disabled':'')+'>'+t('clearChoice')+'</button>'
        + '<span class="submit-hint">'+escHTML(hint)+'</span>'
        + '</div>';
    }

    let examHintHTML = '';
    if(isExam && quiz.idx===0){
      examHintHTML = '<div class="exam-hint" style="margin:0">'+t('examHintBanner')+'</div>';
    }

    // Verdict
    let verdictHTML = '';
    if(locked && !isExam){
      const ok = eqAns(stored, q.answer);
      verdictHTML = '<div class="verdict '+(ok?'right':'wrong')+'">'
        + '<h3>'+(ok?t('correct'):t('incorrect'))+'</h3>'
        + '<div class="ans-line">'+t('correctAnswer')+escHTML(fmtAns(q))+(ok?'':t('yourAnswer')+escHTML(fmtUserAns(q,stored)))+'</div>'
        + (getExp(q) ? '<div>'+escHTML(getExp(q))+'</div>' : '<div style="opacity:.7">'+t('noExp')+'</div>')
        + '</div>';
    }

    const marked = isMarked(it.ch, it.qi);
    const typeBadge = qtype==='single' ? '<span class="qtype single">'+t('typeSingle')+'</span>'
                    : qtype==='multi'  ? '<span class="qtype multi">'+t('typeMulti')+'</span>'
                    : '<span class="qtype tf">'+t('typeTF')+'</span>';
    const chMeta = (function(){ const c=chById(it.ch); return c ? 'Ch.'+c.id+' '+chName(c) : ('Ch.'+it.ch); })();
    $('quizMain').innerHTML = examHintHTML +
      '<div class="card '+(isExam?'exam-card':'')+'">'
        + '<div class="qhead '+(isExam?'exam':'')+'">'
          + '<span class="qnum">'+t('qNum', quiz.idx+1, items.length)+'</span>'
          + typeBadge
          + '<span class="qmeta">'+escHTML(chMeta)+'</span>'
          + '<button class="markbtn '+(marked?'marked':'')+'" id="markBtn">'+(marked?t('markedBtn'):t('markBtn'))+'</button>'
        + '</div>'
        + '<div class="stem">'+escHTML(getStem(q))+'</div>'
        + '<div class="opts" id="opts">'+optsHTML+'</div>'
        + submitRowHTML
        + verdictHTML
        + '<div class="nav">'
          + '<button class="btn ghost" id="prevBtn" '+(quiz.idx===0?'disabled':'')+'>'+t('prev')+'</button>'
          + '<button class="btn" id="nextBtn" '+(quiz.idx===items.length-1?'disabled':'')+'>'+t('next')+'</button>'
          + (locked && !isExam ? '<button class="btn ghost" id="redoBtn">'+t('redo')+'</button>' : '')
          + (isExam && quiz.idx===items.length-1 ? '<button class="btn exam-c" id="submitExamInlineBtn" style="margin-left:auto;font-weight:700">'+t('submitExamInline')+'</button>' : '')
        + '</div>'
      + '</div>';

    /* Wire option clicks */
    function setExamTentative(idx, ans){
      if(isChapter){
        const eo = getExamOngoing(quiz.chapterId) || { tentative:{}, startedAt: nowISO() };
        eo.tentative[items[idx].qi] = ans;
        setExamOngoing(quiz.chapterId, eo);
      } else if(isFull){
        const eo = getExamOngoing('full') || { tentative:{}, startedAt: nowISO() };
        eo.tentative[items[idx].qi] = ans;
        setExamOngoing('full', eo);
      } else {
        quiz.examTentative = quiz.examTentative || {};
        quiz.examTentative[idx] = ans;
      }
    }
    function setDraft(idx, ans){
      quiz.draft = quiz.draft || {};
      quiz.draft[idx] = ans;
    }
    function commitPractice(ans){
      setChAns(it.ch, it.qi, ans);
      if(quiz.retryMode){
        quiz.retried = quiz.retried || {};
        quiz.retried[quiz.idx] = true;
        if(eqAns(ans, q.answer)) toast(t('toastCorrect'));
      }
      if(quiz.draft) delete quiz.draft[quiz.idx];
      render();
    }

    $('quizMain').querySelectorAll('.opt').forEach(btn=>{
      btn.onclick = ()=>{
        if(locked) return;
        const k = +btn.dataset.k;
        if(qtype==='multi'){
          if(isExam){
            const cur = Array.isArray(stored) ? stored.slice() : [];
            const i = cur.indexOf(k); if(i>=0) cur.splice(i,1); else cur.push(k);
            setExamTentative(quiz.idx, cur);
          } else {
            const cur = Array.isArray(draft) ? draft.slice() : [];
            const i = cur.indexOf(k); if(i>=0) cur.splice(i,1); else cur.push(k);
            setDraft(quiz.idx, cur);
          }
          renderQuiz();
        } else {
          if(isExam){ setExamTentative(quiz.idx, k); renderQuiz(); }
          else { setDraft(quiz.idx, k); renderQuiz(); }
        }
      };
    });

    if(!isExam && !locked){
      const sb = $('submitAnsBtn');
      if(sb) sb.onclick = ()=>{
        const d = quiz.draft && quiz.draft[quiz.idx];
        if(d==null || (Array.isArray(d)&&d.length===0)){ toast(t('chooseAnswer')); return; }
        commitPractice(qtype==='multi' ? d.slice() : d);
      };
      const cb = $('clearDraftBtn');
      if(cb) cb.onclick = ()=>{ if(quiz.draft) delete quiz.draft[quiz.idx]; renderQuiz(); };
    }

    $('markBtn').onclick = ()=>{ toggleMark(it.ch, it.qi); renderQuiz(); };
    $('prevBtn').onclick = ()=>{ if(quiz.idx>0){ quiz.idx--; render(); window.scrollTo(0,0); } };
    $('nextBtn').onclick = ()=>{ if(quiz.idx<items.length-1){ quiz.idx++; render(); window.scrollTo(0,0); } };
    const sb2 = $('submitExamInlineBtn'); if(sb2) sb2.onclick = ()=>submitExam();
    const rb = $('redoBtn');
    if(rb) rb.onclick = ()=>{
      const sec = progress[it.ch];
      if(sec){ delete sec[it.qi]; if(Object.keys(sec).length===0) delete progress[it.ch]; saveActive('dmquiz_progress_v1', progress); }
      if(quiz.retryMode && quiz.retried){ delete quiz.retried[quiz.idx]; }
      if(quiz.draft) delete quiz.draft[quiz.idx];
      render();
    };

    document.onkeydown = (ev)=>{
      if(ev.target && ['INPUT','TEXTAREA'].includes(ev.target.tagName)) return;
      if(ev.key==='ArrowLeft' && quiz.idx>0){ quiz.idx--; render(); }
      else if(ev.key==='ArrowRight' && quiz.idx<items.length-1){ quiz.idx++; render(); }
      else if(ev.key==='Enter'){
        if(!isExam && !locked){ const sb=$('submitAnsBtn'); if(sb && !sb.disabled) sb.click(); }
      } else if(qtype==='single' && ['1','2','3','4','5','a','b','c','d','e','A','B','C','D','E'].includes(ev.key)){
        if(locked) return;
        const lk = ev.key.toLowerCase();
        let k = null;
        if(['1','2','3','4','5'].includes(lk)) k = +lk - 1;
        else k = lk.charCodeAt(0) - 'a'.charCodeAt(0);
        if(k>=0 && k<opts.length){
          if(isExam){ setExamTentative(quiz.idx, k); renderQuiz(); }
          else { setDraft(quiz.idx, k); renderQuiz(); }
        }
      } else if(qtype==='tf' && ['t','T','f','F','y','Y','n','N','1','2','o','O','x','X'].includes(ev.key)){
        if(locked) return;
        const k = ev.key.toLowerCase();
        const ans = (k==='t'||k==='y'||k==='1'||k==='o') ? 1 : 0;
        if(isExam){ setExamTentative(quiz.idx, ans); renderQuiz(); }
        else { setDraft(quiz.idx, ans); renderQuiz(); }
      } else if(qtype==='multi' && ['1','2','3','4','5','a','b','c','d','e',' '].includes(ev.key.toLowerCase())){
        if(locked) return;
        const lk = ev.key.toLowerCase();
        let k = null;
        if(['1','2','3','4','5'].includes(lk)) k = +lk - 1;
        else if(['a','b','c','d','e'].includes(lk)) k = lk.charCodeAt(0) - 'a'.charCodeAt(0);
        if(k!=null && k>=0 && k<opts.length){
          if(isExam){
            const cur = Array.isArray(stored) ? stored.slice() : [];
            const i = cur.indexOf(k); if(i>=0) cur.splice(i,1); else cur.push(k);
            setExamTentative(quiz.idx, cur); renderQuiz();
          } else {
            const cur = Array.isArray(quiz.draft && quiz.draft[quiz.idx]) ? quiz.draft[quiz.idx].slice() : [];
            const i = cur.indexOf(k); if(i>=0) cur.splice(i,1); else cur.push(k);
            setDraft(quiz.idx, cur); renderQuiz();
          }
        }
      }
    };
  }

  /* ===================== Submit Exam ===================== */
  function submitExam(){
    const quiz = state.quiz;
    const isChapter = quiz.type==='chapter';
    const isFull = quiz.type==='full';
    const total = quiz.items.length;
    let answered = 0;
    if(isChapter || isFull){
      const key = isChapter ? quiz.chapterId : 'full';
      const eo = getExamOngoing(key);
      if(!eo){ toast(t('toastNoExam')); return; }
      const tent = eo.tentative || {};
      answered = Object.keys(tent).filter(qi=>{
        const v = tent[qi];
        return v!=null && (Array.isArray(v) ? v.length>0 : true);
      }).length;
      if(!confirm(t('confirmSubmitExam', total, answered, total-answered))) return;
      // commit
      Object.keys(tent).forEach(qi=>{
        const v = tent[qi];
        if(v!=null && (Array.isArray(v) ? v.length>0 : true)){
          const targetCh = DATA[+qi].ch;
          setChAns(targetCh, qi, Array.isArray(v)?v.slice():v);
        }
      });
      setExamOngoing(key, null);
    } else {
      const tent = quiz.examTentative || {};
      answered = Object.keys(tent).filter(i=>{
        const v = tent[i];
        return v!=null && (Array.isArray(v) ? v.length>0 : true);
      }).length;
      if(!confirm(t('confirmSubmitExam', total, answered, total-answered))) return;
      Object.keys(tent).forEach(i=>{
        const it = quiz.items[+i]; const v = tent[i];
        if(it && v!=null && (Array.isArray(v) ? v.length>0 : true)){
          setChAns(it.ch, it.qi, Array.isArray(v)?v.slice():v);
        }
      });
    }
    state.quiz.mode = 'exam_review';
    state.view = 'summary';
    render();
    window.scrollTo(0,0);
  }

  /* ===================== Summary ===================== */
  function renderSummary(){
    state.view = 'summary';
    setHidden($('homeView'), true); setHidden($('quizView'), false);
    const quiz = state.quiz;
    const isExamReview = quiz.mode==='exam_review';
    $('hdrTitle').textContent = (isExamReview?t('examResultHeader'):t('summaryHeader')) + (quiz.title||'');
    $('hdrModePill').innerHTML = isExamReview ? '<span class="mode-pill exam">'+t('examSubmittedPill')+'</span>' : '';

    let ansN=0, correctN=0, wrongN=0, markedN=0, unansN=0;
    const wList=[];
    quiz.items.forEach((it,i)=>{
      const a = getChAns(it.ch)[it.qi];
      if(a!=null){
        ansN++;
        if(eqAns(a, it.q.answer)) correctN++;
        else { wrongN++; wList.push({i, it, ua:a}); }
      } else { unansN++; }
      if(isMarked(it.ch, it.qi)) markedN++;
    });
    const total = quiz.items.length;
    const pct = total ? Math.round(correctN/total*100) : 0;

    let html = '<div class="card summary '+(isExamReview?'exam':'')+'">'
      + '<h2>'+(isExamReview?t('examResultTitle'):t('summaryTitle'))+'</h2>'
      + '<div class="score">'+pct+t('points')+'</div>'
      + '<div class="summary-row">'
        + '<div class="item">'+t('qTotal')+'<strong>'+total+'</strong></div>'
        + '<div class="item">'+t('correctN')+'<strong style="color:var(--green)">'+correctN+'</strong></div>'
        + '<div class="item">'+t('wrongN')+'<strong style="color:var(--red)">'+wrongN+'</strong></div>'
        + (unansN?'<div class="item">'+t('unansN')+'<strong style="color:var(--soft)">'+unansN+'</strong></div>':'')
        + '<div class="item">'+t('markedN')+'<strong style="color:var(--yellow)">'+markedN+'</strong></div>'
      + '</div>';
    if(wList.length){
      html += '<h3 style="margin-top:18px;font-size:15px">'+t('wrongList')+'</h3><div class="wrong-list">';
      wList.forEach(w=>{
        const s = getStem(w.it.q);
        html += '<div class="wrong-row" data-i="'+w.i+'"><span class="wno">#'+(w.i+1)+'</span>'
          + '<span style="flex:1">'+escHTML(s.slice(0,60))+(s.length>60?'…':'')+'</span>'
          + '<span style="color:var(--red);font-weight:600">'+t('youLabel')+escHTML(fmtUserAns(w.it.q,w.ua))+'</span>'
          + '<span style="color:var(--green);font-weight:600">'+t('answerLabel')+escHTML(fmtAns(w.it.q))+'</span>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '<div class="nav" style="margin-top:18px">'
      + '<button class="btn" id="backToQuizBtn">'+t('backToQuiz')+'</button>'
      + '<button class="btn ghost" id="backHomeBtn">'+t('backHomeBtn')+'</button>'
      + ((quiz.type==='chapter')?'<button class="btn ghost" id="exportSummaryBtn">'+t('exportThisQuiz')+'</button>':'')
      + '</div></div>';
    $('quizMain').innerHTML = html;
    $('grid').innerHTML = '';
    $('sbTotal').textContent = t('summaryMode');
    $('submitExamBtn').classList.add('hidden');
    $('backToQuizBtn').onclick = ()=>{
      if(isExamReview) state.quiz.mode = 'practice';
      state.view = 'quiz'; render();
    };
    $('backHomeBtn').onclick = ()=>{ state.view = 'home'; render(); };
    const exb = $('exportSummaryBtn');
    if(exb) exb.onclick = ()=>openExportModal({ scope:'quiz', chId: quiz.chapterId });
    $('quizMain').querySelectorAll('.wrong-row').forEach(r=>{
      r.onclick = ()=>{
        if(isExamReview) state.quiz.mode = 'practice';
        state.view = 'quiz'; state.quiz.idx = +r.dataset.i; render(); window.scrollTo(0,0);
      };
    });
  }

  /* ===================== Profile UI ===================== */
  function renderProfileList(){
    const list = $('profileList'); list.innerHTML = '';
    Object.entries(profiles).forEach(([id,p])=>{
      const row = document.createElement('div');
      row.className = 'profile-row' + (id===activeId?' active':'');
      const name = (p.name === '預設使用者') ? t('defaultUser') : p.name;
      row.innerHTML = '<span class="pname">'+escHTML(name)+(id===activeId?' <span style="color:var(--primary);font-size:11px">'+(lang==='en'?' (active)':'（使用中）')+'</span>':'')+'</span>'
        + '<span class="pdate">'+(p.createdAt||'').slice(0,10)+'</span>'
        + (id===activeId?'':'<button data-act="switch" data-id="'+id+'">'+(lang==='en'?'Switch':'切換')+'</button>')
        + (Object.keys(profiles).length>1?'<button class="danger" data-act="del" data-id="'+id+'">'+(lang==='en'?'Delete':'刪除')+'</button>':'');
      list.appendChild(row);
    });
    list.querySelectorAll('button').forEach(b=>{
      b.onclick = ()=>{
        const act = b.dataset.act, id = b.dataset.id;
        if(act==='switch'){
          activeId = id; localStorage.setItem(KEY_ACTIVE, id);
          reloadActiveData(); renderProfileList(); render(); toast(t('toastSwitched', profiles[id].name));
        } else if(act==='del'){
          if(!confirm(t('confirmDelUser', profiles[id].name))) return;
          ['dmquiz_progress_v1','dmquiz_marks_v1','dmquiz_wrong_v1','dmquiz_shuffle_v1','dmquiz_exam_v1'].forEach(k=>localStorage.removeItem(k+'_'+id));
          delete profiles[id]; saveJSON(KEY_PROFILES, profiles);
          if(id===activeId){ activeId = Object.keys(profiles)[0]; localStorage.setItem(KEY_ACTIVE, activeId); reloadActiveData(); }
          renderProfileList(); render();
        }
      };
    });
  }

  /* ===================== Export / Import ===================== */
  let currentExportContext = null;
  function openExportModal(ctx){
    currentExportContext = ctx;
    const isQuiz = ctx.scope==='quiz';
    $('exportTitle').textContent = isQuiz ? t('expHeaderQuiz') : t('expHeaderAll');
    let scopeLabel;
    if(isQuiz){
      const c = chById(ctx.chId);
      scopeLabel = c ? ('Ch.'+c.id+' '+chName(c)) : ('Ch.'+ctx.chId);
    } else {
      scopeLabel = t('rangeAll');
    }
    $('exportSub').textContent = t('rangeUserLabel') + (profiles[activeId]?.name||'') + t('rangeScopeLabel') + scopeLabel;
    $('importLabel').textContent = t('importJsonRestore');
    $('importThisBtn').textContent = isQuiz ? t('importThisRange') : t('importThisRangeBig');
    $('importAllBtn').textContent = t('importAll');
    $('exportModal').classList.add('show');
  }

  function downloadFile(filename, content, mime){
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function buildJSONExport(){
    const ctx = currentExportContext;
    const dump = {
      meta: {
        kind: 'data-mining-quiz-export',
        version: 1,
        exportedAt: nowISO(),
        profile: profiles[activeId]?.name || '',
        scope: ctx.scope,
        chId: ctx.chId || null
      }
    };
    if(ctx.scope==='quiz'){
      const cid = ctx.chId;
      dump.progress = { [cid]: progress[cid] || {} };
      dump.marks    = { [cid]: marks[cid] || {} };
      dump.wrong    = { [cid]: wrongHistory[cid] || {} };
      if(examOngoing[cid]) dump.examOngoing = { [cid]: examOngoing[cid] };
      if(shuffle[cid])     dump.shuffle     = { [cid]: shuffle[cid] };
    } else {
      dump.progress    = progress;
      dump.marks       = marks;
      dump.wrong       = wrongHistory;
      dump.examOngoing = examOngoing;
      dump.shuffle     = shuffle;
    }
    return JSON.stringify(dump, null, 2);
  }

  function buildItemsForExport(){
    const ctx = currentExportContext;
    if(ctx.scope==='quiz'){
      return chQs(ctx.chId).map(qi=>({ ch:ctx.chId, qi, q:DATA[qi] }));
    }
    return allItemsList();
  }

  function buildHTMLScore(){
    const ctx = currentExportContext;
    const items = buildItemsForExport();
    let ansN=0, correctN=0, wrongN=0, unansN=0;
    const rows = items.map((it,i)=>{
      const a = getChAns(it.ch)[it.qi];
      let st=t('statusUnans'), color='#888';
      if(a!=null){ ansN++; if(eqAns(a,it.q.answer)){ correctN++; st=t('statusRight'); color='#2f9e44'; } else { wrongN++; st=t('statusWrong'); color='#c92a2a'; } }
      else unansN++;
      return { i, it, a, st, color };
    });
    const pct = items.length ? Math.round(correctN/items.length*100) : 0;
    const profileName = profiles[activeId]?.name || '';
    let title;
    if(ctx.scope==='quiz'){ const c=chById(ctx.chId); title = c?('Ch.'+c.id+' '+chName(c)):('Ch.'+ctx.chId); }
    else title = t('quizAllChapters');
    const css = 'body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;color:#1a2733;line-height:1.6;max-width:920px;margin:24px auto;padding:0 20px}h1{color:#78350f;font-size:22px;margin:0 0 4px}.sub{color:#5a6b7b;font-size:13px;margin-bottom:16px}.score{font-size:36px;font-weight:700;color:#78350f;margin:8px 0}.summary{display:flex;gap:18px;flex-wrap:wrap;background:#f8f9fa;border:1px solid #e0e6eb;border-radius:8px;padding:14px 18px;margin:14px 0}.summary div{font-size:13px;color:#5a6b7b}.summary div strong{display:block;font-size:18px;color:#1a2733}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th,td{border:1px solid #e0e6eb;padding:8px 10px;text-align:left;vertical-align:top}th{background:#f1f3f5;font-weight:600}tr.right{background:#f1faf3}tr.wrong{background:#fff5f5}tr.unans{background:#fff7e6}.lbl{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;color:#fff}.lbl.s{background:#d97706}.lbl.m{background:#7c3aed}.lbl.t{background:#d97706}@media print{body{margin:0}}';
    let body = '<h1>📊 '+escHTML(title)+'</h1>'
      + '<div class="sub">'+t('userLabel')+escHTML(profileName)+t('exportTimeLabel')+escHTML(nowISO().replace('T',' ').slice(0,16))+'</div>'
      + '<div class="score">'+pct+t('points')+'</div>'
      + '<div class="summary">'
        + '<div>'+t('qTotal')+'<strong>'+items.length+'</strong></div>'
        + '<div>'+t('correctN')+'<strong style="color:#2f9e44">'+correctN+'</strong></div>'
        + '<div>'+t('wrongN')+'<strong style="color:#c92a2a">'+wrongN+'</strong></div>'
        + '<div>'+t('unansN')+'<strong style="color:#888">'+unansN+'</strong></div>'
      + '</div>'
      + '<table><thead><tr><th style="width:40px">'+t('columnNum')+'</th><th style="width:80px">'+t('columnType')+'</th><th>'+t('columnQ')+'</th><th style="width:80px">'+t('columnYourAns')+'</th><th style="width:80px">'+t('columnAns')+'</th><th style="width:60px">'+t('columnStatus')+'</th></tr></thead><tbody>';
    rows.forEach(r=>{
      const lbl = r.it.q.type==='multi' ? '<span class="lbl m">'+t('typeMulti')+'</span>'
                : r.it.q.type==='tf'    ? '<span class="lbl t">'+t('typeTF')+'</span>'
                : '<span class="lbl s">'+t('typeSingle')+'</span>';
      const trCls = r.a==null ? 'unans' : (eqAns(r.a, r.it.q.answer) ? 'right' : 'wrong');
      const chTag = (function(){ const c=chById(r.it.ch); return c?('Ch.'+c.id+' '+chName(c)):('Ch.'+r.it.ch); })();
      body += '<tr class="'+trCls+'"><td>'+(r.i+1)+'</td><td>'+lbl+'</td>'
        + '<td><strong>'+escHTML(getStem(r.it.q))+'</strong>'
        + (ctx.scope!=='quiz' ? '<br><span style="color:#888;font-size:11px">'+escHTML(chTag)+'</span>' : '')
        + '</td><td>'+escHTML(fmtUserAns(r.it.q, r.a))+'</td><td>'+escHTML(fmtAns(r.it.q))+'</td>'
        + '<td style="color:'+r.color+';font-weight:600">'+r.st+'</td></tr>';
    });
    body += '</tbody></table>';
    return '<!doctype html><html lang="'+(lang==='en'?'en':'zh-Hant')+'"><head><meta charset="utf-8"><title>'+escHTML(title)+t('examScoreSheet')+'</title><style>'+css+'</style></head><body>'+body+'</body></html>';
  }

  function buildHTMLErrata(){
    const ctx = currentExportContext;
    const items = buildItemsForExport();
    const wrongs = items.filter(it=>{
      const a = getChAns(it.ch)[it.qi];
      return a!=null && !eqAns(a, it.q.answer);
    });
    const profileName = profiles[activeId]?.name || '';
    let title;
    if(ctx.scope==='quiz'){ const c=chById(ctx.chId); title = (c?('Ch.'+c.id+' '+chName(c)):('Ch.'+ctx.chId)) + t('examErrataSheet'); }
    else title = t('quizErrataTitle') + t('examErrataSheet');
    const css = 'body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;color:#1a2733;line-height:1.7;max-width:780px;margin:24px auto;padding:0 20px}h1{color:#c92a2a;font-size:22px;margin:0 0 4px}.sub{color:#5a6b7b;font-size:13px;margin-bottom:20px}.q{border:1px solid #e0e6eb;border-radius:8px;padding:16px 18px;margin-bottom:14px;background:#fff5f5;page-break-inside:avoid}.q .meta{font-size:12px;color:#888;margin-bottom:6px}.q .stem{font-weight:600;font-size:15px;margin-bottom:10px}.q .opts{margin:8px 0}.q .opts div{padding:4px 0;font-size:13.5px}.q .opts .ans{color:#2f9e44;font-weight:600}.q .opts .ua{color:#c92a2a;font-weight:600}.q .ansline{margin-top:10px;padding:10px 12px;background:#fff;border:1px solid #e0e6eb;border-radius:6px;font-size:13px}.q .ansline strong{color:#2f9e44}.q .exp{margin-top:8px;color:#1a2733;font-size:13.5px}.empty{padding:40px;text-align:center;color:#5a6b7b;background:#f8f9fa;border-radius:8px}.lbl{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#fff;margin-right:4px}.lbl.s{background:#d97706}.lbl.m{background:#7c3aed}.lbl.t{background:#d97706}@media print{body{margin:0}.q{break-inside:avoid}}';
    let body = '<h1>📚 '+escHTML(title)+'</h1>'
      + '<div class="sub">'+t('userLabel')+escHTML(profileName)+t('countWrong', wrongs.length)+t('exportTimeLabel')+escHTML(nowISO().replace('T',' ').slice(0,16))+'</div>';
    if(!wrongs.length){
      body += '<div class="empty">'+t('noErrataMsg')+'</div>';
    } else {
      wrongs.forEach((it,i)=>{
        const a = getChAns(it.ch)[it.qi];
        const lbl = it.q.type==='multi' ? '<span class="lbl m">'+t('typeMulti')+'</span>'
                  : it.q.type==='tf'    ? '<span class="lbl t">'+t('typeTF')+'</span>'
                  : '<span class="lbl s">'+t('typeSingle')+'</span>';
        let optsHTML = '';
        if(it.q.type==='tf'){
          const labs = lang==='zh' ? [[1,'○ 正確'],[0,'✕ 錯誤']] : [[1,'○ True'],[0,'✕ False']];
          labs.forEach(([k,lab])=>{
            const cls = k===it.q.answer ? 'ans' : (k===a ? 'ua' : '');
            const mk = k===it.q.answer ? '✓' : (k===a ? '✗' : '　');
            optsHTML += '<div class="'+cls+'">'+mk+' '+lab+'</div>';
          });
        } else {
          const opts = getOpts(it.q);
          const ansSet = it.q.type==='multi' ? (Array.isArray(it.q.answer)?it.q.answer:[]) : null;
          const uaSet  = it.q.type==='multi' ? (Array.isArray(a)?a:[]) : null;
          opts.forEach((txt,k)=>{
            let isAns, isUa;
            if(it.q.type==='multi'){ isAns = ansSet.includes(k); isUa = uaSet.includes(k); }
            else { isAns = k===it.q.answer; isUa = k===a; }
            const cls = isAns ? 'ans' : (isUa ? 'ua' : '');
            const mk  = isAns ? '✓' : (isUa ? '✗' : '　');
            optsHTML += '<div class="'+cls+'">'+mk+' '+letterFor(k)+'. '+escHTML(txt)+'</div>';
          });
        }
        const c = chById(it.ch);
        const chMeta = c ? ('Ch.'+c.id+' '+chName(c)) : ('Ch.'+it.ch);
        body += '<div class="q">'
          + '<div class="meta">#'+(i+1)+' '+lbl+escHTML(chMeta)+'</div>'
          + '<div class="stem">'+escHTML(getStem(it.q))+'</div>'
          + '<div class="opts">'+optsHTML+'</div>'
          + '<div class="ansline">'+t('answerLabel')+'<strong>'+escHTML(fmtAns(it.q))+'</strong>'+t('yourAnsErrata')+'<span style="color:#c92a2a;font-weight:600">'+escHTML(fmtUserAns(it.q,a))+'</span></div>'
          + (getExp(it.q) ? '<div class="exp"><strong>'+t('expLabelStrong')+'</strong>'+escHTML(getExp(it.q))+'</div>' : '')
          + '</div>';
      });
    }
    return '<!doctype html><html lang="'+(lang==='en'?'en':'zh-Hant')+'"><head><meta charset="utf-8"><title>'+escHTML(title)+'</title><style>'+css+'</style></head><body>'+body+'</body></html>';
  }

  function tsName(prefix, ext){
    const tm = new Date();
    const pad = n=>String(n).padStart(2,'0');
    return prefix + '_' + tm.getFullYear() + pad(tm.getMonth()+1) + pad(tm.getDate()) + '_' + pad(tm.getHours()) + pad(tm.getMinutes()) + '.' + ext;
  }
  function exportFmt(fmt){
    const ctx = currentExportContext;
    const tag = ctx.scope==='quiz' ? ('ch'+ctx.chId) : 'all';
    if(fmt==='json'){
      downloadFile(tsName('data_mining_quiz_'+tag+'_progress','json'), buildJSONExport(), 'application/json');
      toast(t('toastExpJSON'));
    } else if(fmt==='html_score'){
      downloadFile(tsName('data_mining_quiz_'+tag+'_score','html'), buildHTMLScore(), 'text/html;charset=utf-8');
      toast(t('toastExpScore'));
    } else if(fmt==='html_errata'){
      downloadFile(tsName('data_mining_quiz_'+tag+'_errata','html'), buildHTMLErrata(), 'text/html;charset=utf-8');
      toast(t('toastExpErrata'));
    }
  }
  function importJSON(text, mode){
    let dump;
    try{ dump = JSON.parse(text); } catch(e){ toast(t('parseFail', e.message)); return; }
    if(!dump || dump.meta?.kind !== 'data-mining-quiz-export'){
      if(!confirm(t('notRecognised'))) return;
    }
    if(mode==='all'){
      progress     = dump.progress    || {};
      marks        = dump.marks       || {};
      wrongHistory = dump.wrong       || {};
      shuffle      = dump.shuffle     || {};
      examOngoing  = dump.examOngoing || {};
    } else {
      function merge(into, from){
        Object.entries(from||{}).forEach(([ch, sec])=>{
          into[ch] = into[ch] || {};
          Object.entries(sec||{}).forEach(([qi, v])=>{ into[ch][qi] = v; });
        });
      }
      merge(progress, dump.progress);
      merge(marks,    dump.marks);
      merge(wrongHistory, dump.wrong);
      // examOngoing entries are objects with tentative; shallow-replace per chapter
      Object.entries(dump.examOngoing||{}).forEach(([ch,v])=>{ examOngoing[ch] = v; });
      // shuffle: replace per chapter
      Object.entries(dump.shuffle||{}).forEach(([ch,v])=>{ shuffle[ch] = v; });
    }
    saveActive('dmquiz_progress_v1', progress);
    saveActive('dmquiz_marks_v1', marks);
    saveActive('dmquiz_wrong_v1', wrongHistory);
    saveActive('dmquiz_shuffle_v1', shuffle);
    saveActive('dmquiz_exam_v1', examOngoing);
    $('exportModal').classList.remove('show');
    render();
    toast(t('importDone'));
  }

  /* ===================== Modal wiring ===================== */
  $('profileBtn').onclick = ()=>{ renderProfileList(); $('profileModal').classList.add('show'); };
  $('closeProfileBtn').onclick = ()=>$('profileModal').classList.remove('show');
  $('profileModal').addEventListener('click', e=>{ if(e.target.id==='profileModal') $('profileModal').classList.remove('show'); });
  $('addProfileBtn').onclick = ()=>{
    const name = $('newProfileName').value.trim();
    if(!name){ toast(t('toastEnterName')); return; }
    const id = genId(); profiles[id] = { name, createdAt: nowISO() };
    saveJSON(KEY_PROFILES, profiles);
    $('newProfileName').value = '';
    activeId = id; localStorage.setItem(KEY_ACTIVE, id); reloadActiveData();
    renderProfileList(); render(); toast(t('toastCreated', name));
  };

  $('homeBtn').onclick = ()=>{ state.view='home'; state.quiz=null; render(); };

  $('gpReset').onclick = ()=>{
    if(!confirm(t('confirmReset', profiles[activeId]?.name||''))) return;
    progress = {}; saveActive('dmquiz_progress_v1', progress);
    shuffle  = {}; saveActive('dmquiz_shuffle_v1', shuffle);
    examOngoing = {}; saveActive('dmquiz_exam_v1', examOngoing);
    wrongHistory = {}; saveActive('dmquiz_wrong_v1', wrongHistory);
    render(); toast(t('toastResetDone'));
  };
  $('clearMarksBtn').onclick = ()=>{
    if(!confirm(t('confirmClearMk'))) return;
    marks = {}; saveActive('dmquiz_marks_v1', marks);
    render(); toast(t('toastClearMk'));
  };

  /* Special-action buttons */
  $('reviewWrongBtn').onclick = ()=>{
    if(!wrongHistList().length){ toast(t('noWrong')); return; }
    openRandomPicker('wrong','wrong');
  };
  $('reviewMarkBtn').onclick = ()=>{
    if(!markedAllList().length){ toast(t('noMarked')); return; }
    openRandomPicker('marked','marked');
  };
  $('exportHomeBtn').onclick = ()=>openExportModal({ scope:'all' });

  /* Full exam */
  $('fullExamBtn').onclick = ()=>{
    const examOn = getExamOngoing('full');
    if(examOn){
      if(!confirm(t('confirmContExam', Object.keys(examOn.tentative||{}).length+'/'+DATA.length))){
        setExamOngoing('full', null);
        if(!confirm(t('confirmRestartExam'))) return;
        setExamOngoing('full', { tentative:{}, startedAt: nowISO() });
      }
    } else {
      setExamOngoing('full', { tentative:{}, startedAt: nowISO() });
    }
    const items = DATA.map((q,qi)=>({ ch:q.ch, qi, q }));
    enterQuiz({
      type:'full', mode:'exam',
      title: t('titleFullExam'),
      items
    });
  };

  /* ===================== Random picker ===================== */
  let rndSrc='all', rndN=20, rndMode='practice', rndPickerCtx='random';
  function refreshRandomSrc(){
    $('srcAll').querySelector('.cnt').textContent = '('+totalQs()+')';
    $('srcWrong').querySelector('.cnt').textContent = '('+wrongHistList().length+')';
    $('srcMarked').querySelector('.cnt').textContent = '('+markedAllList().length+')';
    document.querySelectorAll('.src-btn').forEach(b=>b.classList.toggle('active', b.dataset.src===rndSrc));
    document.querySelectorAll('.cnt-btn').forEach(b=>b.classList.toggle('active', String(b.dataset.n)===String(rndN)));
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===rndMode));
    let pool;
    if(rndSrc==='all') pool=totalQs();
    else if(rndSrc==='wrong') pool=wrongHistList().length;
    else pool=markedAllList().length;
    $('randomPickerSub').textContent = t('poolAvail', pool);
    $('srcEmptyWarn').style.display = pool===0?'block':'none';
    if(pool===0){
      $('srcEmptyWarn').textContent = rndSrc==='wrong' ? t('poolEmptyWrong') : (rndSrc==='marked' ? t('poolEmptyMarked') : t('poolEmptyAll'));
    }
  }
  function openRandomPicker(presetSrc, ctx){
    rndPickerCtx = ctx || 'random';
    rndSrc = presetSrc || 'all';
    rndN = 20; rndMode = 'practice';
    $('randomCount').value = 20;
    const titleEl = document.querySelector('#randomPickerModal .modal-card h3');
    if(rndPickerCtx==='wrong') titleEl.textContent = t('wrongPickerTitle');
    else if(rndPickerCtx==='marked') titleEl.textContent = t('markedPickerTitle');
    else titleEl.textContent = t('rndPickerTitle');
    refreshRandomSrc();
    $('randomPickerModal').classList.add('show');
  }
  $('randomBtn').onclick = ()=>openRandomPicker('all','random');
  $('randomCancelBtn').onclick = ()=>$('randomPickerModal').classList.remove('show');
  $('randomPickerModal').addEventListener('click', e=>{ if(e.target.id==='randomPickerModal') $('randomPickerModal').classList.remove('show'); });
  document.querySelectorAll('.src-btn').forEach(b=>b.onclick=()=>{ rndSrc=b.dataset.src; refreshRandomSrc(); });
  document.querySelectorAll('.cnt-btn').forEach(b=>b.onclick=()=>{
    rndN = b.dataset.n==='all' ? 'all' : (+b.dataset.n);
    $('randomCount').value = rndN==='all' ? '' : rndN;
    refreshRandomSrc();
  });
  document.querySelectorAll('.mode-btn').forEach(b=>b.onclick=()=>{ rndMode=b.dataset.mode; refreshRandomSrc(); });
  $('randomCount').oninput = ()=>{
    const v = +$('randomCount').value;
    rndN = (v && v>0) ? v : 20;
    document.querySelectorAll('.cnt-btn').forEach(b=>b.classList.toggle('active', String(b.dataset.n)===String(rndN)));
  };
  $('randomStartBtn').onclick = ()=>{
    let pool;
    if(rndSrc==='all') pool=allItemsList();
    else if(rndSrc==='wrong') pool=wrongHistList();
    else pool=markedAllList();
    if(!pool.length){ toast(t('nothingToPick')); return; }
    const want = (rndN==='all' || rndN>=pool.length) ? pool.length : Math.max(1, +rndN);
    const picked = shuffleArr(pool).slice(0, want);
    $('randomPickerModal').classList.remove('show');
    const srcLabel = rndSrc==='all' ? t('srcAll') : rndSrc==='wrong' ? t('srcWrong') : t('srcMarked');
    const titlePrefix = rndPickerCtx==='wrong' ? t('titleWrongPrefix') : rndPickerCtx==='marked' ? t('titleMarkedPrefix') : t('titleRandomPrefix');
    if(rndMode==='exam'){
      enterQuiz({
        type: rndPickerCtx==='wrong'?'wrong':rndPickerCtx==='marked'?'marked':'random',
        mode:'exam',
        title: titlePrefix+' · '+t('examMode')+t('quesUnit', picked.length),
        items: picked,
        examTentative: {}
      });
    } else {
      enterQuiz({
        type: rndPickerCtx==='wrong'?'wrong':rndPickerCtx==='marked'?'marked':'random',
        mode:'practice',
        title: titlePrefix+' · '+t('practiceMode')+' · '+srcLabel+t('quesUnit', picked.length),
        items: picked,
        retryMode: true,
        retried: {}
      });
    }
  };

  /* ===================== Export modal wiring ===================== */
  document.querySelectorAll('.exp-opt').forEach(b=>{ b.onclick = ()=>exportFmt(b.dataset.fmt); });
  $('closeExportBtn').onclick = ()=>$('exportModal').classList.remove('show');
  $('exportModal').addEventListener('click', e=>{ if(e.target.id==='exportModal') $('exportModal').classList.remove('show'); });
  function readImportFile(cb){
    const f = $('importFile').files[0];
    if(!f){ toast(t('chooseFile')); return; }
    const r = new FileReader();
    r.onload = ()=>cb(r.result);
    r.onerror = ()=>toast(t('readFail'));
    r.readAsText(f);
  }
  $('importThisBtn').onclick = ()=>readImportFile(text=>importJSON(text, 'this'));
  $('importAllBtn').onclick  = ()=>readImportFile(text=>importJSON(text, 'all'));
  $('pasteImportThisBtn').onclick = ()=>{ const x=$('pasteImportArea').value.trim(); if(!x){ toast(t('pasteEmpty')); return; } importJSON(x, 'this'); };
  $('pasteImportAllBtn').onclick  = ()=>{ const x=$('pasteImportArea').value.trim(); if(!x){ toast(t('pasteEmpty')); return; } importJSON(x, 'all'); };

  /* ===================== Language toggle ===================== */
  $('langToggle').onclick = toggleLang;
  $('langToggle').textContent = lang==='zh' ? 'EN' : '中文';

  /* ===================== Initial render ===================== */
  applyLang(lang);   // also calls render()
})();
