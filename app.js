const cfg=window.LASER_CONFIG, API=cfg.apiBase.replace(/\/$/,'');
const screen=document.getElementById('screen'),message=document.getElementById('message');
document.getElementById('title').textContent=cfg.title;
let entryMode='camera',guestToken=localStorage.getItem('laser-guest-token')||'',guestCode=localStorage.getItem('laser-guest-code')||'',previewURL=null,colorTimer=null;
let replacementTaskId=null,mobileSession=null,mobilePoll=null,frontMode='camera';
let selectedDesign=null,designPreviews={};
function clearPreviews(){for(const url of new Set(Object.values(designPreviews)))URL.revokeObjectURL(url);designPreviews={};if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;selectedDesign=null;}
async function refreshInputMode(){const d=await api('/api/config');frontMode=d.frontMode==='both'?'both':'camera';}
const deviceMode=new URLSearchParams(location.search).get('mode')||cfg.deviceMode||'auto';
const kioskMode=deviceMode==='kiosk'||(deviceMode==='auto'&&!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)&&matchMedia('(min-width:900px)').matches);
let stream=null,photo=null,taskId=localStorage.getItem('laser-active-task'),poll=null,returnTimer=null,busy=false,requestId=crypto.randomUUID();
function msg(text,error=false){message.textContent=text;message.className=error?'error':'';}
let captureTimer=null,captureOverlay=null;
function stopCamera(){clearTimeout(captureTimer);captureTimer=null;captureOverlay?.remove();captureOverlay=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
async function api(path,body){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{'X-Guest-Token':guestToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'連線失敗');return d;}
function button(text,fn,primary=false){const b=document.createElement('button');b.textContent=text;b.className=primary?'primary':'';b.onclick=fn;return b;}
function actions(...buttons){const e=document.createElement('div');e.className='actions';e.append(...buttons);screen.append(e);}
let loadingSlideTimer=null;
let waitVersion=0,progressTimer=null,progressValue=5,progressPhase='queued';
function cancelMobileSession(id,token){return fetch(API+'/api/mobile-upload-sessions/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{'X-Guest-Token':token,'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});}
function clearMobileSession(){clearTimeout(mobilePoll);mobilePoll=null;if(mobileSession){const old=mobileSession;mobileSession=null;cancelMobileSession(old.id,old.token);}}
function heading(text){screen.classList.remove('landing');document.getElementById('privacy-notice').hidden=true;clearMobileSession();clearTimeout(colorTimer);colorTimer=null;clearInterval(loadingSlideTimer);loadingSlideTimer=null;clearInterval(progressTimer);progressTimer=null;waitVersion++;screen.replaceChildren();const h=document.createElement('h2');h.textContent=text;screen.append(h);msg('');}
function resetGuestState(){clearTimeout(poll);clearInterval(returnTimer);stopCamera();clearMobileSession();replacementTaskId=null;taskId=null;photo=null;busy=false;guestToken='';guestCode='';localStorage.removeItem('laser-active-task');localStorage.removeItem('laser-guest-token');localStorage.removeItem('laser-guest-code');clearPreviews();requestId=crypto.randomUUID();}
function home(){resetGuestState();heading('');screen.querySelector('h2').remove();screen.classList.add('landing');document.getElementById('privacy-notice').hidden=false;const start=button('開始體驗',showCodeEntry,true);start.classList.add('start-experience');actions(start);}
function showCodeEntry(){heading('請輸入活動代碼');const version=waitVersion;const form=document.createElement('form');form.className='code-entry';const label=document.createElement('label');const input=document.createElement('input');input.setAttribute('aria-label','活動代碼');input.required=true;input.maxLength=64;input.autocomplete='off';input.placeholder='請輸入您的代碼';label.append(input);const go=button('驗證代碼',()=>{},true);go.type='submit';form.append(label,go);form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;go.disabled=true;try{await refreshInputMode();const d=await api('/api/access',{code:input.value});if(version!==waitVersion)return;guestToken=d.token;guestCode=d.code;taskId=d.taskId;localStorage.setItem('laser-guest-token',guestToken);localStorage.setItem('laser-guest-code',guestCode);if(taskId){localStorage.setItem('laser-active-task',taskId);waiting();}else chooseEntry();}catch(e){if(version===waitVersion)msg(e.message,true);}finally{busy=false;go.disabled=false;}};screen.append(form);actions(button('返回首頁',home));}
async function camera(){entryMode='camera';heading('看向鏡頭，準備好就拍照');const version=waitVersion;photoGuidance();const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;screen.append(video);try{stopCamera();const opened=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:1280},facingMode:'user'},audio:false});if(version!==waitVersion){opened.getTracks().forEach(t=>t.stop());return;}stream=opened;video.srcObject=stream;await video.play();if(version!==waitVersion)return;actions(button('拍照',(event)=>startCaptureCountdown(video,event.currentTarget),true),...(frontMode==='both'?[button('改用上傳照片',uploadPhoto)]:[]),button('返回首頁',home));}catch(e){if(version!==waitVersion)return;msg('無法開啟相機。請確認網址為 HTTPS，並允許相機權限。',true);actions(button('重新開啟',camera),...(frontMode==='both'?[button('改用上傳照片',uploadPhoto)]:[]),button('返回首頁',home));}}
function capture(video){if(!video.videoWidth)return;const c=document.createElement('canvas');c.width=c.height=1024;const n=Math.min(video.videoWidth,video.videoHeight);const ctx=c.getContext('2d');ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(video,(video.videoWidth-n)/2,(video.videoHeight-n)/2,n,n,0,0,1024,1024);photo=c.toDataURL('image/jpeg',.82);for(let q=.72;photo.length>500000&&q>=.32;q-=.1)photo=c.toDataURL('image/jpeg',q);if(photo.length>500000){msg('照片細節過多，請改用簡單背景再拍照。',true);return;}stopCamera();requestId=crypto.randomUUID();previewPhoto();}

