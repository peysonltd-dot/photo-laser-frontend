window.prepareLaserPhoto = async function(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw Error('照片超過 20 MB，請選擇較小的照片。');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('請選擇 JPG、PNG 或 WebP 照片。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 1024);
    const ratio = Math.min(1024 / img.width, 1024 / img.height);
    const w = img.width * ratio, h = img.height * ratio;
    ctx.drawImage(img, (1024 - w) / 2, (1024 - h) / 2, w, h);
    let data = canvas.toDataURL('image/jpeg', .82);
    for (let quality = .72; data.length > 500000 && quality >= .32; quality -= .1) data = canvas.toDataURL('image/jpeg', quality);
    if (data.length > 500000) throw Error('照片細節過多，請改用簡單背景的照片。');
    return data;
  } catch (error) { throw Error(error.message || '無法讀取照片，請改用 JPG 或 PNG。'); }
  finally { URL.revokeObjectURL(url); }
};
