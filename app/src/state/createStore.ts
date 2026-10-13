import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
  use<U>(selector: (s: T) => U): U;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const store: Store<T> = {
    get: () => state,
    set(next) {
      const patch = typeof next === 'function' ? next(state) : next;
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    use(selector) {
      return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
    },
  };
  return store;
}
