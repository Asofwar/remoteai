/** Account, balance and device details formatted on the host for remote clients. */
export const remoteHostDataEnglish: Readonly<Record<string, string>> = {
  '剩余额度 不限额': 'Remaining quota: unlimited',
  '剩余额度 暂无余额': 'Remaining quota: no data',
  '钱包余额 暂无余额': 'Wallet balance: no data',
  '剩余额度 {amount}': 'Remaining quota: {amount}',
  '钱包余额 {amount}': 'Wallet balance: {amount}',
  '正在查询余额…': 'Checking balance…',
  '余额暂不可用': 'Balance temporarily unavailable',
  '{plan} · 主剩余 {primary} · 次剩余 {secondary}': '{plan} · Remaining: primary {primary}, secondary {secondary}',
  '其他设备': 'Other device',
};

export const remoteHostDataRussian: Readonly<Record<string, string>> = {
  '剩余额度 不限额': 'Остаток лимита: без ограничений',
  '剩余额度 暂无余额': 'Остаток лимита: нет данных',
  '钱包余额 暂无余额': 'Баланс кошелька: нет данных',
  '剩余额度 {amount}': 'Остаток лимита: {amount}',
  '钱包余额 {amount}': 'Баланс кошелька: {amount}',
  '正在查询余额…': 'Запрос баланса…',
  '余额暂不可用': 'Баланс временно недоступен',
  '{plan} · 主剩余 {primary} · 次剩余 {secondary}': '{plan} · Остаток: основной {primary}, второй {secondary}',
  '其他设备': 'Другое устройство',
};
