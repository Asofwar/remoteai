import { runtimeErrorsEnglish, runtimeErrorsRussian } from './runtimeErrors';
import { remoteHostMessagesEnglish, remoteHostMessagesRussian } from './remoteHostMessages';
import { desktopGuiExtrasEnglish, desktopGuiExtrasRussian } from './desktopGuiExtras';
import { desktopMacPermissionsEnglish, desktopMacPermissionsRussian } from './desktopMacPermissions';
import { desktopRemoteSettingsEnglish, desktopRemoteSettingsRussian } from './desktopRemoteSettings';
import { desktopChromePluginEnglish, desktopChromePluginRussian } from './desktopChromePlugin';
import { desktopBuiltinPluginsEnglish, desktopBuiltinPluginsRussian } from './desktopBuiltinPlugins';
import { desktopComposerExtrasEnglish, desktopComposerExtrasRussian } from './desktopComposerExtras';
import { desktopGuiErrorsEnglish, desktopGuiErrorsRussian } from './desktopGuiErrors';
import { desktopDisplayErrorsEnglish, desktopDisplayErrorsRussian } from './desktopDisplayErrors';
import { desktopMiscEnglish, desktopMiscRussian } from './desktopMisc';
import { desktopQuickMenuEnglish, desktopQuickMenuRussian } from './desktopQuickMenu';
import { remoteHostDataEnglish, remoteHostDataRussian } from './remoteHostData';
import { sharedTemplatesEnglish, sharedTemplatesRussian } from './sharedTemplates';
import { webRenderEnglish, webRenderRussian } from './webRender';
import { nativeChatEnglish, nativeChatRussian } from './nativeChat';
import { nativeMiscEnglish, nativeMiscRussian } from './nativeMisc';
import { nativePlatformEnglish, nativePlatformRussian } from './nativePlatform';
import { backendEnglish, backendRussian } from './backend';
import { messages9 } from './ru/messages9';

export const featureCopyEnglish: Readonly<Record<string, string>> = {
  ...runtimeErrorsEnglish,
  ...remoteHostMessagesEnglish,
  ...desktopGuiExtrasEnglish,
  ...desktopMacPermissionsEnglish,
  ...desktopRemoteSettingsEnglish,
  ...desktopChromePluginEnglish,
  ...desktopBuiltinPluginsEnglish,
  ...desktopComposerExtrasEnglish,
  ...desktopGuiErrorsEnglish,
  ...desktopDisplayErrorsEnglish,
  ...desktopMiscEnglish,
  ...desktopQuickMenuEnglish,
  ...remoteHostDataEnglish,
  ...sharedTemplatesEnglish,
  ...webRenderEnglish,
  ...nativeChatEnglish,
  ...nativeMiscEnglish,
  ...nativePlatformEnglish,
  ...backendEnglish,
};

export const featureCopyRussian: Readonly<Record<string, string>> = {
  ...messages9,
  ...runtimeErrorsRussian,
  ...remoteHostMessagesRussian,
  ...desktopGuiExtrasRussian,
  ...desktopMacPermissionsRussian,
  ...desktopRemoteSettingsRussian,
  ...desktopChromePluginRussian,
  ...desktopBuiltinPluginsRussian,
  ...desktopComposerExtrasRussian,
  ...desktopGuiErrorsRussian,
  ...desktopDisplayErrorsRussian,
  ...desktopMiscRussian,
  ...desktopQuickMenuRussian,
  ...remoteHostDataRussian,
  ...sharedTemplatesRussian,
  ...webRenderRussian,
  ...nativeChatRussian,
  ...nativeMiscRussian,
  ...nativePlatformRussian,
  ...backendRussian,
};
