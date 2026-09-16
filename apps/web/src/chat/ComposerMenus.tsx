import { useEffect, useState } from 'react';
import { Box, Camera, File, Folder, Image, X } from 'lucide-react';
import type { Skill } from './types';
import type { ComposerPlugin } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import type { RemoteComposerCatalog } from '../../../../shared/remote-chat/composerCatalog';
import { skillDescription, skillLabel, type SkillCatalogState } from '../../../../shared/chat/skillCatalog';

export type ComposerAddAction = 'camera' | 'photos' | 'file' | 'projectFiles' | 'projectPhotos' | 'plugins';
const ADD_ACTIONS = [
  { id: 'camera', label: '拍照', icon: Camera }, { id: 'photos', label: '相册', icon: Image },
  { id: 'file', label: '文件', icon: File }, { id: 'projectFiles', label: '项目文件', icon: Folder },
  { id: 'projectPhotos', label: '项目照片', icon: Image }, { id: 'plugins', label: '插件', icon: Box },
] as const;

export function ComposerAddMenu({ busy, choose }: { busy: boolean; choose: (action: ComposerAddAction) => void }) {
  return <div className="chat-add-menu" role="menu" aria-label="添加内容">
    {ADD_ACTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="menuitem"
      disabled={busy} onClick={() => choose(id)}><Icon size={20} /><span>{label}</span></button>)}
  </div>;
}

interface CommandProps {
  catalog: SkillCatalogState; query: string; skillsOnly: boolean; compactReason: string | null;
  choose: (skill: Skill) => void; compact: () => void; goal: () => void; close: () => void;
}
export function ChatCommandMenu({ catalog, query, skillsOnly, compactReason, choose, compact, goal,
  close }: CommandProps) {
  const search = query.toLocaleLowerCase();
  const skills = catalog.skills.filter(skill =>
    `${skill.name} ${skillLabel(skill)} ${skillDescription(skill)}`.toLocaleLowerCase().includes(search));
  const showCompact = !skillsOnly && 'compact 压缩 上下文'.includes(search);
  const showGoal = !skillsOnly && 'goal 目标 持续推进'.includes(search);
  return <div className="chat-command-menu" aria-label="命令和技能">
    <header><strong>命令和技能</strong><button type="button" aria-label="关闭命令和技能" onClick={close}>
      <X size={16} /></button></header>
    <div className="chat-menu-options" role="menu">
      {showCompact && <button type="button" role="menuitem" aria-label="压缩上下文"
        disabled={compactReason !== null} onClick={compact}><strong>压缩 <small>/compact</small></strong>
        <small>{compactReason ?? '压缩此对话的上下文'}</small></button>}
      {showGoal && <button type="button" role="menuitem" aria-label="目标模式" onClick={goal}>
        <strong>目标 <small>/goal</small></strong><small>持续推进，直到完成目标</small></button>}
      {skills.map(skill => <button key={skill.path} type="button" role="menuitem"
        aria-label={`使用技能 ${skillLabel(skill)}`} disabled={!skill.enabled} onClick={() => choose(skill)}>
        <strong>{skillLabel(skill)}{!skill.enabled && '（已停用）'}</strong><small>{skillDescription(skill)}</small></button>)}
      {catalog.loading && !catalog.loaded && <p role="status">正在加载技能…</p>}
      {catalog.error && <p role="status">{catalog.error}</p>}
      {catalog.loaded && !skills.length && !showCompact && !showGoal && <p>没有找到匹配的命令或技能</p>}
    </div>
  </div>;
}

export function ComposerPluginMenu({ catalog, query, load, chooseSkill, choosePlugin }: {
  catalog: SkillCatalogState; query: string; load: () => Promise<RemoteComposerCatalog>;
  chooseSkill: (skill: Skill) => void; choosePlugin: (plugin: ComposerPlugin) => void;
}) {
  const [result, setResult] = useState<RemoteComposerCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void load().then(value => { if (!cancelled) { setResult(value); setError(value.pluginsError ?? ''); } })
      .catch(() => { if (!cancelled) setError('暂时无法更新插件，可继续选择已有内容。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);
  const skills = result?.data.flatMap(group => group.skills) ?? catalog.skills;
  const entries = [
    ...(result?.plugins ?? []).filter(plugin => plugin.installed && plugin.enabled).map(plugin => ({
      key: `plugin:${plugin.id}`, label: plugin.interface?.displayName || plugin.name,
      name: plugin.name, action: () => choosePlugin(plugin), type: '插件',
    })),
    ...skills.filter(skill => skill.enabled).map(skill => ({ key: skill.path, label: skillLabel(skill),
      name: skill.name, action: () => chooseSkill(skill), type: '技能' })),
  ].filter(entry => `${entry.label} ${entry.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="chat-command-menu" aria-label="插件列表"><header><strong>插件</strong></header>
    <div className="chat-menu-options" role="menu">{entries.map(entry => <button type="button" role="menuitem"
      key={entry.key} aria-label={`使用${entry.type} ${entry.label}`} onClick={entry.action}>
      <span className="chat-row"><Box size={20} />{entry.label}</span></button>)}
      {loading && !entries.length && <p role="status">正在加载插件…</p>}
      {!loading && !entries.length && !error && <p>{query ? '没有找到匹配的插件' : '暂无可用插件或技能'}</p>}
      {error && <p role="status">{error}</p>}
    </div></div>;
}
