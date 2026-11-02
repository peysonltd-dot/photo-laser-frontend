const cfg=window.LASER_CONFIG, API=cfg.apiBase.replace(/\/$/,'');
const screen=document.getElementById('screen'),message=document.getElementById('message');
document.getElementById('title').textContent=cfg.title;
let entryMode='camera',guestToken=localStorage.getItem('laser-guest-token')||'',guestCode=localStorage.getItem('laser-guest-code')||'',previewURL=null,colorTimer=null;
let stream=null,photo=null,taskId=localStorage.getItem('laser-active-task'),poll=null,returnTimer=null,busy=false,requestId=crypto.randomUUID();
function msg(text,error=false){message.textContent=text;message.className=error?'error':'';}
let captureTimer=null,captureOverlay=null;
function stopCamera(){clearTimeout(captureTimer);captureTimer=null;captureOverlay?.remove();captureOverlay=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
async function api(path,body){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{'X-Guest-Token':guestToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'連線失敗');return d;}
function button(text,fn,primary=false){const b=document.createElement('button');b.textContent=text;b.className=primary?'primary':'';b.onclick=fn;return b;}
function actions(...buttons){const e=document.createElement('div');e.className='actions';e.append(...buttons);screen.append(e);}
let loadingSlideTimer=null;
let waitVersion=0,progressTimer=null,progressValue=5,progressPhase='queued';
function heading(text){clearTimeout(colorTimer);colorTimer=null;clearInterval(loadingSlideTimer);loadingSlideTimer=null;clearInterval(progressTimer);progressTimer=null;waitVersion++;screen.replaceChildren();const h=document.createElement('h2');h.textContent=text;screen.append(h);msg('');}
function home(){clearTimeout(poll);clearInterval(returnTimer);stopCamera();taskId=null;photo=null;busy=false;guestToken='';guestCode='';localStorage.removeItem('laser-active-task');localStorage.removeItem('laser-guest-token');localStorage.removeItem('laser-guest-code');if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;requestId=crypto.randomUUID();heading('請輸入活動代碼');const form=document.createElement('form');form.className='code-entry';const label=document.createElement('label');label.textContent='活動代碼';const input=document.createElement('input');input.required=true;input.maxLength=64;input.autocomplete='off';input.placeholder='請輸入您的代碼';label.append(input);const go=button('驗證代碼',()=>{},true);go.type='submit';form.append(label,go);form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;go.disabled=true;try{const d=await api('/api/access',{code:input.value});guestToken=d.token;guestCode=d.code;taskId=d.taskId;localStorage.setItem('laser-guest-token',guestToken);localStorage.setItem('laser-guest-code',guestCode);if(taskId){localStorage.setItem('laser-active-task',taskId);waiting();}else chooseEntry();}catch(e){msg(e.message,true);}finally{busy=false;go.disabled=false;}};screen.append(form);}
async function camera(){entryMode='camera';heading('看向鏡頭，準備好就拍照');photoGuidance();const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;screen.append(video);try{stopCamera();stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:1280},facingMode:'user'},audio:false});video.srcObject=stream;await video.play();actions(button('拍照',(event)=>startCaptureCountdown(video,event.currentTarget),true),button('返回首頁',home));}catch(e){msg('無法開啟相機。請確認網址為 HTTPS，並允許相機權限。',true);actions(button('重新開啟',camera),button('返回首頁',home));}}
function capture(video){if(!video.videoWidth)return;const c=document.createElement('canvas');c.width=c.height=1024;const n=Math.min(video.videoWidth,video.videoHeight);const ctx=c.getContext('2d');ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(video,(video.videoWidth-n)/2,(video.videoHeight-n)/2,n,n,0,0,1024,1024);photo=c.toDataURL('image/jpeg',.82);for(let q=.72;photo.length>500000&&q>=.32;q-=.1)photo=c.toDataURL('image/jpeg',q);if(photo.length>500000){msg('照片細節過多，請改用簡單背景再拍照。',true);return;}stopCamera();previewPhoto();}

