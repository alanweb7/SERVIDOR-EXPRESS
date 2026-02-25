import type { CacheProvider } from "./cache-provider.js";

type Entry = {
  value: unknown;
  expiresAt?: number;
};

export class InMemoryCacheProvider implements CacheProvider {
  private readonly data = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
