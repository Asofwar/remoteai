const BYTES_PER_KILOBYTE = 1024;
const DOWNLOAD_SIZE_UNITS = ["KB", "MB", "GB"] as const;

export function formatUpdateDownloadBytes(bytes: number): string {
  let size = Math.max(0, bytes) / BYTES_PER_KILOBYTE;
  let unit = 0;
  while (size >= BYTES_PER_KILOBYTE && unit < DOWNLOAD_SIZE_UNITS.length - 1) {
    size /= BYTES_PER_KILOBYTE;
    unit += 1;
  }
  return `${size.toFixed(2)} ${DOWNLOAD_SIZE_UNITS[unit]}`;
}
