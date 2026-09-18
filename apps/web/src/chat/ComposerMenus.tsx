import { t, useLanguage } from '../i18n';
import { useEffect, useState, type RefObject } from 'react';
import { Box, Camera, File, Folder, Image, X } from 'lucide-react';
import type { Skill } from './types';
import type { ComposerPlugin } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import type { RemoteComposerCatalog } from '../../../../shared/remote-chat/composerCatalog';
import { skillDescription, skillLabel, type SkillCatalogState } from '../../../../shared/chat/skillCatalog';
import { useComposerMenuKeyboard, type ComposerMenuOption } from './useComposerMenuKeyboard';

export type ComposerAddAction = 'camera' | 'photos' | 'file' | 'projectFiles' | 'projectPhotos' | 'plugins';
const ADD_ACTIONS = [
  { id: 'camera', get label() { return t("拍照"); }, icon: Camera }, { id: 'photos', get label() { return t("相册"); }, icon: Image },
  { id: 'file', get label() { return t("文件"); }, icon: File }, { id: 'projectFiles', get label() { return t("项目文件"); }, icon: Folder },
  { id: 'projectPhotos', get label() { return t("项目照片"); }, icon: Image }, { id: 'plugins', get label() { return t("插件"); }, icon: Box },
] as const;

export function ComposerAddMenu({ busy, choose }: { busy: boolean; choose: (action: ComposerAddAction) => void }) {
  useLanguage();
  return <div className="chat-add-menu" role="menu" aria-label={t("添加内容")}>
    {ADD_ACTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="menuitem"
      disabled={busy} onClick={() => choose(id)}><Icon size={20} /><span>{label}</span></button>)}
  </div>;
}

interface CommandProps {
  input: RefObject<HTMLTextAreaElement>;
  catalog: SkillCatalogState; query: string; skillsOnly: boolean; compactReason: string | null;
  choose: (skill: Skill) => void; compact: () => void; goal: () => void; close: () => void;
}
export function ChatCommandMenu({ catalog, query, skillsOnly, compactReason, choose, compact, goal,
  close, input }: CommandProps) {
  useLanguage();
  const search = query.toLocaleLowerCase();
  const skills = catalog.skills.filter(skill =>
    `${skill.name} ${skillLabel(skill)} ${skillDescription(skill)}`.toLocaleLowerCase().includes(search));
  const showCompact = !skillsOnly && t("compact 压缩 上下文").includes(search);
  const showGoal = !skillsOnly && t("goal 目标 持续推进").includes(search);
  const options: ComposerMenuOption[] = [
    ...(showCompact ? [{ key: 'compact', enabled: compactReason === null, choose: compact }] : []),
    ...(showGoal ? [{ key: 'goal', enabled: true, choose: goal }] : []),
    ...skills.map(skill => ({ key: skill.path, enabled: skill.enabled, choose: () => choose(skill) })),
  ];
  const keyboard = useComposerMenuKeyboard({ input, query, options, close });
  return <div className="chat-command-menu" aria-label={t("命令和技能")}>
    <header><strong>{t("命令和技能")}</strong><button type="button" aria-label={t("关闭命令和技能")} onClick={close}>
      <X size={16} /></button></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu">
      {showCompact && <button type="button" role="menuitem" aria-label={t("压缩上下文")}
        {...keyboard.optionProps('compact')}
        disabled={compactReason !== null} onClick={compact}><strong>{t("压缩")} <small>/compact</small></strong>
        <small>{compactReason ? t(compactReason) : t("压缩此对话的上下文")}</small></button>}
      {showGoal && <button type="button" role="menuitem" aria-label={t("目标模式")} onClick={goal}
        {...keyboard.optionProps('goal')}>
        <strong>{t("目标")} <small>/goal</small></strong><small>{t("持续推进，直到完成目标")}</small></button>}
      {skills.map(skill => <button key={skill.path} type="button" role="menuitem" {...keyboard.optionProps(skill.path)}
        aria-label={t("使用技能 {value1}", { value1: skillLabel(skill) })} disabled={!skill.enabled} onClick={() => choose(skill)}>
        <strong>{skillLabel(skill)}{!skill.enabled && t("（已停用）")}</strong><small>{skillDescription(skill)}</small></button>)}
      {catalog.loading && !catalog.loaded && <p role="status">{t("正在加载技能…")}</p>}
      {catalog.error && <p role="status">{t(catalog.error)}</p>}
      {catalog.loaded && !skills.length && !showCompact && !showGoal && <p>{t("没有找到匹配的命令或技能")}</p>}
    </div>
  </div>;
}

export function ComposerPluginMenu({ catalog, query, load, chooseSkill, choosePlugin, input, close }: {
  input: RefObject<HTMLTextAreaElement>; close: () => void;
  catalog: SkillCatalogState; query: string; load: () => Promise<RemoteComposerCatalog>;
  chooseSkill: (skill: Skill) => void; choosePlugin: (plugin: ComposerPlugin) => void;
}) {
  useLanguage();
  const [result, setResult] = useState<RemoteComposerCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void load().then(value => { if (!cancelled) { setResult(value); setError(value.pluginsError ?? ''); } })
      .catch(() => { if (!cancelled) setError(t("暂时无法更新插件，可继续选择已有内容。")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);
  const skills = result?.data.flatMap(group => group.skills) ?? catalog.skills;
  const entries = [
    ...(result?.plugins ?? []).filter(plugin => plugin.installed && plugin.enabled).map(plugin => ({
      key: `plugin:${plugin.id}`, label: plugin.interface?.displayName || plugin.name,
      name: plugin.name, action: () => choosePlugin(plugin), type: t("插件"),
    })),
    ...skills.filter(skill => skill.enabled).map(skill => ({ key: skill.path, label: skillLabel(skill),
      name: skill.name, action: () => chooseSkill(skill), type: t("技能") })),
  ].filter(entry => `${entry.label} ${entry.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const keyboard = useComposerMenuKeyboard({ input, query, close,
    options: entries.map(entry => ({ key: entry.key, enabled: true, choose: entry.action })) });
  return <div className="chat-command-menu" aria-label={t("插件列表")}><header><strong>{t("插件")}</strong></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu">
      {entries.map(entry => <button type="button" role="menuitem" {...keyboard.optionProps(entry.key)}
      key={entry.key} aria-label={t("使用{value1} {value2}", { value1: entry.type, value2: entry.label })} onClick={entry.action}>
      <span className="chat-row"><Box size={20} />{entry.label}</span></button>)}
      {loading && !entries.length && <p role="status">{t("正在加载插件…")}</p>}
      {!loading && !entries.length && !error && <p>{query ? t("没有找到匹配的插件") : t("暂无可用插件或技能")}</p>}
      {error && <p role="status">{t(error)}</p>}
    </div></div>;
}
