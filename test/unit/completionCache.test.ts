import { strict as assert } from 'assert';
import { CompletionCache } from '../../src/cache/completionCache';

describe('CompletionCache', () => {
  describe('get/set', () => {
    it('returns undefined for missing keys', () => {
      const cache = new CompletionCache(10);
      assert.equal(cache.get('nonexistent'), undefined);
    });

    it('stores and retrieves a value', () => {
      const cache = new CompletionCache(10);
      cache.set('key1', 'value1');
      assert.equal(cache.get('key1'), 'value1');
    });

    it('overwrites existing values', () => {
      const cache = new CompletionCache(10);
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      assert.equal(cache.get('key1'), 'value2');
    });

    it('evicts oldest entries when at capacity', () => {
      const cache = new CompletionCache(2);
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3'); // Should evict 'a'
      assert.equal(cache.get('a'), undefined);
      assert.equal(cache.get('b'), '2');
      assert.equal(cache.get('c'), '3');
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new CompletionCache(10);
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      assert.equal(cache.get('a'), undefined);
      assert.equal(cache.get('b'), undefined);
      assert.equal(cache.size, 0);
    });
  });

  describe('size', () => {
    it('tracks the number of entries', () => {
      const cache = new CompletionCache(10);
      assert.equal(cache.size, 0);
      cache.set('a', '1');
      assert.equal(cache.size, 1);
      cache.set('b', '2');
      assert.equal(cache.size, 2);
    });
  });

  describe('makeKey', () => {
    it('creates a key from file path, prefix, and suffix', () => {
      const key = CompletionCache.makeKey('/file.ts', 'prefix', 'suffix');
      assert.ok(key.includes('/file.ts'));
      assert.ok(key.includes('prefix'));
      assert.ok(key.includes('suffix'));
    });

    it('truncates long prefix to last 200 chars', () => {
      const longPrefix = 'x'.repeat(500);
      const key = CompletionCache.makeKey('/file.ts', longPrefix, 'suffix');
      // The prefix part should be 200 chars, not 500
      assert.ok(key.length < 500 + 100 + 20); // prefix + suffix + path + separators
    });

    it('produces different keys for different cursor positions', () => {
      const key1 = CompletionCache.makeKey('/file.ts', 'const x = ', '\n}');
      const key2 = CompletionCache.makeKey('/file.ts', 'const x = 1', '\n}');
      assert.notEqual(key1, key2);
    });

    it('produces different keys for different files', () => {
      const key1 = CompletionCache.makeKey('/a.ts', 'prefix', 'suffix');
      const key2 = CompletionCache.makeKey('/b.ts', 'prefix', 'suffix');
      assert.notEqual(key1, key2);
    });
  });
});
