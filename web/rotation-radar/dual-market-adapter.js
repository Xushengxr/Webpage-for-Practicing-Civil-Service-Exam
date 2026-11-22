/* 三指数双策略新版看板：接续原market.json + 单独hstech.json；页面从不伪称盘中实时。 */
(()=>{'use strict';
const BASE='https://raw.githubusercontent.com/Xushengxr/Webpage-for-Practicing-Civil-Service-Exam/main/web/rotation-radar/data/';
const API='https://api.github.com/repos/Xushengxr/Webpage-for-Practicing-Civil-Service-Exam/contents/web/rotation-radar/data/';
const STRATEGY='cyb-dividend-fixed-v21-0375-0625',OFFLINE=RAW_DATA.map(x=>x.slice());
const $=id=>document.getElementById(id),ym=s=>String(s).slice(0,7),p2=v=>Number(v).toFixed(2);
let original=null,hk=null,syncLatest=null,loading=false;
const nowMonth=()=>{const parts=Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());return parts.slice(0,7);}
function old(date){const t=Date.parse(date+'T16:00:00+08:00'),days=(Date.now()-t)/86400000;return !Number.isFinite(days)||days>7||days< -1;}
function validA(x){return !!(x&&x.demo===false&&x.strategy?.id===STRATEGY&&x.latest?.date&&+x.latest.growth>0&&+x.latest.dividend>0&&Array.isArray(x.history)&&x.history.length>=20)}
function validHK(x){return !!(x&&x.series==='HSTECH'&&x.latest?.date&&+x.latest.close>0&&Array.isArray(x.monthly)&&x.monthly.length>=50)}
async function fetchOne(path){const urls=[BASE+path+'?t='+Date.now(),API+path+'?ref=main&t='+Date.now(),'./data/'+path+'?t='+Date.now()];let result=null;
for(const u of urls){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7500);
try{const resp=await fetch(u,{cache:'no-store',signal:ctl.signal});if(!resp.ok)throw Error('HTTP '+resp.status);let x=await resp.json();
if(x?.encoding==='base64'){const b=Uint8Array.from(atob(x.content.replace(/\s/g,'')),c=>c.charCodeAt(0));x=JSON.parse(new TextDecoder().decode(b));}
const ok=path==='market.json'?validA(x):validHK(x);if(!ok)throw Error('数据校验不通过');
if(!result||x.latest.date>result.latest.date)result=x;
if(!old(x.latest.date))break;
}catch(e){console.warn(path+' 备用行情地址',String(e))}finally{clearTimeout(timer);}
}return result;}
function lastCommon(a,h){
const idx=new Map();
for(const x of a.history){if(x.date&&+x.growth>0&&+x.dividend>0)idx.set(x.date,x)}
idx.set(a.latest.date,a.latest);
const j=new Map();
for(const x of (h.history||[])){if(x.date&&+x.close>0)j.set(x.date,x)}
j.set(h.latest.date,h.latest);
const dates=[...idx.keys()].filter(d=>j.has(d)).sort();
const last=dates.at(-1);return last?{date:last,growth:+idx.get(last).growth,dividend:+idx.get(last).dividend,hstech:+j.get(last).close}:null;
}
function historyMerge(a,h){
const m=new Map(OFFLINE.filter(x=>x[0]<nowMonth()).map(x=>[x[0],x.slice()]));
const am=new Map();
for(const r of a.history){if(r.date&&+r.growth>0&&+r.dividend>0){const k=ym(r.date);if(!am.has(k)||am.get(k).date<r.date)am.set(k,r)}}
const hm=new Map((h.monthly||[]).filter(v=>v.month&&+v.close>0).map(v=>[v.month,v]));
for(const [month,v] of am)if(month<nowMonth()&&hm.has(month))m.set(month,[month,+v.growth,+v.dividend,+hm.get(month).close]);
// 即使HK完整月线源不可用，也不能用其旧点位拼接当前月模拟收益。
const arr=[...m.values()].filter(x=>x[0]>='2020-10'&&x[0]<nowMonth()&&x.every((v,i)=>i===0||+v>0)).sort((x,y)=>x[0].localeCompare(y[0]));
if(arr.length<50)throw Error('历史月线少于50期');
RAW_DATA=arr;HIST_RATIO_A=arr.map(x=>x[1]/x[2]);HIST_RATIO_B=arr.map(x=>x[3]/x[2]);
$('dualBtRange').textContent=arr[0][0]+' 至 '+arr.at(-1)[0]+'（'+arr.length+'期完整月线）';
$('dualBtInvestedSub').textContent='期初资金 + '+(arr.length-1)+'个月×定投';
$('dualBtTitle').textContent=arr[0][0]+'～'+arr.at(-1)[0]+' 双策略历史月线回测';
$('dualAssetTitle').textContent='资产曲线对比（'+arr[0][0]+' 至 '+arr.at(-1)[0]+'）';
}
function status(msg,bad){const e=$('dualDataStatus');e.textContent=msg;e.className='rounded-xl border px-4 py-3 text-xs sm:text-sm leading-relaxed '+(bad?'border-amber-500/40 bg-amber-500/10 text-amber-200':'border-emerald-500/40 bg-emerald-500/10 text-emerald-200');}
function safety(){const v=!!original&&!old(original.latest.date),b=!!syncLatest&&!old(syncLatest.date);
const a=$('instructionBoxA'),bb=$('instructionBoxB');
for(const [box,id,bad,txt] of [
 [a,'warningA',!v,'A账户：'+(!v?'行情过期或获取失败，禁止依据此演示执行交易。':original?.forecast?.is_confirmed?'原创业板V2.1月末已确认；本页0.35/0.62属于另一种模拟参数。':'当月收盘快照尚未月末确认，仅供观察。')],
 [bb,'warningB',!b,'B账户：'+(!b?'没有找到两地同日有效收盘价，暂停B账户正式信号。':'两地同日收盘 '+syncLatest.date+'。恒科0.65/0.85为可修改的模拟阈值；正式月末需要两地各自月末数据确认。')]
]){
 if(!box)continue;let ch=$(id);
 if(!ch){ch=document.createElement('div');ch.id=id;ch.className='mt-3 pt-2 border-t border-slate-700 text-[11px]';box.appendChild(ch)}
 ch.textContent=txt;ch.style.color=bad?'#fbbf24':'#a1a1aa';
}
const stamp=$('dualLastDate');if(stamp)stamp.textContent=(syncLatest?.date||original?.latest?.date||'未核实')+' 收盘';
}
const render=updateAll;
updateAll=function(){render();safety();};
function refreshLatest(){
if(syncLatest){state.cyb=syncLatest.growth;state.div=syncLatest.dividend;state.hstech=syncLatest.hstech;}
else if(original){state.cyb=+original.latest.growth;state.div=+original.latest.dividend;}
for(const [id,k] of [['inputCyb','cyb'],['inputDiv','div'],['inputHstech','hstech']])$(id).value=p2(state[k]);
updateAll();
}
async function refresh(){
if(loading)return;loading=true;status('正在核对原GitHub A股指数行情与独立恒生科技行情，未验证前页面仅供模拟。',true);
const [ar,hr]=await Promise.all([fetchOne('market.json'),fetchOne('hstech.json')]);
original=ar;hk=hr;syncLatest=ar&&hr?lastCommon(ar,hr):null;
try{if(ar&&hr)historyMerge(ar,hr)}catch(e){console.error('历史月线合并:',e)}
if(ar&&hr&&syncLatest&&!old(syncLatest.date)){
status('已更新至两地最近共同收盘日 '+syncLatest.date+'：创业板 '+p2(syncLatest.growth)+' / 中证红利 '+p2(syncLatest.dividend)+' / 恒生科技 '+p2(syncLatest.hstech)+'。数据来自原GitHub收盘行情工作流、恒科日线接口；月内非正式信号。',false);
}else status('行情未能完整核验：'+(!ar?'A股原始行情缺失；':'')+(!hr?'恒科行情缺失；':'')+(!syncLatest?'两地没有同日收盘；':'')+((ar&&old(ar.latest.date))||(syncLatest&&old(syncLatest.date))?'报价日期过期；':'')+'可以查看历史模拟，但不得直接据此交易。',true);
if(syncLatest)refreshLatest();else if(ar){state.cyb=+ar.latest.growth;state.div=+ar.latest.dividend;$('inputCyb').value=p2(state.cyb);$('inputDiv').value=p2(state.div);updateAll();}else updateAll();
if(ar)window.dispatchEvent(new CustomEvent('dual-market-updated',{detail:{original:ar,hstech:hr,latest:syncLatest}}));
loading=false;
}
document.addEventListener('DOMContentLoaded',()=>{
const r=$('btnRestoreLatest');
if(r)r.addEventListener('click',e=>{e.stopImmediatePropagation();refreshLatest()},true);
const s=$('btnSimDoubleBottom');if(s)s.addEventListener('click',e=>{e.stopImmediatePropagation();state.cyb=+(state.div*0.34).toFixed(2);state.hstech=+(state.div*0.62).toFixed(2);
$('inputCyb').value=state.cyb;$('inputHstech').value=state.hstech;updateAll();status('当前为手动假设场景，不是最新行情。点击“恢复最新收盘”回到自动行情。',true)},true);
$('btnRefreshDual').addEventListener('click',refresh);refresh();
});
})();