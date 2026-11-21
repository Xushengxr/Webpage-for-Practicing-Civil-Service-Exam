/* 轮动雷达 V2.0 个人账本视图：仅在此浏览器存储，GitHub Pages 不接收持仓。 */
(()=>{'use strict';
const E=window.RotationPortfolio, $=id=>document.getElementById(id);
const STORE='rotationRadarPortfolioV2';let account=null,market=null,viewPlan=null,quotes={growth:null,dividend:null},lastSource=null;
const nf=(n,d=2)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:d});
const yuan=n=>'¥'+nf(n,2),nSide=s=>s==='growth'?'创业板':'中证红利';
const byMonth=d=>d.slice(0,7),iso=()=>new Date().toISOString().slice(0,10);
function msg(s,bad=false){const el=$('acctToast');el.textContent=s;el.className=bad?'acctMsg bad':'acctMsg';el.style.display='block';setTimeout(()=>{el.style.display='none'},5500)}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(account));return true}catch{msg('浏览器不允许保存个人数据，请先导出备份文件！',true);return false}}
function load(){try{let x=JSON.parse(localStorage.getItem(STORE)||'null');if(x){account=E.validateAccount(x);account.priceOverride ||= {growth:null,dividend:null};account.navHistory ||= []; account.processedMonths ||= [];}}catch(e){account=null;msg('发现不兼容的旧版账户，请通过备份导入恢复。',true)}}
function number(id){return Number($(id).value)}
function getPrices(){return {growth:Number($('acctQuoteG').value)||0,dividend:Number($('acctQuoteR').value)||0}}
function validateSymbol(x){return /^\d{6}$/.test(x)}
function accountVisible(){const yes=!!account;$('acctSetup').hidden=yes;$('acctMain').hidden=!yes;if(yes){$('acctMonthly').value=account.monthly;$('acctFee').value=account.fee*100;$('acctLot').value=account.lot;$('acctRisk').value=account.riskThreshold*100;$('acctGrowthCode').value=account.symbols.growth;$('acctDividendCode').value=account.symbols.dividend;}}
function getEtfQuote(side){const price=market?.etf_closes?.[side];if(!price||market?.demo||!market.latest||!validatedMarket())return null;
if(String(price.symbol)!==account.symbols[side]||price.date!==market.latest.date||!(Number(price.close)>0))return null;
return Number(price.close)}
function applyQuotes(){if(!account||!market)return;
let changed=false;
for(const [side,input] of [['growth','acctQuoteG'],['dividend','acctQuoteR']]){
 const q=getEtfQuote(side);const backup=account.priceOverride?.[side];
 if(q!==null){if(Number($(input).value)!==q){$(input).value=q;changed=true;} $('quoteStatus'+(side==='growth'?'G':'R')).textContent=`收盘价 ${market.latest.date} · ${account.symbols[side]}`;}
 else {if(!$(input).value&&backup>0)$(input).value=backup;
  $('quoteStatus'+(side==='growth'?'G':'R')).textContent=`需要手动输入实际 ${account.symbols[side]} ETF 价格（不能填指数点位）`;}
}
if(changed)renderMetrics();}
function validatedMarket(){return market&&!market.demo && market.latest?.date && !isOld(market.latest.date)}
function isOld(d){const timestamp=new Date(d+'T16:00:00+08:00');const days=(Date.now()-timestamp)/86400000;return !Number.isFinite(days)||days>7||days< -1;}
function lastSignal(){if(!market||!account)return null;
 const start=account.startMonth || byMonth(account.journal[0].date);
 const all=(market.last_monthly_signals||[]).filter(x=>x.month>=start&&!account.processedMonths.includes(x.month)&&x.execution_date);
 if(all.length)return {...all[0],confirmed:true,expectedExecution:all[0].execution_date};
 if(!market.forecast||String(market.forecast.signal_month||'')<start)return null;
 return {month:market.forecast.signal_month||byMonth(market.latest.date),ratio:market.latest.ratio,confirmed:!!market.forecast.is_confirmed,
   expectedExecution:market.forecast.expected_execution||null};
}
function riskStatus(){const h=account.navHistory||[];const last=h.at(-1);if(!last)return {text:'未生成净值记录。请录入ETF价格并保存一次估值。',level:0};
 const dd=last.drawdown,limit=account.riskThreshold;return {text:`记录净值 ${nf(last.nav,5)}｜已记录高点回撤 ${nf(dd*100,2)}%｜提醒阈值 ${nf(-limit*100,1)}%（不是止损委托）`,level:dd<=-limit?2:0};}
