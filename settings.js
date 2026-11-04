const API=LASER_CONFIG.apiBase.replace(/\/$/,''),$=id=>document.getElementById(id);let key=sessionStorage.getItem('laser-admin-key')||'',expectedStock=null,resetState=null;
async function api(path,body){const r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok||!d.success){if(d.pending){resetState=d.pending;paintResetState();}throw Error(d.error||'操作失敗');}return d;}
function notice(text){$('status').textContent=text;}
function action(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){notice(e.message);}finally{b.disabled=false;}};return b;}
async function load(){const [d,reset]=await Promise.all([api('/api/admin/settings'),api('/api/admin/reset-status')]);resetState=reset.pending;paintResetState();$('allow-camera').checked=d.frontMode!=='upload';$('allow-upload').checked=['both','upload'].includes(d.frontMode);$('login').hidden=true;$('settings').hidden=false;$('codes').replaceChildren();for(const c of d.codes.sort((a,b)=>a.code.localeCompare(b.code))){const row=document.createElement('div');row.className='settings-row';const label=document.createElement('span');label.textContent=c.code+'｜'+(c.used?'已兌換':c.taskId?'已開始，訂單 #'+c.taskId:'未使用');row.append(label);if(!c.taskId&&!c.used)row.append(action('編輯',()=>{$('code-id').value=c.id;$('code').value=c.code;$('code').focus();}));row.append(action('刪除',async()=>{if(!confirm('停用代碼 '+c.code+'？歷史訂單仍保留。'))return;await api('/api/admin/codes/'+c.id+'/delete',{});await load();}));$('codes').append(row);}$('colors').replaceChildren();for(const c of d.colors){const row=document.createElement('div');row.className='settings-row';const sw=document.createElement('span');sw.className='swatch';sw.style.background=c.swatch;const label=document.createElement('span');label.textContent=c.name+'｜剩餘 '+c.stock+'｜'+(c.active?'上架':'下架');row.append(sw,label,action('編輯',()=>{$('color-id').value=c.id;$('color-name').value=c.name;$('swatch').value=c.swatch;$('stock').value=c.stock;$('active').checked=c.active;expectedStock=c.stock;$('color-name').focus();}));$('colors').append(row);}}
$('login').onsubmit=async e=>{e.preventDefault();key=$('key').value;try{await load();sessionStorage.setItem('laser-admin-key',key);$('key').value='';}catch(e){alert(e.message);}};
$('logout').onclick=()=>{sessionStorage.removeItem('laser-admin-key');location.reload();};$('refresh').onclick=()=>load().then(()=>notice('已更新')).catch(e=>notice(e.message));
$('code-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/api/admin/codes',{id:$('code-id').value||undefined,code:$('code').value});$('code-form').reset();$('code-id').value='';await load();notice('代碼已儲存');}catch(e){notice(e.message);}finally{b.disabled=false;}};$('code-reset').onclick=()=>{$('code-form').reset();$('code-id').value='';};
$('color-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/api/admin/colors',{id:$('color-id').value||undefined,name:$('color-name').value,swatch:$('swatch').value,stock:Number($('stock').value),active:$('active').checked,expectedStock});$('color-form').reset();$('color-id').value='';expectedStock=null;await load();notice('杯色與庫存已儲存');}catch(e){notice(e.message);}finally{b.disabled=false;}};$('color-reset').onclick=()=>{$('color-form').reset();$('color-id').value='';expectedStock=null;};
$('width').value=localStorage.getItem('laser-download-width')||60;$('save-width').onclick=()=>{const n=Number($('width').value);if(n<20||n>200||!Number.isFinite(n))return notice('請輸入 20–200 mm');localStorage.setItem('laser-download-width',n);notice('下載寬度已儲存');};if(key)load().catch(e=>{notice(e.message);$('login').hidden=false;});

$('bulk-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=await api('/api/admin/codes/bulk',{codes:$('bulk-codes').value});$('bulk-result').textContent='已新增 '+d.added+' 筆；略過 '+d.skipped.length+' 筆'+(d.skipped.length?'：'+d.skipped.join('、'):'');$('bulk-codes').value='';await load();}catch(e){$('bulk-result').textContent=e.message;}finally{b.disabled=false;}};


$('entry-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const camera=$('allow-camera').checked,upload=$('allow-upload').checked;if(!camera&&!upload)throw Error('請至少勾選「拍照」或「上傳照片」其中一項');await api('/api/admin/front-mode',{frontMode:camera&&upload?'both':upload?'upload':'camera'});notice('前台入口已儲存，從首頁開始的新體驗即會套用');}catch(e){notice(e.message);}finally{b.disabled=false;}};

function paintResetState(){
 for(const kind of ['codes','orders']){
  const button=$('reset-'+kind),pending=resetState?.kind===kind;
  button.textContent=pending?(kind==='codes'?'繼續清空白名單':'繼續重置訂單與序號'):(kind==='codes'?'一鍵清空白名單':'一鍵重置訂單與序號');
  button.disabled=!!resetState&&!pending;
  if(pending)$(kind+'-reset-status').textContent='上次操作尚未完成，前台已暫停。請按上方按鈕繼續完成重置。';
 }
}
async function resetData(kind){
 const phrase=kind==='codes'?'清空白名單':'重置訂單';
 const warning=kind==='codes'?'將永久刪除所有白名單代碼；歷史訂單、圖片與庫存保留。':'將永久刪除全部訂單與圖片，舊下載連結失效，下一筆從 #001 開始。白名單恢復可用，杯色庫存維持目前數量。';
 if(prompt(warning+'\n此操作無法復原。請輸入「'+phrase+'」確認：')!==phrase)return;
 const button=$('reset-'+kind),status=$(kind+'-reset-status'),storageKey='laser-reset-'+kind;
 const requestId=resetState?.kind===kind?resetState.requestId:(sessionStorage.getItem(storageKey)||crypto.randomUUID());
 sessionStorage.setItem(storageKey,requestId);button.disabled=true;status.textContent='正在處理，請勿關閉頁面…';
 try{
  const d=await api(kind==='codes'?'/api/admin/codes/reset':'/api/admin/reset-all',{confirmation:phrase,requestId});
  sessionStorage.removeItem(storageKey);resetState=null;
  $('code-form').reset();$('code-id').value='';$('bulk-result').textContent='';
  await load();status.textContent=kind==='codes'?'白名單已清空，共刪除 '+d.deletedCodes+' 筆代碼。':'訂單已重置，共刪除 '+d.deletedOrders+' 筆；下一筆從 #001 開始。';
  notice('重置完成');
 }catch(error){status.textContent='尚未確認完成：'+error.message;}
 finally{paintResetState();}
}
$('reset-codes').onclick=()=>resetData('codes');
$('reset-orders').onclick=()=>resetData('orders');