async function submit(){if(busy)return;busy=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);msg('照片傳送中，請稍候…');try{const d=await api('/api/upload',{image:photo,requestId,entryMode,replaceTaskId:replacementTaskId});taskId=d.taskId;replacementTaskId=null;localStorage.setItem('laser-active-task',taskId);photo=null;waiting();}catch(e){msg('送出未確認，請確認網路後按「開始生成」重試。'+e.message,true);screen.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}}
function waiting(){
 heading('AI人像照片生成中');
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
   if(d.status==='completed'&&d.hasResultImageB&&(!(d.designStyles||[]).includes('A')||d.hasResultImageA)){
     clearInterval(progressTimer);paintProgress(100);
     document.getElementById('generation-stage').textContent='線稿已完成';
     if(['A','B'].includes(d.chosenDesign)){selectedDesign=d.chosenDesign;completed(d.downloadToken);return;}
     const designs=(d.designStyles||['B']).filter(x=>['A','B'].includes(x));
     const blobs=await Promise.all(designs.map(async design=>{const r=await fetch(API+'/api/preview/'+encodeURIComponent(id)+'?design='+design,{headers:{'X-Guest-Token':guestToken}});if(!r.ok)throw Error('預覽載入失敗');return [design,await r.blob()];}));
     if(id!==taskId||version!==waitVersion)return;clearPreviews();
     for(const [design,blob] of blobs)designPreviews[design]=URL.createObjectURL(blob);
     review(designs);return;
   }
   const stage=document.getElementById('generation-stage');
   const bar=document.getElementById('generation-progress');
   if(d.status==='failed'){
     progressPhase='failed';stage.textContent='生成未完成，請工作人員協助重試';bar.classList.add('is-failed');bar.setAttribute('aria-label','生成未完成');
     msg('請告知工作人員您的活動代碼 '+guestCode+'，後台可重試。',true);
   }else{
     progressPhase=d.status==='queued'||d.status==='pending'?'queued':'generating';bar.classList.remove('is-failed');bar.setAttribute('aria-label','預估生成進度');
     stage.textContent=d.status==='queued'||d.status==='pending'?'照片已送出 → 排隊等待中':'照片已送出 → AI 正在生成 A、B 兩款線稿';
     msg('');
   }
 }catch(e){
   if(id!==taskId||version!==waitVersion)return;
   progressPhase='offline';msg('連線較慢，正在重新連線，請勿重新拍照。');
 }
 if(id===taskId&&version===waitVersion)poll=setTimeout(()=>pollTask(id,version),3000);
}
function review(designs){
 heading(designs.length>1?'選擇您喜歡的線稿':'確認您的專屬線稿');
 const hint=document.createElement('p');hint.textContent=designs.length>1?'請點選 A 款或 B 款，再按「確認圖片」。':'請確認圖片後送出。';screen.append(hint);
 const grid=document.createElement('div');grid.className='design-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','選擇線稿款式');
 const cards=[];
 const confirmButton=button('確認圖片',async()=>{
  if(busy||!selectedDesign)return;busy=true;const version=waitVersion,design=selectedDesign;const buttons=[...screen.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);msg('正在確認送單…');
  try{const d=await api('/api/finalize',{taskId,design});if(version===waitVersion){previewURL=designPreviews[design];completed(d.downloadToken);}}
  catch(e){if(version===waitVersion){msg('尚未確認送單，請再按「確認圖片」重試。'+e.message,true);buttons.forEach(b=>b.disabled=false);}}
  finally{busy=false;}
 },true);
 for(const design of designs){
  const card=button('',()=>{selectedDesign=design;for(const item of cards)item.setAttribute('aria-pressed',String(item.dataset.design===design));confirmButton.disabled=false;},false);
  card.className='design-choice';card.dataset.design=design;card.setAttribute('aria-pressed','false');card.setAttribute('aria-label',design+' 款');
  const img=new Image();img.src=designPreviews[design];img.alt=design+' 款人物線稿';img.width=480;img.height=480;
  const title=document.createElement('strong');title.textContent=design+' 款';card.append(img,title);cards.push(card);grid.append(card);
 }
 screen.append(grid);confirmButton.disabled=true;
 if(designs.length===1){selectedDesign=designs[0];cards[0].setAttribute('aria-pressed','true');confirmButton.disabled=false;}
 const retake=button('重新拍照',()=>{if(busy||!confirm('要重新拍照並再次生成圖片嗎？'))return;replacementTaskId=taskId;requestId=crypto.randomUUID();clearPreviews();camera();});
 const back=button('返回首頁',()=>{if(!busy&&confirm('返回首頁？稍後輸入相同代碼可接續此圖片。'))home();});
 actions(confirmButton,retake,back);screen.lastElementChild.classList.add('review-actions');
}
function completed(token){
 clearInterval(returnTimer);heading('已完成');const title=screen.querySelector('h2');const note=document.createElement('span');note.className='screenshot-note';note.textContent='請截圖';title.append(document.createTextNode(' '),note);
 const version=waitVersion,id=taskId;const layout=document.createElement('div');layout.className='completed-layout';
 const img=new Image();img.alt='您的專屬人像';img.className='portrait';img.width=480;img.height=480;layout.append(img);
 if(previewURL)img.src=previewURL;else fetch(API+'/api/preview/'+encodeURIComponent(id)+'?design='+encodeURIComponent(selectedDesign||'B'),{headers:{'X-Guest-Token':guestToken}}).then(async r=>{if(!r.ok)throw Error();const blob=await r.blob();if(version!==waitVersion)return;previewURL=URL.createObjectURL(blob);img.src=previewURL;}).catch(()=>{img.alt='預覽暫時無法載入，仍可使用下載連結';});
 const panel=document.createElement('div');panel.className='download-panel';
 if(token){const url=new URL(API+'/download.html');url.hash=new URLSearchParams({token}).toString();const canvas=document.createElement('canvas');canvas.className='download-qr';canvas.setAttribute('aria-label','掃描下載圖片 QR Code');panel.append(canvas);if(window.QRious)new QRious({element:canvas,value:url.href,size:360,level:'M',padding:16});const caption=document.createElement('p');caption.textContent='掃描下載您的圖片';const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='button';link.textContent='開啟圖片下載頁';panel.append(caption,link);}else{const p=document.createElement('p');p.textContent='下載連結已過期，請洽工作人員。';panel.append(p);}
 layout.append(panel);screen.append(layout);actions(button('返回首頁',home));let left=cfg.returnSeconds||20;const label=document.createElement('p');screen.append(label);label.textContent=left+' 秒後返回首頁';returnTimer=setInterval(()=>{left--;label.textContent=left+' 秒後返回首頁';if(left<=0)home();},1000);
}

