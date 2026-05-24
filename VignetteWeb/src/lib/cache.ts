import { redis } from "@/lib/redis";

type CacheValue<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheValue<unknown>>();
const REDIS_CACHE_TIMEOUT_MS = Number(process.env.REDIS_CACHE_TIMEOUT_MS || "150");

const withTimeout = async <T>(promise: Promise<T>, fallback: T) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), REDIS_CACHE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const getCachedValue = async <T>(key: string) => {
  const memoryValue = memoryCache.get(key);

  if (memoryValue && memoryValue.expiresAt > Date.now()) {
    return memoryValue.value as T;
  }

  if (memoryValue) {
    memoryCache.delete(key);
  }

  if (!redis) return null;

  try {
    return await withTimeout(redis.get<T>(key), null);
  } catch {
    return null;
  }
};

export const setCachedValue = async <T>(key: string, value: T, ttlSeconds: number) => {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });

  if (!redis) return;

  void redis.set(key, value, { ex: ttlSeconds }).catch(() => undefined);
};
