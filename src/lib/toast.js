// toast.js — minimal toast/undo system.
//
// Usage:
//   import { toast, useToasts } from './lib/toast.js';
//   toast.show('Saved');
//   toast.undoable('Deleted job', { onUndo: () => restore(), durationMs: 5000 });
//
// A single <ToastHost /> instance lives in <App> and subscribes to the bus.

let nextId = 1;
const subs = new Set();
let queue = [];

function emit() {
  for (const s of subs) s([...queue]);
}

export const toast = {
  show(message, { durationMs = 2500 } = {}) {
    const id = nextId++;
    queue.push({ id, message, kind: 'info', expiresAt: Date.now() + durationMs });
    emit();
    setTimeout(() => dismiss(id), durationMs);
    return id;
  },
  error(message, { durationMs = 4000 } = {}) {
    const id = nextId++;
    queue.push({ id, message, kind: 'error', expiresAt: Date.now() + durationMs });
    emit();
    setTimeout(() => dismiss(id), durationMs);
    return id;
  },
  undoable(message, { onUndo, durationMs = 5000 } = {}) {
    const id = nextId++;
    queue.push({
      id, message, kind: 'undo',
      expiresAt: Date.now() + durationMs,
      onUndo: () => { onUndo?.(); dismiss(id); },
    });
    emit();
    setTimeout(() => dismiss(id), durationMs);
    return id;
  },
};

export function dismiss(id) {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) emit();
}

export function subscribe(fn) {
  subs.add(fn);
  fn([...queue]);
  return () => subs.delete(fn);
}
