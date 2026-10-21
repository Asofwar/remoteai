import { accountsEnglish, accountsRussian } from './accounts';
import { cloudEnglish, cloudRussian } from './cloud';
import { codexGuiEnglish, codexGuiRussian } from './codexGui';
import { conversationsEnglish, conversationsRussian } from './conversations';

/** Backend messages keep their Chinese source text; clients translate them when displayed. */
export const backendEnglish: Readonly<Record<string, string>> = {
  ...codexGuiEnglish,
  ...accountsEnglish,
  ...conversationsEnglish,
  ...cloudEnglish,
};

export const backendRussian: Readonly<Record<string, string>> = {
  ...codexGuiRussian,
  ...accountsRussian,
  ...conversationsRussian,
  ...cloudRussian,
};
