import { parse, type Node, type Pattern, type Program, type VariableDeclaration,
  type FunctionDeclaration, type ClassDeclaration, type ImportDeclaration } from 'acorn';

const GLOBALS = ['window', 'self', 'globalThis', 'document', 'location', 'history'];
export const BROWSER_MODULE = {
  url: 'remote-preview:browser',
  code: 'const browser = globalThis.__previewBrowser;\n'
    + GLOBALS.map(name => `const preview_${name} = browser.${name};\n`
      + `export {preview_${name} as ${name}};`).join('\n'),
};

function patternNames(pattern: Pattern, names: Set<string>) {
  if (pattern.type === 'Identifier') names.add(pattern.name);
  if (pattern.type === 'RestElement') patternNames(pattern.argument, names);
  if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, names);
  if (pattern.type === 'ArrayPattern') for (const item of pattern.elements) if (item) patternNames(item, names);
  if (pattern.type === 'ObjectPattern') for (const item of pattern.properties) {
    patternNames(item.type === 'RestElement' ? item.argument : item.value as Pattern, names);
  }
}

function children(node: Node): Node[] {
  return Object.values(node as unknown as Record<string, unknown>)
    .flatMap((value): unknown[] => Array.isArray(value) ? value : [value])
    .filter((value): value is Node => value !== null && typeof value === 'object'
      && 'type' in value && typeof value.type === 'string');
}

function declarations(node: Node, names: Set<string>, topLevel: boolean) {
  if (node.type === 'ImportDeclaration') {
    for (const specifier of (node as ImportDeclaration).specifiers) names.add(specifier.local.name);
    return;
  }
  if (node.type === 'VariableDeclaration') {
    const declaration = node as VariableDeclaration;
    if (topLevel || declaration.kind === 'var') for (const item of declaration.declarations) patternNames(item.id, names);
  }
  if (/Function|Class/.test(node.type)) {
    const declaration = node as FunctionDeclaration | ClassDeclaration;
    if (topLevel && declaration.id) names.add(declaration.id.name);
    return;
  }
  for (const child of children(node)) {
    declarations(child, names, node.type === 'Program' || node.type.startsWith('Export'));
  }
}

/** Shadow browser globals lexically while preserving module bindings and inner lexical scopes. */
export function previewModuleGlobals(source: string) {
  const candidates = GLOBALS.filter(name => new RegExp(`\\b${name}\\b`).test(source));
  if (!candidates.length) return '';
  const program: Program = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = new Set<string>();
  declarations(program, names, false);
  const imports = candidates.filter(name => !names.has(name));
  return imports.length ? `import {${imports.join(',')}} from ${JSON.stringify(BROWSER_MODULE.url)};\n` : '';
}
