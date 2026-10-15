import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PortMappings } from '../src/chat/portMapping/PortMappings';
import type { ForwardingClient } from '../../../shared/port-mapping/service';
import '../src/styles.css';
import { setActiveSession } from '../src/api';

const account = new URLSearchParams(location.search).get('sync');
if (account) setActiveSession({ baseUrl: location.origin, email: account,
  accessToken: account, refreshToken: 'fixture-only' });
const scope = account ? JSON.stringify([location.origin, account, 'fixture-device']) : 'port-mapping-fixture';

async function rpc<T>(body: object): Promise<T> {
  const response = await fetch('http://127.0.0.1:1496/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.value;
}
const client: ForwardingClient = {
  openResource: url => rpc({ operation: 'open', url }), closeResource: id => rpc({ operation: 'close', id }),
  link: (id, request) => rpc({ operation: 'link', id, request }),
};
function App() {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  return <main style={{ padding: 20 }}>
    <button onClick={() => setOpen(true)}>端口映射</button>
    <button onClick={() => setConnected(value => !value)}>{connected ? 'Disconnect fixture' : 'Reconnect fixture'}</button>
    <PortMappings client={client} scope={scope} connected={connected} active
      open={open} close={() => setOpen(false)} deviceName="测试电脑" />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
