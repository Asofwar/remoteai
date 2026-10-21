import { imageAiEnglish } from '../imageAi';
import { dictationEnglish } from '../dictation';
import { projectBrowserEnglish } from '../projectBrowser';
import { gitMessageEnglish } from '../gitMessage';
import { accountUsageEnglish } from '../accountUsage';
import { aggregateRoutingEnglish } from '../aggregateRouting';
import { messageEditingEnglish } from '../messageEditing';
import { fileReferencesEnglish } from '../fileReferences';
import { messages } from './messages';
import { terminalMessages } from './terminal';
import { gitMessages } from './git';
import { remoteDesktopMessages } from './remoteDesktop';
import { mobile } from './mobile';
import { reliabilityEnglish } from '../chatReliability';
import { reviewEnglish } from '../taskReview';
import { cliImportEnglish } from '../cliImport';
import { desktop } from './desktop';
import { assistanceEnglish } from '../remoteAssistance';
import { guiSettingsEnglish } from '../guiSettings';
import { cozeEnglish } from '../coze';
import { portForwardingEnglish } from '../portForwarding';
import { featureCopyEnglish } from '../featureCopy';

export const english: Readonly<Record<string, string>> = {
  ...dictationEnglish,
  ...projectBrowserEnglish,
  ...gitMessageEnglish,
  ...accountUsageEnglish,
  ...aggregateRoutingEnglish,
  ...messageEditingEnglish,
  ...messages, ...terminalMessages, ...gitMessages, ...remoteDesktopMessages, ...mobile,
  ...reliabilityEnglish,
  ...reviewEnglish,
  ...cliImportEnglish,
  ...desktop,
  ...assistanceEnglish,
  ...guiSettingsEnglish,
  ...cozeEnglish,
  ...imageAiEnglish,
  ...fileReferencesEnglish,
  ...portForwardingEnglish,
  ...featureCopyEnglish,
};