function renderMetrics(){if(!account)return;
 const p=getPrices();let v=E.getEquity(account,p);
 $('acctCash').textContent=yuan(account.cash);
 $('acctSharesG').textContent=nf(account.shares.growth,0)+' 份';
 $('acctSharesR').textContent=nf(account.shares.dividend,0)+' 份';
 $('acctValueG').textContent=account.shares.growth===0?'市值 ¥0':p.growth>0?'市值 '+yuan(account.shares.growth*p.growth):'需要ETF价格';
 $('acctValueR').textContent=account.shares.dividend===0?'市值 ¥0':p.dividend>0?'市值 '+yuan(account.shares.dividend*p.dividend):'需要ETF价格';
 $('acctTotal').textContent=v===null?'—':yuan(v);
 const risk=riskStatus();$('acctRiskText').textContent=risk.text;$('acctRiskText').classList.toggle('riskAlert',risk.level===2);
 $('acctCycle').textContent=account.cycle?`${nSide(account.cycle.side)} ${account.cycle.done} / 3档`:'未处于轮动周期';
 $('acctCycleInfo').textContent=account.cycle?`锁定原始${nSide(account.cycle.source)} ${nf(account.cycle.lockedShares,0)}份；现金快照 ${yuan(account.cycle.lockedCash)}；周期开始于${account.cycle.startedAt}`:'首次信号前资金为现金；进入中性区间后周期重置';
 $('acctDirection').textContent=account.direction?nSide(account.direction):'尚无有效方向';
 $('acctJournalCount').textContent=`已记录 ${account.journal.length} 项，已处理 ${account.processedMonths.length} 个月末信号`;
 $('acctEmptyPrices').hidden=v!==null;
}
function renderPlan(){if(!account)return;
 const root=$('acctPlan'),riskStale=!validatedMarket();const sig=lastSignal();
 if(!sig){viewPlan=null;root.textContent='尚未拿到可用的本月或月末信号。请等待行情数据更新。';$('acctExecute').disabled=true;$('acctSkip').disabled=true;return;}
 try{viewPlan=E.plan(account,{month:sig.month,ratio:Number(sig.ratio),confirmed:sig.confirmed,expectedExecution:sig.expectedExecution},getPrices());}
 catch(e){root.textContent='无法计算：'+e.message;viewPlan=null;return}
 if(viewPlan.alreadyDone){root.textContent='该月轮动已经确认记账；等待下一个月末信号。';$('acctExecute').disabled=true;$('acctSkip').disabled=true;return;}
 $('acctExecDate').value=viewPlan.expectedExecution||iso();
 let parts=[];
 parts.push(`${sig.confirmed?'【正式月末信号】':'【月中动态预判】'} ${sig.month} ｜ 比值 ${nf(sig.ratio,4)}`);
 if(sig.expectedExecution)parts.push(`下月首个交易日 ${sig.expectedExecution}`);
 if(viewPlan.newTiers)parts.push(`转入${nSide(viewPlan.target)}，本次新增 ${viewPlan.newTiers} 档（本轮累计达到${viewPlan.reached}档），${viewPlan.source==='growth'?'卖创业板':'卖中证红利'} ${nf(viewPlan.actualSell,0)}份；预计净卖出 ${yuan(viewPlan.netSale)}。`);
 else parts.push('本次无新增换仓档位。');
 parts.push(viewPlan.selected?`当月新增定投 ${yuan(viewPlan.monthly)} → ${nSide(viewPlan.selected)}；参考合并买入 ${nf(viewPlan.buyQty,0)}份（100份整数倍，可按设置调整）。`:`当月新增 ${yuan(viewPlan.monthly)} 留在现金账户。`);
 parts.push(`预计交易后现金：${viewPlan.complete?yuan(viewPlan.endCash):'价格不足，无法计算'}`);
 if(viewPlan.missing.length)parts.push('缺少：'+viewPlan.missing.join('、'));
 if(riskStale)parts.push('⚠ 目前为演示、过期或缺失行情，只允许看账本，不允许确认策略指令。');
 else if(!sig.confirmed)parts.push('⚠ 这是月中预判，月底收盘前不应执行。');
 else if(sig.expectedExecution && iso()<sig.expectedExecution)parts.push('正式信号已锁定，但执行日尚未到来。');
 root.replaceChildren();for(const line of parts){const p=document.createElement('p');p.textContent=line;root.appendChild(p);}
 $('acctHistoricalConfirm').disabled=!(sig.expectedExecution&&iso()>sig.expectedExecution);
 $('acctExecute').disabled=!!(riskStale||!sig.confirmed||viewPlan.missing.length||!viewPlan.complete||(sig.expectedExecution&&iso()<sig.expectedExecution)||(sig.expectedExecution&&iso()>sig.expectedExecution&&!$('acctHistoricalConfirm').checked));
 $('acctSkip').disabled=!!(riskStale||!sig.confirmed);
 if(sig.confirmed&&sig.expectedExecution&&iso()>sig.expectedExecution){$('acctExecute').title='该信号已过预定执行日。只能填入券商真实成交日期/价格补录，禁止把今日价格冒充历史交易。';}
 else $('acctExecute').title='仅当你已经在券商完成实际买卖后点击，此动作不会替你下单';
}
function renderJournal(){if(!account)return;const body=$('acctRecords');body.replaceChildren();for(const j of account.journal.slice(-12).reverse()){
 const tr=document.createElement('tr');const kind=j.kind==='monthly_execution'?`策略执行：${j.target?nSide(j.target):'中性持有'}`:
     j.kind==='initial'?'账户初始化':j.kind==='skipped'?'本月跳过':j.kind.replace('manual_','手动记录 · ');
 const info=j.kind==='monthly_execution'?`定投 ${yuan(j.deposit)}；${j.newTiers}档；${j.sellShares?`卖出${nf(j.sellShares,0)}份；`:''}${j.buyShares?`买入${nf(j.buyShares,0)}份`:'未买入'}`:
     j.kind==='initial'?`现金 ${yuan(j.cash)}`:
     j.kind==='skipped'?'无资金流动':`${j.asset?nSide(j.asset)+'｜':''}${j.shares?nf(j.shares,0)+'份 × '+yuan(j.price):j.amount?yuan(j.amount):''}`;
 for(const t of [j.date||'',kind,info]){const td=document.createElement('td');td.textContent=t;tr.appendChild(td)}body.appendChild(tr);
 }
}
function render(){accountVisible();if(!account)return;renderMetrics();renderPlan();renderJournal();}
function setup(){try{
 const opts={initialCash:number('acctInitial'),monthly:number('acctInitMonthly'),fee:number('acctInitFee')/100,lot:number('acctInitLot'),growthSymbol:$('acctInitG').value.trim(),dividendSymbol:$('acctInitR').value.trim(),startDate:iso()};
 if(!validateSymbol(opts.growthSymbol)||!validateSymbol(opts.dividendSymbol))throw Error('ETF代码应为6位数字');
 account=E.createAccount(opts);account.startMonth=byMonth(iso());persist();render();msg('已创建10万元起始现金账本。首次有效月底信号出现前不自动买入。');
 }catch(e){msg(e.message,true)}}
