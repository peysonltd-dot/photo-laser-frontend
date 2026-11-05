const API=LASER_CONFIG.apiBase.replace(/\/$/,''),$=id=>document.getElementById(id);
let key=sessionStorage.getItem('laser-admin-key')||'',limit=50,tasks=[],colors=[],polling=false,timer,editing=false,lastRender='',orderRevision='initial';
const jobs=new Map(),files=[];const thumbnailURLs=new Map();const thumbnailObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){thumbnailObserver.unobserve(e.target);loadThumbnail(e.target);}});async function loadThumbnail(img){const revision=img.dataset.revision;const id=img.dataset.taskId,design=img.dataset.design,cacheKey=id+':'+design;if(thumbnailURLs.has(cacheKey)){img.src=thumbnailURLs.get(cacheKey);return;}try{const r=await fetch(API+'/api/preview/'+encodeURIComponent(id)+'?design='+design,{headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision}});if(!r.ok)throw Error('預覽失敗');const blob=await r.blob();if(revision!==orderRevision)return;const url=URL.createObjectURL(blob);thumbnailURLs.set(cacheKey,url);img.src=url;}catch{img.alt='預覽暫時無法載入，請重新整理';}}
$('width').value=localStorage.getItem('laser-download-width')||60;
async function api(path,body,revision=orderRevision){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(r.status===401){logout();throw Error('請重新登入');}if(!r.ok||!d.success)throw Error(d.error||'操作失敗');if(path.startsWith('/api/admin/all-tasks'))d.orderRevision=r.headers.get('X-Laser-Order-Revision')||'initial';return d;}
function logout(){clearTimeout(timer);sessionStorage.removeItem('laser-admin-key');key='';$('work').classList.add('hidden');$('login').classList.remove('hidden');}
$('logout').onclick=logout;
$('login').onsubmit=async e=>{e.preventDefault();key=$('key').value;try{const check=await fetch(API+'/api/config').then(r=>r.json());if(check.product!=='laser-single-b')throw Error('網址不是雷雕後端，請檢查 config.js');await api('/api/admin/front-mode');sessionStorage.setItem('laser-admin-key',key);$('key').value='';$('login').classList.add('hidden');$('work').classList.remove('hidden');load();}catch(error){alert(error.message);}};
function btn(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){$('status').textContent=e.message;}finally{b.disabled=false;}};return b;}
function render(){if(editing)return;const signature=JSON.stringify([tasks.slice(0,limit),colors]);if(signature===lastRender)return;lastRender=signature;thumbnailObserver.disconnect();const list=$('orders');list.replaceChildren();for(const t of tasks.slice(0,limit)){const rowRevision=orderRevision;
 const row=document.createElement('article');row.className='row';const name=document.createElement('div');const strong=document.createElement('strong');strong.textContent='#'+t.id;name.append(strong);const code=document.createElement('p');code.textContent='代碼：'+(t.guestCode||'舊訂單');const color=document.createElement('p');color.textContent='杯色：'+(t.cupColorName||'未指定（選填）');name.append(code,color);const state=document.createElement('p');state.textContent=t.supersededBy?'已重新拍照（原圖保留）':t.status==='failed'?'生成失敗':t.status==='completed'?(t.chosenDesign?'已確認':'待客人確認'):'生成中';name.append(state);if(t.chosenDesign){const style=document.createElement('p');style.textContent='已選：'+t.chosenDesign+' 款';name.append(style);}
 const previews=document.createElement('div');previews.className='order-designs';
 for(const design of (t.chosenDesign?[t.chosenDesign]:['A','B'])){if(!t['hasResultImage'+design])continue;const figure=document.createElement('figure');const img=new Image();img.alt=design+' 款人物線稿';img.loading='lazy';img.dataset.taskId=t.id;img.dataset.design=design;img.dataset.revision=rowRevision;const label=document.createElement('figcaption');label.textContent=design+' 款';figure.append(img,label);previews.append(figure);thumbnailObserver.observe(img);}
 const ops=document.createElement('div');ops.className='operations';const act=document.createElement('div');act.className='actions';
 if(['A','B'].includes(t.chosenDesign)&&t['hasResultImage'+t.chosenDesign]){act.append(btn('下載雷雕 PNG（'+t.chosenDesign+' 款）',()=>download(t.id,t.chosenDesign,rowRevision)));
 for(const fmt of ['svg','png'])act.append(btn('下載合成 '+fmt.toUpperCase()+'（48 mm）',()=>download(t.id,t.chosenDesign,rowRevision,fmt)));}
 if(t.hasSourceImage)act.append(btn('下載原始照片',()=>downloadSource(t.id,rowRevision)));
 if(t.status==='failed')act.append(btn('重試生成',async()=>{if(confirm('重試會使用 AI 額度，確定？')){await api('/api/admin/retry/'+t.id,{},rowRevision);await load();}}));
 const select=document.createElement('select');for(const v of ['待確認','製作中','已完成','已取消']){const o=document.createElement('option');o.value=o.textContent=v;select.append(o);}select.value=t.processStatus||'製作中';select.onfocus=()=>editing=true;select.onblur=()=>editing=false;select.onchange=async()=>{try{await api('/api/admin/update-meta/'+t.id,{processStatus:select.value},rowRevision);t.processStatus=select.value;}catch(e){$('status').textContent=e.message;}};
 const remark=document.createElement('input');remark.placeholder='備註';remark.value=t.remark||'';remark.onfocus=()=>editing=true;remark.onblur=()=>editing=false;remark.onchange=async()=>{try{await api('/api/admin/update-meta/'+t.id,{remark:remark.value},rowRevision);t.remark=remark.value;}catch(e){$('status').textContent=e.message;}};
 ops.append(act,staffColors(t,rowRevision),select,remark);row.append(name,previews,ops);list.append(row);
 }$('more').hidden=tasks.length<=limit;}
