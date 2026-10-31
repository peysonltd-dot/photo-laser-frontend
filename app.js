const cfg=window.LASER_CONFIG, API=cfg.apiBase.replace(/\/$/,'');
const screen=document.getElementById('screen'),message=document.getElementById('message');
document.getElementById('title').textContent=cfg.title;
let entryMode="camera";
let stream=null,photo=null,taskId=localStorage.getItem('laser-active-task'),poll=null,returnTimer=null,busy=false,requestId=crypto.randomUUID();
function msg(text,error=false){message.textContent=text;message.className=error?'error':'';}
let captureTimer=null,captureOverlay=null;
function stopCamera(){clearTimeout(captureTimer);captureTimer=null;captureOverlay?.remove();captureOverlay=null;stream?.getTracks().forEach(t=>t.stop());stream=null;}
async function api(path,body){const r=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'連線失敗');return d;}
function button(text,fn,primary=false){const b=document.createElement('button');b.textContent=text;b.className=primary?'primary':'';b.onclick=fn;return b;}
function actions(...buttons){const e=document.createElement('div');e.className='actions';e.append(...buttons);screen.append(e);}
let waitClock=null,waitVersion=0;
function heading(text){clearInterval(waitClock);waitClock=null;waitVersion++;screen.replaceChildren();const h=document.createElement('h2');h.textContent=text;screen.append(h);msg('');}
function home(){clearTimeout(poll);clearInterval(returnTimer);stopCamera();taskId=null;photo=null;busy=false;localStorage.removeItem('laser-active-task');requestId=crypto.randomUUID();heading('一張照片，一份專屬線稿');screen.insertAdjacentHTML('beforeend','<div class="examples"><figure><img src="https://img.shoplineapp.com/media/image_clips/6a1ef28ef1bda7070f35eecc/original.png?1780413070=&owner_id=66221c5c384dbb002ec45c18" alt="AI角色示意"><figcaption>AI 專屬角色</figcaption></figure><span>→</span><figure><img src="https://img.shoplineapp.com/media/image_clips/6a1ef3c33ce472c30e346dac/original.png?1780413379=&owner_id=66221c5c384dbb002ec45c18" alt="禮品示意"><figcaption>專屬客製禮品</figcaption></figure></div><p>本攤位生成黑白雷雕線稿，圖片為示意。</p>');actions(button('開始體驗',chooseEntry,true));}
async function camera(){entryMode='camera';heading('看向鏡頭，準備好就拍照');const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;screen.append(video);try{stopCamera();stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:1280},facingMode:'user'},audio:false});video.srcObject=stream;await video.play();actions(button('拍照',(event)=>startCaptureCountdown(video,event.currentTarget),true),button('返回首頁',home));}catch(e){msg('無法開啟相機。請確認網址為 HTTPS，並允許相機權限。',true);actions(button('重新開啟',camera),button('返回首頁',home));}}
function capture(video){if(!video.videoWidth)return;const c=document.createElement('canvas');c.width=c.height=1024;const n=Math.min(video.videoWidth,video.videoHeight);const ctx=c.getContext('2d');ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(video,(video.videoWidth-n)/2,(video.videoHeight-n)/2,n,n,0,0,1024,1024);photo=c.toDataURL('image/jpeg',.82);for(let q=.72;photo.length>500000&&q>=.32;q-=.1)photo=c.toDataURL('image/jpeg',q);if(photo.length>500000){msg('照片細節過多，請改用簡單背景再拍照。',true);return;}stopCamera();previewPhoto();}

