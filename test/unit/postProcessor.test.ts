import { strict as assert } from 'assert';
import { postProcess, removePrefixOverlap, removeSuffixOverlap, normalizeIndentation } from '../../src/prompt/postProcessor';

describe('PostProcessor', () => {
  describe('postProcess()', () => {
    it('returns clean code as-is', () => {
      assert.equal(postProcess('console.log("hello")'), 'console.log("hello")');
    });

    it('returns null for empty string', () => {
      assert.equal(postProcess(''), null);
    });

    it('returns null for whitespace-only string', () => {
      assert.equal(postProcess('   \n  \n  '), null);
    });

    it('returns null for NO_COMPLETION marker', () => {
      assert.equal(postProcess('<NO_COMPLETION/>'), null);
    });

    it('returns null when NO_COMPLETION marker is surrounded by whitespace', () => {
      assert.equal(postProcess('  <NO_COMPLETION/>  '), null);
    });

    it('strips markdown code fences', () => {
      const input = '```typescript\nconsole.log("hello")\n```';
      assert.equal(postProcess(input), 'console.log("hello")');
    });

    it('strips code fences with no language specified', () => {
      const input = '```\nconst x = 1;\n```';
      assert.equal(postProcess(input), 'const x = 1;');
    });

    it('preserves multiline code inside fences', () => {
      const input = '```ts\nconst a = 1;\nconst b = 2;\n```';
      assert.equal(postProcess(input), 'const a = 1;\nconst b = 2;');
    });

    it('does not strip partial code fences', () => {
      const input = 'const x = ```';
      assert.equal(postProcess(input), 'const x = ```');
    });

    it('strips trailing explanation text', () => {
      const input = 'const x = 42;\nThis completes the variable assignment.';
      assert.equal(postProcess(input), 'const x = 42;');
    });

    it('strips trailing explanation starting with "Here"', () => {
      const input = 'return result;\nHere we return the result.';
      assert.equal(postProcess(input), 'return result;');
    });

    it('strips trailing explanation starting with "I"', () => {
      const input = 'x + y;\nI added the two values together.';
      assert.equal(postProcess(input), 'x + y;');
    });

    it('strips trailing explanation starting with "Note:"', () => {
      const input = 'foo();\nNote: This function has side effects.';
      assert.equal(postProcess(input), 'foo();');
    });

    it('strips multiple trailing explanation lines', () => {
      const input = 'const x = 1;\n\nThis sets x to 1.\nNote: It is a constant.';
      assert.equal(postProcess(input), 'const x = 1;');
    });

    it('strips trailing comment-style explanation', () => {
      const input = 'x = 5;\n// This completes the assignment';
      assert.equal(postProcess(input), 'x = 5;');
    });

    it('preserves inline comments that are part of code', () => {
      const input = 'const x = 5; // important value';
      assert.equal(postProcess(input), 'const x = 5; // important value');
    });

    it('trims leading empty lines', () => {
      const input = '\n\nconst x = 1;';
      assert.equal(postProcess(input), 'const x = 1;');
    });

    it('trims trailing empty lines', () => {
      const input = 'const x = 1;\n\n';
      assert.equal(postProcess(input), 'const x = 1;');
    });

    it('preserves internal empty lines', () => {
      const input = 'const x = 1;\n\nconst y = 2;';
      assert.equal(postProcess(input), 'const x = 1;\n\nconst y = 2;');
    });

    it('handles combined: fences + explanation + whitespace', () => {
      const input = '```python\ndef hello():\n    pass\n```\nThis defines a hello function.';
      assert.equal(postProcess(input), 'def hello():\n    pass');
    });

    it('preserves indentation in multiline completions', () => {
      const input = '    if (x > 0) {\n        return x;\n    }';
      assert.equal(postProcess(input), '    if (x > 0) {\n        return x;\n    }');
    });
  });

  describe('removeSuffixOverlap()', () => {
    it('removes overlapping suffix', () => {
      assert.equal(removeSuffixOverlap('return x;\n}', '\n}'), 'return x;');
    });

    it('returns completion unchanged when no overlap', () => {
      assert.equal(removeSuffixOverlap('return x;', '\nconst y = 1;'), 'return x;');
    });

    it('handles single-character overlap', () => {
      assert.equal(removeSuffixOverlap('hello)', ')'), 'hello');
    });

    it('handles full overlap (completion equals suffix start)', () => {
      assert.equal(removeSuffixOverlap('abc', 'abcdef'), '');
    });

    it('returns completion when suffix is empty', () => {
      assert.equal(removeSuffixOverlap('return x;', ''), 'return x;');
    });

    it('returns completion when completion is empty', () => {
      assert.equal(removeSuffixOverlap('', '\n}'), '');
    });

    it('handles multi-line overlap', () => {
      assert.equal(
        removeSuffixOverlap('x + y;\n  return result;\n}', '\n  return result;\n}'),
        'x + y;'
      );
    });

    it('removes single-char overlap when last char matches', () => {
      // 'b' at end of 'xab' matches 'b' at start of 'bay'
      assert.equal(removeSuffixOverlap('xab', 'bay'), 'xa');
    });

    it('does not remove when no chars match', () => {
      assert.equal(removeSuffixOverlap('xyz', 'abc'), 'xyz');
    });
  });

  describe('removePrefixOverlap()', () => {
    it('removes prefix that LLM repeated', () => {
      assert.equal(removePrefixOverlap('op.create_index(', '    op.'), 'create_index(');
    });

    it('removes full current line prefix', () => {
      assert.equal(removePrefixOverlap('This is a test', 'line1\nThis '), 'is a test');
    });

    it('returns completion unchanged when no overlap', () => {
      assert.equal(removePrefixOverlap('create_index(', '    op.'), 'create_index(');
    });

    it('handles empty prefix', () => {
      assert.equal(removePrefixOverlap('hello', ''), 'hello');
    });

    it('handles empty completion', () => {
      assert.equal(removePrefixOverlap('', 'some prefix'), '');
    });

    it('does not remove single-char overlap (too short to be reliable)', () => {
      assert.equal(removePrefixOverlap('x + y', 'const x'), 'x + y');
    });

    it('works with multi-line prefix (uses last line)', () => {
      assert.equal(removePrefixOverlap('result = getValue()', 'line1\nline2\nresult'), ' = getValue()');
    });
  });

  describe('normalizeIndentation()', () => {
    it('preserves indentation when file uses spaces (no-op)', () => {
      const completion = 'if (x) {\n    return x;\n}';
      assert.equal(normalizeIndentation(completion, '    ', false, 4), completion);
    });

    it('converts spaces to tabs when file uses tabs', () => {
      const completion = 'if (x) {\n    return x;\n}';
      const result = normalizeIndentation(completion, '\t', true, 4);
      assert.equal(result, 'if (x) {\n\treturn x;\n}');
    });

    it('converts tabs to spaces when file uses spaces', () => {
      const completion = 'if (x) {\n\treturn x;\n}';
      const result = normalizeIndentation(completion, '    ', false, 4);
      assert.equal(result, 'if (x) {\n    return x;\n}');
    });

    it('preserves LLM indentation depth (does not adjust levels)', () => {
      // LLM returns 8-space indented args — normalizer should NOT change this
      const completion = 'op.create_index(\n        op.f("name"),\n    )';
      const result = normalizeIndentation(completion, '    ', false, 4);
      assert.equal(result, completion);
    });
  });
});
