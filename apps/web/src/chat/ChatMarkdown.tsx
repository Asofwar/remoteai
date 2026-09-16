import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseFileReference } from '../../../../shared/chat/fileReference';
import { isInlineImage, localImageSource } from '../../../../shared/chat/imageSources';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatImage } from './ChatImage';
import { ChatFileLink } from './ChatFileLink';

function textContent(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    return isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : '';
  }).join('');
}

const components: Components = {
  a: ({ children, href }) => <ChatFileLink href={href}>{children}</ChatFileLink>,
  img: ({ src, alt }) => <ChatImage source={src} description={alt || '图片'} />,
  pre: ({ children }) => {
    const code = Children.toArray(children).find(child => isValidElement(child));
    const language = isValidElement<{ className?: string }>(code)
      ? code.props.className?.replace(/^language-/, '') : '';
    return <ChatCodeBlock text={textContent(children).replace(/\n$/, '')} language={language} />;
  },
};

export function ChatMarkdown({ text, process = false }: { text: string; process?: boolean }) {
  return <div className={`chat-markdown${process ? ' chat-process-prose' : ''}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url, key) => {
      if (/^https?:\/\//i.test(url)) return url;
      if (key === 'href' && parseFileReference(url)) return url;
      return key === 'src' && (isInlineImage(url) || localImageSource(url)) ? url : '';
    }}>{text}</ReactMarkdown>
  </div>;
}
