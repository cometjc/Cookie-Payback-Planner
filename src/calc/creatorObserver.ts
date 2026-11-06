/** Observes a trusted two-stage creator; does not certify data purity. */
export function observeCreatorLaunch<T>(game: any, owner: any, expectedSource: string, run: () => T) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'launch');
  const launch = descriptor?.value;
  const normalize = (source: string) => source.replace(/\r\n/g, '\n').trim();
  if (!descriptor || typeof launch !== 'function' || !descriptor.writable || !descriptor.configurable
    || normalize(Function.prototype.toString.call(launch)) !== normalize(expectedSource)) {
    return {value: run(), ownerOf: () => undefined};
  }
  const initial = new Map([[game, Object.getOwnPropertyDescriptor(game, 'hasGod')], [owner, Object.getOwnPropertyDescriptor(owner, 'init')]]);
  if ([...initial].some(([object, d]) => d ? !('value' in d) || !d.configurable || !d.writable
    : (object === game ? 'hasGod' : 'init') in object || !Object.isExtensible(object))) {
    return {value: run(), ownerOf: () => undefined};
  }
  const initOwners = new WeakMap<Function, any>(), helperOwners = new WeakMap<Function, any>(), frames: any[] = [], watches: Array<() => void> = [];
  let wrapper: Function, observing = true;
  let setterFactory: any, wrapperFactory: any;
  try {
    setterFactory = new Function('record', 'return function(value){record(value,arguments.callee.caller);}');
    wrapperFactory = new Function('launch', 'before', 'after', 'return function(){before(this);try{return launch.apply(this,arguments);}finally{after();}}');
  } catch { return {value: run(), ownerOf: () => undefined}; }
  const sameDescriptor = (actual: PropertyDescriptor | undefined, expected: PropertyDescriptor) => actual && Object.keys(actual).length === Object.keys(expected).length
    && Object.keys(expected).every(key => (actual as any)[key] === (expected as any)[key]);
  const watch = (object: any, key: string, record: (next: any, caller: any) => void) => {
    const before = initial.get(object);
    let value = before?.value, written = false;
    const get = () => value;
    // Non-strict accessors expose the direct caller; strict/unsupported callers fail closed.
    const set = setterFactory((next: any, caller: any) => {
      value = next; written = true; record(next, caller);
    });
    const installed = {configurable: true, enumerable: before?.enumerable ?? true, get, set};
    Object.defineProperty(object, key, installed);
    watches.push(() => {
      const current = Object.getOwnPropertyDescriptor(object, key);
      if (!sameDescriptor(current, installed)) return;
      if (!before && !written) delete object[key];
      else Object.defineProperty(object, key, {...(before || {configurable: true, enumerable: true, writable: true}), value});
    });
  };
  wrapper = wrapperFactory(
    launch, (target: any) => frames.push(target), () => frames.pop());
  let value: T | undefined, failed = false, failure: unknown;
  const errors: unknown[] = [];
  try {
    watch(owner, 'init', (fn, caller) => {
      if (!observing) return;
      let direct = false;
      try { direct = caller === launch && caller.caller === wrapper && frames[frames.length - 1] === owner; } catch { /* Unsupported caller. */ }
      if (direct && typeof fn === 'function') initOwners.set(fn, owner);
    });
    watch(game, 'hasGod', (fn, caller) => {
      if (!observing) return;
      const bound = initOwners.get(caller);
      if (bound && typeof fn === 'function') helperOwners.set(fn, bound);
    });
    Object.defineProperty(owner, 'launch', {...descriptor, value: wrapper});
    value = run();
  } catch (error) {
    failed = true; failure = error;
  } finally {
    observing = false;
    for (const restore of [() => {
      if (sameDescriptor(Object.getOwnPropertyDescriptor(owner, 'launch'), {...descriptor, value: wrapper})) {
        Object.defineProperty(owner, 'launch', descriptor);
      }
    }, ...watches.reverse()]) {
      try { restore(); } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw Object.assign(new Error('Creator observer cleanup failed'), {errors, cause: failure});
  if (failed) throw failure;
  return {value: value as T, ownerOf: (fn: any) => helperOwners.get(fn)};
}