async function submit(){if(busy)return;busy=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);msg('照片傳送中，請稍候…');try{const d=await api('/api/upload',{image:photo,requestId,entryMode});taskId=d.taskId;localStorage.setItem('laser-active-task',taskId);photo=null;waiting();}catch(e){msg('送出未確認，請確認網路後按「開始生成」重試。'+e.message,true);screen.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}}
function waiting(){
 heading('專屬線稿製作中');
 showLoadingSlides();
 const n=document.createElement('div');n.className='number';n.textContent='';n.hidden=true;screen.append(n);
 const stage=document.createElement('p');stage.id='generation-stage';stage.textContent='照片已送出，正在查詢進度';screen.insertBefore(stage,n);
 const bar=document.createElement('div');bar.id='generation-progress';bar.className='generation-progress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','預估生成進度');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');const label=document.createElement('div');label.className='generation-percent';label.innerHTML='<span>預估進度</span><strong id="generation-percent">5%</strong>';screen.append(label,bar);progressValue=5;progressPhase='queued';paintProgress(5);progressTimer=setInterval(()=>{if(progressPhase==='failed'||progressPhase==='offline')return;const cap=progressPhase==='queued'?15:95;paintProgress(Math.min(cap,progressValue+Math.max(.1,(cap-progressValue)*.035)));},1000);
 actions(button('返回首頁',()=>{
   if(confirm('返回首頁後仍會繼續生圖，稍後輸入相同代碼即可接續。確定返回？'))home();
 }));
 pollTask(taskId,waitVersion);
}
async function pollTask(id=taskId,version=waitVersion){
 if(id!==taskId||version!==waitVersion)return;
 try{
   const d=await api('/api/status/'+encodeURIComponent(id));
   if(id!==taskId||version!==waitVersion)return;
   if(d.status==='completed'&&d.hasResultImageB){
     clearInterval(progressTimer);paintProgress(100);
     document.getElementById('generation-stage').textContent='線稿已完成';
     if(d.chosenDesign==='B'){completed(d.cupColorName);return;}const r=await fetch(API+'/api/preview/'+encodeURIComponent(id),{headers:{'X-Guest-Token':guestToken}});if(!r.ok)throw Error('預覽載入失敗');const blob=await r.blob();if(id!==taskId||version!==waitVersion)return;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);review(previewURL);return;
   }
   const stage=document.getElementById('generation-stage');
   const bar=document.getElementById('generation-progress');
   if(d.status==='failed'){
     progressPhase='failed';stage.textContent='生成未完成，請工作人員協助重試';bar.classList.add('is-failed');bar.setAttribute('aria-label','生成未完成');
     msg('請告知工作人員您的活動代碼 '+guestCode+'，後台可重試。',true);
   }else{
     progressPhase=d.status==='queued'||d.status==='pending'?'queued':'generating';bar.classList.remove('is-failed');bar.setAttribute('aria-label','預估生成進度');
     stage.textContent=d.status==='queued'||d.status==='pending'?'照片已送出 → 排隊等待中':'照片已送出 → AI 正在生成線稿';
     msg('');
   }
 }catch(e){
   if(id!==taskId||version!==waitVersion)return;
   progressPhase='offline';msg('連線較慢，正在重新連線，請勿重新拍照。');
 }
 if(id===taskId&&version===waitVersion)poll=setTimeout(()=>pollTask(id,version),3000);
}
function review(src){heading('確認您的專屬線稿');const img=new Image();img.src=src;img.className='portrait';screen.append(img);actions(button('確認圖片，選擇杯色',()=>chooseColor(src),true),button('取消（回首頁）',()=>{if(confirm('返回首頁？稍後輸入相同代碼可接續此圖片。'))home();}));}
async function chooseColor(src){heading('選擇杯款顏色');const version=waitVersion;const img=new Image();img.src=src;img.className='portrait';img.style.maxWidth='220px';screen.append(img);const hint=document.createElement('p');hint.textContent='選擇顏色後按確認；以送單成功時的庫存為準。';const grid=document.createElement('div');grid.className='color-grid';screen.append(hint,grid);let selected=null;const go=button('確認杯色並完成',async()=>{if(busy||!selected)return;busy=true;go.disabled=true;try{const d=await api('/api/finalize',{taskId,colorId:selected});completed(d.colorName);}catch(e){msg(e.message,true);selected=null;await refresh();}finally{busy=false;go.disabled=!selected;}},true);go.disabled=true;actions(go,button('返回看圖',()=>{if(!busy)review(src);}),button('返回首頁',()=>{if(!busy&&confirm('返回首頁？相同代碼可接續此訂單。'))home();}));async function refresh(){clearTimeout(colorTimer);try{const d=await api('/api/colors');if(version!==waitVersion)return;grid.replaceChildren();if(!d.colors.length){const p=document.createElement('p');p.textContent='目前尚無可選杯色，請洽工作人員。';grid.append(p);}if(!d.colors.some(c=>c.id===selected&&c.stock>0))selected=null;for(const c of d.colors){const b=button('',()=>{if(busy)return;selected=c.id;drawSelection();});b.dataset.colorId=c.id;b.disabled=c.stock<1;const sw=document.createElement('span');sw.className='swatch';sw.style.background=c.swatch;const label=document.createElement('span');label.textContent=c.name+(c.stock>0?'｜剩餘 '+c.stock:'｜已選完');b.append(sw,label);grid.append(b);}drawSelection();}catch(e){if(version===waitVersion)msg(e.message,true);}finally{if(version===waitVersion)colorTimer=setTimeout(refresh,5000);}}function drawSelection(){for(const b of grid.children)if(b.dataset.colorId)b.setAttribute('aria-pressed',String(b.dataset.colorId===selected));go.disabled=busy||!selected;}await refresh();}
function completed(colorName){heading('已完成！');const p=document.createElement('p');p.textContent='您的杯款顏色：'+(colorName||'已選定');const hint=document.createElement('p');hint.textContent='請以您的活動代碼向工作人員確認領取。';screen.append(p,hint);actions(button('返回首頁',home));let left=cfg.returnSeconds||20;const label=document.createElement('p');screen.append(label);label.textContent=left+' 秒後返回首頁';returnTimer=setInterval(()=>{left--;label.textContent=left+' 秒後返回首頁';if(left<=0)home();},1000);}

