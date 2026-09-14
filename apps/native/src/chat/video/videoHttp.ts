export interface VideoRange { start: number; end: number; partial: boolean }
export function videoRange(header: string | undefined, size: number): VideoRange | undefined {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1, partial: true } : undefined;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return undefined;
  return { start, end: Math.min(end, size - 1), partial: true };
}

export function videoRequest(header: string, token: string) {
  const [line, ...lines] = header.split('\r\n');
  const match = /^(GET|HEAD) ([^ ]+) HTTP\/1\.[01]$/.exec(line);
  if (!match || match[2] !== '/' + token) return undefined;
  const ranges = lines.filter((entry) => /^range:/i.test(entry));
  if (ranges.length > 1) return undefined;
  return { head: match[1] === 'HEAD', range: ranges[0]?.slice('range:'.length).trim() };
}

export function videoHeaders(info: { size: number; mimeType: string }, range: VideoRange) {
  const headers = [
    range.partial ? 'HTTP/1.1 206 Partial Content' : 'HTTP/1.1 200 OK',
    'Content-Type: ' + info.mimeType,
    'Content-Length: ' + (range.end - range.start + 1),
    'Accept-Ranges: bytes', 'Cache-Control: no-store', 'Connection: close',
    'X-Content-Type-Options: nosniff',
  ];
  if (range.partial) headers.push('Content-Range: bytes ' + range.start + '-' + range.end + '/' + info.size);
  return headers.join('\r\n') + '\r\n\r\n';
}
