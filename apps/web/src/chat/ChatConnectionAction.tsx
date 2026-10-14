import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  className?: string;
}

/** Inline actions let the entire status line share a single trailing ellipsis. */
export function ChatConnectionAction({ children, label, onClick, disabled, expanded, className = '' }: Props) {
  // Native buttons create atomic inline boxes and cannot be ellipsized as part of the surrounding text.
  return <span role="button" tabIndex={disabled ? -1 : 0} aria-label={label}
    aria-disabled={disabled} aria-expanded={expanded} className={`chat-connection ${className}`}
    onClick={disabled ? undefined : onClick} onKeyDown={event => {
      if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      onClick();
    }}>{children}</span>;
}
