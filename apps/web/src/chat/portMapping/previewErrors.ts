export const PREVIEW_ERRORS = {
  'load-error': '网页未能加载，请刷新重试。',
  'resource-error': '部分网页资源无法加载，请检查服务后刷新。',
  'resource-limit': '网页内容较多，暂时无法在此预览。',
  'address-error': '网页需要访问其他地址，暂时无法在此预览。',
  'script-error': '网页运行出错，请检查网页后刷新。',
} as const;

export type PreviewFailure = keyof typeof PREVIEW_ERRORS;
export type PreviewStatus = 'loading' | 'ready' | PreviewFailure;

export function isPreviewFailure(value: unknown): value is PreviewFailure {
  return typeof value === 'string' && Object.hasOwn(PREVIEW_ERRORS, value);
}

/** Only bounded error categories cross the preview boundary; never forward remote URLs or error details. */
export class PreviewError extends Error {
  constructor(readonly failure: PreviewFailure) { super(PREVIEW_ERRORS[failure]); }
}

export function previewFailure(error: unknown): PreviewFailure {
  return error instanceof PreviewError ? error.failure : 'load-error';
}