function saveSettings(){try{
 const monthly=number('acctMonthly'),fee=number('acctFee')/100,lot=number('acctLot'),risk=number('acctRisk')/100;
 const gs=$('acctGrowthCode').value.trim(),rs=$('acctDividendCode').value.trim();
 if(!Number.isFinite(monthly)||monthly<0||!(fee>=0&&fee<=.02)||!Number.isSafeInteger(lot)||lot<1||risk<=0||risk>1||!validateSymbol(gs)||!validateSymbol(rs))throw Error('设置无效');
 if((gs!==account.symbols.growth&&account.shares.growth>0)||(rs!==account.symbols.dividend&&account.shares.dividend>0))throw Error('当前持有ETF时不得直接换代码，请先卖出或用另一份账本');
 account.monthly=monthly;account.fee=fee;account.lot=lot;account.riskThreshold=risk;
 account.symbols={growth:gs,dividend:rs};persist();applyQuotes();render();msg('设置已保存');
 }catch(e){msg(e.message,true)}}
function confirmTrade(){try{
 const p=getPrices();const date=$('acctExecDate').value,note=$('acctExecNote').value;
 if(date>iso())throw Error('实际成交日期不能晚于今天');
 if(!validatedMarket())throw Error('演示/过期行情不能确认交易，请先部署每日更新');
 if(!viewPlan||!viewPlan.confirmed)throw Error('需要月底正式信号');
 if(viewPlan.expectedExecution&&iso()>viewPlan.expectedExecution&&!$('acctHistoricalConfirm').checked)throw Error('历史成交请先勾选确认实际成交价来源');
 if(!confirm(`你是否已在券商真实成交？\n将按ETF输入价格记录：${viewPlan.buyQty}份买入，${viewPlan.actualSell}份卖出，月入金${yuan(account.monthly)}。\n此按钮不会发出真实证券委托。`))return;
 const r=E.commit(account,viewPlan,p,{date,note});account=r.account;persist();render();msg('交易已确认入账。建议导出备份以免换设备丢失。');
 }catch(e){msg(e.message,true)}}
