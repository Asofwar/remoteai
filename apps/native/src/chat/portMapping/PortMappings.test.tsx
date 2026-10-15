import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { PortMappings } from './PortMappings';

const runtime = vi.hoisted(() => ({ cursor: 0, component: '', states: new Map<string, unknown[]>(),
  service: undefined as PortForwardingService | undefined }));
vi.mock('react', async original => ({ ...await original<typeof React>(), useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const state = runtime.states.get(runtime.component) ?? [];
    runtime.states.set(runtime.component, state);
    const index = runtime.cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (value: unknown) => { state[index] = value; }];
  },
}));
vi.mock('react-native', () => ({ Text: 'Text', TextInput: 'TextInput', View: 'View', Pressable: 'Pressable',
  Switch: 'Switch', Platform: { OS: 'android' } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('./mappingStyles', () => ({ useMappingStyles: () => ({}) }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('../styles', () => ({ useStyles: () => ({}) }));
vi.mock('../../i18n', () => ({ t: (value: string) => value }));
vi.mock('../../components/BottomSheet', () => ({ BottomSheet: 'BottomSheet' }));
vi.mock('../../components/SheetScrollView', () => ({ SheetScrollView: 'SheetScrollView' }));
vi.mock('./MappingPreview', () => ({ MappingPreview: 'MappingPreview' }));
vi.mock('./MappingOpenActions', () => ({ MappingOpenActions: 'MappingOpenActions' }));
vi.mock('./usePortMappings', () => ({ usePortMappings: () => ({ service: runtime.service,
  entries: runtime.service!.snapshot() }) }));

interface Props {
  children?: ReactNode; accessibilityLabel?: string; accessibilityRole?: string; maxWidth?: number;
  value?: string; onChangeText?: (value: string) => void; onPress?: () => void;
}
function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Props>(child)) return [];
    if (typeof child.type === 'function') {
      runtime.component = child.type.name + String(child.key ?? ''); runtime.cursor = 0;
      return elements((child.type as (props: Props) => ReactNode)(child.props));
    }
    return [child, ...elements(child.props.children)];
  });
}
const client: ForwardingClient = { openResource: vi.fn(async () => 'resource'),
  closeResource: vi.fn(async () => {}), link: vi.fn(async () => ({ type: 'done' as const })) };
const render = () => elements(<PortMappings client={client} scope="test" connected active open close={() => {}} />);
const field = (label: string) => render().find(element => element.props.accessibilityLabel === label)!;
const submit = () => render().find(element => element.props.accessibilityRole === 'button'
  && elements(element.props.children).some(child => child.props.children === '添加并启动'))!.props.onPress!();

beforeEach(() => {
  vi.stubGlobal('React', React); vi.clearAllMocks(); runtime.states.clear();
  runtime.service = new PortForwardingService(client, [], { createId: () => 'mapping',
    createTunnel: () => ({ resolve: async (_id, url) => url, close: async () => {} }) });
  runtime.service.setConnected(true);
});
afterEach(() => { runtime.service?.dispose(); vi.unstubAllGlobals(); });

it('submits the selected target and local port and displays the complete destination in the compact sheet', () => {
  field('目标 IP').props.onChangeText!('192.168.1.20');
  field('远程端口').props.onChangeText!('3000');
  field('本地端口').props.onChangeText!('13000');
  submit();
  expect(client.openResource).toHaveBeenCalledWith('http://192.168.1.20:3000');
  expect(runtime.service!.snapshot()[0]).toMatchObject({ remoteHost: '192.168.1.20', localPort: 13000 });
  expect(render().some(element => element.props.maxWidth === 540)).toBe(true);
  expect(render().some(element => Children.toArray(element.props.children).includes('192.168.1.20:3000'))).toBe(true);
});

it('preserves invalid input for correction and defaults an empty IP to the remote computer', () => {
  field('目标 IP').props.onChangeText!('192.168.1.20:3000');
  field('远程端口').props.onChangeText!('3000'); submit();
  expect(client.openResource).not.toHaveBeenCalled();
  expect(render().find(element => element.props.accessibilityRole === 'alert')?.props.children)
    .toBe('请输入有效的 IPv4 或 IPv6 地址。');
  expect(field('目标 IP').props.value).toBe('192.168.1.20:3000');
  field('目标 IP').props.onChangeText!(''); submit();
  expect(client.openResource).toHaveBeenCalledWith('http://127.0.0.1:3000');
});

it('opens the editing form from the card menu and updates the existing running mapping', async () => {
  field('远程端口').props.onChangeText!('3000'); submit();
  for (let count = 0; count < 10; count++) await Promise.resolve();
  const id = runtime.service!.snapshot()[0].id;
  field('更多操作').props.onPress!();
  const button = (text: string) => render().find(element => element.props.accessibilityRole === 'button'
    && elements(element.props.children).some(child => child.props.children === text))!;
  button('编辑映射').props.onPress!();
  expect(field('远程端口').props.value).toBe('3000');
  field('目标 IP').props.onChangeText!('172.16.200.85');
  field('远程端口').props.onChangeText!('8306');
  field('本地端口').props.onChangeText!('18306');
  button('保存修改').props.onPress!();
  for (let count = 0; count < 30; count++) await Promise.resolve();
  expect(runtime.service!.snapshot()).toHaveLength(1);
  expect(runtime.service!.snapshot()[0]).toMatchObject({ id, remoteHost: '172.16.200.85',
    remotePort: 8306, localPort: 18306, status: 'running' });
});
