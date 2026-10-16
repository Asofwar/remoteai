import { useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import { Checkbox } from 'antd';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useAppDispatch, useAppSelector } from '../hooks';
import { t, useLanguage } from '../i18n';
import { consumeQuota } from '../store';
import type { AccountSummary } from '../types';
import { maskEmail, remainingPercent, resetLabel } from './formatters';
import './quotaConsumption.css';

export function QuotaConsumptionSheet({ accounts, privateMode, deviceName, onClose }: {
  accounts: AccountSummary[]; privateMode: boolean; deviceName: string; onClose: () => void;
}) {
  useLanguage();
  const dispatch = useAppDispatch();
  const busy = useAppSelector(state => state.data.consumingQuota);
  const [selectedIds, setSelectedIds] = useState(() => accounts.map(account => account.id));
  const selected = accounts.filter(account => selectedIds.includes(account.id));
  const allSelected = selected.length === accounts.length;
  const close = () => { if (!busy) onClose(); };
  const confirm = async () => {
    if (busy || !selected.length) return;
    try {
      const result = await dispatch(consumeQuota(selected.map(account => account.id))).unwrap();
      Toast.show({ icon: result.failed ? 'fail' : 'success', content: result.failed
        ? t('已消耗 {count} 个账号，{failed} 个账号未完成全部操作，请查看用量。',
          { count: result.consumed, failed: result.failed })
        : t('已消耗 {count} 个账号的额度，用量已更新。', { count: result.consumed }) });
      onClose();
    } catch { /* The global toast reports connection failures. */ }
  };
  return <AdaptiveSheet open title={t('选择消耗额度的账号')} width={440}
    subtitle={t('已选择 {value1} / {value2} 个账号', { value1: selected.length, value2: accounts.length })}
    onClose={close}>
    <div className="quota-consumption">
      <div className="quota-consumption-notice">
        <strong>{t('此操作会产生真实用量')}</strong>
        <p>{t('将通过「{device}」向所选账号发送“今天天气如何？”，完成后更新用量。', { device: deviceName })}</p>
      </div>
      <Checkbox className="quota-select-all" checked={allSelected} disabled={busy}
        onChange={event => setSelectedIds(event.target.checked ? accounts.map(account => account.id) : [])}>
        {allSelected ? t('取消全选') : t('全选可用账号')}
      </Checkbox>
      <div className="quota-consumption-list">
        {accounts.map(account => {
          const remaining = remainingPercent(account.usage.primary?.remainingPercent);
          const email = privateMode ? maskEmail(account.email) : account.email;
          return <Checkbox key={account.id} checked={selectedIds.includes(account.id)} disabled={busy}
            onChange={event => setSelectedIds(ids => event.target.checked
              ? [...ids, account.id] : ids.filter(id => id !== account.id))}>
            <span className="quota-consumption-identity"><strong>{email}</strong>
              <small>{account.plan || 'ChatGPT'} · {remaining === null ? t('主额度暂不可用')
                : t('主额度剩余 {value1}%', { value1: remaining })}</small>
              <small>{resetLabel(account.usage.primary?.resetsAt)}</small></span>
          </Checkbox>;
        })}
      </div>
      <div className="quota-consumption-actions">
        <Button disabled={busy} onClick={close}>{t('取消')}</Button>
        <Button color="danger" disabled={busy || !selected.length} loading={busy} onClick={() => void confirm()}>
          {selected.length ? t('消耗所选 {value1} 个账号', { value1: selected.length }) : t('请先选择账号')}
        </Button>
      </div>
    </div>
  </AdaptiveSheet>;
}
