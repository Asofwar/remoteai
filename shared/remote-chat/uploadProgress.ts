export type TransferProgress = (fraction: number) => void;

export interface UploadProgress {
  phase: 'preparing' | 'uploading' | 'confirming';
  percent: number;
}

/** Only local attachment data needs transferring; project paths and plugins do not. */
export function hasUpload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const input = value as { images?: unknown; attachments?: unknown };
  return (Array.isArray(input.images) && input.images.some((image: unknown) =>
    typeof image === 'string' && image.startsWith('data:')))
    || (Array.isArray(input.attachments) && input.attachments.some((item: unknown) =>
      !!item && typeof item === 'object' && typeof (item as { data?: unknown }).data === 'string'
      && Boolean((item as { data: string }).data.length)));
}

export function uploadProgress(fraction: number): UploadProgress {
  return { phase: fraction >= 1 ? 'confirming' : 'uploading',
    percent: Math.max(0, Math.min(100, Math.floor(fraction * 100))) };
}