async function submit(){if(busy)return;busy=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);msg('照片傳送中，請稍候…');try{const d=await api('/api/upload',{image:photo,requestId,entryMode});taskId=d.taskId;localStorage.setItem('laser-active-task',taskId);photo=null;waiting();}catch(e){msg('送出未確認，請確認網路後按「開始生成」重試。'+e.message,true);screen.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}}
function waiting(){
 heading('專屬線稿製作中');
 screen.insertAdjacentHTML('beforeend','<div class="bear" aria-label="黑熊陪你等待"></div><p>圖像就快好囉，黑熊一起等。</p>');
 const n=document.createElement('div');n.className='number';n.textContent='#'+taskId;screen.append(n);
 const stage=document.createElement('p');stage.id='generation-stage';stage.textContent='照片已送出，正在查詢進度';
 const bar=document.createElement('progress');bar.id='generation-progress';bar.max=1;bar.setAttribute('aria-label','線稿處理中');bar.style.cssText='display:block;width:100%;height:20px;accent-color:#133139';
 const elapsed=document.createElement('p');const began=Date.now();
 const updateTime=()=>elapsed.textContent='本次畫面已等待 '+Math.floor((Date.now()-began)/1000)+' 秒';
 updateTime();waitClock=setInterval(updateTime,1000);
 screen.append(stage,bar,elapsed);
 actions(button('返回首頁',()=>{
   if(confirm('訂單 #'+taskId+' 尚未確認製作。返回首頁後，生圖仍會繼續，請先記下號碼並告知工作人員。確定返回？'))home();
 }));
 pollTask(taskId,waitVersion);
}
async function pollTask(id=taskId,version=waitVersion){
 if(id!==taskId||version!==waitVersion)return;
 try{
   const d=await api('/api/status/'+encodeURIComponent(id));
   if(id!==taskId||version!==waitVersion)return;
   if(d.status==='completed'&&d.resultImageB){
     if(d.chosenDesign==='B')return completed(d.resultImageB);
     return review(d.resultImageB);
   }
   const stage=document.getElementById('generation-stage');
   const bar=document.getElementById('generation-progress');
   if(d.status==='failed'){
     stage.textContent='生成未完成，請工作人員協助重試';bar.value=0;
     msg('請告知工作人員訂單號碼 #'+id+'，後台可重試。',true);
   }else{
     bar.removeAttribute('value');
     stage.textContent=d.status==='queued'||d.status==='pending'?'照片已送出 → 排隊等待中':'照片已送出 → AI 正在生成線稿';
     msg('');
   }
 }catch(e){
   if(id!==taskId||version!==waitVersion)return;
   msg('連線較慢，正在重新連線，請勿重新拍照。');
 }
 if(id===taskId&&version===waitVersion)poll=setTimeout(()=>pollTask(id,version),3000);
}
function review(src){heading('你的專屬線稿完成了');const img=new Image();img.src=src;img.className='portrait';screen.append(img);const n=document.createElement('p');n.textContent='號碼 #'+taskId+'｜確認後交由工作人員製作';screen.append(n);actions(button('確認製作',async()=>{if(busy)return;busy=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);msg('正在確認送單…');try{await api('/api/choice/'+encodeURIComponent(taskId),{choice:'B'});completed(src);}catch(e){msg(e.message+'；可再按確認，不會重複建立訂單。',true);screen.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}},true));}
function completed(src){heading('已送出製作');const img=new Image();img.className='portrait';img.style.maxWidth='300px';img.src=src;screen.append(img);const n=document.createElement('div');n.className='number';n.textContent='#'+taskId;screen.append(n);const p=document.createElement('p');p.textContent='請記下此號碼，向工作人員確認製作及領取。';screen.append(p);const url=API+'/download.html?taskId='+encodeURIComponent(taskId);const qr=document.createElement('canvas');qr.id='qr';screen.append(qr);if(window.QRious)new QRious({element:qr,value:url,size:300,level:'M'});else{const a=document.createElement('a');a.href=url;a.textContent='開啟線稿下載頁';screen.append(a);}let left=cfg.returnSeconds||20;const label=document.createElement('p');screen.append(label);actions(button('返回首頁',home));returnTimer=setInterval(()=>{label.textContent=left+' 秒後返回首頁';if(left--<=0)home();},1000);}
if(API.includes('YOUR-LASER')){heading('尚未完成系統設定');msg('請先在 config.js 填入獨立雷雕後端網址。',true);}else{heading('正在連接雷雕系統');api('/api/config').then(d=>{if(d.product!=='laser-single-b')throw Error('此網址不是獨立雷雕後端，已停止送單。');if(taskId)waiting();else home();}).catch(e=>msg(e.message,true));}

function chooseEntry(){stopCamera();heading('選擇照片來源');actions(button('現場拍照',camera,true),button('上傳照片',uploadPhoto,true),button('返回首頁',home));}
function previewPhoto(){heading('使用這張照片製作線稿？');const img=new Image();img.src=photo;img.className='portrait';screen.append(img);actions(button('開始生成',submit,true),button(entryMode==='upload'?'更換照片':'重新拍照',entryMode==='upload'?uploadPhoto:camera),button('重新選擇來源',chooseEntry));}
function uploadPhoto(){stopCamera();entryMode='upload';heading('選擇一張清楚的單人照片');const hint=document.createElement('p');hint.textContent='請使用正面、臉部清晰的照片。支援 JPG、PNG、WebP，最大 20 MB。';screen.append(hint);const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>20*1024*1024){msg('照片超過 20 MB，請選擇較小的照片。',true);return;}const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);const ratio=Math.min(1024/img.width,1024/img.height);const w=img.width*ratio,h=img.height*ratio;ctx.drawImage(img,(1024-w)/2,(1024-h)/2,w,h);photo=c.toDataURL('image/jpeg',.82);for(let q=.72;photo.length>500000&&q>=.32;q-=.1)photo=c.toDataURL('image/jpeg',q);if(photo.length>500000)throw Error('照片過於複雜，請更換照片');requestId=crypto.randomUUID();previewPhoto();}catch(e){msg('無法讀取照片，請改用 JPG 或 PNG。'+e.message,true);}finally{URL.revokeObjectURL(url);}};screen.append(input);actions(button('返回',chooseEntry));}

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
