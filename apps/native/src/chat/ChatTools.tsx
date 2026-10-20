import { createThemedStyles } from '../theme/styles';
import { useThemeColor } from '../theme/store';
import { t, useLanguage } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuiToolsClient } from '../../../../shared/remote-chat/guiTools';
import { ChatTerminal } from './ChatTerminal';
import { ChatGit } from './git/ChatGit';
import { RemoteDesktop } from './desktop/RemoteDesktop';
import { ChatToolsPopover } from './ChatToolsPopover';
import { PortMappings } from './portMapping/PortMappings';
import type { AuthSession } from '../types';
import { palette, useStyles } from './styles';
import { ProjectBrowser } from './ProjectBrowser';

interface Props {
  client: GuiToolsClient; cwd: string; active: boolean; connected: boolean; deviceName?: string;
  scope: string; session?: AuthSession;
}
export function ChatTools(props: Props) {
  useLanguage();
  const [mapping, setMapping] = useState(false);
  const [project, setProject] = useState<string>();
  return <>
    <ProjectTools key={props.cwd} {...props} openMappings={() => setMapping(true)}
      openFiles={() => setProject(value => value ?? props.cwd)} />
    {project && <ProjectBrowser client={props.client.projectBrowser} cwd={project}
      active={props.active} connected={props.connected} onClose={() => setProject(undefined)} />}
    <PortMappings client={props.client.files} scope={props.scope} connected={props.connected} session={props.session}
      active={props.active} deviceName={props.deviceName} open={mapping} close={() => setMapping(false)} />
  </>;
}

function ProjectTools({ client, ...props }: Props & { openMappings: () => void; openFiles: () => void }) {
  const styles = useStyles();
  const color = useThemeColor();
  const menuStyles = useMenuStyles();
  useLanguage();
  const anchor = useRef<View>(null);
  const [menu, setMenu] = useState(false);
  const [launchId, setLaunchId] = useState(0);
  const [git, setGit] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { if (!props.active) setMenu(false); }, [props.active]);
  return <>
    <Pressable ref={anchor} collapsable={false} accessibilityRole="button" accessibilityLabel={t("打开工具")}
      accessibilityState={{ expanded: menu && props.active }}
      style={styles.back} onPress={() => { Keyboard.dismiss(); setMenu(value => !value); }}>
      <Ionicons name="construct-outline" size={24} color={color(palette.ink, 'ink')} /></Pressable>
    {menu && props.active && <ChatToolsPopover anchor={anchor} close={() => setMenu(false)}>
      <Pressable accessibilityRole="button" style={({ pressed }) => [menuStyles.item, pressed && menuStyles.pressed]}
        onPress={() => { setMenu(false); props.openMappings(); }}>
        <Ionicons name="swap-horizontal-outline" size={20} color={color(palette.ink, 'ink')} />
        <Text style={menuStyles.label}>{t('端口映射')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!props.connected}
        accessibilityState={{ disabled: !props.connected }}
        style={({ pressed }) => [menuStyles.item, pressed && menuStyles.pressed, !props.connected && styles.disabled]}
        onPress={() => { setMenu(false); setDesktop(true); }}>
        <Ionicons name="desktop-outline" size={20} color={color(palette.ink, 'ink')} />
        <Text style={menuStyles.label}>{t("远程桌面")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!props.connected}
        accessibilityState={{ disabled: !props.connected }}
        style={({ pressed }) => [menuStyles.item, pressed && menuStyles.pressed, !props.connected && styles.disabled]}
        onPress={() => { setMenu(false); setLaunchId(value => value + 1); }}>
        <Ionicons name="terminal-outline" size={20} color={color(palette.ink, 'ink')} /><Text style={menuStyles.label}>{t("终端")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={({ pressed }) => [menuStyles.item, pressed && menuStyles.pressed]}
        onPress={() => { setMenu(false); setGit(true); }}>
        <Ionicons name="git-branch-outline" size={20} color={color(palette.ink, 'ink')} /><Text style={menuStyles.label}>Git</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!props.connected || !props.cwd}
        accessibilityState={{ disabled: !props.connected || !props.cwd }}
        style={({ pressed }) => [menuStyles.item, pressed && menuStyles.pressed,
          (!props.connected || !props.cwd) && styles.disabled]}
        onPress={() => { setMenu(false); props.openFiles(); }}>
        <Ionicons name="folder-open-outline" size={20} color={color(palette.ink, 'ink')} />
        <Text style={menuStyles.label}>{t('文件浏览')}</Text>
      </Pressable>
    </ChatToolsPopover>}
    <ChatTerminal {...props} client={client.terminal} launchId={launchId} hideTrigger />
    {git && <ChatGit {...props} client={client.git} onClose={() => setGit(false)} />}
    {desktop && <RemoteDesktop client={client.desktop} active={props.active}
      close={() => setDesktop(false)} />}
  </>;
}

const useMenuStyles = createThemedStyles((color) => ({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44,
    borderRadius: 8, padding: 12 },
  pressed: { backgroundColor: color('#eef4f1', 'canvas') },
  label: { color: color(palette.ink, 'ink'), fontSize: 14, lineHeight: 20, flexShrink: 1 },
}));
