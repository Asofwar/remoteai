// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Account, Provider } from '../../types';
import { ProviderGroupToolbar } from './ProviderGroupControls';

vi.mock('antd', () => ({
  Button: ({ children, disabled, onClick }: {
    children: ReactNode; disabled: boolean; onClick: () => void;
  }) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  Space: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

it.each([null, 'Another group', 'Work'])(
  'uses the active group, not an individually active API: %s', async activeGroup => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const onSwitchGroup = vi.fn();
  const providers = [{ id: 'api', kind: 'custom', group: 'Work', active: true }] as Provider[];
  const accounts = [{ id: 'official', group: 'Work', autoSwitchEnabled: true,
    localProxyCompatible: true }] as Account[];
  try {
    await act(async () => root.render(<ProviderGroupToolbar providers={providers} accounts={accounts}
      activeGroup={activeGroup} busyProviderId={null} proxyRunning onSwitchGroup={onSwitchGroup} t={key => key} />));
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('Work2');
    expect(button.disabled).toBe(activeGroup === 'Work');
    await act(async () => button.click());
    if (activeGroup === 'Work') expect(onSwitchGroup).not.toHaveBeenCalled();
    else expect(onSwitchGroup).toHaveBeenCalledExactlyOnceWith('Work');
    await act(async () => root.render(<ProviderGroupToolbar providers={providers} accounts={accounts}
      activeGroup={null} busyProviderId={null} proxyRunning={false} onSwitchGroup={onSwitchGroup} t={key => key} />));
    expect(container.querySelector('button')!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
