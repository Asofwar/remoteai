import { useThemeColor } from '../../theme/store';
import { t, getLocale, useLanguage } from '../../i18n';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { gitGraph, GRAPH_ROW_HEIGHT, type GraphLine, type GraphRow } from '../../../../../shared/remote-chat/gitGraph';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { GIT_HISTORY_CONTENT_WIDTH, GIT_HISTORY_DATE_FORMAT } from '../../../../../shared/remote-chat/gitHistoryLayout';
import { useGitStyles as useStyles } from './styles';

function Line({ line }: { line: GraphLine }) {
  useLanguage();
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  return <View style={{ position: 'absolute', height: 2, width: length, backgroundColor: line.color,
    left: (line.x1 + line.x2) / 2 - length / 2, top: (line.y1 + line.y2) / 2 - 1,
    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
}

function Graph({ row }: { row: GraphRow }) {
  const color = useThemeColor();
  useLanguage();
  return <View accessible={false} style={{ width: row.width, height: GRAPH_ROW_HEIGHT, flexShrink: 0 }}>
    {row.lines.map((line, index) => <Line key={index} line={line} />)}
    <View style={{ position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: row.color,
      borderColor: color('#fff', 'border'), borderWidth: 1, left: row.x - 4.5, top: GRAPH_ROW_HEIGHT / 2 - 4.5 }} />
  </View>;
}

export function GitHistory({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const styles = useStyles();
  useLanguage();
  const [width, setWidth] = useState(0);
  const graph = useMemo(() => gitGraph(panel.commits), [panel.commits]);
  return <ScrollView style={styles.fill} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {!panel.busy && !panel.commits.length && <Text style={styles.notice}>{t("还没有提交记录。")}</Text>}
    <ScrollView horizontal>
      <View>{graph.rows.map(row => <Pressable key={row.commit.hash} accessibilityRole="button"
        accessibilityLabel={`${row.commit.hash.slice(0, 8)} ${row.commit.subject}`}
        style={[styles.historyRow, { width: Math.max(width, row.width + GIT_HISTORY_CONTENT_WIDTH) }]}
        disabled={!connected || panel.busy} onPress={() => panel.setDetail({ kind: 'files', commit: row.commit })}>
        <Graph row={row} />
        <View style={styles.historyText}>
          <View style={styles.historySummary}>
            <Text numberOfLines={1} style={[styles.subject, styles.historySubject]}>{row.commit.subject}</Text>
            {!!row.commit.refs.length && <View style={styles.refs}>{row.commit.refs.map(ref =>
              <Text key={ref} numberOfLines={1} style={styles.ref}>{ref}</Text>)}</View>}
          </View>
          <View style={styles.historyMetadata}>
            <Text style={[styles.meta, styles.historyHash]}>{row.commit.hash.slice(0, 8)}</Text>
            <Text numberOfLines={1} style={[styles.meta, styles.fill]}>{row.commit.author}</Text>
            <Text numberOfLines={1} style={styles.meta}>{
              new Date(row.commit.date).toLocaleString(getLocale(), GIT_HISTORY_DATE_FORMAT)}</Text>
          </View>
        </View>
      </Pressable>)}</View>
    </ScrollView>
    {panel.hasMore && <Pressable accessibilityRole="button" style={styles.button} disabled={panel.busy || !connected}
      onPress={() => void panel.more()}><Text style={styles.buttonText}>{t("加载更多提交")}</Text></Pressable>}
  </ScrollView>;
}
