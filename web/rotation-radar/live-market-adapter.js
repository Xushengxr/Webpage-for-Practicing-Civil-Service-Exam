/* 轮动雷达新版界面数据适配器。
 * 行情只读原有 GitHub Actions 更新的 data/market.json，不在浏览器调用第三方实时行情服务。
 * 最新日收盘只用于观察；月末前不得将预演金额当作已确认调仓指令。
 */
(() => {
  'use strict';
  const ROOT = 'https://raw.githubusercontent.com/Xushengxr/Webpage-for-Practicing-Civil-Service-Exam/main/web/rotation-radar/data/market.json';
  const API = 'https://api.github.com/repos/Xushengxr/Webpage-for-Practicing-Civil-Service-Exam/contents/web/rotation-radar/data/market.json?ref=main';
  const STRATEGY = 'cyb-dividend-fixed-v21-0375-0625';
  const INITIAL_MONTHS = RAW_DATA.map(x => x.slice());
  let market = null;
  let busy = false;
  const $ = id => document.getElementById(id);
  const n = v => Number(v).toLocaleString('zh-CN',{maximumFractionDigits:3});
  const ym = d => String(d).slice(0,7);
  const todayChina = () => {
    const parts = Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const obj = Object.fromEntries(parts.map(x => [x.type,x.value]));
    return obj.year + '-' + obj.month + '-' + obj.day;
  };
  function stale(date) {
    const t = new Date(date + 'T16:00:00+08:00').getTime();
    const days = (Date.now()-t)/86400000;
    return !Number.isFinite(days) || days>7 || days< -1;
  }
  function valid(x) {
    return x && x.demo === false && x.strategy && x.strategy.id === STRATEGY &&
      x.latest && /^\d{4}-\d{2}-\d{2}$/.test(x.latest.date) &&
      Number.isFinite(+x.latest.growth) && +x.latest.growth>0 &&
      Number.isFinite(+x.latest.dividend) && +x.latest.dividend>0 &&
      Array.isArray(x.history) && x.history.length>=20 && x.forecast;
  }
  async function getJson(url) {
    const controller = new AbortController();
    const cutoff = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url,{cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}});
      if (!res.ok) throw Error('HTTP '+res.status);
      let data = await res.json();
      if (data && data.encoding==='base64' && typeof data.content==='string') {
        const bin=atob(data.content.replace(/\s/g,''));
        const arr=Uint8Array.from(bin,c=>c.charCodeAt(0));
        data=JSON.parse(new TextDecoder().decode(arr));
      }
      if (!valid(data)) throw Error('策略版本或行情字段不符合预期');
      return data;
    } finally {clearTimeout(cutoff);}
  }
  function mergeMonthly(x) {
    const m = new Map(INITIAL_MONTHS.map(r=>[r[0],r.slice()]));
    // 历史档案沿用上传模板；最近约260个交易日的月末由原自动行情覆盖，避免固定值不更新。
    const recent=new Map();
    for (const row of x.history) {
      if (!row || !row.date || !(+row.growth>0) || !(+row.dividend>0)) continue;
      const key=ym(row.date);
      if (!recent.has(key) || row.date>recent.get(key).date) recent.set(key,row);
    }
    const latest=x.latest, latestMonth=ym(latest.date);
    recent.set(latestMonth,latest);
    for (const [key,row] of recent) m.set(key,[key,+row.growth,+row.dividend]);
    // 当月月末尚未确认时，不允许将其当作完整月线参与历史回测。
    if (!x.forecast.is_confirmed && latestMonth===ym(todayChina())) m.delete(latestMonth);
    const result=[...m.values()].filter(row=>row[0]>='2010-06' && row[0]<=latestMonth && row[1]>0 && row[2]>0).sort((a,b)=>a[0].localeCompare(b[0]));
    if (result.length<100) throw Error('月线样本不足，停止覆盖');
    RAW_DATA=result;
    HIST_RATIOS=result.map(r=>r[1]/r[2]);
    const title=$('backtestDateTitle');
    if(title) title.textContent='2010–'+result[result.length-1][0]+' 历史月线回测对比';
    const number=$('backtestCountTag');
    if(number) number.textContent='MODULE 02 · '+result.length+'期月线回测';
    const note=$('backtestPeriodNote');
    if(note) note.textContent='2010-06 至 '+result[result.length-1][0]+'，共 '+result.length+' 个完整或已收盘的样本月。月内快照不计入回测；月初执行价以上月末收盘代理，属于近似模拟。';
  }
  function setStatus(text,type) {
    const bar=$('liveStatusBar');
    if (!bar) return;
    bar.textContent=text;
    bar.className = 'rounded-xl border px-4 py-3 text-sm leading-relaxed ' +
      (type==='ok'?'bg-emerald-50 border-emerald-200 text-emerald-900':
       type==='warn'?'bg-amber-50 border-amber-300 text-amber-950':
                       'bg-rose-50 border-rose-300 text-rose-900');
  }
  function markSafety(){
    const box=$('primaryActionBox');
    if(!box) return;
    let child=$('liveSignalWarning');
    if(!child){
      child=document.createElement('div');
      child.id='liveSignalWarning';
      child.className='rounded-lg border border-amber-400/50 bg-amber-500/10 text-amber-200 p-3 text-xs leading-relaxed mt-3';
      box.appendChild(child);
    }
    const confirmed=market && market.forecast && market.forecast.is_confirmed && !stale(market.latest.date);
    if (!market) {
      child.textContent='行情尚未核验。上方任何显示点位、调仓金额均为历史演示，请勿据此交易。';
    } else if (stale(market.latest.date)) {
      child.textContent='行情已过期（最近共同收盘 '+market.latest.date+'）。不生成正式交易指令，请检查 GitHub Actions。';
    } else if (!confirmed) {
      child.textContent='【月内观察，非交易指令】本页按最新收盘模拟分三个月转仓。正式信号必须以月末确认，并在下月首个交易日核对后执行。原V2.1三档规则请打开旧版面板。';
    } else {
      child.textContent='【月末已确认】原V2.1信号：'+(market.forecast.kind==='hold'?'本轮维持原方向':('计划转向 '+(market.forecast.side==='growth'?'创业板':'中证红利')))+'；预期执行日 '+(market.forecast.expected_execution||'待核实')+'。本页自定义参数及三个月方案属于独立模拟，与旧版三档规则不同。';
    }
    const badge=$('actionStatusPill');
    if (badge && !confirmed) {
      badge.textContent='仅供模拟 · 未获月末确认';
      badge.className='px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30';
    }
  }
  const origUpdate=updateAll;
  updateAll=function(){
    origUpdate();
    markSafety();
  };
  async function refresh(){
    if(busy)return;
    busy=true;
    setStatus('正在通过原有 GitHub 行情文件检查最新收盘数据…','warn');
    const urls=[ROOT+'?t='+Date.now(),API+'&t='+Date.now(),'./data/market.json?nocache='+Date.now()];
    let loaded=null;
    for(const url of urls) {
      try { const x=await getJson(url); if (!loaded || x.latest.date>loaded.latest.date)loaded=x; if (!stale(x.latest.date))break; }
      catch(err) {console.warn('轮动雷达备用行情源切换：',String(err));}
    }
    if (!loaded) {
      market=null;
      setStatus('未能从原仓库取得有效行情。模板历史数据只供离线回测展示；当前指令不可用于交易。旧版V2.1仍可独立访问。','error');
      markSafety();
      busy=false;return;
    }
    market=loaded;
    try { mergeMonthly(loaded); }
    catch(err) {console.error('合并月线失败',err);setStatus('最新收盘已取得，但历史月线合并失败；回测仍为离线样本，不可视作已更新。','warn');}
    state.cyb=+market.latest.growth;
    state.div=+market.latest.dividend;
    $('inputCyb').value=state.cyb.toFixed(3);
    $('inputDiv').value=state.div.toFixed(2);
    const dateTag=$('topSnapshotDate');if(dateTag)dateTag.textContent=market.latest.date+' 收盘';
    $('simBtnCurrent').textContent='最新 '+(+market.latest.growth/+market.latest.dividend).toFixed(4);
    const info='最新共同收盘：'+market.latest.date+
      '；创业板 '+n(market.latest.growth)+' 点 / 中证红利 '+n(market.latest.dividend)+
      ' 点；数据源：'+(market.price_sources?.growth||'原有行情服务')+'、'+(market.price_sources?.dividend||'原有行情服务')+
      '；仓库生成时间：'+(market.generated_at||'未提供')+'。';
    if(stale(market.latest.date))setStatus('行情已过期，暂停正式指令。'+info,'warn');
    else if(market.forecast.is_confirmed)setStatus('月末确认数据。'+info,'ok');
    else setStatus('月内收盘快照（非实时盘中、非月末正式信号）。'+info,'warn');
    updateAll();
    busy=false;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const current=$('simBtnCurrent'),reset=$('btnResetDefaults');
    if(current)current.addEventListener('click',e=>{
      if(!market)return;
      e.stopImmediatePropagation();
      state.cyb=+market.latest.growth;state.div=+market.latest.dividend;
      $('inputCyb').value=state.cyb.toFixed(3);$('inputDiv').value=state.div.toFixed(2);
      updateAll();
    },true);
    if(reset)reset.addEventListener('click',e=>{
      e.stopImmediatePropagation();
      state.capital=50000;state.monthly=1000;state.holding='div';
      state.lower=0.375;state.upper=0.625;state.batches=3;
      state.includeDiv=false;state.yScale='linear';state.logFilter='all';state.logExpanded=false;
      if(market){state.cyb=+market.latest.growth;state.div=+market.latest.dividend;}
      $('inputCapital').value=state.capital;$('inputMonthly').value=state.monthly;
      $('inputCyb').value=state.cyb;$('inputDiv').value=state.div;
      $('selectHolding').value=state.holding;$('toggleDividend').checked=false;
      updateAll();
    },true);
    refresh();
    const button=document.createElement('button');
    button.className='ml-2 underline underline-offset-2';
    button.type='button';button.textContent='手动检查更新';
    button.addEventListener('click',refresh);
    const bar=$('liveStatusActions');if(bar)bar.appendChild(button);
  });
})();