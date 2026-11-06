const API=LASER_CONFIG.apiBase.replace(/\/$/,''),$=id=>document.getElementById(id);
let key=sessionStorage.getItem('laser-admin-key')||'',limit=50,tasks=[],colors=[],polling=false,timer,editing=false,lastRender='',orderRevision='initial';
const jobs=new Map(),files=[];const thumbnailURLs=new Map();const thumbnailObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){thumbnailObserver.unobserve(e.target);loadThumbnail(e.target);}});async function loadThumbnail(img){const revision=img.dataset.revision;const id=img.dataset.taskId,design=img.dataset.design,cacheKey=id+':'+design;if(thumbnailURLs.has(cacheKey)){img.src=thumbnailURLs.get(cacheKey);return;}try{const r=await fetch(API+'/api/preview/'+encodeURIComponent(id)+'?design='+design,{headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision}});if(!r.ok)throw Error('預覽失敗');const blob=await r.blob();if(revision!==orderRevision)return;const url=URL.createObjectURL(blob);thumbnailURLs.set(cacheKey,url);img.src=url;}catch{img.alt='預覽暫時無法載入，請重新整理';}}
// Order search matches the entire number/code; # explicitly selects order ID.
function matchesOrderSearch(task,query){
 const q=String(query||'').normalize('NFKC').trim().toLowerCase();if(!q)return true;
 const canonical=value=>{const s=String(value??'').normalize('NFKC').trim().toLowerCase();return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s;};
 if(q.startsWith('#')){const id=q.slice(1).trim();return !!id&&canonical(task.id)===canonical(id);}
 return canonical(task.id)===canonical(q)||(task.guestCode!=null&&canonical(task.guestCode)===canonical(q));
}
let orderSearch='';
function filteredOrders(){return tasks.filter(t=>matchesOrderSearch(t,orderSearch));}
function initOrderSearch(){
 const box=document.createElement('section');box.className='card';box.style.marginTop='16px';
 const label=document.createElement('label');label.htmlFor='order-search';label.textContent='搜尋訂單';
 const input=document.createElement('input');input.id='order-search';input.type='search';input.placeholder='訂單編號或活動代碼，例如 #71、202';input.autocomplete='off';
 const clear=btn('清除搜尋',()=>{input.value='';apply();input.focus();});clear.type='button';
 const note=document.createElement('p');note.className='note';note.textContent='搜尋全部訂單。#71 可找到 #071；不加 # 時，同時比對訂單編號與活動代碼。';
 function apply(){orderSearch=input.value;limit=50;lastRender='';render();}input.addEventListener('input',apply);
 box.append(label,input,clear,note);$('status').before(box);
}
initOrderSearch();
// AUTO_PNG_START — persistent, browser-local, one automatic worker across tabs.
const AUTO_PNG_STORE='laser-auto-composite-v1:'+API;
let autoPngBusy=false,autoPngController=null;
function autoPngIdentity(t,revision=orderRevision){return JSON.stringify([revision,String(t.id),t.createdAtIso||t.createdAt||'']);}
function readAutoPng(){const raw=localStorage.getItem(AUTO_PNG_STORE);const state=raw?JSON.parse(raw):{enabled:false,baseline:true,records:{}};if(!state||typeof state.enabled!=='boolean'||!state.records||typeof state.records!=='object')throw Error('本機下載紀錄無法讀取');return state;}
function saveAutoPng(state){localStorage.setItem(AUTO_PNG_STORE,JSON.stringify(state));}
function autoPngMessage(message){$('auto-png-status').textContent=message;}
function paintAutoPng(){try{const s=readAutoPng();$('auto-png-toggle').checked=s.enabled;const rows=Object.values(s.records),failed=rows.filter(r=>r.status==='failed');autoPngMessage((s.enabled?`已啟用｜待處理 ${rows.filter(r=>r.status==='pending').length} 筆｜已觸發下載 ${rows.filter(r=>r.status==='triggered').length} 筆`:'自動下載已關閉；可手動下載。')+(failed.length?'｜需手動補下載：'+failed.map(r=>'#'+r.id).join('、'):'')+' 實際儲存結果請至瀏覽器下載紀錄確認。');}catch{autoPngMessage('本機下載紀錄無法讀寫，自動下載已暫停；請使用手動下載。');}}
async function toggleAutoPng(){const input=$('auto-png-toggle');input.disabled=true;try{const s=readAutoPng();s.enabled=input.checked;if(s.enabled)s.baseline=true;saveAutoPng(s);if(!s.enabled&&autoPngController)autoPngController.abort();paintAutoPng();await load();}catch{autoPngMessage('無法儲存自動下載設定；請使用手動下載。');}finally{input.disabled=!navigator.locks;paintAutoPng();}}
function observeAutoPng(state,list,revision){
 const live=new Set(list.map(t=>autoPngIdentity(t,revision)));
 for(const id of Object.keys(state.records))if(!live.has(id))delete state.records[id];
 for(const t of list){const id=autoPngIdentity(t,revision),chosen=['A','B'].includes(t.chosenDesign);let r=state.records[id];
  if(state.baseline){if(!r||['waiting','pending'].includes(r.status))r=state.records[id]={id:t.id,status:chosen?'skipped':'waiting'};}
  else if(!r)r=state.records[id]={id:t.id,status:'waiting'};
  if(!state.baseline&&r.status==='waiting'&&chosen)r.status='pending';
  if((t.supersededBy||t.processStatus==='已取消')&&['waiting','pending'].includes(r.status))r.status='skipped';
 }state.baseline=false;
}
function recordAutoPng(t,revision){const s=readAutoPng();s.records[autoPngIdentity(t,revision)]={id:t.id,status:'triggered'};saveAutoPng(s);paintAutoPng();}
async function pumpAutoPng(){
 if(!navigator.locks||autoPngBusy||!key)return;autoPngBusy=true;
 try{await navigator.locks.request(AUTO_PNG_STORE,{ifAvailable:true},async lock=>{
  if(!lock||!key)return;let s=readAutoPng();if(!s.enabled)return;
  const revision=orderRevision;observeAutoPng(s,tasks,revision);saveAutoPng(s);paintAutoPng();
  if(jobs.size)return;
  const task=[...tasks].sort((a,b)=>Number(a.id)-Number(b.id)).find(t=>s.records[autoPngIdentity(t,revision)]?.status==='pending'&&['A','B'].includes(t.chosenDesign)&&t['hasResultImage'+t.chosenDesign]&&t.status==='completed');
  if(!task)return;const identity=autoPngIdentity(task,revision),design=task.chosenDesign;
  autoPngMessage(`正在自動合成 #${task.id}（${design} 款，48 mm）…`);
  const result=await download(task.id,design,revision,'png',{
   started(controller){autoPngController=controller;},
   beforeTrigger(){const latest=tasks.find(t=>autoPngIdentity(t)===identity),current=readAutoPng();if(!key||!current.enabled||current.records[identity]?.status!=='pending'||!latest||latest.chosenDesign!==design||latest.status!=='completed'||latest.supersededBy||latest.processStatus==='已取消'||revision!==orderRevision)throw Error('設定或訂單已變更，已停止自動下載；可手動補下載。');recordAutoPng(task,revision);}
  });
  autoPngController=null;
  if(result?.status==='failed'){s=readAutoPng();if(s.records[identity]?.status==='pending'){s.records[identity]={id:task.id,status:'failed'};saveAutoPng(s);}}
  paintAutoPng();
 });}catch(e){autoPngMessage('自動下載已暫停：'+e.message+'。請使用手動下載。');}
 finally{autoPngBusy=false;autoPngController=null;}
}
function initAutoPng(){
 const section=document.createElement('section');section.className='card';section.style.marginTop='16px';
 const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:12px;cursor:pointer;';
 const input=document.createElement('input');input.id='auto-png-toggle';input.type='checkbox';input.style.cssText='width:22px;height:22px;margin:0;flex:none;';input.onchange=toggleAutoPng;input.disabled=!navigator.locks;
 const title=document.createElement('strong');title.textContent='自動下載合成 PNG';label.append(input,title);
 const note=document.createElement('p');note.className='note';note.textContent='僅此電腦瀏覽器生效。啟用後，新確認 A／B 款的訂單依序下載 48 mm 合成 PNG；舊訂單不會一次補下載。請保持後台開啟、電腦不休眠，允許此網站自動下載多個檔案，並關閉每次詢問儲存位置。';
 const status=document.createElement('p');status.id='auto-png-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(label,note,status);$('status').before(section);
 if(navigator.locks)paintAutoPng();else autoPngMessage('此瀏覽器不支援安全的自動下載排程，請使用電腦版 Chrome；手動下載仍可使用。');
 window.addEventListener('storage',e=>{if(e.key!==AUTO_PNG_STORE)return;try{if(!readAutoPng().enabled&&autoPngController)autoPngController.abort();}catch{}paintAutoPng();});
}
initAutoPng();
// AUTO_PNG_END

