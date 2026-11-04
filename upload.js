const params = new URLSearchParams(location.hash.slice(1));
const session = params.get('session'), token = params.get('token');
const form = document.getElementById('photo-form'), input = document.getElementById('photo-file');
const preview = document.getElementById('photo-preview'), status = document.getElementById('upload-status'), send = document.getElementById('send');
let photo = null, readingVersion = 0;
if (!/^[a-f0-9]{32}$/.test(session || '') || !/^[a-f0-9]{64}$/.test(token || '')) {
  form.hidden = true; status.textContent = '請先掃描大螢幕上的上傳 QR Code。';
}
input.onchange = async () => {
  const version = ++readingVersion; send.disabled = true; photo = null; preview.hidden = true;
  try {
    status.textContent = '正在讀取照片…'; const result = await prepareLaserPhoto(input.files[0]);
    if (version !== readingVersion) return;
    photo = result; preview.src = result; preview.hidden = false; send.disabled = false; status.textContent = '請確認照片，再送到大螢幕。';
  } catch (error) { if (version === readingVersion) status.textContent = error.message; }
};
form.onsubmit = async event => {
  event.preventDefault(); if (!photo || send.disabled) return;
  send.disabled = true; input.disabled = true; status.textContent = '照片上傳中…';
  try {
    const response = await fetch(LASER_CONFIG.apiBase.replace(/\/$/, '') + '/api/mobile-upload-sessions/' + session + '/photo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Token': token }, body: JSON.stringify({ image: photo })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      if (response.status === 410) { form.hidden = true; }
      throw Error(result.error || '上傳失敗，請重試');
    }
    form.hidden = true; photo = null; preview.removeAttribute('src'); status.textContent = '照片已送出，請回到大螢幕確認並開始生成。';
  } catch (error) { status.textContent = error.message; send.disabled = false; input.disabled = false; }
};
