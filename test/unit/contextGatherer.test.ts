import { strict as assert } from 'assert';

// Mock vscode before importing module under test
import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { gatherContext } from '../../src/context/contextGatherer';
import type * as vscode from 'vscode';

/** Create a mock TextDocument from a string */
function createMockDocument(
  content: string,
  languageId = 'typescript',
  filePath = '/project/src/test.ts'
): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    lineCount: lines.length,
    languageId,
    uri: { fsPath: filePath, scheme: 'file', path: filePath },
    lineAt(line: number) {
      return { text: lines[line] ?? '' };
    },
    getText() {
      return content;
    },
  } as unknown as vscode.TextDocument;
}

function pos(line: number, character: number): vscode.Position {
  return { line, character } as unknown as vscode.Position;
}

describe('ContextGatherer', () => {
  describe('gatherContext()', () => {
    it('gathers prefix and suffix at middle of file', () => {
      const doc = createMockDocument(
        'line 0\nline 1\nline 2\nline 3\nline 4'
      );
      const ctx = gatherContext(doc, pos(2, 3), 100);

      assert.equal(ctx.prefix, 'line 0\nline 1\nlin');
      assert.equal(ctx.suffix, 'e 2\nline 3\nline 4');
      assert.equal(ctx.cursorLine, 2);
      assert.equal(ctx.cursorColumn, 3);
    });

    it('gathers context at start of file (line 0, col 0)', () => {
      const doc = createMockDocument('first\nsecond\nthird');
      const ctx = gatherContext(doc, pos(0, 0), 100);

      assert.equal(ctx.prefix, '');
      assert.equal(ctx.suffix, 'first\nsecond\nthird');
    });

    it('gathers context at end of file', () => {
      const doc = createMockDocument('first\nsecond\nthird');
      const ctx = gatherContext(doc, pos(2, 5), 100);

      assert.equal(ctx.prefix, 'first\nsecond\nthird');
      assert.equal(ctx.suffix, '');
    });

    it('gathers context at end of a middle line', () => {
      const doc = createMockDocument('aaa\nbbb\nccc');
      const ctx = gatherContext(doc, pos(1, 3), 100);

      assert.equal(ctx.prefix, 'aaa\nbbb');
      assert.equal(ctx.suffix, '\nccc');
    });

    it('handles single-line file', () => {
      const doc = createMockDocument('hello');
      const ctx = gatherContext(doc, pos(0, 3), 100);

      assert.equal(ctx.prefix, 'hel');
      assert.equal(ctx.suffix, 'lo');
    });

    it('handles empty file', () => {
      const doc = createMockDocument('');
      const ctx = gatherContext(doc, pos(0, 0), 100);

      assert.equal(ctx.prefix, '');
      assert.equal(ctx.suffix, '');
    });

    it('respects contextLines limit for prefix', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
      const doc = createMockDocument(lines.join('\n'));
      // Cursor at line 15, col 0, context window of 5 lines
      const ctx = gatherContext(doc, pos(15, 0), 5);

      // Prefix should only include lines 10-14 + empty start of line 15
      const prefixLines = ctx.prefix.split('\n');
      assert.equal(prefixLines.length, 6); // 5 before + cursor line partial
      assert.equal(prefixLines[0], 'line 10');
    });

    it('respects contextLines limit for suffix', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
      const doc = createMockDocument(lines.join('\n'));
      // Cursor at line 5, col 0, context window of 5 lines
      const ctx = gatherContext(doc, pos(5, 0), 5);

      // Suffix should include rest of line 5 + lines 6-10
      const suffixLines = ctx.suffix.split('\n');
      assert.equal(suffixLines.length, 6); // current line rest + 5 after
      assert.equal(suffixLines[suffixLines.length - 1], 'line 10');
    });

    it('extracts file metadata correctly', () => {
      const doc = createMockDocument(
        'code here',
        'python',
        '/home/user/project/main.py'
      );
      const ctx = gatherContext(doc, pos(0, 0), 100);

      assert.equal(ctx.language, 'python');
      assert.equal(ctx.fileName, 'main.py');
      assert.equal(ctx.filePath, '/home/user/project/main.py');
    });

    it('handles cursor at beginning of a non-first line', () => {
      const doc = createMockDocument('first\nsecond\nthird');
      const ctx = gatherContext(doc, pos(1, 0), 100);

      assert.equal(ctx.prefix, 'first\n');
      assert.equal(ctx.suffix, 'second\nthird');
    });

    it('handles file with blank lines', () => {
      const doc = createMockDocument('a\n\nb\n\nc');
      const ctx = gatherContext(doc, pos(2, 1), 100);

      assert.equal(ctx.prefix, 'a\n\nb');
      assert.equal(ctx.suffix, '\n\nc');
    });

    it('handles very long line with cursor in middle', () => {
      const longLine = 'x'.repeat(1000);
      const doc = createMockDocument(longLine);
      const ctx = gatherContext(doc, pos(0, 500), 100);

      assert.equal(ctx.prefix.length, 500);
      assert.equal(ctx.suffix.length, 500);
    });

    it('handles cursor at exact end of line (column = line length)', () => {
      const doc = createMockDocument('abc\ndef');
      const ctx = gatherContext(doc, pos(0, 3), 100);

      assert.equal(ctx.prefix, 'abc');
      assert.equal(ctx.suffix, '\ndef');
    });
  });
});
