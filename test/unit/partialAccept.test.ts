import { strict as assert } from 'assert';
import { extractNextWord, extractNextLine } from '../../src/partialAccept';

describe('partialAccept', () => {
  describe('extractNextWord()', () => {
    it('extracts first word', () => {
      assert.equal(extractNextWord('hello world'), 'hello');
    });

    it('includes leading whitespace', () => {
      assert.equal(extractNextWord('  hello world'), '  hello');
    });

    it('handles single word', () => {
      assert.equal(extractNextWord('return'), 'return');
    });

    it('handles punctuation as word boundary', () => {
      assert.equal(extractNextWord('x + y'), 'x');
    });

    it('returns empty for empty string', () => {
      assert.equal(extractNextWord(''), '');
    });

    it('handles symbols', () => {
      assert.equal(extractNextWord('=> {'), '=>');
    });

    it('handles dotted identifiers', () => {
      assert.equal(extractNextWord('console.log()'), 'console.log()');
    });
  });

  describe('extractNextLine()', () => {
    it('extracts first line including newline', () => {
      assert.equal(extractNextLine('first\nsecond\nthird'), 'first\n');
    });

    it('returns full text if no newline', () => {
      assert.equal(extractNextLine('just one line'), 'just one line');
    });

    it('handles empty first line', () => {
      assert.equal(extractNextLine('\nsecond'), '\n');
    });

    it('returns empty for empty string', () => {
      assert.equal(extractNextLine(''), '');
    });

    it('includes indentation', () => {
      assert.equal(extractNextLine('    return x;\n}'), '    return x;\n');
    });
  });
});
