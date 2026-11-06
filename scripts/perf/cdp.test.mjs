import assert from 'node:assert/strict';
import vm from 'node:vm';
import {connect} from './cdp.mjs';
const OriginalWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class {
  constructor() {queueMicrotask(() => this.onopen());}
  send(input) {
    const {id, params} = JSON.parse(input);
    Promise.resolve(vm.runInNewContext(params.expression)).then(value => {
      this.onmessage({data: JSON.stringify({id, result: {result: {value}}})});
    });
  }
  close() {this.onclose?.();}
};
try {
  const c = await connect({webSocketDebuggerUrl: 'ws://localhost/test'});
  try {
    const value = await c.evaluateJson('Promise.resolve({large:9223372036854776000,items:[1,2]})');
    assert.equal(value.large, 9223372036854776000); assert.deepEqual(value.items, [1,2]);
    assert.equal(await c.evaluateJson('null'), null);
    assert.equal(await c.evaluate('1+1'), 2);
  } finally {c.close();}
} finally {globalThis.WebSocket = OriginalWebSocket;}
console.log('CDP JSON transport: awaited values, large doubles, null and legacy evaluation pass');
