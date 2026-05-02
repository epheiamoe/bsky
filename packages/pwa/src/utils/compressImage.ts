const MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.82;

export interface CompressResult {
  file: File;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
  originalName: string;
}

/**
 * Auto-compress an image file if it exceeds maxSize (default 2MB, Bluesky limit).
 * Resizes to maxDimension and re-encodes as JPEG at the given quality.
 * GIFs are NOT compressed (to preserve animation).
 * Returns the original file if no compression needed or possible.
 */
export async function compressImage(
  file: File,
  maxSize = 2 * 1024 * 1024,
  maxDimension = MAX_DIMENSION,
): Promise<CompressResult> {
  if (file.size <= maxSize) {
    return { file, wasCompressed: false, originalSize: file.size, compressedSize: file.size, originalName: file.name };
  }

  // Don't compress GIFs — they lose animation
  if (file.type.includes('gif')) {
    return { file, wasCompressed: false, originalSize: file.size, compressedSize: file.size, originalName: file.name };
  }

  try {
    const img = await createImageBitmap(file);
    let { width, height } = img;

    // Resize if larger than max dimension
    if (width > maxDimension || height > maxDimension) {
      const ratio = maxDimension / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    img.close();

    // Try JPEG first (smallest), then WebP if still too large
    for (const [format, quality] of [
      ['image/jpeg', DEFAULT_QUALITY],
      ['image/jpeg', 0.65],
      ['image/webp', 0.75],
    ] as Array<[string, number]>) {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), format, quality),
      );
      if (blob && blob.size <= maxSize) {
        const ext = format === 'image/webp' ? '.webp' : '.jpg';
        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ext), {
          type: format,
          lastModified: Date.now(),
        });
        return {
          file: compressedFile,
          wasCompressed: true,
          originalSize: file.size,
          compressedSize: compressedFile.size,
          originalName: file.name,
        };
      }
    }

    // Last resort: accept whatever we get at low quality JPEG
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.4),
    );
    if (blob) {
      const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      return {
        file: compressedFile,
        wasCompressed: true,
        originalSize: file.size,
        compressedSize: compressedFile.size,
        originalName: file.name,
      };
    }
  } catch {
    // Compression failed — use original file
  }

  return { file, wasCompressed: false, originalSize: file.size, compressedSize: file.size, originalName: file.name };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
