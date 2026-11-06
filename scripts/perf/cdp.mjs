export async function connect(target, timeoutMs = 15000) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;
  const fail = error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP 連線逾時')); }, timeoutMs);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('CDP 連線失敗')); };
  });
  socket.onclose = () => fail(new Error('CDP 已斷線'));
  socket.onerror = () => fail(new Error('CDP 連線錯誤'));
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}, timeout = timeoutMs) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} 逾時`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description || ''));
      return result.result.value;
  };
  return { send, evaluate,
    // Older Electron CDP corrupts some integer-valued doubles beyond int64. Transport JSON as text.
    evaluateJson: async expression => JSON.parse(await evaluate(`(async()=>JSON.stringify(await (${expression})))()`)),
    close: () => { fail(new Error('CDP 已關閉')); socket.close(); } };
}
