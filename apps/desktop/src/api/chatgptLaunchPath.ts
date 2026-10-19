import { invoke } from './backend';

export interface ChatGptLaunchPathSettings {
  manualPath: string | null;
  detectedPath: string | null;
}

export const getChatGptLaunchPath = () => invoke<ChatGptLaunchPathSettings>('get_chatgpt_launch_path');
export const setChatGptLaunchPath = (path: string) => invoke<string | null>('set_chatgpt_launch_path', { path });
