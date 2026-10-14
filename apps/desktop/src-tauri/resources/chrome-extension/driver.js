import { authorize, assertRunning } from './permissions.js';
import { createFrameSessions } from './frame-sessions.js';
import { markControlledTab, clearControlledTabs } from './tab-indicator.js';
import { prepareBackgroundPage, restoreBackgroundPage, settleRendering } from './rendering.js';
import { acquireConnection, assertConnected, closeConnection, releaseConnection,
  stopConnections } from './debugger-connections.js';
import { queueTarget } from './target-queue.js';

export function withTab(context, args, operation, options = {}) {
  return queueTarget({ tabId: args.tabId }, () => run(context, args, operation, options));
}

async function run(context, args, operation, { prepareInput = true }) {
  const tab = await chrome.tabs.get(args.tabId);
  await authorize(tab.url, context.clientId, context.signal);
  const target = { tabId: tab.id };
  const connection = await acquireConnection(target, context.signal, context.clientId).catch(() => {
    assertRunning(context.signal);
    throw new Error('无法连接这个标签页。请关闭其开发者工具或其他浏览器控制工具后重试。');
  });
  // Detaching also releases commands held open by a page dialog when the user cancels.
  const abort = () => { void closeConnection(connection); };
  context.signal?.addEventListener('abort', abort, { once: true });
  if (context.signal?.aborted) abort();
  const guard = async (options) => {
    assertRunning(context.signal);
    assertConnected(connection);
    const current = await chrome.tabs.get(tab.id);
    await authorize(current.url, context.clientId, context.signal, options);
  };
  const sessions = createFrameSessions(target, guard);
  let viewportOverridden = false;
  try {
    await guard();
    // Log reads need no focus emulation, viewport changes or page JavaScript execution.
    if (prepareInput) viewportOverridden = await prepareBackgroundPage({ tab, send: sessions.send });
    await markControlledTab(tab.id);
    await sessions.initialize();
    const driver = { tab, send: sessions.send, documents: sessions.documents, listen: sessions.listen, context, guard,
      debuggee: sessions.debuggee, relatedFrames: sessions.relatedFrames };
    const result = await operation(driver);
    if (prepareInput) await settleRendering(driver);
    await guard();
    return result;
  } finally {
    const cleaned = await sessions.dispose();
    const restored = !prepareInput || await restoreBackgroundPage(target, viewportOverridden);
    // A stale reference or a wait timeout does not end the debugging task. Recheck access
    // before retaining the transport, even when the requested page action failed.
    const authorized = await guard({ prompt: false }).then(() => true, () => false);
    await releaseConnection(connection, authorized && cleaned && restored);
    context.signal?.removeEventListener('abort', abort);
  }
}

export async function stopDebugging() {
  await stopConnections();
  await clearControlledTabs();
}

export async function pageCall(driver, ref, functionDeclaration, args = []) {
  const resolved = await driver.send('DOM.resolveNode', { backendNodeId: ref.nodeId }, ref.frameId);
  const objectId = resolved.object.objectId;
  try {
    const response = await driver.send('Runtime.callFunctionOn', { objectId, functionDeclaration,
      arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true }, ref.frameId);
    if (response.exceptionDetails) throw new Error('页面内容已变化，或该元素不能完成此操作。请重新读取页面。');
    return response.result.value;
  } finally {
    await driver.send('Runtime.releaseObject', { objectId }, ref.frameId).catch(() => {});
  }
}
