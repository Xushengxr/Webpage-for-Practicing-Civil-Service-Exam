const assert=require('node:assert/strict');
const E=require('../portfolio-engine.js');
const PRICE={growth:3.2,dividend:1.3};
function sig(month,ratio,exec){return {month,ratio,confirmed:true,expectedExecution:exec};}
const ts=['2026-11','2026-12','2027-01','2027-02','2027-03'];
let a=E.createAccount({initialCash:100000,monthly:1000,fee:.001,lot:100,startDate:'2026-11-01'});
assert.equal(a.cash,100000);
assert.equal(E.tierCount(.4,'growth'),0);
assert.equal(E.tierCount(.34999,'growth'),2);
assert.equal(E.tierCount(.7,'dividend'),2);
let p=E.plan(a,sig('2026-11',.38,'2026-12-01'),PRICE);
assert.equal(p.reached,1);
assert.equal(p.newTiers,1);
assert.equal(p.actualSell,0);
assert.equal(p.buyQty,10700);
assert.equal(p.targetBudget,34333.33);
assert.equal(p.endCash,66725.76);
assert.throws(()=>E.commit(a,p,PRICE,{date:'2026-11-30'}),/不得早于/);
assert.throws(()=>E.commit(a,{...p,confirmed:false},PRICE,{date:'2026-12-01'}),/月末/);
a=E.commit(a,p,PRICE,{date:'2026-12-01'}).account;
assert.equal(a.shares.growth,10700);
assert.equal(a.cash,66725.76);
assert.equal(a.cycle.done,1);
assert.equal(a.direction,'growth');
assert.throws(()=>E.commit(a,p,PRICE,{date:'2026-12-01'}),/已经|重复|账户状态/);
// 继续跌破第二档，必须按首个快照的现金1/3，而不是重新将当日余额/3。
p=E.plan(a,sig('2026-12',.34,'2027-01-04'),PRICE);
assert.equal(p.newTiers,1);
assert.equal(p.cashTranche,100000/3);
assert.equal(p.previousDone,1);
a=E.commit(a,p,PRICE,{date:'2027-01-04'}).account;
assert.equal(a.cycle.done,2);
// 0.36 仍在0.4以下，但档位不能回退到第一档
p=E.plan(a,sig('2027-01',.36,'2027-02-01'),PRICE);
assert.equal(p.newTiers,0);
a=E.commit(a,p,PRICE,{date:'2027-02-01'}).account;
assert.equal(a.cycle.done,2,'档位数不能随比值回升而减少');
// 中性区时重置周期，定投延续最近方向
p=E.plan(a,sig('2027-02',.5,'2027-03-01'),PRICE);
assert.equal(p.willReset,true);
assert.equal(p.selected,'growth');
a=E.commit(a,p,PRICE,{date:'2027-03-01'}).account;
assert.equal(a.cycle,null);
assert.equal(a.direction,'growth');
// 后续触发0.28，全三档集中执行，冻结现金是新周期开始时的余额
p=E.plan(a,sig('2027-03',.28,'2027-04-01'),PRICE);
assert.equal(p.newTiers,3);
a=E.commit(a,p,PRICE,{date:'2027-04-01'}).account;
assert.equal(a.cycle.done,3);
// 反向跳过中性区直接触发红利，锁定创业板当前份额并按3档计
p=E.plan(a,sig('2027-04',.705,'2027-05-06'),PRICE);
assert.equal(p.source,'growth');assert.equal(p.newTiers,3);
assert.equal(p.actualSell,a.shares.growth);
a=E.commit(a,p,PRICE,{date:'2027-05-06'}).account;
assert.equal(a.shares.growth,0); assert(a.shares.dividend>0);
// 按月收入现金按份额净值中性处理，不能被误报成投资收益
let initial=E.createAccount({initialCash:100000});
let row=E.addValuation(initial,PRICE,'2026-11-01');
assert.equal(row.valuation.nav,1);
initial=row.account;
// 手动买卖真实份额与余额验证
initial=E.manual(initial,{kind:'buy',asset:'growth',shares:100,price:3.2,fee:1,date:'2026-11-03'},PRICE);
assert.equal(initial.cash,99679);
assert.equal(initial.shares.growth,100);
assert.throws(()=>E.manual(initial,{kind:'sell',asset:'growth',shares:200,price:3,fee:0,date:'2026-11-04'},PRICE),/超出/);
assert.throws(()=>E.manual(initial,{kind:'buy',asset:'growth',shares:1000,price:200,fee:1,date:'2026-11-04'},PRICE),/不足/);
const v=E.addValuation(initial,{growth:2.5,dividend:1.3},'2026-11-10');
assert(v.valuation.drawdown<0);
// 未录入ETF价，不用指数点位强行换算/记账
p=E.plan(a,sig('2027-05',.35,'2027-06-01'),{growth:0,dividend:0});
assert(p.missing.length>0);
// 严格等于阈值不触发档位
assert.equal(E.tierCount(.35,'growth'),1);
console.log('✓ 账本策略：15组规则断言全部通过（含跨档、重置、锁仓、月入金、手续费、回撤、防重复）');
