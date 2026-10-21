import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab, undo, redo } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { openSearchPanel, search } from '@codemirror/search';
import { ChevronsDownUp, ChevronsUpDown, Redo2, Search, Undo2, WrapText } from 'lucide-react';
import { editorHighlighting, editorLanguage, editorPhrases, editorTheme, textFolding } from './editorSetup';
import type { BrowserTranslate } from './ProjectTree';

interface Props {
  text: string; path: string; readOnly: boolean; t: BrowserTranslate;
  onChange: (text: string) => void; save: () => void;
}

export function ProjectEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const settings = useRef({ editable: new Compartment(), wrapping: new Compartment(), language: new Compartment() });
  const latest = useRef(props);
  const synchronizing = useRef(false);
  latest.current = props;
  const [wrap, setWrap] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  useLayoutEffect(() => {
    if (!host.current) return;
    const { editable, wrapping, language } = settings.current;
    const syntax = editorLanguage(props.path);
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: props.text, extensions: [
        basicSetup, editorTheme, editorHighlighting, editorPhrases(props.t), search({ top: true }),
        EditorState.lineSeparator.of(props.text.includes('\r\n') ? '\r\n' : '\n'),
        EditorView.contentAttributes.of({ 'aria-label': props.t('文件内容'), spellcheck: 'false',
          autocorrect: 'off', autocapitalize: 'off' }),
        editable.of(EditorState.readOnly.of(props.readOnly)), wrapping.of([]), language.of(syntax ? [] : textFolding),
        keymap.of([indentWithTab, { key: 'Mod-s', run: () => { latest.current.save(); return true; } }]),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !synchronizing.current) latest.current.onChange(update.state.sliceDoc());
        }),
      ] }),
    });
    view.current = editor;
    // Mobile keyboards and pasted queries do not always emit keyup; update search on input too.
    const searchInput = (event: Event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.closest('.cm-search')) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    editor.dom.addEventListener('input', searchInput);
    let disposed = false;
    if (syntax) void syntax.load().then(support => {
      if (!disposed) editor.dispatch({ effects: language.reconfigure(support) });
    }).catch(() => { if (!disposed) setLanguageError(true); });
    return () => {
      disposed = true; editor.dom.removeEventListener('input', searchInput); editor.destroy(); view.current = undefined;
    };
    // A document version remounts this editor; keystrokes must not recreate it or reset history.
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.sliceDoc() === props.text) return;
    // Another view of the same project may have edited this draft while this editor was hidden.
    synchronizing.current = true;
    try {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.text },
        annotations: Transaction.addToHistory.of(false) });
    } finally { synchronizing.current = false; }
  }, [props.text]);
  useEffect(() => {
    view.current?.dispatch({ effects: settings.current.editable.reconfigure(EditorState.readOnly.of(props.readOnly)) });
  }, [props.readOnly]);
  useEffect(() => {
    view.current?.dispatch({ effects: settings.current.wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);
  const command = (run: (editor: EditorView) => boolean) => { if (view.current) run(view.current); };
  return <div className="pf-editor">
    <div className="pf-editor-tools" role="toolbar" aria-label={props.t('编辑工具')}>
      <button type="button" onClick={() => command(openSearchPanel)}>
        <Search size={16} /><span>{props.t('查找')}</span></button>
      <button type="button" aria-label={props.t('撤销')} disabled={props.readOnly} onClick={() => command(undo)}>
        <Undo2 size={16} /></button>
      <button type="button" aria-label={props.t('重做')} disabled={props.readOnly} onClick={() => command(redo)}>
        <Redo2 size={16} /></button>
      <button type="button" aria-label={props.t('全部折叠')} onClick={() => command(foldAll)}>
        <ChevronsDownUp size={16} /></button>
      <button type="button" aria-label={props.t('全部展开')} onClick={() => command(unfoldAll)}>
        <ChevronsUpDown size={16} /></button>
      <button type="button" aria-label={props.t('自动换行')} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
        <WrapText size={16} /></button>
      {languageError && <span role="status">{props.t('语法高亮暂不可用')}</span>}
    </div>
    <div ref={host} className="pf-editor-host" />
  </div>;
}
