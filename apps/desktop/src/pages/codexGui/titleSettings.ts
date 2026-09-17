import { DEFAULT_CLOUD_BASE_URL, loadCloudAuthState } from '../../api/backend';
import { DEFAULT_TITLE_SETTINGS, parseTitleSettings, type TitleSettings } from '../../../../../shared/chat/titleSettings';

const SETTINGS_TIMEOUT_MS = 5_000;

/** One fetch per tab activation; generation waits for this fetch, never the conversation itself. */
export class GuiTitleSettings {
  private settings = { ...DEFAULT_TITLE_SETTINGS };
  private generation = 0;
  private pending?: Promise<void>;

  refresh = (): Promise<void> => {
    const generation = ++this.generation;
    const pending = this.load().then((settings) => {
      if (generation === this.generation) this.settings = settings;
    }).catch(() => {
      // Offline clients and older servers keep the last valid settings, or the built-in defaults.
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  };

  private async load(): Promise<TitleSettings> {
    const auth = await loadCloudAuthState();
    const base = (auth.baseUrl || DEFAULT_CLOUD_BASE_URL).replace(/\/+$/, '');
    const response = await fetch(`${base}/chat/title-settings`, {
      cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('Title settings unavailable');
    return parseTitleSettings(await response.json());
  }

  async snapshot(): Promise<TitleSettings> {
    while (this.pending) await this.pending;
    return { ...this.settings };
  }
}
