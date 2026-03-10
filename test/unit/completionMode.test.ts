import { strict as assert } from 'assert';
import { detectCompletionMode, getBlockHint } from '../../src/trigger/completionMode';

describe('completionMode', () => {
  describe('detectCompletionMode()', () => {
    // JavaScript/TypeScript block openers
    it('detects block after function declaration with {', () => {
      assert.equal(detectCompletionMode('function hello() {', 'typescript'), 'block');
    });

    it('detects block after async function {', () => {
      assert.equal(detectCompletionMode('async function fetch() {', 'typescript'), 'block');
    });

    it('detects block after class {', () => {
      assert.equal(detectCompletionMode('class MyClass {', 'typescript'), 'block');
    });

    it('detects block after if () {', () => {
      assert.equal(detectCompletionMode('  if (x > 0) {', 'javascript'), 'block');
    });

    it('detects block after for () {', () => {
      assert.equal(detectCompletionMode('  for (let i = 0; i < n; i++) {', 'typescript'), 'block');
    });

    it('detects block after arrow function {', () => {
      assert.equal(detectCompletionMode('const fn = () => {', 'typescript'), 'block');
    });

    it('detects block after export function {', () => {
      assert.equal(detectCompletionMode('export function getData() {', 'typescript'), 'block');
    });

    it('detects block after export class {', () => {
      assert.equal(detectCompletionMode('export class Service {', 'typescript'), 'block');
    });

    it('detects block after interface {', () => {
      assert.equal(detectCompletionMode('interface Props {', 'typescript'), 'block');
    });

    // Python block openers
    it('detects block after def foo():', () => {
      assert.equal(detectCompletionMode('def hello():', 'python'), 'block');
    });

    it('detects block after class Foo:', () => {
      assert.equal(detectCompletionMode('class MyClass:', 'python'), 'block');
    });

    it('detects block after if x:', () => {
      assert.equal(detectCompletionMode('  if x > 0:', 'python'), 'block');
    });

    it('detects block after async def:', () => {
      assert.equal(detectCompletionMode('async def fetch():', 'python'), 'block');
    });

    it('detects block after for x in y:', () => {
      assert.equal(detectCompletionMode('  for item in items:', 'python'), 'block');
    });

    // Inline cases
    it('returns inline for normal code', () => {
      assert.equal(detectCompletionMode('const x = ', 'typescript'), 'inline');
    });

    it('returns inline for partial expression', () => {
      assert.equal(detectCompletionMode('return getUser(', 'typescript'), 'inline');
    });

    it('returns inline for import statement', () => {
      assert.equal(detectCompletionMode('import { foo } from ', 'typescript'), 'inline');
    });

    it('returns inline for empty prefix', () => {
      assert.equal(detectCompletionMode('', 'typescript'), 'inline');
    });

    // Multi-line prefix (uses last non-empty line)
    it('uses last non-empty line of multi-line prefix', () => {
      const prefix = 'const x = 1;\n\nfunction hello() {';
      assert.equal(detectCompletionMode(prefix, 'typescript'), 'block');
    });

    it('detects block even with trailing whitespace line after opener', () => {
      const prefix = 'function hello() {\n  ';
      assert.equal(detectCompletionMode(prefix, 'typescript'), 'block');
    });

    it('returns inline when last non-empty line is normal code', () => {
      const prefix = 'const x = 1;\n  ';
      assert.equal(detectCompletionMode(prefix, 'typescript'), 'inline');
    });
  });

  describe('getBlockHint()', () => {
    it('returns hint for block mode', () => {
      const hint = getBlockHint('block');
      assert.ok(hint.includes('block body'));
    });

    it('returns empty string for inline mode', () => {
      assert.equal(getBlockHint('inline'), '');
    });
  });
});
