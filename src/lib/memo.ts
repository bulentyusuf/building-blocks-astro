import { AsyncLocalStorage } from "node:async_hooks";

// Identical calls made inside one scope share one request. Outside a scope a
// call goes straight through, so nothing is ever held across requests by
// accident.
export type MemoStore = Map<unknown, Map<string, Promise<unknown>>>;

const scope = new AsyncLocalStorage<MemoStore>();

export function createMemoStore(): MemoStore {
  return new Map();
}

export function withMemo<T>(store: MemoStore, run: () => T): T {
  return scope.run(store, run);
}

export function memoise<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => {
    const store = scope.getStore();
    if (!store) return fn(...args);

    let calls = store.get(fn);
    if (!calls) store.set(fn, (calls = new Map()));

    const key = JSON.stringify(args);
    const earlier = calls.get(key) as Promise<R> | undefined;
    if (earlier) return earlier;

    const call = fn(...args);
    calls.set(key, call);
    // A failure is not remembered, so the next caller tries again.
    call.catch(() => calls.delete(key));
    return call;
  };
}
