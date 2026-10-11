import { type PersistStorage, type StorageValue } from "zustand/middleware";

const DEBOUNCE_MS = 300;
const pendingWrites = new Map<string, StorageValue<unknown>>();

let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let flushHandlersBound = false;

function flush() {
    if (pendingWrites.size === 0) {
        return;
    }

    for (const [name, value] of pendingWrites) {
        sessionStorage.setItem(name, JSON.stringify(value));
    }

    pendingWrites.clear();
}

function scheduleFlush(delay: number) {
    if (flushTimeout) {
        clearTimeout(flushTimeout);
    }

    flushTimeout = setTimeout(() => {
        flushTimeout = null;
        flush();
    }, delay);
}

/** Writes any debounced tree states to sessionStorage right away. */
export function flushPendingWrites() {
    if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
    }

    flush();
}

function bindFlushHandlers() {
    if (flushHandlersBound || typeof window === "undefined") {
        return;
    }

    window.addEventListener("beforeunload", flushPendingWrites);
    window.addEventListener("pagehide", flushPendingWrites);

    flushHandlersBound = true;
}

export function createDebouncedSessionStorage<S>(delay = DEBOUNCE_MS): PersistStorage<S> {
    bindFlushHandlers();

    return {
        getItem: (name) => {
            const pending = pendingWrites.get(name);
            if (pending) {
                return pending as StorageValue<S>;
            }

            const stored = sessionStorage.getItem(name);
            return stored ? (JSON.parse(stored) as StorageValue<S>) : null;
        },
        setItem: (name, value) => {
            pendingWrites.set(name, value as StorageValue<unknown>);
            scheduleFlush(delay);
        },
        removeItem: (name) => {
            pendingWrites.delete(name);
            sessionStorage.removeItem(name);
        },
    };
}
