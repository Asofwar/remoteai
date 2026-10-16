import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { MappingSync } from '../../../../../shared/port-mapping/sync';
import { PortMappings } from './PortMappings';

const runtime = vi.hoisted(() => ({ cursor: 0, component: '', states: new Map<string, unknown[]>(),
  service: undefined as PortForwardingService | undefined, syncStatus: '' }));
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
  entries: runtime.service!.snapshot(), syncStatus: runtime.syncStatus }) }));

interface Props {
  children?: ReactNode; accessibilityLabel?: string; accessibilityRole?: string; maxWidth?: number;
  accessibilityLiveRegion?: string;
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
  vi.stubGlobal('React', React); vi.clearAllMocks(); runtime.states.clear(); runtime.syncStatus = '';
  runtime.service = new PortForwardingService(client, [], { createId: () => 'mapping',
    createTunnel: () => ({ resolve: async (_id, url) => url, close: async () => {} }) });
  runtime.service.setConnected(true);
});

it('adds and edits UDP mappings and shows copy without browser actions', async () => {
  field('UDP').props.onPress!();
  field('远程端口').props.onChangeText!('53');
  field('本地端口').props.onChangeText!('1053');
  submit();
  for (let count = 0; count < 30; count++) await Promise.resolve();
  expect(runtime.service!.snapshot()[0]).toMatchObject({ protocol: 'udp', status: 'running' });
  expect(render().some(element => element.props.accessibilityLabel === '打开')).toBe(false);
  expect(render().some(element => element.props.accessibilityLabel === '复制本地地址')).toBe(true);
  field('更多操作').props.onPress!();
  render().find(element => element.props.accessibilityRole === 'button'
    && elements(element.props.children).some(child => child.props.children === '编辑映射'))!.props.onPress!();
  field('全部（TCP + UDP）').props.onPress!();
  render().find(element => element.props.accessibilityRole === 'button'
    && elements(element.props.children).some(child => child.props.children === '保存修改'))!.props.onPress!();
  for (let count = 0; count < 30; count++) await Promise.resolve();
  expect(runtime.service!.snapshot()[0]).toMatchObject({ protocol: 'both', status: 'running' });
  expect(render().some(element => element.props.accessibilityLabel === '打开')).toBe(true);
});

it('displays retained overflow with actionable sync guidance and removes it after capacity is freed', async () => {
  const extra = { id: 'local-extra', remotePort: 5000, localPort: 15000 };
  const saved = new Map([['codex-port-mapping-sync:test', JSON.stringify({ [extra.id]: extra })]]);
  const sync = new MappingSync(runtime.service!, { scope: 'test', storage: {
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); },
  }, exchange: async input => ({ revision: 1, mappings: input?.mappings ??
    Array.from({ length: 8 }, (_, index) => ({ id: `remote-${index}`, remotePort: 3000 + index,
      localPort: 13000 + index })), accepted: !!input }) });
  const stop = sync.start();
  try {
    for (let count = 0; count < 40; count++) await Promise.resolve();
    runtime.syncStatus = sync.snapshot();
    expect(runtime.service!.snapshot()).toHaveLength(9);
    expect(render().find(element => element.props.accessibilityLiveRegion === 'polite')?.props.children)
      .toBe('最多同步 8 条映射，多出的映射已保留在本机。请删除不需要的映射后继续同步。');
    await runtime.service!.remove('remote-0');
    for (let count = 0; count < 40; count++) await Promise.resolve();
    runtime.syncStatus = sync.snapshot();
    expect(runtime.service!.snapshot()).toHaveLength(8);
    expect(render().find(element => element.props.accessibilityLiveRegion === 'polite')?.props.children)
      .toBe('配置已自动同步');
  } finally { stop(); }
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
  for (const value of ['192.168.1.20', 3000, 13000]) {
    expect(render().some(element => element.props.children === value)).toBe(true);
  }
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
