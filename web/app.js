'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const bank = window.BANK_INDEX;
  if (!bank) { $('match-count').textContent = '题库加载失败，请保留 data 文件夹与本页面在一起。'; return; }
  const nf = new Intl.NumberFormat('zh-CN');
  const metaById = new Map(bank.index.map(x => [x[0], x]));
  const questions = new Map(), chunks = new Map();
  let records = new Map(), db = null, memoryOnly = false, fallback = false;
  let mode = 'practice', candidates = [], session = null, savedSession = null, selected = [], busy = false;
  const SESSION_KEY = 'xingce-study-session-v1', FALLBACK_KEY = 'xingce-study-records-v1';
  const titles = { practice: ['今天，也前进一步。', '选一个方向，把零散真题练成自己的积累。', '开始一组专项练习', '专注一个考点'], wrong: ['再见面，就多一分把握。', '回到做错的地方，找准原因，再练一次。', '从错题中，找回掌握感', '慢一点，弄懂它'], star: ['值得回看的，留在这里。', '收藏好题，整理思路，温故而知新。', '重练你收藏的题目', '好题，值得再练'], paper: ['回到考场的节奏。', '按照原卷顺序，把各个模块串成完整练习。', '选一套真题，完整练习', '保留原卷顺序'] };
  const todayKey = d => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const option = (v,t) => { const o=document.createElement('option');o.value=v;o.textContent=t;return o; };
  const toast = message => { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4200); };
  const warning = message => { $('storage-warning').textContent=message;$('storage-warning').hidden=false; };
  const freshRecord = id => ({id, attempts:0, correctCount:0, wrong:false, star:false, updatedAt:0, days:{}});
  const request = req => new Promise((resolve,reject) => {req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const transaction = tx => new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('存储事务中断'));});

  async function openStore() {
    try {
      const req=indexedDB.open('xingce-study-v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('records',{keyPath:'id'});
      db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('数据库被其他标签页占用'));});
      db.onversionchange=()=>db.close();
      const rows=await request(db.transaction('records').objectStore('records').getAll());
      records=new Map(rows.filter(r=>metaById.has(r.id)).map(r=>[r.id,r]));
      const tx=db.transaction('records','readwrite');tx.objectStore('records').put({id:'__probe'});tx.objectStore('records').delete('__probe');await transaction(tx);
    } catch (error) {
      db=null;fallback=true;
      try {const raw=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]');records=new Map(raw.filter(r=>metaById.has(r.id)).map(r=>[r.id,r]));localStorage.setItem(FALLBACK_KEY,JSON.stringify([...records.values()]));warning('此浏览器未提供数据库存储，已改用容量较小的本地存储。建议定期导出备份。');}
      catch {memoryOnly=true;warning('当前浏览器不允许持久保存。答题暂存于本次页面，关闭前请导出学习备份；也可换用普通模式的 Edge / Chrome。');}
    }
    try { const raw=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); if (validSession(raw)) savedSession=raw; }
    catch { /* Answer records can remain durable even when resume storage is unavailable. */ }
    renderStats();renderResume();
  }

  async function persistRecord(record) {
    record.updatedAt=Date.now();
    if (db) {
      const tx=db.transaction('records','readwrite');tx.objectStore('records').put(record);await transaction(tx);
    } else if (!memoryOnly) {
      const next=new Map(records);next.set(record.id,record);localStorage.setItem(FALLBACK_KEY,JSON.stringify([...next.values()]));
    }
    records.set(record.id,record);
    return !memoryOnly;
  }
  async function saveRecord(record) {
    try {return await persistRecord(record);}
    catch (error) {
      records.set(record.id,record);memoryOnly=true;
      warning('学习记录写入失败，可能是浏览器存储已满或权限改变。本次记录仍在页面中，请立即导出备份。');
      return false;
    }
  }
  function renderStats() {
    const rows=[...records.values()], answered=rows.filter(r=>r.attempts>0), attempts=answered.reduce((n,r)=>n+r.attempts,0), correct=answered.reduce((n,r)=>n+r.correctCount,0);
    const wrong=rows.filter(r=>r.wrong).length, star=rows.filter(r=>r.star).length;
    const today=todayKey(new Date());const daily=rows.reduce((n,r)=>n+(r.days?.[today]?.[0]||0),0);
    $('stat-done').textContent=nf.format(answered.length);$('stat-total').textContent=`共 ${nf.format(bank.unique)} 道题（保留不同版本）`;
    $('stat-accuracy').textContent=attempts?`${Math.round(correct/attempts*100)}%`:'—';$('stat-attempts').textContent=attempts?`${nf.format(correct)} / ${nf.format(attempts)} 次作答正确`:'还没有答题记录';
    $('stat-wrong').textContent=nf.format(wrong);$('nav-wrong').textContent=wrong;$('nav-star').textContent=star;$('stat-today').textContent=nf.format(daily);
    $('stat-today-detail').textContent='次作答 · 包含重复练习';
  }

  function validSession(s) {
    return s && s.version===1 && Array.isArray(s.queue) && s.queue.length>0 && s.queue.length<=1000 && s.queue.every(x=>x&&metaById.has(x.id)&&Array.isArray(x.source)&&x.source.length===4&&metaById.get(x.id)[2].some(y=>y.every((v,i)=>v===x.source[i]))) && Number.isInteger(s.position) && s.position>=0 && s.position<s.queue.length && s.responses && typeof s.responses==='object' && s.queue.every((_,i)=>!s.responses[i] || (Array.isArray(s.responses[i].answer) && s.responses[i].answer.every(x=>/^[A-H]$/.test(x)) && (typeof s.responses[i].correct==='boolean' || s.responses[i].correct===null)));
  }
  function saveSession() {
    if (!session) return;
    session.updatedAt=Date.now();savedSession=session;
    try {localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
    catch {warning('答题记录仍按当前存储方式保存，但无法保存本组练习的断点。请导出备份，并检查浏览器存储空间。');}
  }
  function renderResume() {
    $('resume-bar').hidden=!savedSession;
    if (savedSession) $('resume-info').textContent=`已提交 ${Object.keys(savedSession.responses).length} / ${savedSession.queue.length} 题 · 停在第 ${savedSession.position+1} 题`;
  }
  function setMode(nextMode) {
    const changed=mode!==nextMode;
    mode=nextMode;
    document.body.classList.remove('studying');$('mobile-answer-bar').hidden=true;$('mobile-quick').hidden=mode!=='practice';
    if(changed&&mode!=='practice'){
      $('module').value='';refreshTopics();$('topic').value='';$('year').value='';$('region').value='';$('scope').value='all';
    }
    const t=titles[mode];$('page-title').textContent=t[0];$('page-subtitle').textContent=t[1];$('setup-title').textContent=t[2];$('mode-tag').textContent=t[3];
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));
    $('paper-filter').hidden=mode!=='paper';$('batch-filter').hidden=mode==='paper';$('order').disabled=mode==='paper';
    $('scope').disabled=mode==='wrong'||mode==='star';
    if (mode==='paper') refreshPapers();
    $('study').hidden=true;$('setup').hidden=false;renderResume();updateCandidates();
  }
  function initFilters() {
    $('module').replaceChildren(option('','全部模块'),...bank.modules.map(x=>option(x,x)));
    $('module').value='言语理解与表达';
    const years=[...new Set(bank.papers.map(x=>x.year))].sort((a,b)=>Number(b)-Number(a));
    $('year').replaceChildren(option('','全部年份'),...years.map(x=>option(x,x+' 年')));
    const regions=[...new Set(bank.papers.map(x=>x.region))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    $('region').replaceChildren(option('','全部地区'),...regions.map(x=>option(x,x)));
    $('order').value='random';refreshTopics();refreshPapers();
  }
  function refreshTopics() {
    const prev=$('topic').value,module=$('module').value;
    const topics=[...new Set(bank.index.flatMap(x=>x[2].filter(s=>!module||s[1]===module).map(s=>s[2])))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    $('topic').replaceChildren(option('','全部题型'),...topics.map(x=>option(x,x)));
    if(topics.includes(prev))$('topic').value=prev;
  }
  function refreshPapers() {
    const prev=$('paper').value;
    const list=bank.papers.map((p,i)=>({...p,i})).filter(p=>(!$('year').value||p.year===$('year').value)&&(!$('region').value||p.region===$('region').value)).sort((a,b)=>Number(b.year)-Number(a.year)||a.title.localeCompare(b.title,'zh-CN'));
    $('paper').replaceChildren(...list.map(p=>option(String(p.i),p.title)));
    if(list.some(p=>String(p.i)===prev))$('paper').value=prev;
  }
  function sourceFits(s) {
    const p=bank.papers[s[0]];
    return (!$('module').value||s[1]===$('module').value)&&(!$('topic').value||s[2]===$('topic').value)&&(!$('year').value||p.year===$('year').value)&&(!$('region').value||p.region===$('region').value)&&(mode!=='paper'||String(s[0])===$('paper').value);
  }
  function updateCandidates() {
    candidates=[];
    const scope=$('scope').value;
    for(const item of bank.index){
      const r=records.get(item[0]);
      if(mode==='wrong'&&!r?.wrong)continue;
      if(mode==='star'&&!r?.star)continue;
      if(mode!=='wrong'&&mode!=='star'&&((scope==='new'&&r?.attempts>0)||(scope==='wrong'&&!r?.wrong)))continue;
      const sources=item[2].filter(sourceFits);
      if(!sources.length)continue;
      if(mode==='paper')for(const source of sources)candidates.push({id:item[0],source,chunk:item[1],group:item[4],gradable:item[3]});
      else candidates.push({id:item[0],source:sources[0],chunk:item[1],group:item[4],gradable:item[3]});
    }
    candidates.sort((a,b)=>Number(bank.papers[b.source[0]].year)-Number(bank.papers[a.source[0]].year)||a.source[0]-b.source[0]||bank.modules.indexOf(a.source[1])-bank.modules.indexOf(b.source[1])||a.source[3]-b.source[3]);
    const manual=candidates.filter(x=>!x.gradable).length;
    $('match-count').textContent=`找到 ${nf.format(candidates.length)} 道${mode==='paper'?'原卷':'可练'}题目`;
    $('match-note').textContent=mode==='paper'?'按模块和原题号排列，可用“全部模块”练整套试卷。':mode==='wrong'?'错题保留至主动标记“已掌握”；答对不会自动移出。':mode==='star'?'收藏独立于答题记录，可以随时取消。':'相同题目合并、不同版本保留；材料题整组抽取，题量可能略超所选数量。';
    if(manual)$('match-note').textContent+=` 其中 ${manual} 题缺少有效答案或选项，只能阅读解析。`;
    $('start').disabled=busy||!candidates.length;
    $('quick-five').disabled=busy||!candidates.length;$('quick-ten').disabled=busy||!candidates.length;
  }

  window.registerQuestions=(bucket,items)=>{for(const q of items)questions.set(q.id,q);};
  function loadChunk(bucket) {
    if(!/^[a-f0-9]{2}$/.test(bucket))return Promise.reject(new Error('题库分片标识无效'));
    if(chunks.has(bucket))return chunks.get(bucket);
    const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`data/q-${bucket}.js`;s.onload=resolve;s.onerror=()=>{chunks.delete(bucket);s.remove();reject(new Error('题目文件读取失败，请确认 data 文件夹完整'));};document.head.append(s);});chunks.set(bucket,p);return p;
  }
  async function loadQueue(queue) {
    const buckets=[...new Set(queue.map(x=>metaById.get(x.id)[1]))];let position=0;
    await Promise.all(Array.from({length:Math.min(5,buckets.length)},async()=>{while(position<buckets.length){const b=buckets[position++];await loadChunk(b);}}));
    if(queue.some(x=>!questions.has(x.id)))throw new Error('题目内容不完整，请检查 data 文件夹。');
  }
  function makeQueue() {
    if(mode==='paper')return candidates.map(({id,source})=>({id,source}));
    return window.STUDY_CORE.groupQueue(candidates,Number($('batch').value),$('order').value==='random');
  }
  async function startSession(resume=false) {
    if(busy)return;busy=true;$('start').disabled=true;$('resume').disabled=true;
    const original=$('start').innerHTML;$('start').textContent='正在装好这一组题…';
    try{
      const next=resume?savedSession:{version:1,mode,queue:makeQueue(),position:0,responses:{},startedAt:Date.now(),updatedAt:Date.now()};
      if(!validSession(next))throw new Error('练习记录无效，请重新选题。');
      await loadQueue(next.queue);session=structuredClone(next);saveSession();$('setup').hidden=true;$('study').hidden=false;$('mobile-quick').hidden=true;document.body.classList.add('studying');$('mobile-answer-bar').hidden=false;renderQuestion();window.scrollTo({top:0,behavior:'smooth'});
      const offlineFiles=new Set(next.queue.map(x=>'data/q-'+metaById.get(x.id)[1]+'.js'));
      for(const slot of next.queue){const q=questions.get(slot.id);for(const html of [q.stem,q.material,q.analysis,...q.options.map(o=>o[1])])for(const m of html.matchAll(/src="(images\/[^"]+)"/g))offlineFiles.add(m[1]);}
      window.dispatchEvent(new CustomEvent('study-session-ready',{detail:{files:[...offlineFiles],ids:next.queue.map(x=>x.id)}}));
    }catch(error){toast(error.message);}
    finally{busy=false;$('start').innerHTML=original;$('resume').disabled=false;updateCandidates();if(session&&!$('study').hidden)renderOptions();}
  }
  function imageWatch(container) {
    container.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.classList.add('missing');img.alt='原题图片缺失';$('image-warning').hidden=false;},{once:true});});
  }
  function showRich(id,html) {$(id).innerHTML=html;imageWatch($(id));}
  function currentQuestion(){return questions.get(session.queue[session.position].id);}
  function currentResponse(){return session.responses[session.position];}
  function renderQuestion() {
    const q=currentQuestion(), slot=session.queue[session.position],r=records.get(q.id),response=currentResponse();selected=response?[...response.answer]:[];
    $('image-warning').hidden=true;$('save-status').textContent='';
    $('session-label').textContent=session.mode==='paper'?'整卷练习':session.mode==='wrong'?'错题复习':session.mode==='star'?'收藏重练':'专项练习';
    $('question-type').textContent=!q.answer?'仅供阅读':q.answer.length>1?'多项选择':'单项选择';$('question-topic').textContent=slot.source[1]+' · '+slot.source[2];$('question-qid').textContent='qid '+q.qid;
    $('question-number').textContent=`第 ${session.position+1} 题`;
    showRich('question-stem',q.stem);$('material-card').hidden=!q.material;$('question-layout').classList.toggle('has-material',!!q.material);showRich('material',q.material);
    $('manual-note').hidden=!!q.answer;$('manual-note').textContent='原题缺少有效标准答案或选项，本题仅供阅读，不计入自动判题和正确率。';
    $('submit').textContent=q.answer?'提交答案':'查看解析';$('submit').hidden=!!response;$('retry').hidden=!response||!q.answer;
    $('result').hidden=!response;$('analysis-section').hidden=!response;
    $('options').setAttribute('aria-label',q.answer.length>1?'多选题，请选择所有正确选项':'单选题，请选择一个选项');
    if(response){
      $('result').className='result'+(response.correct===false?' incorrect':'');
      $('result').textContent=response.correct===null?`本题不做自动判分。原记录答案：${q.answerText||'缺失'}。`:response.correct?`回答正确 · 标准答案 ${q.answer}`:`本次选择 ${response.answer.join('')}，标准答案 ${q.answer}。已加入错题本。`;
      showRich('analysis',q.analysis||'原题库没有提供解析。');
    }else{$('analysis').replaceChildren();$('result').textContent='';}
    renderOptions();renderStarAndMaster();renderNavigator();
    const sources=metaById.get(q.id)[2];$('sources-summary').textContent=`题目来源 · ${sources.length} 处记录 · 当前：${bank.papers[slot.source[0]].region} ${bank.papers[slot.source[0]].year} · 原第 ${slot.source[3]} 题`;
    $('sources').replaceChildren(...sources.map(s=>{const li=document.createElement('li');li.textContent=`${bank.papers[s[0]].title} / ${s[1]} / 第 ${s[3]} 题`;return li;}));
    $('prev').disabled=session.position===0;$('next').textContent=session.position===session.queue.length-1?'查看本组结果 ✓':'下一题 →';
  }
  function renderOptions() {
    const q=currentQuestion(), response=currentResponse();
    $('options').replaceChildren(...q.options.map(([key,content])=>{
      const b=document.createElement('button');b.type='button';b.className='option';b.dataset.key=key;b.setAttribute('aria-pressed',String(selected.includes(key)));b.disabled=!!response||!q.answer;
      b.innerHTML=`<span class="option-letter">${key}</span><span class="rich-text">${content}</span>`;b.classList.toggle('selected',selected.includes(key));
      if(response&&q.answer){b.classList.toggle('correct',q.answer.includes(key));b.classList.toggle('incorrect',selected.includes(key)&&!q.answer.includes(key));}
      b.addEventListener('click',()=>choose(key));imageWatch(b);return b;
    }));
    $('submit').disabled=busy||(!!q.answer&&!selected.length);
    syncMobileControls();
  }
  function syncMobileControls(){
    if(!session)return;const q=currentQuestion(),response=currentResponse();
    $('mobile-prev').disabled=busy||session.position===0;
    $('mobile-next').disabled=busy;$('mobile-next').textContent=session.position===session.queue.length-1?'本组结果':'下一题';
    $('mobile-submit').textContent=response?(q.answer?'重新作答':'已阅读'):(q.answer?'提交答案':'查看解析');
    $('mobile-submit').disabled=busy||(response?!q.answer:!!q.answer&&!selected.length);
  }
  function choose(key) {
    if(!session||busy||currentResponse())return;
    const q=currentQuestion();if(!q.answer||!q.options.some(o=>o[0]===key))return;
    if(q.answer.length>1)selected=selected.includes(key)?selected.filter(x=>x!==key):[...selected,key].sort();else selected=[key];
    renderOptions();
  }
  function renderStarAndMaster(){const r=records.get(currentQuestion().id);$('star').textContent=r?.star?'★ 已收藏':'☆ 收藏本题';$('star').setAttribute('aria-pressed',String(!!r?.star));$('master').hidden=!r?.wrong;}
  function renderNavigator() {
    const n=session.queue.length, responses=Object.values(session.responses), done=responses.length, scored=responses.filter(x=>x.correct!==null), correct=scored.filter(x=>x.correct).length;
    $('session-progress-label').textContent=`进度 ${done} / ${n}`;$('session-progress-fill').style.width=`${done/n*100}%`;$('session-score').textContent=scored.length?`本组正确率 ${Math.round(correct/scored.length*100)}%`:'准备就绪';
    $('question-nav').replaceChildren(...session.queue.map((_,i)=>{const b=document.createElement('button');b.textContent=i+1;b.className=(i===session.position?'current ':'')+(session.responses[i]?session.responses[i].correct===true?'done-correct':session.responses[i].correct===false?'done-wrong':'':'');b.setAttribute('aria-label',`第 ${i+1} 题，${session.responses[i]?session.responses[i].correct===true?'答对':session.responses[i].correct===false?'答错':'已阅读':'未答'}`);if(i===session.position)b.setAttribute('aria-current','step');b.onclick=()=>goTo(i);return b;}));
    $('group-note').textContent=done===n?`本组已完成：${correct} 题答对，${scored.length-correct} 题答错${done>scored.length?`，${done-scored.length} 题仅阅读`:''}。可回看解析，或返回选题继续练习。`:'可以随时切题；答题记录自动保存，未提交的选择不会计分。';
  }
  async function submit() {
    if(!session||busy||currentResponse())return;
    const q=currentQuestion();if(q.answer&&!selected.length)return;
    busy=true;$('submit').disabled=true;
    try {
      const correct=window.STUDY_CORE.grade(q.answer,selected);
      let saved=true;
      if(correct!==null){
        const r=structuredClone(records.get(q.id)||freshRecord(q.id));r.attempts++;r.correctCount+=correct?1:0;r.lastAnswer=selected.join('');r.lastCorrect=correct;r.wrong=r.wrong||!correct;r.lastAt=Date.now();
        r.days=r.days||{};const key=todayKey(new Date());r.days[key]=r.days[key]||[0,0];r.days[key][0]++;r.days[key][1]+=correct?1:0;
        saved=await saveRecord(r);
      }
      session.responses[session.position]={answer:[...selected],correct,at:Date.now()};saveSession();renderQuestion();renderStats();
      $('save-status').textContent=correct===null?'不计入自动判题':saved?'已保存到本地':'暂存于本页面，请导出备份';
    } finally {busy=false;syncMobileControls();}
  }
  function goTo(i){if(busy||i<0||i>=session.queue.length)return;session.position=i;saveSession();renderQuestion();$('study').scrollIntoView({behavior:'smooth',block:'start'});}

  async function toggleStar(){if(!session||busy)return;busy=true;try{const r=structuredClone(records.get(currentQuestion().id)||freshRecord(currentQuestion().id));r.star=!r.star;const saved=await saveRecord(r);renderStarAndMaster();renderStats();toast(saved?(r.star?'已加入收藏':'已取消收藏'):'已暂存，请导出备份');}finally{busy=false;}}
  async function markMaster(){if(!session||busy)return;busy=true;try{const r=structuredClone(records.get(currentQuestion().id)||freshRecord(currentQuestion().id));r.wrong=false;const saved=await saveRecord(r);renderStarAndMaster();renderStats();toast(saved?'已从待巩固错题中移出，答题记录仍保留':'已暂存，请导出备份');}finally{busy=false;}}

  function openPrint(){
    if(!session||busy)return;
    $('print-summary').textContent=`打印当前整组 ${session.queue.length} 道题，包括尚未作答的题目。`;
    $('print-message').textContent='';$('print-dialog').showModal();
  }
  async function printSession(){
    if(!session||busy)return;busy=true;$('print-go').disabled=true;$('print-close').disabled=true;$('print-cancel').disabled=true;
    $('print-message').textContent='正在准备题目和图片…';
    try{
      const title=session.mode==='paper'?bank.papers[session.queue[0].source[0]].title:(titles[session.mode]?'行测自习室 · '+(session.mode==='wrong'?'错题复习':session.mode==='star'?'收藏练习':'专项练习'):'行测练习');
      $('print-root').innerHTML=window.STUDY_PRINT.build({queue:session.queue,questions,papers:bank.papers,title,content:$('print-content').value,space:$('print-space').value});
      let missing=0;
      const images=[...$('print-root').querySelectorAll('img')];
      const loaded=Promise.all(images.map(img=>new Promise(resolve=>{const finish=()=>{if(!img.naturalWidth){missing++;img.alt='原题图片缺失';}resolve();};if(img.complete)finish();else{img.onload=finish;img.onerror=finish;}})));
      let timer;try{await Promise.race([loaded,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('图片尚未加载完成，请稍后重新打印。')),20000);})]);}finally{clearTimeout(timer);}
      if(missing){const note=$('print-image-note');if(note){note.hidden=false;note.textContent=`注意：本卷有 ${missing} 处图片无法显示，可能影响作答。`; }else{const note=document.createElement('p');note.className='print-notice';note.textContent=`本份解析有 ${missing} 处图片无法显示。`;$('print-root').prepend(note);}}
      if(document.fonts?.ready)await document.fonts.ready;
      $('print-dialog').close();
      document.body.classList.add('print-active');
      window.print();
      $('print-message').textContent=missing?`本份内容有 ${missing} 处图片缺失，请在打印预览中核对。`:'打印窗口已打开；也可以选择另存为 PDF。';
    }catch(error){$('print-message').textContent='无法准备打印：'+error.message;}
    finally{document.body.classList.remove('print-active');if(!$('print-dialog').open)$('print-dialog').showModal();busy=false;$('print-go').disabled=false;$('print-close').disabled=false;$('print-cancel').disabled=false;}
  }

  function exportBackup(){
    const payload={app:'xingce-study',version:1,exportedAt:new Date().toISOString(),bank:{total:bank.total,unique:bank.unique},records:[...records.values()]};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`行测学习备份-${todayKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('backup-message').textContent=`已生成包含 ${records.size} 道题学习记录的备份。请妥善保存下载的 JSON 文件。`;
  }
  function validateRecord(r) {
    return window.STUDY_CORE.validateRecord(r,metaById);
  }
  async function importBackup(file){
    if(!file||busy)return;busy=true;$('backup-message').textContent='正在核对备份…';
    try{
      if(file.size>40*1024*1024)throw new Error('备份文件超过 40 MB，请确认选中的是学习备份。');
      const data=JSON.parse(await file.text());
      if(data.app!=='xingce-study'||data.version!==1||!Array.isArray(data.records)||data.records.length>bank.unique)throw new Error('不是有效的行测自习室学习备份。');
      const seen=new Set();for(const r of data.records){if(!validateRecord(r)||seen.has(r.id))throw new Error('备份含有无效、重复或不匹配的题目记录；此次导入已取消。');seen.add(r.id);}
      const changed=data.records.filter(r=>!records.has(r.id)||records.get(r.id).updatedAt<r.updatedAt);
      const clean=changed.map(r=>({id:r.id,attempts:r.attempts,correctCount:r.correctCount,wrong:r.wrong,star:r.star,updatedAt:r.updatedAt,days:r.days,...(r.lastAt!==undefined?{lastAt:r.lastAt}:{}),...(r.lastAnswer!==undefined?{lastAnswer:r.lastAnswer}:{}),...(r.lastCorrect!==undefined?{lastCorrect:r.lastCorrect}:{})}));
      if(db){const tx=db.transaction('records','readwrite');for(const r of clean)tx.objectStore('records').put(r);await transaction(tx);}
      else if(!memoryOnly){const next=new Map(records);for(const r of clean)next.set(r.id,r);localStorage.setItem(FALLBACK_KEY,JSON.stringify([...next.values()]));}
      for(const r of clean)records.set(r.id,r);renderStats();updateCandidates();if(session)renderStarAndMaster();
      $('backup-message').textContent=`导入完成：更新 ${clean.length} 道题，保留 ${data.records.length-clean.length} 道题的现有较新记录。${memoryOnly?'当前仅暂存，关闭前请导出备份。':''}`;
    }catch(error){$('backup-message').textContent='导入失败：'+error.message;}
    finally{busy=false;$('import').value='';}
  }

  $('today').innerHTML=esc(new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric'}))+'<br>'+esc(new Date().toLocaleDateString('zh-CN',{weekday:'long'}));
  $('bank-summary').textContent=`${nf.format(bank.total)} 条原卷记录 / ${nf.format(bank.unique)} 道合并后题目`;
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(busy)return;setMode(b.dataset.mode);});
  document.querySelector('.brand').onclick=e=>{e.preventDefault();if(!busy)setMode('practice');};
  for(const id of ['module','topic','year','region','scope','order','batch','paper'])$(id).addEventListener('change',()=>{if(id==='module')refreshTopics();if(id==='year'||id==='region')refreshPapers();updateCandidates();});
  $('start').onclick=()=>startSession();$('resume').onclick=()=>startSession(true);
  $('quick-five').onclick=()=>{$('batch').value='5';startSession();};$('quick-ten').onclick=()=>{$('batch').value='10';startSession();};
  $('mobile-prev').onclick=()=>$('prev').click();$('mobile-next').onclick=()=>$('next').click();$('mobile-submit').onclick=()=>currentResponse()?$('retry').click():submit();
  $('back').onclick=()=>{if(!busy)setMode(mode);};$('submit').onclick=submit;$('star').onclick=toggleStar;$('master').onclick=markMaster;
  $('retry').onclick=()=>{if(busy)return;delete session.responses[session.position];saveSession();renderQuestion();toast('可以重新作答；历史作答次数和错题记录仍保留。');};
  $('prev').onclick=()=>goTo(session.position-1);$('next').onclick=()=>{if(session.position<session.queue.length-1)goTo(session.position+1);else{renderNavigator();$('question-nav').scrollIntoView({behavior:'smooth',block:'center'});toast($('group-note').textContent);}};
  $('backup-open').onclick=()=>$('backup-dialog').showModal();$('backup-close').onclick=()=>$('backup-dialog').close();$('export').onclick=exportBackup;$('import').onchange=e=>importBackup(e.target.files[0]);
  $('print-open').onclick=openPrint;$('print-close').onclick=()=>$('print-dialog').close();$('print-cancel').onclick=()=>$('print-dialog').close();$('print-go').onclick=printSession;
  document.addEventListener('keydown',e=>{if(!session||$('study').hidden||$('backup-dialog').open||$('print-dialog').open||busy||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(/^[1-8]$/.test(e.key)){e.preventDefault();choose(String.fromCharCode(64+Number(e.key)));}else if(e.key==='Enter'&&e.target===document.body){e.preventDefault();submit();}else if(e.key==='ArrowRight'){e.preventDefault();goTo(session.position+1);}else if(e.key==='ArrowLeft'){e.preventDefault();goTo(session.position-1);}});
  initFilters();
  openStore().then(()=>{updateCandidates();setMode('practice');}).catch(error=>{$('match-count').textContent='初始化失败：'+error.message;});
})();