$('width').value=localStorage.getItem('laser-download-width')||60;
async function api(path,body,revision=orderRevision){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(r.status===401){logout();throw Error('請重新登入');}if(!r.ok||!d.success)throw Error(d.error||'操作失敗');if(path.startsWith('/api/admin/all-tasks'))d.orderRevision=r.headers.get('X-Laser-Order-Revision')||'initial';return d;}
function logout(){clearTimeout(timer);if(autoPngController)autoPngController.abort();sessionStorage.removeItem('laser-admin-key');key='';$('work').classList.add('hidden');$('login').classList.remove('hidden');}
$('logout').onclick=logout;
$('login').onsubmit=async e=>{e.preventDefault();key=$('key').value;try{const check=await fetch(API+'/api/config').then(r=>r.json());if(check.product!=='laser-single-b')throw Error('網址不是雷雕後端，請檢查 config.js');await api('/api/admin/front-mode');sessionStorage.setItem('laser-admin-key',key);$('key').value='';$('login').classList.add('hidden');$('work').classList.remove('hidden');load();}catch(error){alert(error.message);}};
function btn(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){$('status').textContent=e.message;}finally{b.disabled=false;}};return b;}
function render(){if(editing)return;const found=filteredOrders();$('status').textContent=orderSearch.trim()?`搜尋結果：顯示 ${Math.min(limit,found.length)}／${found.length} 筆（全部 ${tasks.length} 筆）`:`顯示 ${Math.min(limit,tasks.length)}／${tasks.length} 筆；已同步`;const signature=JSON.stringify([found.slice(0,limit),colors,orderSearch]);if(signature===lastRender)return;lastRender=signature;thumbnailObserver.disconnect();const list=$('orders');list.replaceChildren();for(const t of found.slice(0,limit)){const rowRevision=orderRevision;
 const row=document.createElement('article');row.className='row';const name=document.createElement('div');const strong=document.createElement('strong');strong.textContent='#'+t.id;name.append(strong);const code=document.createElement('p');code.textContent='代碼：'+(t.guestCode||'舊訂單');const color=document.createElement('p');color.textContent='杯色：'+(t.cupColorName||'未指定（選填）');name.append(code,color);const state=document.createElement('p');state.textContent=t.supersededBy?'已重新拍照（原圖保留）':t.status==='failed'?'生成失敗':t.status==='completed'?(t.chosenDesign?'已確認':'待客人確認'):'生成中';name.append(state);if(t.chosenDesign){const style=document.createElement('p');style.textContent='已選：'+t.chosenDesign+' 款';name.append(style);}
 const previews=document.createElement('div');previews.className='order-designs';
 for(const design of (t.chosenDesign?[t.chosenDesign]:['A','B'])){if(!t['hasResultImage'+design])continue;const figure=document.createElement('figure');const img=new Image();img.alt=design+' 款人物線稿';img.loading='lazy';img.dataset.taskId=t.id;img.dataset.design=design;img.dataset.revision=rowRevision;const label=document.createElement('figcaption');label.textContent=design+' 款';figure.append(img,label);previews.append(figure);thumbnailObserver.observe(img);}
 const ops=document.createElement('div');ops.className='operations';const act=document.createElement('div');act.className='actions';
 if(['A','B'].includes(t.chosenDesign)&&t['hasResultImage'+t.chosenDesign]){
  act.append(btn('合成PNG',()=>download(t.id,t.chosenDesign,rowRevision,'png')));
  act.append(btn('線稿',()=>download(t.id,t.chosenDesign,rowRevision)));}
 if(t.hasSourceImage)act.append(btn('原圖',()=>downloadSource(t.id,rowRevision)));
 if(t.status==='failed')act.append(btn('重試生成',async()=>{if(confirm('重試會使用 AI 額度，確定？')){await api('/api/admin/retry/'+t.id,{},rowRevision);await load();}}));
 const select=document.createElement('select');for(const v of ['待確認','製作中','已完成','已取消']){const o=document.createElement('option');o.value=o.textContent=v;select.append(o);}select.value=t.processStatus||'製作中';select.onfocus=()=>editing=true;select.onblur=()=>editing=false;select.onchange=async()=>{try{await api('/api/admin/update-meta/'+t.id,{processStatus:select.value},rowRevision);t.processStatus=select.value;}catch(e){$('status').textContent=e.message;}};
 const remark=document.createElement('input');remark.placeholder='備註';remark.value=t.remark||'';remark.onfocus=()=>editing=true;remark.onblur=()=>editing=false;remark.onchange=async()=>{try{await api('/api/admin/update-meta/'+t.id,{remark:remark.value},rowRevision);t.remark=remark.value;}catch(e){$('status').textContent=e.message;}};
 ops.append(act,staffColors(t,rowRevision),select,remark);row.append(name,previews,ops);list.append(row);
 }if(!found.length){const empty=document.createElement('p');empty.textContent=orderSearch.trim()?'找不到符合的訂單，請確認編號或代碼，或清除搜尋。':'尚無訂單';list.append(empty);}$('more').hidden=found.length<=limit;}
