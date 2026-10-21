(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.STUDY_PRINT=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eager=html=>String(html).replace(/\sloading="lazy"/g,' loading="eager"');
  function build({queue,questions,papers,title,content='questions',space='small'}){
    if(!['questions','both','answers'].includes(content)||!['none','small','large'].includes(space))throw new Error('无效的打印设置');
    if(!queue.length||queue.some(s=>!questions.has(s.id)))throw new Error('题目尚未加载完成');
    const heading=subtitle=>`<header class="print-heading"><h1>${escape(title)}</h1><p>${subtitle} · 共 ${queue.length} 题</p></header>`;
    let result='';
    if(content!=='answers'){
      result+='<section class="print-paper">'+heading('题目卷')+'<div class="print-name">姓名：________________　日期：________________　用时：________________</div><p class="print-notice" id="print-image-note" hidden></p>';
      for(let i=0;i<queue.length;i++){
        const slot=queue[i],q=questions.get(slot.id),previous=i?questions.get(queue[i-1].id):null;
        if(q.material&&(!previous||previous.group!==q.group)){
          let end=i;while(end+1<queue.length&&questions.get(queue[end+1].id).group===q.group)end++;
          result+=`<section class="print-material"><h2>阅读材料（供第 ${i+1}${end>i?'—'+(end+1):''} 题使用）</h2><div class="print-rich">${eager(q.material)}</div></section>`;
        }
        const p=papers[slot.source[0]];
        result+=`<article class="print-question"><h3>第 ${i+1} 题 <small>〔${!q.answer?'仅供阅读':q.answer.length>1?'多选':'单选'}〕</small></h3><p class="print-source">${escape(p.region)} ${escape(p.year)} · ${escape(slot.source[1])} · 原第 ${slot.source[3]} 题 · qid ${escape(q.qid)}</p><div class="print-rich">${eager(q.stem)}</div><div class="print-options">`;
        for(const [key,text] of q.options)result+=`<div class="print-option"><b>${escape(key)}.</b><div class="print-rich">${eager(text)}</div></div>`;
        result+=`</div>${!q.answer?'<p class="print-readonly">原题缺少有效答案或选项，本题不作自动判分。</p>':''}<div class="print-writing ${space}"></div></article>`;
      }
      result+='</section>';
    }
    if(content!=='questions'){
      result+=`<section class="print-answers${content==='both'?' new-page':''}">${heading('答案与参考解析')}<div class="print-answer-grid">`;
      for(let i=0;i<queue.length;i++){const q=questions.get(queue[i].id);result+=`<span>${i+1}. ${q.answer?escape(q.answer):'不判分'}</span>`;}
      result+='</div>';
      for(let i=0;i<queue.length;i++){const q=questions.get(queue[i].id);result+=`<article class="print-analysis"><h3>第 ${i+1} 题 · ${q.answer?'答案 '+escape(q.answer):'仅供阅读（原记录答案：'+escape(q.answerText||'缺失')+'）'}</h3><div class="print-rich">${eager(q.analysis||'原题未提供解析。')}</div></article>`;}
      result+='</section>';
    }
    return result;
  }
  return {build};
});
