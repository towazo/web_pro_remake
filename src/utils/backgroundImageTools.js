export const IMAGE_FILE_ACCEPT = 'image/*';
export const MAX_INPUT_FILE_BYTES = 12 * 1024 * 1024;

export const clampBackgroundPosition = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

export const convertImageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const sourceDataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!sourceDataUrl) {
      reject(new Error('画像の読み込みに失敗しました。'));
      return;
    }

    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        resolve(sourceDataUrl);
        return;
      }

      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(sourceDataUrl);
        return;
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = sourceDataUrl;
  };
  reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
  reader.readAsDataURL(file);
});
