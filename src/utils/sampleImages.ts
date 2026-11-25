import { CapturedImage, ScanStage } from '../types/medilens';

export class ImageCaptureError extends Error {
  stage: ScanStage;
  constructor(stage: ScanStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

const SUPPORTED_EXPORT_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extractImagePayload(dataUrl: string): { mimeType: string; base64: string; byteSize: number } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new ImageCaptureError(
      'image_transmission',
      'Encoded image did not produce a valid image MIME type and Base64 payload.'
    );
  }
  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteSize = Math.floor((base64.length * 3) / 4) - padding;

  if (byteSize < 128) {
    throw new ImageCaptureError(
      'image_transmission',
      'Captured image payload is empty or too small to analyze.'
    );
  }
  return { mimeType, base64, byteSize };
}

export function createSampleLabelImage(variant: 'clear' | 'blurry'): CapturedImage {
  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageCaptureError('camera_capture', 'Canvas 2D context is unavailable.');
  }

  if (variant === 'clear') {
    ctx.fillStyle = '#f3faf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, canvas.width, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Rx  AZITHROMYCIN TABLETS IP 500 mg', 36, 48);

    ctx.fillStyle = '#0f1f19';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Azithromycin 500 mg', 36, 154);

    ctx.fillStyle = '#334155';
    ctx.font = '22px sans-serif';
    ctx.fillText('Each film-coated tablet contains:', 36, 214);
    ctx.fillText('Azithromycin Dihydrate IP equivalent to', 36, 248);
    ctx.fillText('Azithromycin Anhydrous ............ 500 mg', 36, 282);

    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('EXP: 08/2028   |   BATCH: ML2026A', 36, 368);

    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText('Keep out of reach of children. Store below 30°C.', 36, 424);
  } else {
    ctx.fillStyle = '#cfd8d4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(115, 130, 124, 0.45)';
    ctx.font = 'italic 24px sans-serif';
    ctx.fillText('•••••• ••••• ••••', 64, 180);
    ctx.fillText('~~~~~~~~ ~~~~~ ~~~~', 64, 232);
    ctx.fillText('Unreadable Smudged Foil', 64, 280);

    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')?.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#cfd8d4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'blur(10px)';
    ctx.drawImage(copy, 0, 0);
    ctx.filter = 'none';

    // Additional low-contrast glare overlay so text remains illegible even without CSS filter support
    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
  const { mimeType, base64, byteSize } = extractImagePayload(previewUrl);

  return {
    mimeType,
    base64,
    previewUrl,
    label: variant === 'clear' ? 'Sample: Azithromycin 500mg' : 'Sample: Blurry Label (Safety Check)',
    source: 'sample',
    width: canvas.width,
    height: canvas.height,
    byteSize,
  };
}

export function resizeImageFile(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(
        new ImageCaptureError(
          'image_transmission',
          `Unsupported file type (${file.type || 'unknown'}). Please choose a JPEG, PNG, or WebP photo.`
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () =>
      reject(new ImageCaptureError('image_transmission', 'Could not read the selected image file.'));

    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () =>
        reject(new ImageCaptureError('image_transmission', 'The selected file is not a valid image.'));

      img.onload = () => {
        const maxDimension = 1400;
        const scale =
          Math.max(img.width, img.height) > maxDimension
            ? maxDimension / Math.max(img.width, img.height)
            : 1;
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new ImageCaptureError('image_transmission', 'Canvas 2D context is unavailable.'));
          return;
        }

        // Preserve PNG/WebP when supported, otherwise export JPEG on white background so transparent text stays legible
        const exportMime = SUPPORTED_EXPORT_MIMES.has(file.type.toLowerCase())
          ? file.type.toLowerCase()
          : 'image/jpeg';

        if (exportMime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const previewUrl =
          exportMime === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL(exportMime, 0.9);

        try {
          const { mimeType, base64, byteSize } = extractImagePayload(previewUrl);
          resolve({
            mimeType,
            base64,
            previewUrl,
            label: file.name,
            source: 'upload',
            width,
            height,
            byteSize,
          });
        } catch (err) {
          reject(err);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function captureVideoFrame(video: HTMLVideoElement): CapturedImage {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    throw new ImageCaptureError(
      'camera_capture',
      'Camera stream has not produced a video frame yet. Wait a moment or upload a photo.'
    );
  }

  const maxWidth = 1400;
  const width = Math.min(video.videoWidth, maxWidth);
  const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageCaptureError('camera_capture', 'Canvas 2D context is unavailable.');
  }

  ctx.drawImage(video, 0, 0, width, height);
  const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
  const { mimeType, base64, byteSize } = extractImagePayload(previewUrl);

  return {
    mimeType,
    base64,
    previewUrl,
    label: 'Live camera frame',
    source: 'camera',
    width,
    height,
    byteSize,
  };
}
