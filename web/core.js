(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.STUDY_CORE=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function grade(answer,selection){
    if(!answer)return null;
    if(!Array.isArray(selection)||new Set(selection).size!==selection.length||selection.some(x=>! /^[A-H]$/.test(x)))return false;
    return [...answer].sort().join('')===[...selection].sort().join('');
  }
  function validateRecord(r,knownIds){
    if(!r||typeof r.id!=='string'||!knownIds.has(r.id)||!Number.isSafeInteger(r.attempts)||r.attempts<0||!Number.isSafeInteger(r.correctCount)||r.correctCount<0||r.correctCount>r.attempts||typeof r.wrong!=='boolean'||typeof r.star!=='boolean'||!Number.isFinite(r.updatedAt)||r.updatedAt<0)return false;
    if(r.lastAt!==undefined&&(!Number.isFinite(r.lastAt)||r.lastAt<0))return false;
    if(r.lastAnswer!==undefined&&(typeof r.lastAnswer!=='string'||!/^[A-H]{0,8}$/.test(r.lastAnswer)))return false;
    if(r.lastCorrect!==undefined&&typeof r.lastCorrect!=='boolean')return false;
    if(!r.days||typeof r.days!=='object'||Array.isArray(r.days))return false;
    const days=Object.entries(r.days);if(days.length>20000)return false;
    if(!days.every(([date,a])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Array.isArray(a)&&a.length===2&&a.every(n=>Number.isSafeInteger(n)&&n>=0)&&a[1]<=a[0]))return false;
    const sums=days.reduce((a,[,v])=>[a[0]+v[0],a[1]+v[1]],[0,0]);return sums[0]===r.attempts&&sums[1]===r.correctCount;
  }
  function groupQueue(candidates,limit,randomize){
    const groups=new Map();for(const c of candidates){const k=c.group||c.id;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);}
    const blocks=[...groups.values()];if(randomize)for(let i=blocks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[blocks[i],blocks[j]]=[blocks[j],blocks[i]];}
    const queue=[];for(const block of blocks){queue.push(...block.map(({id,source})=>({id,source})));if(queue.length>=limit)break;}return queue;
  }
  return {grade,validateRecord,groupQueue};
});
