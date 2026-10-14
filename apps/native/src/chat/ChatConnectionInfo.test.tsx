import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatConnectionInfo } from './ChatConnectionInfo';
import { ChatReconnectButton } from './ChatReconnectButton';
import { HostIdentityVerification } from './HostIdentityVerification';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import { initialChatState } from '../../../../shared/remote-chat/client/types';
import { HOST_IDENTITY_CHANGED } from '../../../../shared/remote-chat/trustedHost';

const runtime = vi.hoisted(() => ({ cursor: 0, states: [] as unknown[] }));
vi.mock('react', async original => ({ ...await original<typeof React>(),
  useEffect: vi.fn(), useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: unknown) => {
    const index = runtime.cursor++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
}));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles } }));
vi.mock('./ChatConnectionHealth', () => ({ ChatConnectionHealth: 'ConnectionHealth' }));
vi.mock('./HostIdentityVerification', () => ({ HostIdentityVerification: 'IdentityVerification' }));

interface ElementProps {
  children?: ReactNode;
  numberOfLines?: number;
  style?: { overflow?: string; maxWidth?: string; flexWrap?: string };
  onPress?: () => void;
  confirm?: (fingerprint: string) => Promise<void>;
}
type Element = ReactElement<ElementProps>;

function descendants(node: ReactNode, parents: Element[] = []): Array<{ element: Element; parents: Element[] }> {
  return Children.toArray(node).flatMap(child => isValidElement<ElementProps>(child)
    ? [{ element: child, parents }, ...descendants(child.props.children, [...parents, child])] : []);
}

beforeEach(() => { vi.stubGlobal('React', React); runtime.cursor = 0; runtime.states = []; });
afterEach(() => vi.unstubAllGlobals());

it('keeps identity and retry actions outside ellipsized text and opens fingerprint confirmation', async () => {
  const retry = vi.fn();
  const confirm = vi.fn(async () => undefined);
  const controller = new ChatController(() => ({ start: vi.fn(), stop: vi.fn(), retryNow: retry,
    confirmHostIdentity: confirm, request: async <T,>() => ({}) as T }));
  const device = { deviceId: 'device', name: '很长的电脑名称'.repeat(40), online: true, platform: 'windows',
    localProxyRunning: false, capabilities: [], lastSeenAt: '' };
  const props = { state: { ...initialChatState(), error: HOST_IDENTITY_CHANGED }, controller, device, active: true };
  const render = () => { runtime.cursor = 0; return ChatConnectionInfo(props); };
  const nodes = descendants(render());
  const identityText = nodes.find(({ element }) => element.props.children === '核对电脑身份')!;
  const identityButton = identityText.parents.at(-1)!;
  const reconnect = nodes.find(({ element }) => element.type === ChatReconnectButton)!;
  for (const entry of [identityText, reconnect]) {
    expect(entry.parents.every(parent => parent.props.numberOfLines === undefined)).toBe(true);
    expect(entry.parents.every(parent => parent.props.style?.overflow !== 'hidden')).toBe(true);
    expect(entry.parents.some(parent => parent.props.style?.flexWrap === 'wrap')).toBe(true);
  }
  expect(identityButton.props.style?.maxWidth).toBe('100%');
  identityButton.props.onPress!();
  const verification = descendants(render()).find(({ element }) => element.type === HostIdentityVerification)!;
  await verification.element.props.confirm!('confirmed-fingerprint');
  expect(confirm).toHaveBeenCalledWith('confirmed-fingerprint');
  expect(retry).toHaveBeenCalledOnce();
  (reconnect.element.props as React.ComponentProps<typeof ChatReconnectButton>).onPress();
  expect(retry).toHaveBeenCalledTimes(2);
});
