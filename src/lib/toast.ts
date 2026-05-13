// toast.ts — minimal toast/undo system.
//
// Usage:
//   import { toast, useToasts } from './lib/toast';
//   toast.show('Saved');
//   toast.undoable('Deleted job', { onUndo: () => restore(), durationMs: 5000 });
//
// A single <ToastHost /> instance lives in <App> and subscribes to the bus.

export type ToastKind = 'info' | 'error' | 'undo';

export interface IToastMessage {
    id: number;
    message: string;
    kind: ToastKind;
    expiresAt: number;
    onUndo?: () => void;
}

export interface IToastOptions {
    durationMs?: number;
}

export interface IToastUndoableOptions extends IToastOptions {
    onUndo?: () => void;
}

type ToastSubscriber = (queue: IToastMessage[]) => void;

let nextId = 1;
const subs = new Set<ToastSubscriber>();
let queue: IToastMessage[] = [];

function emit(): void {
    subs.forEach((s) => s([...queue]));
}

export function dismiss(id: number): void {
    const before = queue.length;
    queue = queue.filter((t) => t.id !== id);
    if (queue.length !== before) emit();
}

export const toast = {
    show(message: string, { durationMs = 2500 }: IToastOptions = {}): number {
        const id = nextId;
        nextId += 1;
        queue.push({
            id, message, kind: 'info', expiresAt: Date.now() + durationMs,
        });
        emit();
        setTimeout(() => dismiss(id), durationMs);
        return id;
    },
    error(message: string, { durationMs = 4000 }: IToastOptions = {}): number {
        const id = nextId;
        nextId += 1;
        queue.push({
            id, message, kind: 'error', expiresAt: Date.now() + durationMs,
        });
        emit();
        setTimeout(() => dismiss(id), durationMs);
        return id;
    },
    undoable(
        message: string,
        { onUndo, durationMs = 5000 }: IToastUndoableOptions = {},
    ): number {
        const id = nextId;
        nextId += 1;
        queue.push({
            id,
            message,
            kind: 'undo',
            expiresAt: Date.now() + durationMs,
            onUndo: () => { onUndo?.(); dismiss(id); },
        });
        emit();
        setTimeout(() => dismiss(id), durationMs);
        return id;
    },
};

export function subscribe(fn: ToastSubscriber): () => void {
    subs.add(fn);
    fn([...queue]);
    return () => { subs.delete(fn); };
}
