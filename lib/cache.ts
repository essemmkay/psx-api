const TTL_SECONDS = 300; // 5 minutes

const memoryStore = new Map<string, { value: unknown; expires: number }>();

function getCacheOrMemory(): { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, opts: { ttl: number }) => Promise<void> } {
  try {
    const { getCache } = require("@vercel/functions");
    const cache = getCache();
    if (cache && typeof cache.get === "function") return cache;
  } catch {
    // not on Vercel or getCache unavailable
  }
  return {
    async get(key: string) {
      const entry = memoryStore.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expires) {
        memoryStore.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key: string, value: unknown, opts: { ttl: number }) {
      memoryStore.set(key, { value, expires: Date.now() + opts.ttl * 1000 });
    },
  };
}

const cache = getCacheOrMemory();

export async function getCached<T>(key: string): Promise<T | undefined> {
  const value = await cache.get(key);
  return value as T | undefined;
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await cache.set(key, value, { ttl: TTL_SECONDS });
}

export const cacheKeys = {
  indices: () => "indices",
  index: (symbol: string) => `indices:${symbol.toUpperCase()}`,
  stocks: () => "stocks",
  stock: (symbol: string) => `stocks:${symbol.toUpperCase()}`,
} as const;