async function load(){if(polling||!key)return;clearTimeout(timer);polling=true;try{const [d,catalog]=await Promise.all([api('/api/admin/all-tasks?lightweight=true'),api('/api/admin/colors')]);if(orderRevision!==d.orderRevision){orderRevision=d.orderRevision;editing=false;lastRender='';for(const url of thumbnailURLs.values())URL.revokeObjectURL(url);thumbnailURLs.clear();for(const controller of jobs.values())controller.abort();for(const file of files){URL.revokeObjectURL(file.url);file.row.remove();}files.length=0;}colors=catalog.colors;tasks=d.tasks.sort((a,b)=>Number(b.id)-Number(a.id));render();void pumpAutoPng();}catch(e){$('status').textContent='同步失敗，稍後重試：'+e.message;}finally{polling=false;if(key)timer=setTimeout(load,5000);}}
$('refresh').onclick=load;$('more').onclick=()=>{limit+=50;render();};
async function download(id,design,revision=orderRevision,format=null,options={}){if(jobs.has(id))return;const width=format?87:Number($('width').value);if(!Number.isFinite(width)||width<20||width>200)throw Error('下載寬度須為 20–200 mm');const controller=new AbortController();jobs.set(id,controller);if(options.started)options.started(controller);const downloadTask=tasks.find(t=>String(t.id)===String(id));const row=document.createElement('p');row.textContent='#'+id+' 下載中… ';const cancel=btn('取消等待',()=>controller.abort());row.append(cancel);$('downloads').append(row);try{const r=await fetch(API+'/api/line-art/'+encodeURIComponent(id)+'?width='+width,{signal:controller.signal,headers:{Authorization:'Bearer '+key,'X-Laser-Order-Revision':revision}});if(!r.ok)throw Error('下載失敗，請重試');let blob=await r.blob();if(!blob.type.startsWith('image/'))throw Error('檔案格式錯誤');if(format){const {compose}=await import('./cup-frame.js?v=48-2');blob=await compose(blob,format);}if(controller.signal.aborted||revision!==orderRevision)throw new DOMException('Cancelled','AbortError');if(options.beforeTrigger)options.beforeTrigger();else if(format==='png'&&downloadTask){try{recordAutoPng(downloadTask,revision);}catch{}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=format?`雷雕_${id}_${design}_保溫杯合成_48mm.${format}`:`雷雕_${id}_${design}_${width}mm_300dpi.png`;a.textContent='#'+id+' 儲存檔案';row.replaceChildren(a);files.push({url,row});while(files.length>10){const old=files.shift();URL.revokeObjectURL(old.url);old.row.remove();}a.click();return {status:'triggered'};}catch(e){row.textContent='#'+id+' '+(e.name==='AbortError'?'已取消，可重試':e.message);return {status:'failed'};}finally{jobs.delete(id);}}
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


