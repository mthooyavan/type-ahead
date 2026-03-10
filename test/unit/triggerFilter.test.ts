import { strict as assert } from 'assert';

import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { shouldTrigger } from '../../src/trigger/triggerFilter';
import type * as vscode from 'vscode';

function makeDoc(lines: string[]): vscode.TextDocument {
  return {
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
  } as unknown as vscode.TextDocument;
}

function pos(line: number, character: number): vscode.Position {
  return { line, character } as unknown as vscode.Position;
}

describe('triggerFilter', () => {
  describe('shouldTrigger()', () => {
    it('triggers on normal code', () => {
      assert.equal(shouldTrigger(makeDoc(['const x = ']), pos(0, 10)), true);
    });

    it('triggers inside function call', () => {
      assert.equal(shouldTrigger(makeDoc(['console.log(']), pos(0, 12)), true);
    });

    it('triggers on partial identifier', () => {
      assert.equal(shouldTrigger(makeDoc(['const result = getUs']), pos(0, 19)), true);
    });

    it('triggers on single character (relaxed)', () => {
      assert.equal(shouldTrigger(makeDoc(['  {']), pos(0, 3)), true);
    });

    it('triggers on empty line (may want block completion)', () => {
      assert.equal(shouldTrigger(makeDoc(['    ']), pos(0, 4)), true);
    });

    it('triggers after comma (useful in arg lists)', () => {
      assert.equal(shouldTrigger(makeDoc(['  a,']), pos(0, 4)), true);
    });

    it('triggers on cursor at start of empty line', () => {
      assert.equal(shouldTrigger(makeDoc(['']), pos(0, 0)), true);
    });

    // Still skip after structural closing chars
    it('skips after closing brace', () => {
      assert.equal(shouldTrigger(makeDoc(['  }']), pos(0, 3)), false);
    });

    it('skips after closing paren', () => {
      assert.equal(shouldTrigger(makeDoc(['  )']), pos(0, 3)), false);
    });

    it('skips after closing bracket', () => {
      assert.equal(shouldTrigger(makeDoc(['  ]']), pos(0, 3)), false);
    });

    it('skips after semicolon', () => {
      assert.equal(shouldTrigger(makeDoc(['const x = 1;']), pos(0, 12)), false);
    });
  });
});
