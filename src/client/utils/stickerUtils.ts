/**
 * Utilidades para procesamiento, validación y conversión inteligente de stickers para WhatsApp
 * Especificación de WhatsApp Cloud API:
 * - Stickers estáticos: WebP, exactamente 512x512 px, fondo transparente, <= 100 KB
 * - Stickers animados: WebP animado, exactamente 512x512 px, fondo transparente, <= 500 KB, loop infinito
 */

export const MAX_STATIC_STICKER_BYTES = 100 * 1024; // 100 KB
export const MAX_ANIMATED_STICKER_BYTES = 500 * 1024; // 500 KB

/**
 * Detecta si un archivo WebP es animado buscando el chunk "ANIM" o "ANMF" en su estructura binaria RIFF.
 */
export async function isAnimatedWebp(file: File | Blob): Promise<boolean> {
  try {
    // Los chunks VP8X y ANIM aparecen en los primeros 4KB
    const slice = file.slice(0, 4096);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Buscar "ANIM" (0x41, 0x4E, 0x49, 0x4D) o "ANMF" (0x41, 0x4E, 0x4D, 0x46)
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x41 && bytes[i + 1] === 0x4E) {
        if (bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4D) {
          return true; // 'ANIM'
        }
        if (bytes[i + 2] === 0x4D && bytes[i + 3] === 0x46) {
          return true; // 'ANMF'
        }
      }
    }
    return false;
  } catch (err) {
    console.warn('[StickerUtils] Error comprobando WebP animado:', err);
    return false;
  }
}

export interface ProcessedStickerResult {
  blob: Blob;
  isAnimated: boolean;
  previewUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  warning?: string;
}

/**
 * Procesa una imagen seleccionada por el usuario:
 * - Si es WebP animado: no pasa por canvas para preservar frames, valida límite de 500 KB.
 * - Si es PNG, JPG o WebP estático: dibuja en canvas 512x512 centrada (contain), fondo transparente y exporta WebP <= 100 KB.
 */
export async function processImageForSticker(file: File): Promise<ProcessedStickerResult> {
  const isAnim = await isAnimatedWebp(file);

  if (isAnim) {
    if (file.size > MAX_ANIMATED_STICKER_BYTES) {
      const kb = (file.size / 1024).toFixed(1);
      throw new Error(
        `El sticker animado pesa ${kb} KB. El límite máximo permitido por WhatsApp es 500 KB.`
      );
    }
    const previewUrl = URL.createObjectURL(file);
    return {
      blob: file,
      isAnimated: true,
      previewUrl,
      sizeBytes: file.size,
      width: 512,
      height: 512,
    };
  }

  // Imagen estática (PNG, JPG, WebP estático)
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo inicializar el contexto de imagen 2D del navegador.'));
          return;
        }

        // Limpiar para asegurar fondo transparente
        ctx.clearRect(0, 0, 512, 512);

        // Ajustar / centrar a 512x512 píxeles con relación de aspecto (contain)
        const scale = Math.min(512 / img.width, 512 / img.height);
        const drawWidth = Math.round(img.width * scale);
        const drawHeight = Math.round(img.height * scale);
        const offsetX = Math.round((512 - drawWidth) / 2);
        const offsetY = Math.round((512 - drawHeight) / 2);

        ctx.drawImage(img, 0, 0, img.width, img.height, offsetX, offsetY, drawWidth, drawHeight);

        URL.revokeObjectURL(objectUrl);

        // Función de exportación a WebP con calidad progresiva
        const exportWebp = (quality: number): Promise<Blob | null> => {
          return new Promise((res) => {
            canvas.toBlob(res, 'image/webp', quality);
          });
        };

        let quality = 0.92;
        let blob = await exportWebp(quality);

        if (!blob) {
          reject(new Error('Tu navegador no soportó la compresión a formato WebP.'));
          return;
        }

        // Si excede 100KB, comprimir bajando la calidad progresivamente
        while (blob.size > MAX_STATIC_STICKER_BYTES && quality > 0.15) {
          quality -= 0.1;
          const lowerBlob = await exportWebp(quality);
          if (lowerBlob) {
            blob = lowerBlob;
          }
        }

        let warning: string | undefined;
        if (blob.size > MAX_STATIC_STICKER_BYTES) {
          const kb = (blob.size / 1024).toFixed(1);
          warning = `La imagen optimizada pesa ${kb} KB (límite WhatsApp: 100 KB). Podría ser rechazada por Meta.`;
        }

        const previewUrl = URL.createObjectURL(blob);
        resolve({
          blob,
          isAnimated: false,
          previewUrl,
          sizeBytes: blob.size,
          width: 512,
          height: 512,
          warning,
        });
      } catch (err: any) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Error procesando imagen: ${err.message || 'Error desconocido'}`));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El archivo seleccionado no es una imagen válida o está dañado.'));
    };

    img.src = objectUrl;
  });
}

/** Formatea bytes a KB legibles */
export function formatBytesToKb(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 KB';
  return `${(bytes / 1024).toFixed(1)} KB`;
}
