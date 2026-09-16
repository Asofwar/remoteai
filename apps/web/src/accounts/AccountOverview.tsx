import { Button } from 'antd-mobile';
import { Clock3, Eye, EyeOff, Laptop, Plus, RefreshCw, Users } from 'lucide-react';
import { displayDate } from './formatters';

export function AccountOverview({ count, online, privateMode, refreshing, updatedAt, onPrivacy, onRefresh, onAdd }: {
  count: number; online: number; privateMode: boolean; refreshing: boolean; updatedAt: number | null;
  onPrivacy: () => void; onRefresh: () => void; onAdd: () => void;
}) {
  return <>
    <section className="accounts-overview">
      <header><h1>账户管理</h1><button className="icon-button" type="button" onClick={onPrivacy}
        aria-label={privateMode ? '显示账号邮箱' : '隐藏账号邮箱'} aria-pressed={privateMode}>
        {privateMode ? <EyeOff size={20} /> : <Eye size={20} />}</button></header>
      <div className="accounts-overview-stats">
        <div><Users size={26} /><span><b>{count}</b><small>个账号</small></span></div>
        <div><Laptop size={26} /><span><b>{online}</b><small>在线设备</small></span></div>
        <Button color="primary" loading={refreshing} disabled={!count || refreshing} onClick={onRefresh}
          aria-label="批量刷新用量">
          <RefreshCw size={18} /><span>批量刷新用量</span></Button>
      </div>
    </section>
    <div className="accounts-toolbar"><span><Clock3 size={16} />用量更新：
      {updatedAt ? displayDate(new Date(updatedAt).toISOString()) : '未刷新'}</span>
      <Button fill="none" color="primary" onClick={onAdd}><Plus size={20} />添加账户</Button>
    </div>
  </>;
}
