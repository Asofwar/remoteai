export const PREVIEW_ERRORS = {
  'load-error': '网页未能加载，请刷新重试。',
  'resource-error': '部分网页资源无法加载，请检查服务后刷新。',
  'resource-limit': '网页内容较多，暂时无法在此预览。',
  'address-error': '网页需要访问其他地址，暂时无法在此预览。',
  'script-error': '网页运行出错，请检查网页后刷新。',
} as const;

export type PreviewFailure = keyof typeof PREVIEW_ERRORS;
export type PreviewStatus = 'loading' | 'ready' | 'resource-warning' | PreviewFailure;

const PREVIEW_DIAGNOSTICS = new Set([
  'storage-access', 'cookie-access', 'history-access', 'dynamic-code', 'module-import', 'invalid-url', 'script-exception',
]);

/** Reject arbitrary strings supplied by a remote page before logging its diagnostic category. */
export function previewDiagnostic(value: unknown) {
  if (typeof value !== 'string') return 'script-exception';
  return PREVIEW_DIAGNOSTICS.has(value)
    || /^http-[45]\d\d-(document|stylesheet|script|font|image|resource)$/.test(value) ? value : 'script-exception';
}

/** Describe failed requests without disclosing remote paths, query strings or response bodies. */
export function resourceDiagnostic(url: string, status: number, accept: string) {
  const extension = new URL(url).pathname.split('.').at(-1)?.toLowerCase();
  let kind = 'resource';
  if (accept === 'text/html') kind = 'document';
  else if (accept === 'text/css' || extension === 'css') kind = 'stylesheet';
  else if (extension && /^(js|mjs|cjs|ts|tsx|jsx)$/.test(extension)) kind = 'script';
  else if (extension && /^(woff2?|ttf|otf|eot)$/.test(extension)) kind = 'font';
  else if (extension && /^(png|jpe?g|gif|svg|webp|avif|ico)$/.test(extension)) kind = 'image';
  return previewDiagnostic(`http-${status}-${kind}`);
}

export function isPreviewFailure(value: unknown): value is PreviewFailure {
  return typeof value === 'string' && Object.hasOwn(PREVIEW_ERRORS, value);
}

/** Only bounded error categories cross the preview boundary; never forward remote URLs or error details. */
export class PreviewError extends Error {
  constructor(readonly failure: PreviewFailure, readonly diagnostic?: string) { super(PREVIEW_ERRORS[failure]); }
}

export function previewFailure(error: unknown): PreviewFailure {
  return error instanceof PreviewError ? error.failure : 'load-error';
}