if(API.includes('YOUR-LASER')){heading('尚未完成系統設定');msg('請先在 config.js 填入獨立雷雕後端網址。',true);}else{heading('正在連接雷雕系統');api('/api/config').then(d=>{if(d.product!=='laser-single-b')throw Error('此網址不是獨立雷雕後端，已停止送單。');if(d.flowVersion!==2)throw Error('系統更新中，請稍候重新整理');if(taskId&&guestToken)waiting();else home();}).catch(e=>msg(e.message,true));}

function chooseEntry(){stopCamera();heading('選擇照片來源');photoGuidance();actions(button('現場拍照',camera,true),button('上傳照片',uploadPhoto,true),button('返回首頁',home));}
function previewPhoto(){heading('使用這張照片製作線稿？');const img=new Image();img.src=photo;img.className='portrait';screen.append(img);actions(button('開始生成',submit,true),button(entryMode==='upload'?'更換照片':'重新拍照',entryMode==='upload'?uploadPhoto:camera),button('重新選擇來源',chooseEntry));}
function uploadPhoto(){stopCamera();entryMode='upload';heading('選擇一張清楚的單人照片');photoGuidance();const hint=document.createElement('p');hint.textContent='支援 JPG、PNG、WebP，最大 20 MB。';screen.append(hint);const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>20*1024*1024){msg('照片超過 20 MB，請選擇較小的照片。',true);return;}const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);const ratio=Math.min(1024/img.width,1024/img.height);const w=img.width*ratio,h=img.height*ratio;ctx.drawImage(img,(1024-w)/2,(1024-h)/2,w,h);photo=c.toDataURL('image/jpeg',.82);for(let q=.72;photo.length>500000&&q>=.32;q-=.1)photo=c.toDataURL('image/jpeg',q);if(photo.length>500000)throw Error('照片過於複雜，請更換照片');requestId=crypto.randomUUID();previewPhoto();}catch(e){msg('無法讀取照片，請改用 JPG 或 PNG。'+e.message,true);}finally{URL.revokeObjectURL(url);}};screen.append(input);actions(button('返回',chooseEntry));}

function startCaptureCountdown(video,trigger){
  if(captureOverlay||!video.videoWidth||video.readyState<2)return;
  trigger.disabled=true;
  const overlay=document.createElement('div');
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','assertive');
  overlay.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1000;color:#fff;font-size:clamp(100px,22vw,240px);font-weight:900;text-shadow:0 4px 24px #000,0 0 6px #000;background:rgba(0,0,0,.15)';
  captureOverlay=overlay;
  document.body.append(overlay);
  let remaining=3;
  overlay.textContent=remaining;
  const tick=()=>{
    if(!video.isConnected||!stream){stopCamera();return;}
    remaining--;
    if(remaining>0){overlay.textContent=remaining;captureTimer=setTimeout(tick,1000);return;}
    overlay.remove();captureOverlay=null;captureTimer=null;
    trigger.disabled=false;
    capture(video);
  };
  captureTimer=setTimeout(tick,1000);
}

function photoGuidance(){const p=document.createElement('p');p.textContent='請拍攝或上傳正面、臉部清晰的單人照片，避免多人合照，以免無法正確生成線稿。';p.style.color='#133139';screen.append(p);}

function paintProgress(value){progressValue=Math.max(progressValue,value);const bar=document.getElementById('generation-progress'),label=document.getElementById('generation-percent');if(!bar||!label)return;const rounded=Math.floor(progressValue);bar.style.setProperty('--progress',progressValue+'%');bar.setAttribute('aria-valuenow',String(rounded));label.textContent=rounded+'%';}

function showLoadingSlides(){
 const version=waitVersion;
 const frame=document.createElement('div');frame.className='loading-slides';screen.append(frame);
 const pictures=[1,2,3].map(n=>{const img=new Image();img.src='assets/innoserve/loading-'+n+'.jpg';img.alt='InnoServe Awards 活動主視覺';img.width=1721;img.height=1244;return img;});
 frame.append(pictures[0]);
 Promise.all(pictures.map(img=>img.decode())).then(()=>{
   if(version!==waitVersion||!frame.isConnected)return;
   let index=0;
   loadingSlideTimer=setInterval(()=>{
     if(version!==waitVersion||!frame.isConnected){clearInterval(loadingSlideTimer);loadingSlideTimer=null;return;}
     index=(index+1)%pictures.length;frame.replaceChildren(pictures[index]);
   },1000);
 }).catch(()=>{/* Keep the first image if another slide cannot be loaded. */});
}

