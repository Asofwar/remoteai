import { t, useLanguage } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, File, Pause, Play, Plus, SlidersHorizontal, Target, X, Zap } from 'lucide-react';
import { COMPOSER_ACTION_LABELS } from '../../../../shared/remote-chat/composerAction';
import { composerLabel } from '../../../../shared/remote-chat/composer';
import { ChatSettings } from './ChatSettings';
import { ChatAttachmentPreviews } from './ChatAttachments';
import { pickChatImages } from './pickChatImages';
import { ChatImageEditor } from './ChatImageEditor';
import { ChatUploadProgress } from './ChatUploadProgress';
import { ChatQueue } from './ChatQueue';
import { ComposerQuotes } from './ChatQuotes';
import { ComposerAddMenu, ComposerPluginMenu, ChatCommandMenu, type ComposerAddAction } from './ComposerMenus';
import { ComposerProjectFiles } from './ComposerProjectFiles';
import { useComposerState } from './useComposerState';
import type { ComposerProps } from './composerProps';
import './composer.css';

export function ChatComposer(props: ComposerProps) {
  useLanguage();
  const { models, selection, settingsBusy, settingsError, updateSettings, readUsage, tokenUsage, queue,
    uploadProgress, threadId, active, ready, sending, goal, goalBusy, catalog, cwd, loadFiles, loadCatalog } = props;
  const state = useComposerState(props);
  const { draft, attachments, menu, busy, compact, action, actionDisabled, goalMode } = state;
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [projectFiles, setProjectFiles] = useState<'files' | 'photos' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickerThread = useRef(threadId);
  const dock = useRef<HTMLDivElement>(null);
  const editing = draft.images.find(image => image.id === editingId);
  const readCatalog = useCallback(() => loadCatalog(cwd), [loadCatalog, cwd]);
  useEffect(() => { if (!active || busy || !editing) setEditingId(null); }, [active, busy, editing]);
  useEffect(() => { if (!active) { setSettings(false); setAdding(false); setProjectFiles(null); } }, [active]);
  useEffect(() => { setSettings(false); setAdding(false); setProjectFiles(null); }, [threadId]);
  useEffect(() => { setProjectFiles(null); }, [cwd]);
  useEffect(() => {
    if (!adding && !menu.open) return;
    const close = (event: PointerEvent) => {
      if (!dock.current?.contains(event.target as Node)) { setAdding(false); menu.close(); }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { setAdding(false); menu.close(); }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', keydown);
    };
  }, [adding, menu.open, menu.close]);
  const chooseAdd = (choice: ComposerAddAction) => {
    setAdding(false);
    if (choice === 'plugins') { menu.openPlugins(); return; }
    if (choice === 'projectFiles' || choice === 'projectPhotos') {
      setProjectFiles(choice === 'projectPhotos' ? 'photos' : 'files'); return;
    }
    pickerThread.current = threadId;
    ({ camera: cameraInput, photos: photoInput, file: fileInput })[choice].current?.click();
  };
  const pickPhotos = (files: File[]) => {
    if (pickerThread.current === threadId) void draft.addImages(remaining => pickChatImages(files, remaining));
  };
  const ActionIcon = { send: ArrowUp, pause: Pause, continue: Play }[action];
  const label = composerLabel(models, selection, t);
  return <div className="chat-composer-dock" ref={dock} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { setAdding(false); menu.close(); }
  }}>
    {queue && <ChatQueue {...queue} {...state.queueEditor} />}
    <form className={`chat-composer${compact ? ' is-compact' : ''}`}
      onSubmit={event => { event.preventDefault(); void state.submit(); }}>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden aria-label={t("选择相册图片")}
        onChange={event => { pickPhotos(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden aria-label={t("拍照")}
        onChange={event => { pickPhotos(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <input ref={fileInput} type="file" multiple hidden aria-label={t("选择文件")} onChange={event => {
        if (pickerThread.current === threadId) void attachments.pick(Array.from(event.target.files ?? []));
        event.target.value = '';
      }} />
      {state.error && <p role="alert" className="chat-error">{t(state.error)}</p>}
      {props.compacting && <p role="status" className="chat-muted">{t("正在压缩上下文…")}</p>}
      {(draft.picking || attachments.busy) && <p role="status" className="chat-muted">{t("正在添加附件…")}</p>}
      <ChatUploadProgress progress={uploadProgress} reconnecting={!ready} />
      {(adding || menu.open) && <div className="chat-composer-popover" onKeyDown={event => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') { setAdding(false); menu.close(); menu.input.current?.focus(); }
      }}>{adding ? <ComposerAddMenu busy={busy} choose={chooseAdd} />
        : menu.plugins ? <ComposerPluginMenu catalog={catalog} query={menu.query} load={readCatalog}
          input={menu.input} close={menu.close}
          chooseSkill={menu.choose} choosePlugin={plugin => { attachments.addPlugin(plugin); menu.consumeTrigger(); }} />
          : <ChatCommandMenu catalog={catalog} query={menu.query} skillsOnly={menu.skillsOnly} input={menu.input}
            compactReason={props.compactReason} choose={menu.choose} compact={() => { void menu.runCompact(); }}
            goal={() => { menu.consumeTrigger(); goalMode.enter(); }} close={menu.close} />}</div>}
      <div className="chat-composer-field">
        <div className="chat-composer-content">
          <ChatAttachmentPreviews images={draft.images} busy={busy} remove={draft.removeImage}
            add={() => setAdding(true)} edit={id => { menu.input.current?.blur(); setEditingId(id); }} />
          <div className="chat-composer-capsules">{attachments.items.map((item, index) =>
            <span className="chat-capsule" key={`${item.path}:${index}`}><File size={14} />
              <span title={item.name}>{item.name}</span><button type="button" aria-label={t("移除{value1}", { value1: item.name })}
                disabled={busy} onClick={() => attachments.remove(item)}><X size={14} /></button></span>)}</div>
          <ComposerQuotes disabled={busy} />
          <textarea ref={menu.input} aria-label={t("聊天消息")} value={draft.text} maxLength={100_000} rows={1}
            readOnly={state.queueEditor.loading} onPaste={state.paste} onChange={event => {
              draft.setText(event.target.value);
              menu.setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd });
            }}
            onSelect={event => menu.setSelection({ start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd })}
            placeholder={ready ? (goalMode.enabled ? t("描述想完成的目标…") : t("发消息…")) : t("连接后发消息")}
            onKeyDown={event => {
              if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Escape') { menu.close(); setAdding(false); return; }
              if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
              event.preventDefault(); void state.submit();
            }} />
        </div>
        <div className="chat-composer-actions">
          <button type="button" className="chat-composer-add" aria-label={t("添加内容")} aria-expanded={adding}
            disabled={busy} onPointerDown={event => event.preventDefault()}
            onClick={() => { menu.close(); setAdding(value => !value); }}><Plus size={24} /></button>
          <div className="chat-composer-trailing">
            {(goalMode.enabled || goal) && <span className="chat-goal-capsule"><Target size={15} /><span>{t("目标")}</span>
              <button type="button" aria-label={t("退出目标模式")} disabled={sending || goalBusy || (!!goal && !ready)}
                onClick={state.removeGoal}><X size={13} /></button></span>}
            <button type="button" className="chat-model" onPointerDown={event => event.preventDefault()}
              aria-label={t("{value1}{value2}，聊天设置", { value1: label, value2: selection.speed === 'fast' ? t("，快速模式") : '' })}
              onClick={() => { menu.close(); setAdding(false); setSettings(true); }}>
              {compact ? <SlidersHorizontal size={20} /> : <><span>{label}</span>
                {selection.speed === 'fast' && <Zap size={14} aria-label={t("快速模式")} />}<ChevronDown size={12} /></>}
            </button>
            <button type="submit" className="chat-composer-submit" aria-label={t(COMPOSER_ACTION_LABELS[action])}
              onPointerDown={event => event.preventDefault()} aria-busy={state.pausing || sending} disabled={actionDisabled}>
              <ActionIcon size={22} fill={action === 'continue' ? 'currentColor' : 'none'} /></button>
          </div>
        </div>
      </div>
    </form>
    {active && !busy && editing && <ChatImageEditor key={editing.id} image={editing}
      save={url => draft.replaceImage(editing, url)} close={() => setEditingId(null)} />}
    {projectFiles && <ComposerProjectFiles imagesOnly={projectFiles === 'photos'} threadId={threadId} cwd={cwd}
      load={loadFiles} close={() => setProjectFiles(null)} choose={file => {
        attachments.add({ kind: 'file', name: file.name, path: file.path }); setProjectFiles(null);
      }} />}
    {settings && <ChatSettings models={models} selection={selection} threadId={threadId}
      contextSettings={props.contextSettings} readUsage={readUsage} tokenUsage={tokenUsage}
      saving={settingsBusy} error={settingsError} ready={ready}
      updateSettings={updateSettings} onClose={() => setSettings(false)} />}
  </div>;
}
