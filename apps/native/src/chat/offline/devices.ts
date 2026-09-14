import { useEffect, useState } from 'react';
import type { AuthSession, RemoteDevice } from '../../types';
import { accountScope } from './store';
import { cacheTransaction, withCache } from './database';

const DEVICE_COUNT_LIMIT = 100;

export function readDevices(account: string) {
  return withCache(async (db) => {
    const rows = await db.getAllAsync<{ data: string }>(
      'SELECT data FROM devices WHERE account = ? ORDER BY touched DESC', account);
    return rows.map((row) => JSON.parse(row.data) as RemoteDevice);
  });
}

export function saveDevices(account: string, devices: RemoteDevice[]) {
  return withCache(async (db) => {
    await cacheTransaction(db, async (tx) => {
      for (const device of devices) {
        // Cache display metadata only; never copy account credentials or online state.
        const cached: RemoteDevice = { deviceId: device.deviceId, name: device.name, platform: device.platform,
          lastSeenAt: device.lastSeenAt, online: false, localProxyRunning: false, capabilities: [] };
        await tx.runAsync('INSERT OR REPLACE INTO devices (account, id, data, touched) VALUES (?, ?, ?, ?)',
          [account, device.deviceId, JSON.stringify(cached), Date.now()]);
      }
      await tx.runAsync(`DELETE FROM devices WHERE rowid NOT IN
        (SELECT rowid FROM devices ORDER BY touched DESC, rowid DESC LIMIT ?)`, DEVICE_COUNT_LIMIT);
    });
  });
}

export function useOfflineDevices(session: AuthSession, devices: RemoteDevice[]) {
  const account = accountScope(session);
  const [cached, setCached] = useState<{ account: string; devices: RemoteDevice[] }>();
  useEffect(() => {
    let active = true;
    void readDevices(account).then((saved) => { if (active) setCached({ account, devices: saved }); })
      .catch(() => { /* Live device discovery remains usable if local storage is unavailable. */ });
    return () => { active = false; };
  }, [account]);
  useEffect(() => {
    if (devices.length) void saveDevices(account, devices).catch(() => {
      /* The chat cache reports storage failures separately without blocking connection. */
    });
  }, [account, devices]);
  const saved = cached?.account === account ? cached.devices : [];
  return [...devices, ...saved.filter((device) => !devices.some((entry) => entry.deviceId === device.deviceId))];
}
