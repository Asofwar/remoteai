window.__previewDiagnostic = error => {
  // Only fixed categories leave the sandbox. Remote error text may contain credentials or private URLs.
  const message = typeof error?.message === 'string' ? error.message.slice(0, 1024).toLowerCase() : '';
  if (/localstorage|sessionstorage/.test(message)) return 'storage-access';
  if (/cookie/.test(message)) return 'cookie-access';
  if (/replacestate|pushstate|history state/.test(message)) return 'history-access';
  if (/unsafe-eval|evalerror|evaluate a string|code generation/.test(message)) return 'dynamic-code';
  if (/module specifier|module script|dynamically imported module/.test(message)) return 'module-import';
  if (/invalid url|construct 'url'/.test(message)) return 'invalid-url';
  return 'script-exception';
};
