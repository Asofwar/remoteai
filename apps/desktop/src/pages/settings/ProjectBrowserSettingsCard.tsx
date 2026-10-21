import { FolderSearch } from 'lucide-react';
import { AutoSaveSettings } from '../../../../../shared/project-browser/AutoSaveSettings';
import { useBrowserPreferences } from '../../../../../shared/project-browser/useBrowserPreferences';
import { t, useLanguage } from '../../../../web/src/i18n';

export function ProjectBrowserSettingsCard() {
  useLanguage();
  const preferences = useBrowserPreferences();
  return <section className="settings-card">
    <div className="settings-icon"><FolderSearch size={23} /></div>
    <div className="settings-card-content"><div className="settings-card-copy">
      <h3>{t('文件浏览')}</h3><AutoSaveSettings preferences={preferences} t={t} />
    </div></div>
  </section>;
}
