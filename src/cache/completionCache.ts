import { LRUCache } from 'lru-cache';

export class CompletionCache {
  private cache: LRUCache<string, string>;

  constructor(maxSize: number) {
    this.cache = new LRUCache<string, string>({ max: maxSize > 0 ? maxSize : 1 });
  }

  /**
   * Generate a cache key from the completion context.
   * The key is based on file path, cursor position, and surrounding code.
   */
  static makeKey(filePath: string, prefix: string, suffix: string): string {
    // Use last N characters of prefix and first N of suffix for the key
    // This provides good cache hit rates without storing huge keys
    const prefixTail = prefix.slice(-200);
    const suffixHead = suffix.slice(0, 100);
    return `${filePath}::${prefixTail}::${suffixHead}`;
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
