import { useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { Button, Dialog, Empty, Input, PullToRefresh, SpinLoading, Toast } from 'antd-mobile';
import { ListFilter, Plus, QrCode, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { TotpEntry } from '../types';
import type { useTotpVault } from '../useTotpVault';
import { selectTotpEntries, type TotpSortOrder } from '../../../native/src/totp/entryList';
import { TotpCodeCard } from '../totp/TotpCodeCard';
import { TotpForm } from '../totp/TotpForm';
import { useTotpCodes } from '../totp/useTotpCodes';
import '../totp/styles.css';

const SORT_OPTIONS = [{ key: 'default', label: '默认顺序' }, { key: 'name', label: '按服务名称' },
  { key: 'newest', label: '最近添加优先' }];
const REFRESH_TEXT = { pulling: '下拉同步', canRelease: '释放立即同步', refreshing: '正在同步…', complete: '同步完成' };

export function TotpPage({ manager }: { manager: ReturnType<typeof useTotpVault> }) {
  const [form, setForm] = useState<{ entry: TotpEntry | null; scanFirst: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TotpSortOrder>('default');
  const refreshing = useRef(false);
  const entries = useMemo(() => selectTotpEntries(manager.entries, query, sort), [manager.entries, query, sort]);
  const { codes, now } = useTotpCodes(manager.entries);
  const refresh = async () => {
    if (refreshing.current || manager.syncing || !manager.initialized) return;
    refreshing.current = true;
    try {
      const result = await manager.refreshCloud();
      const messages = { empty: '云端暂无 2FA 密钥', current: '2FA 密钥已是最新', updated: '已获取云端 2FA 密钥' };
      Toast.show({ content: messages[result] });
    } catch { Toast.show({ icon: 'fail', content: '获取云端 2FA 密钥失败，请重试' }); }
    finally { refreshing.current = false; }
  };
  const remove = async (entry: TotpEntry) => {
    const confirmed = await Dialog.confirm({ title: '删除 2FA 密钥？',
      content: `确定删除“${entry.issuer}”的密钥吗？`, confirmText: '删除', cancelText: '取消' });
    if (confirmed) manager.deleteEntry(entry.id);
  };
  return <>
    <PullToRefresh onRefresh={refresh} renderText={status => REFRESH_TEXT[status]}>
      <div className="page-body verification-page">
        <header className="verification-heading"><div><h1>2FA 验证码</h1>
          <p>同步云端密钥，点击验证码即可复制</p></div><ShieldCheck size={82} aria-hidden="true" /></header>
        <div className="verification-actions">
          <Button onClick={() => setForm({ entry: null, scanFirst: false })}><Plus size={22} />手动添加</Button>
          <Button color="primary" onClick={() => setForm({ entry: null, scanFirst: true })}>
            <QrCode size={22} />扫码添加</Button>
        </div>
        <div className="verification-toolbar"><label className="verification-search"><Search size={20} />
          <Input value={query} onChange={setQuery} aria-label="搜索服务名称或账号" placeholder="搜索服务名称或账号" clearable />
        </label><Dropdown trigger={['click']} menu={{ selectable: true, selectedKeys: [sort], items: SORT_OPTIONS,
          onClick: ({ key }) => setSort(key as TotpSortOrder) }}>
          <button className="icon-button" type="button" aria-label="验证码排序"><ListFilter size={23} /></button>
        </Dropdown><button className="icon-button" type="button" aria-label="同步 2FA 密钥"
          disabled={manager.syncing || !manager.initialized} onClick={() => void refresh()}>
          <RefreshCw size={20} className={manager.syncing ? 'spin' : ''} /></button></div>
        {!manager.initialized ? <div className="page-loading"><SpinLoading /><span>正在读取 2FA 密钥</span></div>
          : !entries.length ? <div className="verification-empty"><Empty
            description={manager.entries.length ? '没有找到匹配的账号' : '还没有 2FA 密钥'} />
            <p>{manager.entries.length ? '试试其他服务名称或账号，或清空搜索查看全部。'
              : '扫描二维码或手动输入密钥，即可生成动态验证码。'}</p></div>
            : <div className="verification-grid">{entries.map(entry => <TotpCodeCard key={entry.id} entry={entry}
              code={codes[entry.id] ?? ''} now={now} onEdit={() => setForm({ entry, scanFirst: false })}
              onDelete={() => void remove(entry)} />)}</div>}
      </div>
    </PullToRefresh>
    {form && <TotpForm {...form} onSave={manager.saveEntry} onClose={() => setForm(null)} />}
  </>;
}
