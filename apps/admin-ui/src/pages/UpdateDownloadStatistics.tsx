import { Alert, Button, Card, Drawer, Select, Space, Table, Tag, Typography } from 'antd';
import { useI18n } from '../i18n-context';
import { useUpdateDownloadStatistics, type DailyDownloads, type FailureReport } from '../hooks/useUpdateDownloadStatistics';
import type { UpdateSharingSettingsProps } from '../hooks/useUpdateSharingSettings';

const labels: Record<string, [string, string]> = {
  peer: ['设备共享', 'Device sharing'], server: ['服务器', 'Server'], origin: ['官方下载', 'Official download'],
  download: ['整包下载', 'Package download'], lookup: ['查找共享设备', 'Peer lookup'],
  connect: ['建立连接', 'Connection'], transfer: ['传输', 'Transfer'], verify: ['完整性校验', 'Verification'],
  storage: ['文件保存', 'File storage'], policy: ['下载限制', 'Download policy'],
  unavailable: ['暂不可用或连接中断', 'Unavailable or interrupted'], invalid: ['数据校验失败', 'Invalid data'],
  io: ['文件读写失败', 'File access failed'], network: ['网络连接失败', 'Network failure'],
  timeout: ['连接超时', 'Timed out'],
};

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

export function UpdateDownloadStatistics({ api }: Pick<UpdateSharingSettingsProps, 'api'>) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const state = useUpdateDownloadStatistics(api);
  const label = (value: string) => labels[value]?.[zh ? 0 : 1] ?? value;
  const error = <Alert type="error" showIcon message={zh
    ? '下载统计加载失败，请重试。' : 'Unable to load download statistics. Please retry.'} />;
  return <Card title={zh ? '每日下载统计' : 'Daily download statistics'} extra={<Space wrap>
    <Select aria-label={zh ? '统计范围' : 'Date range'} value={state.days} onChange={state.setDays}
      options={[7, 30, 90].map(value => ({ value, label: zh ? `近 ${value} 天` : `Last ${value} days` }))} />
    <Button onClick={state.reload} disabled={state.daily.loading}>{zh ? '刷新' : 'Refresh'}</Button>
  </Space>}>
    <Typography.Paragraph type="secondary">{zh
      ? '按北京时间统计。完整下载并通过校验后计入成功次数，服务器下载用户每天按账号去重。'
        + '混合下载分别计入参与来源；流量为本次下载的有效数据，包含未完成下载，不含本地缓存和重复分块。'
      : 'Dates use Beijing time. Success requires a complete, verified download. Server users are counted once per '
        + 'account per day. Mixed downloads count for each contributing source. Traffic includes accepted data from '
        + 'unfinished downloads, excluding local cache and duplicate blocks.'}</Typography.Paragraph>
    {state.daily.failed && error}
    <Table<DailyDownloads> rowKey="date" size="small" loading={state.daily.loading}
      dataSource={state.daily.data?.items ?? []} pagination={{ pageSize: 15, showSizeChanger: false }}
      scroll={{ x: 1050 }} columns={[
        { title: zh ? '日期' : 'Date', dataIndex: 'date', width: 120 },
        { title: zh ? '共享下载成功次数' : 'Shared downloads', dataIndex: 'peerDownloads' },
        { title: zh ? '服务器下载成功次数' : 'Server downloads', dataIndex: 'serverDownloads' },
        { title: zh ? '服务器下载用户数' : 'Server users', dataIndex: 'serverUsers' },
        { title: zh ? '共享下载流量' : 'Shared traffic', dataIndex: 'peerBytes', render: bytes },
        { title: zh ? '服务器下载流量' : 'Server traffic', dataIndex: 'serverBytes', render: bytes },
        { title: zh ? '未完成次数' : 'Unfinished', dataIndex: 'failedDownloads' },
        { title: zh ? '失败日志' : 'Failure logs', dataIndex: 'reportsWithFailures',
          render: (count: number, row) => <Button type="link" disabled={!count}
            onClick={() => state.showFailures(row.date)}>{count}</Button> },
      ]} />
    <Drawer title={`${state.date ?? ''} · ${zh ? '失败日志' : 'Failure logs'}`}
      open={state.date !== null} onClose={() => state.showFailures(null)} width={1000}>
      <Typography.Paragraph type="secondary">{zh
        ? '包含下载过程中失败后换源成功的记录。时间均为北京时间。'
        : 'Includes failures recovered by switching sources. All times use Beijing time.'}</Typography.Paragraph>
      {state.failures.failed && error}
      <Table<FailureReport> rowKey={row => `${row.userId}:${row.id}`} loading={state.failures.loading}
        dataSource={state.failures.data?.items ?? []} size="small" scroll={{ x: 850 }}
        pagination={{ current: state.page, pageSize: 20, total: state.failures.data?.total ?? 0,
          showSizeChanger: false, onChange: state.setPage }} columns={[
          { title: zh ? '时间' : 'Time', dataIndex: 'createdAt', width: 170,
            render: (value: string) => new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-GB',
              { timeZone: 'Asia/Shanghai', hour12: false }) },
          { title: zh ? '平台' : 'Platform', dataIndex: 'platform', width: 90 },
          { title: zh ? '用户' : 'User', dataIndex: 'userId', width: 150, ellipsis: true },
          { title: zh ? '下载结果' : 'Result', dataIndex: 'outcome', width: 110,
            render: (value: string) => <Tag color={value === 'success' ? 'green' : 'red'}>{value === 'success'
              ? (zh ? '已完成' : 'Completed') : (zh ? '未完成' : 'Unfinished')}</Tag> },
          { title: zh ? '原因' : 'Reason', dataIndex: 'failures',
            render: (failures: FailureReport['failures']) => <Space direction="vertical" size={2}>
              {failures.map((failure, index) => <span key={index}>{label(failure.source)} · {label(failure.stage)} ·{' '}
                {label(failure.code)} × {failure.count}</span>)}
            </Space> },
        ]} />
    </Drawer>
  </Card>;
}
