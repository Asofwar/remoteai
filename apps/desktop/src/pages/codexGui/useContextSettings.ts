import { invoke } from '../../api/backend';
import type { ContextSettingsApi } from '../../../../../shared/remote-chat/contextSettings';
import { useContextSettings as useSettings } from '../../../../../shared/remote-chat/client/useContextSettings';

export { parseContextCapacity } from '../../../../../shared/remote-chat/contextSettings';

const api: ContextSettingsApi = {
  read: (threadId) => invoke('codex_gui_context_settings', { threadId }),
  write: (threadId, settings) => invoke('codex_gui_set_context_settings', { threadId, settings }),
};

export function useContextSettings(threadId: string) { return useSettings(threadId, api); }