function skipTrade(){try{
 if(!viewPlan?.confirmed||!validatedMarket())throw Error('仅能跳过正式的月末信号');
 if(!confirm('确定跳过本月所有策略交易与月入金1000元？该操作也会记录为本月已处理，不能在本月再执行一次。'))return;
 account=E.skip(account,{month:viewPlan.month,ratio:viewPlan.ratio});persist();render();msg('本月已跳过，无买卖/定投到账。');
 }catch(e){msg(e.message,true)}}
function manualTrade(){try{
 const kind=$('acctManualKind').value,side=$('acctManualSide').value,date=$('acctManualDate').value;
 if(date>iso())throw Error('补录成交日期不能晚于今天');
 let entry={kind,asset:side,date,amount:number('acctManualAmount'),shares:number('acctManualShares'),price:number('acctManualPrice'),fee:number('acctManualFee'),note:$('acctManualNote').value};
 account=E.manual(account,entry,getPrices());persist();render();msg('手动交易已入账；手动买卖不自动计入分档进度。');
 }catch(e){msg(e.message,true)}}
function saveValuation(){try{
 const p=getPrices();const a=E.addValuation(account,p,market&&!market.demo?market.latest.date:iso());account=a.account;
 account.priceOverride=p;persist();render();msg('估值已保存，账户净值与回撤记录已更新');
 }catch(e){msg(e.message,true)}}
function exportAccount(){if(!account){msg('请先创建账户');return}
 const file=new Blob([JSON.stringify({app:'轮动雷达',exportedAt:new Date().toISOString(),account},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='轮动雷达_个人持仓备份_'+iso()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);msg('已导出备份。请妥善保存，内含私人持仓金额和交易记录。');}
async function importAccount(file){if(!file)return;try{if(file.size>3_000_000)throw Error('备份文件过大');const o=JSON.parse(await file.text());
 const restored=E.validateAccount(o.account||o);if(!confirm(`确认以导入账本覆盖此浏览器的现有数据？\n记录 ${restored.journal.length} 条。请先备份当前账本。`))return;
 account=restored;persist();render();msg('账本已导入。请核验仓位数量和当前ETF价格。');
 }catch(e){msg('导入失败：'+e.message,true)}}
function resetAccount(){if(!account)return;
 if(!confirm('即将清空全部持仓、分档与交易历史。此操作无法恢复。确定已经导出备份？'))return;
 if(!confirm('再次确认：删除本设备保存的个人持仓账本？'))return;
 account=null;localStorage.removeItem(STORE);location.reload();}
function useLatestETF(){if(!market||!account)return;const pre=getPrices();applyQuotes();let now=getPrices();
 if(pre.growth===now.growth&&pre.dividend===now.dividend)msg('当前没有新的匹配ETF收盘价。可手动填写你持有ETF的成交价。');else {render();msg('已同步可核验的ETF收盘价（仅供估算；不代表实际成交价）')}
}
function onMarketUpdated(data){market=data;
 if(!account)return;
 applyQuotes();
 // 本地浏览器在被打开并收到同日可核验的ETF收盘价后自动保存一次估值。无后台账户同步。
 if(validatedMarket() && getEtfQuote('growth')!==null && getEtfQuote('dividend')!==null) {
   const today=market.latest.date;
   if(!(account.navHistory||[]).some(x=>x.date===today)){
      try{account=E.addValuation(account,getPrices(),today).account;account.priceOverride=getPrices();persist()}catch(e){console.warn(e)}
   }
 }
 render();
}
window.addEventListener('rotation-market-updated',e=>onMarketUpdated(e.detail));
$('acctSetupButton').addEventListener('click',setup);
$('acctSaveSettings').addEventListener('click',saveSettings);
$('acctSyncEtf').addEventListener('click',useLatestETF);
$('acctSaveValuation').addEventListener('click',saveValuation);
$('acctExecute').addEventListener('click',confirmTrade);
$('acctSkip').addEventListener('click',skipTrade);
$('acctManualRecord').addEventListener('click',manualTrade);
$('acctExport').addEventListener('click',exportAccount);
$('acctImport').addEventListener('change',e=>importAccount(e.target.files?.[0]));
$('acctReset').addEventListener('click',resetAccount);
for(const id of ['acctQuoteG','acctQuoteR'])$(id).addEventListener('input',()=>{if(account){account.priceOverride=getPrices();persist();render()}});
$('acctManualDate').value=iso();
load();render();if(window.__rotationMarket)onMarketUpdated(window.__rotationMarket);
})();
