import { strict as assert } from 'assert';
import { postProcess } from '../../src/prompt/postProcessor';

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
});
