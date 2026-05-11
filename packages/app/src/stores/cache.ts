const _stores = new Map<string, unknown>();

export function readCache<T>(key: string): T | undefined {
  return _stores.get(key) as T | undefined;
}

export function writeCache<T>(key: string, data: T): void {
  _stores.set(key, data);
}

export function hasCache(key: string): boolean {
  return _stores.has(key);
}

export function clearCache(key: string): void {
  _stores.delete(key);
}