if(API.includes('YOUR-LASER')){heading('尚未完成系統設定');msg('請先在 config.js 填入獨立雷雕後端網址。',true);}else{heading('正在連接雷雕系統');api('/api/config').then(d=>{if(d.product!=='laser-single-b')throw Error('此網址不是獨立雷雕後端，已停止送單。');if(d.flowVersion!==3)throw Error('系統更新中，請稍候重新整理');frontMode=d.frontMode==='both'?'both':'camera';if(taskId&&guestToken)waiting();else home();}).catch(e=>msg(e.message,true));}

function chooseEntry(){if(frontMode!=='both')return camera();stopCamera();heading('選擇照片來源');photoGuidance();actions(button('現場拍照',camera,true),button('上傳照片',uploadPhoto,true),button('返回首頁',home));}
function previewPhoto(){heading('使用這張照片製作線稿？');const img=new Image();img.src=photo;img.className='portrait';screen.append(img);actions(button('開始生成',submit,true),button(entryMode==='upload'?'更換照片':'重新拍照',entryMode==='upload'?uploadPhoto:camera),frontMode==='both'?button('重新選擇來源',chooseEntry):button('返回首頁',home));}
function uploadPhoto(){if(frontMode!=='both')return camera();if(kioskMode)return uploadByQR();return localUpload();}
function localUpload(){
 stopCamera();entryMode='upload';heading('選擇一張清楚的單人照片');photoGuidance();const version=waitVersion;
 const hint=document.createElement('p');hint.textContent='支援 JPG、PNG、WebP，最大 20 MB。';screen.append(hint);
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','選擇照片');
 input.onchange=async()=>{const file=input.files[0];if(!file)return;input.disabled=true;msg('正在讀取照片…');try{const result=await prepareLaserPhoto(file);if(version!==waitVersion)return;photo=result;requestId=crypto.randomUUID();previewPhoto();}catch(e){if(version===waitVersion)msg(e.message,true);}finally{input.disabled=false;}};
 screen.append(input);actions(button('返回',chooseEntry));
}
async function uploadByQR(){
 stopCamera();entryMode='upload';heading('掃碼上傳手機照片');photoGuidance();const version=waitVersion,token=guestToken;
 const content=document.createElement('div');content.className='mobile-upload';const status=document.createElement('p');status.textContent='正在準備上傳 QR Code…';content.append(status);screen.append(content);actions(button('返回',chooseEntry),button('返回首頁',home));
 try{
  const d=await api('/api/mobile-upload-sessions',{});
  if(version!==waitVersion){cancelMobileSession(d.sessionId,token);return;}
  mobileSession={id:d.sessionId,token};const url=new URL('upload.html',location.href);url.search='';url.hash=new URLSearchParams({session:d.sessionId,token:d.uploadToken}).toString();
  const canvas=document.createElement('canvas');canvas.className='download-qr';canvas.setAttribute('aria-label','手機上傳照片 QR Code');content.prepend(canvas);new QRious({element:canvas,value:url.href,size:360,level:'M',padding:16});status.textContent='請用手機掃描，選擇照片並送出，再回到大螢幕確認。';
  const expiry=document.createElement('p');expiry.textContent='此 QR Code 5 分鐘內有效，每次僅接收一張照片。';content.append(expiry);
  const check=async()=>{
   if(version!==waitVersion)return;
   try{const state=await api('/api/mobile-upload-sessions/'+d.sessionId);if(version!==waitVersion)return;
    if(state.status==='uploaded'&&state.sourceImage){photo=state.sourceImage;requestId=crypto.randomUUID();previewPhoto();return;}
    if(state.status==='expired'||state.status==='cancelled'){expired();return;}
    msg('');
   }catch(e){if(version!==waitVersion)return;if(Date.now()>=d.expiresAt){expired();return;}msg('連線較慢，正在重新連線…');}
   if(version===waitVersion)mobilePoll=setTimeout(check,2000);
  };
  function expired(){canvas.remove();status.textContent='QR Code 已失效，請重新產生。';expiry.remove();content.append(button('重新產生 QR Code',uploadByQR,true));clearMobileSession();}
  check();
 }catch(e){if(version===waitVersion){status.textContent=e.message;content.append(button('重新產生 QR Code',uploadByQR,true));}}
}

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

function photoGuidance(){const p=document.createElement('p');p.textContent=frontMode==='both'?'請拍攝或上傳正面、臉部清晰的單人照片，避免多人合照，以免無法正確生成線稿。':'請拍攝正面、臉部清晰的單人照片，避免多人合照，以免無法正確生成線稿。';p.style.color='#133139';screen.append(p);}

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




