/* 轮动雷达 V2.1 个人账本与交易计划纯计算引擎。
 * 浏览器 window.RotationPortfolio / Node require()；不联网、不自动下单。
 * 信号：价格指数比值；实际买入：ETF 份额与真实成交价，不能混用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RotationPortfolio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION=3;
  const STRATEGY_ID="cyb-dividend-fixed-v21-0375-0625";
  const GROWTH_LEVELS=[0.375,0.325,0.275];
  const DIVIDEND_LEVELS=[0.625,0.675,0.725];
  const rd=(n,k=6)=>Math.round((n+Number.EPSILON)*10**k)/10**k;
  const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
  const okAmount=(x)=>finite(x)&&x>=0;
  const clone=(o)=>JSON.parse(JSON.stringify(o));
  const err=s=>{throw new Error(s)};
  function tierCount(r, side) {
    if(!finite(r)||r<=0)err('指数比值无效');
    return side==='growth' ? GROWTH_LEVELS.filter(t=>r<t).length
     : side==='dividend' ? DIVIDEND_LEVELS.filter(t=>r>t).length : 0;
  }
  function sideOf(r){if(!finite(r)||r<=0)err('指数比值无效');return r<GROWTH_LEVELS[0]?'growth':r>DIVIDEND_LEVELS[0]?'dividend':null;}
  function createAccount(opts={}) {
    const start=Number(opts.initialCash??100000), monthly=Number(opts.monthly??1000),fee=Number(opts.fee??0.001), lot=Number(opts.lot??100);
    if(!okAmount(start)||!okAmount(monthly)||!finite(fee)||fee<0||fee>=.02||!Number.isSafeInteger(lot)||lot<1)err('初始资金、定投、费率或交易单位无效');
    const shares={growth:Number(opts.growthShares??0),dividend:Number(opts.dividendShares??0)};
    if(Object.values(shares).some(x=>!okAmount(x)||!Number.isSafeInteger(x)))err('ETF份额必须为非负整数');
    return {version:VERSION,createdAt: new Date().toISOString(),initialCash:start,
       cash:rd(start),monthly,fee,lot,shares,symbols:{growth:opts.growthSymbol||'159915',dividend:opts.dividendSymbol||'515080'},
       direction:null,cycle:null,processedMonths:[],journal:[{kind:'initial',date:(opts.startDate||new Date().toISOString().slice(0,10)),cash:start,shares:clone(shares)}],
       navUnits:null,peakNAV:1,navHistory:[],riskThreshold:0.1,priceOverride:{growth:null,dividend:null}};
  }
  function validateAccount(a){
     if(!a||a.version!==VERSION||!okAmount(a.cash)||!a.shares||!a.symbols)err('不是有效V2账本');
     if(!okAmount(a.shares.growth)||!okAmount(a.shares.dividend))err('份额无效');
     if(!Array.isArray(a.journal)||!Array.isArray(a.processedMonths)||a.journal.length>10000)err('交易记录结构无效');
     if(!finite(a.monthly)||a.monthly<0||!finite(a.fee)||a.fee<0||a.fee>.02)err('资金参数无效');
     return a;
  }
  function splitLocked(total, count, done, lot){
    if(count<=0)return 0;
    if(done>=3)return 0;
    // 首两档按初始快照各取整到交易单位；第三档卖出快照剩余全部持仓。
    const first=Math.floor(total/3/lot)*lot;
    const tranche=[first,first,total-2*first];
    let n=0;for(let i=done;i<Math.min(done+count,3);i++)n+=tranche[i];return n;
  }
  function sourcePrice(prices,side){return side=== 'growth'?Number(prices?.growth):Number(prices?.dividend)}
  function plan(account,signal,prices={}) {
    validateAccount(account);
    if(!signal||!/^\d{4}-\d{2}$/.test(signal.month)||!finite(signal.ratio))err('月底信号的月份/比值无效');
    if(account.processedMonths.includes(signal.month))return {alreadyDone:true,month:signal.month};
    let target=sideOf(signal.ratio),previous=account.direction;
    let cy=account.cycle&&account.cycle.side===target?clone(account.cycle):null;
    if(target&&!cy){const source=target==='growth'?'dividend':'growth';cy={side:target,source,lockedShares:account.shares[source],lockedCash:account.cash,done:0,startedAt:signal.month};}
    let reached=target?tierCount(signal.ratio,target):0;
    let newTiers=target?Math.max(0,reached-cy.done):0;
    let source=cy?.source||null;
    let requestedSell=cy?splitLocked(cy.lockedShares,newTiers,cy.done,account.lot):0;
    let actualSell=Math.min(account.shares[source]||0,requestedSell);
    let cashTranche=cy ? (cy.lockedCash/3)*newTiers : 0;
    const selected=target||previous;
    const growthPx=Number(prices.growth),dividendPx=Number(prices.dividend);
    // 持仓估值和实际撮合需要ETF价格；指数点位不可作为ETF价格。
    const missing=[];
    if(account.shares.growth>0 && !(growthPx>0))missing.push('创业板ETF价格');
    if(account.shares.dividend>0 && !(dividendPx>0))missing.push('红利ETF价格');
    if(selected && !(sourcePrice(prices,selected)>0))missing.push('买入ETF价格');
    if(actualSell>0 && !(sourcePrice(prices,source)>0))missing.push('卖出ETF价格');
    const complete=missing.length===0;
    const gross=complete?actualSell*sourcePrice(prices,source):0;
    const netSale=complete?gross*(1-account.fee):0;
    let monthlyBudget=account.monthly;
    let available=account.cash+monthlyBudget+netSale;
    let rotationBudget=Math.min(Math.max(0,available-monthlyBudget),cashTranche+netSale);
    let intended=selected?rotationBudget+monthlyBudget:0;
    // 若处于中性区，保持上一轮定投方向，若从未有信号则累积现金。
    let px=selected?sourcePrice(prices,selected):null;
    let buyQty=complete&&selected?Math.max(0,Math.floor(intended/(px*(1+account.fee))/account.lot))*account.lot:0;
    let buyCost=complete&&selected?buyQty*px*(1+account.fee):0;
    while (buyCost>available+1e-5&&buyQty>0) {buyQty-=account.lot;buyCost=buyQty*px*(1+account.fee)}
    return {alreadyDone:false,month:signal.month,ratio:signal.ratio,confirmed:Boolean(signal.confirmed),expectedExecution:signal.expectedExecution||null,
      target,selected,source,cycle:cy,reached,newTiers,previousDone:cy?.done||0,willReset:!target,
      requestedSell,actualSell,cashTranche,monthly:account.monthly,selectedPrice:px,sellPrice:complete&&actualSell?sourcePrice(prices,source):null,
      missing:[...new Set(missing)],complete,grossSell:rd(gross,2),netSale:rd(netSale,2),rotationBudget:rd(rotationBudget,2),
      targetBudget:rd(intended,2),buyQty,buyCost:rd(buyCost,2),endCash:rd(available-buyCost,2),fee:account.fee};
  }
  function getEquity(account, prices){
     const g=account.shares.growth, r=account.shares.dividend;
     const gp=Number(prices?.growth),rp=Number(prices?.dividend);
     if((g>0&&!(gp>0))||(r>0&&!(rp>0)))return null;
     return account.cash+g*(g?gp:0)+r*(r?rp:0);
  }
  function addValuation(account,prices,date){
    validateAccount(account);const v=getEquity(account,prices);if(v===null)err('持仓ETF尚未录入有效市价，无法计算净值和回撤');
    const a=clone(account);
    if(a.navUnits===null) a.navUnits=Math.max(v,1);
    const nav=v/a.navUnits;
    a.peakNAV=Math.max(a.peakNAV||nav,nav);
    const dd=(nav/a.peakNAV)-1;
    const row={date,value:rd(v,2),nav:rd(nav,8),drawdown:rd(dd,6),prices:clone(prices)};
    const i=a.navHistory.findIndex(x=>x.date===date);if(i>=0)a.navHistory[i]=row;else a.navHistory.push(row);
    a.navHistory.sort((x,y)=>x.date.localeCompare(y.date));if(a.navHistory.length>1500)a.navHistory=a.navHistory.slice(-1500);
    return {account:a,valuation:row};
  }
  function accountMonthCount(a,mo){return a.processedMonths.filter(x=>x===mo).length;}
  function commit(account,p,prices,opts={}){
    validateAccount(account);
    if(!p||p.alreadyDone||!p.complete||p.missing?.length)err('买卖计划不完整');
    if(!p.confirmed)err('月末信号未锁定，不允许记为策略执行');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(opts.date||''))err('成交日期错误');
    if(p.expectedExecution && opts.date<p.expectedExecution)err('不得早于下月首个交易日执行');
    if(accountMonthCount(account,p.month))err('该月信号已记录，不得重复定投或执行');
    if(account.journal.some(x=>x.kind==='manual_buy' && String(x.date).slice(0,7)===String(opts.date).slice(0,7)))err('本月已经补录过买入交易。请勿重复执行同一月定投');
    const latest=plan(account,{month:p.month,ratio:p.ratio,confirmed:p.confirmed,expectedExecution:p.expectedExecution},prices);
    if(!latest.complete||latest.alreadyDone)err('账户状态已变更，请重新计算');
    const a=clone(account);
    const before=getEquity(a,prices);if(before===null)err('ETF价格缺失');
    if(a.navUnits===null)a.navUnits=Math.max(before,1);
    const navBefore=before/a.navUnits;
    a.cash=rd(a.cash+a.monthly,6);
    a.navUnits=rd(a.navUnits+a.monthly/navBefore,8);
    if(latest.actualSell>0){a.shares[latest.source]-=latest.actualSell;a.cash+=latest.actualSell*latest.sellPrice*(1-a.fee)}
    if(latest.buyQty>0){a.shares[latest.selected]+=latest.buyQty;a.cash-=latest.buyCost}
    if(a.cash < -1e-4)err('现金不足，请检查价格与手续费');
    a.cash=Math.max(0,rd(a.cash,6));
    if(latest.willReset){a.cycle=null;}
    else {
       a.cycle=latest.cycle;
       a.cycle.done=Math.max(latest.cycle.done, latest.reached);
       a.direction=latest.target;
    }
    a.processedMonths.push(latest.month);
    a.journal.push({kind:'monthly_execution',month:latest.month,date:opts.date,signalRatio:latest.ratio,
      target:latest.target,direction:a.direction,newTiers:latest.newTiers,
      buyAsset:latest.selected,buyShares:latest.buyQty,buyPrice:latest.selectedPrice||null,
      sellAsset:latest.source,sellShares:latest.actualSell,sellPrice:latest.sellPrice||null,
      deposit:a.monthly,rotationBudget:latest.rotationBudget,grossSell:latest.grossSell,
      feeSell:rd(latest.grossSell*a.fee,2),feeBuy:rd(latest.buyQty*(latest.selectedPrice||0)*a.fee,2),
      note:(opts.note||'').slice(0,150)});
    return {account:addValuation(a,prices,opts.date).account,trade:latest};
  }
  function skip(account,signal){
    validateAccount(account);const a=clone(account);
    if(a.processedMonths.includes(signal.month))err('此月信号已经处理过');
    let tgt=sideOf(signal.ratio);
    if(!tgt){a.cycle=null;}
    // 跳过不购买，不改变档位进度；方向仍然按最后一笔实际有效买入。
    a.processedMonths.push(signal.month);
    a.journal.push({kind:'skipped',month:signal.month,date:new Date().toISOString().slice(0,10),ratio:signal.ratio});
    return a;
  }
  function manual(account,entry,prices={}){
    validateAccount(account);const a=clone(account),date=entry.date||new Date().toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))err('日期格式错误');
    const kind=entry.kind;
    const asset=entry.asset;
    const amount=Number(entry.amount),shares=Number(entry.shares),price=Number(entry.price),fee=Number(entry.fee??0);
    const before=getEquity(a,prices);
    if(kind==='deposit'||kind==='withdraw'){
       if(!okAmount(amount)||amount<=0)err('入金/取款金额错误');
       if(kind==='withdraw'&&amount>a.cash+1e-5)err('可用现金不足');
       if(a.navUnits===null&&before!==null)a.navUnits=Math.max(before,1);
       if(before!==null&&a.navUnits&&before>0){let nav=before/a.navUnits; a.navUnits += (kind==='deposit'?1:-1)*amount/nav;}
       a.cash+=(kind==='deposit'?1:-1)*amount;
    } else if(kind==='buy'||kind==='sell'){
       if(!['growth','dividend'].includes(asset))err('请选择ETF种类');
       if(!Number.isSafeInteger(shares)||shares<=0||price<=0||!okAmount(fee))err('交易份额/价格/手续费无效');
       const gross=shares*price, cashUsed=gross+fee,cashReceived=gross-fee;
       if(kind==='buy'){
         if(cashUsed>a.cash+1e-5)err('现金不足');a.cash-=cashUsed;a.shares[asset]+=shares;
       } else {if(shares>a.shares[asset])err('卖出份额超出持仓');a.cash+=cashReceived;a.shares[asset]-=shares;}
    } else if(kind==='dividend'){
       if(!okAmount(amount)||amount<=0)err('分红金额错误');a.cash+=amount;
    } else err('不支持的记录类型');
    a.cash=rd(a.cash,6);
    a.journal.push({kind:'manual_'+kind,date,asset:asset||null,amount:finite(amount)?amount:null,shares:finite(shares)?shares:null,price:finite(price)?price:null,fee:finite(fee)?fee:0,note:String(entry.note||'').slice(0,120)});
    return a;
  }
  return {VERSION,STRATEGY_ID,GROWTH_LEVELS,DIVIDEND_LEVELS,createAccount,validateAccount,tierCount,sideOf,plan,commit,skip,manual,getEquity,addValuation,clone};
});
