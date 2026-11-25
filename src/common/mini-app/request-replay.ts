const REPLAY_MS = 5 * 60 * 1000;
const REQUEST_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Reuse the same operation when a client loses the response and retries. */
export class RequestReplay {
    private readonly pending = new Map<string, Promise<unknown>>();

    run<T>(
        userId: string,
        requestId: string | undefined,
        execute: () => Promise<T>,
    ): Promise<T> {
        if (!requestId || !REQUEST_ID.test(requestId)) return execute();

        const key = `${userId}:${requestId}`;
        const existing = this.pending.get(key);
        if (existing) return existing as Promise<T>;

        const result = Promise.resolve().then(execute);
        this.pending.set(key, result);
        const expire = () => {
            setTimeout(() => this.pending.delete(key), REPLAY_MS).unref();
        };
        void result.then(expire, expire);
        return result;
    }
}