async function load(){if(polling||!key)return;clearTimeout(timer);polling=true;try{const [d,catalog]=await Promise.all([api('/api/admin/all-tasks?lightweight=true'),api('/api/admin/colors')]);if(orderRevision!==d.orderRevision){orderRevision=d.orderRevision;editing=false;lastRender='';for(const url of thumbnailURLs.values())URL.revokeObjectURL(url);thumbnailURLs.clear();for(const controller of jobs.values())controller.abort();for(const file of files){URL.revokeObjectURL(file.url);file.row.remove();}files.length=0;}colors=catalog.colors;tasks=d.tasks.sort((a,b)=>Number(b.id)-Number(a.id));render();$('status').textContent=`顯示 ${Math.min(limit,tasks.length)}／${tasks.length} 筆；已同步`;}catch(e){$('status').textContent='同步失敗，稍後重試：'+e.message;}finally{polling=false;if(key)timer=setTimeout(load,5000);}}
$('refresh').onclick=load;$('more').onclick=()=>{limit+=50;render();};
async function download(id,design,revision=orderRevision,format=null){if(jobs.has(id))return;const width=format?87:Number($('width').value);if(!Number.isFinite(width)||width<20||width>200)throw Error('下載寬度須為 20–200 mm');const controller=new AbortController();jobs.set(id,controller);const row=document.createElement('p');row.textContent='#'+id+' 下載中… ';const cancel=btn('取消等待',()=>controller.abort());row.append(cancel);$('downloads').append(row);try{const r=await fetch(API+'/api/line-art/'+encodeURIComponent(id)+'?width='+width,{signal:controller.signal,headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision}});if(!r.ok)throw Error('下載失敗，請重試');let blob=await r.blob();if(!blob.type.startsWith('image/'))throw Error('檔案格式錯誤');if(format){const {compose}=await import('./cup-frame.js?v=48-2');blob=await compose(blob,format);}if(controller.signal.aborted||revision!==orderRevision)throw new DOMException('Cancelled','AbortError');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=format?`雷雕_${id}_${design}_保溫杯合成_48mm.${format}`:`雷雕_${id}_${design}_${width}mm_300dpi.png`;a.textContent='#'+id+' 儲存檔案';row.replaceChildren(a);files.push({url,row});while(files.length>10){const old=files.shift();URL.revokeObjectURL(old.url);old.row.remove();}a.click();}catch(e){row.textContent='#'+id+' '+(e.name==='AbortError'?'已取消，可重試':e.message);}finally{jobs.delete(id);}}
if(key){$('login').classList.add('hidden');$('work').classList.remove('hidden');load();}



function staffColors(task,revision){
 const group=document.createElement('div');group.className='staff-color-actions';group.setAttribute('role','group');group.setAttribute('aria-label','杯色（選填）');
 const title=document.createElement('p');title.textContent='杯色（選填）';group.append(title);
 const options=[{id:null,name:'未指定'},...colors.filter(c=>c.active||c.id===task.cupColorId)];
 for(const color of options){
  const selected=(task.cupColorId||null)===color.id;
  const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(selected));
  if(color.swatch){const sw=document.createElement('span');sw.className='swatch';sw.style.background=color.swatch;b.append(sw);}
  const label=document.createElement('span');label.textContent=color.name+(color.id?'（剩 '+color.stock+'）':'');b.append(label);
  b.disabled=!['A','B'].includes(task.chosenDesign)||!!task.supersededBy||(!selected&&!!color.id&&(!color.active||color.stock<1));
  b.onclick=async()=>{
   if(selected||editing)return;editing=true;group.querySelectorAll('button').forEach(el=>el.disabled=true);
   try{const result=await api('/api/admin/tasks/'+encodeURIComponent(task.id)+'/color',{colorId:color.id,expectedColorId:task.cupColorId||null},revision);task.cupColorId=result.cupColorId;task.cupColorName=result.cupColorName;}
   catch(error){alert(error.message);}
   finally{editing=false;lastRender='';await load();}
  };
  group.append(b);
 }
 return group;
}


async function downloadSource(id,revision=orderRevision){
 const jobId='source:'+id;if(jobs.has(jobId))return;
 const controller=new AbortController();jobs.set(jobId,controller);
 const row=document.createElement('p');row.textContent='#'+id+' 原始照片下載中… ';
 row.append(btn('取消等待',()=>controller.abort()));$('downloads').append(row);
 try{
  const r=await fetch(API+'/api/admin/task-source-image/'+encodeURIComponent(id),{signal:controller.signal,headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision},cache:'no-store'});
  if(!r.ok)throw Error('下載失敗，請重新登入或重新整理後重試');
  const data=await r.json();if(revision!==orderRevision)throw Error('訂單已重置，請重新整理');
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(data.sourceImage||'');
  if(!match)throw Error('此訂單沒有可下載的原始照片');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  const blob=new Blob([bytes],{type:'image/'+match[1]});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='雷雕_'+id+'_原始照片.'+(match[1]==='jpeg'?'jpg':match[1]);a.textContent='#'+id+' 儲存原始照片';
  row.replaceChildren(a);files.push({url,row});
  while(files.length>10){const old=files.shift();URL.revokeObjectURL(old.url);old.row.remove();}
  a.click();
 }catch(e){row.textContent='#'+id+' '+(e.name==='AbortError'?'已取消，可重試':e.message);}
 finally{jobs.delete(jobId);}
}
