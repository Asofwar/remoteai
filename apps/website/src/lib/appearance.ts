export type Appearance = 'dark' | 'light';

// Keep this key aligned with the small pre-paint script in index.html.
export const APPEARANCE_KEY = 'remoteai-website-theme';

export function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.theme = appearance;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', appearance === 'light' ? '#ffffff' : '#09090b');
}

export function toggleAppearance() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyAppearance(next);
  try {
    localStorage.setItem(APPEARANCE_KEY, next);
  } catch {
    // Switching still works for this page when browser storage is unavailable.
  }
}

export function syncAppearance(event: StorageEvent) {
  if (event.key !== APPEARANCE_KEY && event.key !== null) return;
  applyAppearance(event.newValue === 'light' ? 'light' : 'dark');
}
