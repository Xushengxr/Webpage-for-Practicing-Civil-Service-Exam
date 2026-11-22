/* 60/40双策略个人账本。绝不上传个人仓位，独立于旧版V2.1账本。 */
(()=>{'use strict';
const KEY='rotationRadarDualPortfolioV1', TYPES=['div','cyb','hstech'];
const $=id=>document.getElementById(id),fmt=v=>'¥'+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const clean=v=>Number.isFinite(+v)&&+v>=0?+v:null;
let account=null,lastMarket=null;
function warn(msg,bad=false){const x=$('accountNotice');if(!x)return;x.textContent=msg;x.className='text-xs leading-relaxed '+(bad?'text-rose-300':'text-emerald-300')}
function template(){return {version:1,cash:0,fee:0.001,assets:{div:{symbol:'515080',shares:0,price:0},cyb:{symbol:'159915',shares:0,price:0},hstech:{symbol:'513130',shares:0,price:0}},ledger:[],valuations:[],created:new Date().toISOString()}}
function valid(x){if(!x||x.version!==1||clean(x.cash)===null||!x.assets||!Array.isArray(x.ledger))return false;
for(const k of TYPES){const a=x.assets[k];if(!a||!(/^\d{6}$/.test(String(a.symbol)))||clean(a.shares)===null||clean(a.price)===null)return false;}
return clean(x.fee)!==null&&x.fee<0.02}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(account));return true}catch(e){warn('本地保存失败，请导出JSON备份。',true);return false}}
function fromStorage(){try{let x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&valid(x))account=x;else if(x)warn('旧账本文件格式不兼容，未导入或覆盖。',true)}catch(e){warn('无法读取本地账本，请导入备份。',true)}}
function readFields(){if(!account)account=template();const cash=clean($('accCash').value),fee=clean($('accFee').value);
if(cash===null||fee===null||fee>2)throw Error('现金或单边手续费无效');
let assets={};for(const k of TYPES){const sym=$('accSymbol_'+k).value.trim(),sh=clean($('accShares_'+k).value),pr=clean($('accPrice_'+k).value);if(!/^\d{6}$/.test(sym)||sh===null||pr===null||!Number.isSafeInteger(sh))throw Error('ETF代码应为6位数字，份额必须为非负整数');
assets[k]={symbol:sym,shares:sh,price:pr};}
return {cash,fee:fee/100,assets}
}
function valuation(){if(!account)return {total:0,complete:false};
let total=account.cash,complete=true;
for(const k of TYPES){const a=account.assets[k];if(a.shares>0&&a.price<=0)complete=false;total+=a.shares*a.price}
return {total,complete}}
function applyToStrategy(){if(!account)return;const v=valuation();if(!v.complete)return;
for(const [k,st,id] of [['div','curHoldDiv','holdDivInput'],['cyb','curHoldCyb','holdCybInput'],['hstech','curHoldHstech','holdHstechInput']]){let a=account.assets[k];state[st]=a.shares*a.price;$(id).value=state[st].toFixed(2);}
state.capital=v.total;$('inputCapital').value=v.total.toFixed(2);updateAll();
}
function show(){if(!account){$('accountEmpty').hidden=false;$('accountLoaded').hidden=true;return;}
$('accountEmpty').hidden=true;$('accountLoaded').hidden=false;
$('accCash').value=account.cash;
$('accFee').value=(account.fee*100).toFixed(3);
for(const k of TYPES){const a=account.assets[k];$('accSymbol_'+k).value=a.symbol;$('accShares_'+k).value=a.shares;$('accPrice_'+k).value=a.price||'';$('accValue_'+k).textContent=a.price>0?fmt(a.price*a.shares):a.shares?'价格待填':'¥0.00';}
const v=valuation();
$('accTotal').textContent=v.complete?fmt(v.total):'估值待补齐';
$('accCashShown').textContent=fmt(account.cash);
$('accJournalCount').textContent=account.ledger.length+' 条记录';
const body=$('accLedger');body.replaceChildren();
for(const j of account.ledger.slice(-20).reverse()){
const tr=document.createElement('tr');tr.className='border-b border-slate-800/70';
for(const v of [j.date,j.type,j.symbol||'现金',j.shares??'—',j.amount!==undefined?fmt(j.amount):'—']){const cell=document.createElement('td');cell.className='py-2 px-2 text-slate-300';cell.textContent=String(v);tr.appendChild(cell);}body.appendChild(tr);}
$('accValuationInfo').textContent=v.complete?'估值已就绪，可将市值同步到上方差额测算。':'持有ETF但缺少每份价格，请补齐后再计算实盘差额。';
}
function snapshot(){try{const values=readFields();const before=account?valuation().total:0;if(!account)account=template();Object.assign(account,values);const after=valuation();account.ledger.push({date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),type:'持仓快照',amount:after.total,prevTotal:before});account.valuations.push({date:new Date().toISOString().slice(0,10),total:after.total});persist();show();applyToStrategy();warn('持仓快照已保存在当前浏览器。请定期导出备份；账户不连接券商。')}catch(e){warn(e.message,true)}}
function record(){
if(!account){warn('请先创建或恢复账本。',true);return}
try{
const type=$('accTradeType').value,k=$('accTradeAsset').value,amount=clean($('accTradeAmount').value),shares=clean($('accTradeShares').value),price=clean($('accTradePrice').value),date=$('accTradeDate').value;
if(!date||!(/^\d{4}-\d{2}-\d{2}$/.test(date)))throw Error('请选择有效交易日期');
if(amount===null||shares===null||price===null)throw Error('金额、份额、价格必须为非负数字');
const a=account.assets[k],fee=account.fee;let actual=0;
if(type==='入金'){if(!(amount>0))throw Error('入金金额须大于0');account.cash+=amount;actual=amount}
else if(type==='出金'){if(!(amount>0)||account.cash<amount)throw Error('出金金额无效或现金不足');account.cash-=amount;actual=-amount}
else {
 if(!TYPES.includes(k)||!(shares>0)||!Number.isSafeInteger(shares)||!(price>0))throw Error('交易份额必须为正整数，价格大于0');
 const turnover=shares*price;
 if(type==='买入'){const debit=turnover*(1+fee);if(account.cash+1e-6<debit)throw Error('可用现金不足，不能记录这笔买入');account.cash-=debit;a.shares+=shares;actual=-debit}
 else if(type==='卖出'){if(a.shares<shares)throw Error('现有份额不足，不能卖出');a.shares-=shares;actual=turnover*(1-fee);account.cash+=actual}
 else throw Error('未知操作类型');
 a.price=price;
}
account.cash=Math.max(0,Math.round(account.cash*1000000)/1000000);
account.ledger.push({date,type,symbol:type==='入金'||type==='出金'?'':a.symbol,shares:(type==='入金'||type==='出金')?null:shares,price,amount:actual});
persist();show();applyToStrategy();warn('已记账（不代表券商已下单）。实际成交请以券商回报为准。');
}catch(e){warn(e.message,true)}
}
function useEtfQuotes(){if(!account||!lastMarket){warn('没有可核实的ETF收盘行情；请手动填价。',true);return}
let count=0;for(const [k,field] of [['cyb','growth'],['div','dividend']]){
const q=lastMarket.etf_closes?.[field],a=account.assets[k];
if(q&&q.symbol===a.symbol&&q.date===lastMarket.latest.date&&+q.close>0){a.price=+q.close;count++}}
if(count){persist();show();applyToStrategy()}
warn(count?'已同步 '+count+' 只代码及日期完全匹配的ETF收盘价。恒科ETF请手动填实际价格。':'暂无日期及代码匹配的ETF收盘价。',!count)}
function saveExport(){if(!account)return;const b=new Blob([JSON.stringify(account,null,2)],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='双策略我的轮换账户-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
async function loadImport(e){const f=e.target.files?.[0];if(!f)return;try{if(f.size>3000000)throw Error('备份文件过大');const x=JSON.parse(await f.text());if(!valid(x))throw Error('非本版三ETF账户文件，拒绝覆盖');if(account&&!confirm('导入将覆盖本浏览器的当前三ETF账本，继续吗？'))return;account=x;persist();show();applyToStrategy();warn('备份已导入。旧版V2.1账户不受影响。')}catch(err){warn(err.message,true)}finally{e.target.value=''}}
function init(){
fromStorage();show();
if(account)applyToStrategy();
$('accSave').addEventListener('click',snapshot);
$('accCreate').addEventListener('click',()=>{if(account&&!confirm('你已有三ETF账本，重建前请导出备份。确定覆盖？'))return;account=template();persist();show();warn('已建立空白本地账本。请填入现金、ETF持仓份额及实际价格后保存快照。')});
$('accApply').addEventListener('click',applyToStrategy);
$('accSyncQuotes').addEventListener('click',useEtfQuotes);
$('accRecord').addEventListener('click',record);
$('accExport').addEventListener('click',saveExport);
$('accImport').addEventListener('change',loadImport);
$('accTradeDate').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
window.addEventListener('dual-market-updated',e=>{lastMarket=e.detail?.original||null;});
}
document.addEventListener('DOMContentLoaded',init);
})();