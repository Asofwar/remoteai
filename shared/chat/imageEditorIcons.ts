const paths = {
  pen: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 6-1M5 15l4 4M14 21h7"/>',
  arrow: '<path d="M5 19 19 5M7 5h12v12"/>',
  rectangle: '<rect x="4" y="4" width="16" height="16" rx="1.5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M8 20h8"/>',
  mosaic: '<path fill="currentColor" stroke="none" opacity=".3" d="M3 3h18v18H3z"/>'
    + '<path fill="currentColor" stroke="none" opacity=".4" d="M3 3h6v6H3zm12 0h6v6h-6zM9 9h6v6H9zM3 15h6v6H3z"/>'
    + '<path fill="currentColor" stroke="none" d="M3 9h6v6H3zm12 6h6v6h-6z"/>',
  eraser: '<path d="m14 3 7 7a2 2 0 0 1 0 3l-8 8H8l-5-5a2 2 0 0 1 0-3l8-10a2 2 0 0 1 3 0ZM7 9l9 9M13 21h8"/>',
  cancel: '<path d="m6 6 12 12M6 18 18 6"/>',
  done: '<path d="m4 12 5 5L20 6"/>',
  reset: '<path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/>',
  undo: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  redo: '<path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/>',
};

export type ImageEditorIcon = keyof typeof paths;

export function imageEditorIcon(name: ImageEditorIcon) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
