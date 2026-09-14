import MarkdownIt from 'markdown-it';
import { parseFileReference } from '../../../../shared/chat/fileReference';

// Tokenize HTML only to discard it, matching the desktop renderer's skipHtml behavior.
const parser = new MarkdownIt({ html: true, linkify: true, typographer: false, maxNesting: 20 });
const validateLink = parser.validateLink.bind(parser);
parser.validateLink = (url) => validateLink(url) || Boolean(parseFileReference(url));
type Token = ReturnType<typeof parser.parse>[number];
export interface MarkdownNode { token: Token; children: MarkdownNode[]; task?: boolean }

function tree(tokens: Token[]): MarkdownNode[] {
  const root: MarkdownNode[] = [];
  const stack = [root];
  for (const token of tokens) {
    if (token.type === 'html_block' || token.type === 'html_inline') continue;
    if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node: MarkdownNode = { token, children: token.children ? tree(token.children) : [] };
    stack[stack.length - 1].push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return root;
}

function markTasks(nodes: MarkdownNode[]) {
  for (const node of nodes) {
    if (node.token.type === 'list_item_open') {
      const first = node.children[0]?.children[0]?.children[0];
      const match = first?.token.type === 'text' ? first.token.content.match(/^\[([ xX])\](?:[ \t]+|$)/) : null;
      if (first && match) {
        node.task = match[1].toLowerCase() === 'x';
        first.token.content = first.token.content.slice(match[0].length);
      }
    }
    markTasks(node.children);
  }
}

/** Keep complete blocks intact so large fenced code stays formatted and copies in full. */
export function parseMarkdown(text: string): MarkdownNode[] {
  const nodes = tree(parser.parse(text, {}));
  markTasks(nodes);
  return nodes;
}

export function hasMarkdownImage(node: MarkdownNode): boolean {
  return node.token.type === 'image' || node.children.some(hasMarkdownImage);
}
