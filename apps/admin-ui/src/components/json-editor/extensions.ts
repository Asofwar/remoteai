import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting,
} from "@codemirror/language";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";

export const editorConfiguration = new Compartment();

export function editorSettings(readOnly: boolean, label: string) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({ "aria-label": label, "aria-readonly": String(readOnly) })];
}

export function jsonExtensions(options: { readOnly: boolean; label: string; onChange: (value: string) => void }) {
  return [
    json(), lineNumbers(), foldGutter(), history(), drawSelection(), highlightActiveLine(),
    indentOnInput(), bracketMatching(), syntaxHighlighting(defaultHighlightStyle), linter(jsonParseLinter()),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    editorConfiguration.of(editorSettings(options.readOnly, options.label)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    }),
  ];
}
