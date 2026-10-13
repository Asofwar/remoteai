const DOWNLOAD_ONLY_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'apk', 'aab', 'dmg', 'pkg', 'deb', 'rpm', 'zip', '7z', 'rar', 'gz', 'tar', 'bz2', 'xz',
  'iso', 'bin', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp3', 'wav', 'flac', 'ogg',
]);

/** Files that cannot use the portable text, image or video preview. */
export function isDownloadOnlyFile(path: string) {
  const name = path.split(/[\\/]/).at(-1) || '';
  return name.includes('.') && DOWNLOAD_ONLY_EXTENSIONS.has(name.split('.').at(-1)!.toLowerCase());
}
