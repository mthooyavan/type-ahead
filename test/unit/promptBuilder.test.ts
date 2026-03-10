import { strict as assert } from 'assert';
import { buildPrompt, COMPLETION_SYSTEM_PROMPT } from '../../src/prompt/promptBuilder';
import { CodeContext } from '../../src/context/types';

function makeContext(overrides: Partial<CodeContext> = {}): CodeContext {
  return {
    prefix: 'function hello() {\n  const x = ',
    suffix: '\n}',
    language: 'typescript',
    fileName: 'test.ts',
    filePath: '/project/test.ts',
    cursorLine: 1,
    cursorColumn: 14,
    ...overrides,
  };
}

describe('PromptBuilder', () => {
  describe('COMPLETION_SYSTEM_PROMPT', () => {
    it('contains instructions for raw code output', () => {
      assert.ok(COMPLETION_SYSTEM_PROMPT.includes('raw code only'));
      assert.ok(COMPLETION_SYSTEM_PROMPT.includes('<CURSOR/>'));
      assert.ok(COMPLETION_SYSTEM_PROMPT.includes('<NO_COMPLETION/>'));
    });
  });

  describe('buildPrompt()', () => {
    it('includes file name and language', () => {
      const prompt = buildPrompt(makeContext());
      assert.ok(prompt.includes('File: test.ts (typescript)'));
    });

    it('includes prefix, cursor marker, and suffix', () => {
      const prompt = buildPrompt(makeContext({
        prefix: 'BEFORE',
        suffix: 'AFTER',
      }));
      assert.ok(prompt.includes('BEFORE<CURSOR/>AFTER'));
    });

    it('handles empty prefix', () => {
      const prompt = buildPrompt(makeContext({ prefix: '' }));
      assert.ok(prompt.includes('<CURSOR/>'));
      assert.ok(prompt.startsWith('File:'));
    });

    it('handles empty suffix', () => {
      const prompt = buildPrompt(makeContext({ suffix: '' }));
      assert.ok(prompt.includes('<CURSOR/>'));
      assert.ok(prompt.endsWith('<CURSOR/>'));
    });

    it('handles Python file', () => {
      const prompt = buildPrompt(makeContext({
        language: 'python',
        fileName: 'main.py',
      }));
      assert.ok(prompt.includes('File: main.py (python)'));
    });

    it('preserves multiline prefix and suffix', () => {
      const prompt = buildPrompt(makeContext({
        prefix: 'line1\nline2\nline3',
        suffix: 'line4\nline5',
      }));
      assert.ok(prompt.includes('line1\nline2\nline3<CURSOR/>line4\nline5'));
    });
  });
});
