'use strict';
(() => {
  const status=document.getElementById('offline-status'),save=document.getElementById('offline-save'),dialog=document.getElementById('offline-dialog');
  let registration=null,selection=null,busy=false,generation=0;
  document.getElementById('offline-help').onclick=()=>dialog.showModal();
  document.getElementById('offline-close').onclick=()=>dialog.close();
  const supported=location.protocol!=='file:'&&window.isSecureContext&&'serviceWorker' in navigator&&'caches' in window;
  const cacheName=()=> 'xingce-offline-v1-'+encodeURIComponent(registration.scope);
  window.addEventListener('study-session-ready',event=>{
    selection=event.detail;generation++;
    if(registration&&!busy){save.hidden=false;status.textContent='这一组已打开。可保存整组题目和图片，离线时继续练习。';}
  });
  save.onclick=async()=>{
    if(!selection||!registration||busy)return;
    busy=true;save.disabled=true;
    const batch=selection,version=generation,base=new URL('./',location.href);
    let complete=0,failed=0,next=0;
    try{
      const cache=await caches.open(cacheName());
      await Promise.all(Array.from({length:Math.min(4,batch.files.length)},async()=>{
        while(next<batch.files.length){const file=batch.files[next++];
          try{const url=new URL(file,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('非法文件路径');
            if(!await cache.match(url.href)){const response=await fetch(url.href);if(!response.ok)throw Error('文件无法下载');await cache.put(url.href,response);}
          }catch{failed++;}
          complete++;status.textContent=`正在保存 ${complete} / ${batch.files.length} 个文件…`;
        }
      }));
      if(version!==generation)status.textContent='上一组已处理；当前题组发生变化，请再点一次保存当前一组。';
      else status.textContent=failed?`有 ${failed} 个文件未能保存（可能包含原题缺图）。请联网重试；本组尚未完整离线保存。`:`本组 ${batch.ids.length} 题及引用图片已保存。断网后可从同一入口“继续上次练习”；浏览器清理缓存后需重存。`;
    }catch{status.textContent='离线保存失败，可能是空间不足或浏览器限制。请导出学习备份，联网后重试。';}
    finally{busy=false;save.disabled=false;}
  };
  if(!supported){status.textContent=location.protocol==='file:'?'电脑本地完整题库可直接离线使用；iPhone 主屏幕安装需先发布为 HTTPS 网页。':'当前地址不支持离线安装。请使用 HTTPS 网址在 Safari 中打开。';return;}
  navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(value=>{
    registration=value;save.hidden=!selection;
    if(!selection)status.textContent='页面已支持离线打开。请先开始一组题，再保存该组题目及图片。';
    else status.textContent='可保存当前一组题目及图片，离线时继续练习。';
  }).catch(()=>{status.textContent='离线功能未能启用，在线练习仍可使用。请保持普通浏览模式并联网重试。';});
})();
