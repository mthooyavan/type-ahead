import { strict as assert } from 'assert';
import { matchesAnyPattern } from '../../src/utils/globMatcher';

describe('globMatcher', () => {
  describe('matchesAnyPattern()', () => {
    it('returns false for empty patterns', () => {
      assert.equal(matchesAnyPattern('/project/src/test.ts', []), false);
    });

    it('matches exact file name', () => {
      assert.equal(matchesAnyPattern('/project/.env', ['.env']), true);
      assert.equal(matchesAnyPattern('/project/.gitignore', ['.gitignore']), true);
    });

    it('does not match wrong file name', () => {
      assert.equal(matchesAnyPattern('/project/src/main.ts', ['.env']), false);
    });

    it('matches *.ext extension pattern', () => {
      assert.equal(matchesAnyPattern('/project/README.md', ['*.md']), true);
      assert.equal(matchesAnyPattern('/project/data.json', ['*.json']), true);
    });

    it('does not match wrong extension', () => {
      assert.equal(matchesAnyPattern('/project/main.ts', ['*.md']), false);
    });

    it('matches **/*.ext anywhere in path', () => {
      assert.equal(matchesAnyPattern('/project/src/deep/file.md', ['**/*.md']), true);
      assert.equal(matchesAnyPattern('/project/config.json', ['**/*.json']), true);
    });

    it('matches **/folder/** for folder anywhere in path', () => {
      assert.equal(matchesAnyPattern('/project/node_modules/lodash/index.js', ['**/node_modules/**']), true);
      assert.equal(matchesAnyPattern('/project/src/dist/bundle.js', ['**/dist/**']), true);
    });

    it('does not match folder pattern for unrelated path', () => {
      assert.equal(matchesAnyPattern('/project/src/main.ts', ['**/node_modules/**']), false);
    });

    it('matches **/name for file name anywhere', () => {
      assert.equal(matchesAnyPattern('/project/deep/Dockerfile', ['**/Dockerfile']), true);
    });

    it('matches path suffix', () => {
      assert.equal(matchesAnyPattern('/project/src/secret.ts', ['src/secret.ts']), true);
    });

    it('does not match partial path suffix', () => {
      assert.equal(matchesAnyPattern('/project/src/main.ts', ['other/main.ts']), false);
    });

    it('handles multiple patterns (matches any)', () => {
      const patterns = ['*.md', '*.json', '.env'];
      assert.equal(matchesAnyPattern('/project/README.md', patterns), true);
      assert.equal(matchesAnyPattern('/project/data.json', patterns), true);
      assert.equal(matchesAnyPattern('/project/.env', patterns), true);
      assert.equal(matchesAnyPattern('/project/main.ts', patterns), false);
    });

    it('handles Windows-style backslash paths', () => {
      assert.equal(matchesAnyPattern('C:\\project\\node_modules\\pkg\\index.js', ['**/node_modules/**']), true);
      assert.equal(matchesAnyPattern('C:\\project\\README.md', ['*.md']), true);
    });

    it('ignores empty/whitespace patterns', () => {
      assert.equal(matchesAnyPattern('/project/main.ts', ['', '  ', '*.md']), false);
    });
  });
});
