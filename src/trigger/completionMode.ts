/**
 * Detect whether the cursor position suggests a multi-line (block) completion
 * vs a single-line (inline) completion. Used to adjust the prompt.
 */
export type CompletionMode = 'inline' | 'block';

const BLOCK_OPENERS_BRACE = /\b(function|class|if|else|for|while|switch|try|catch|finally|do|interface|type|enum|namespace|module|export\s+default|export\s+class|export\s+function|export\s+interface|export\s+enum|async\s+function)\b.*\{\s*$/;
const BLOCK_OPENERS_COLON = /\b(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def)\b.*:\s*$/;
const ARROW_FUNCTION = /=>\s*\{\s*$/;
const EMPTY_BODY = /\{\s*\}?\s*$/;

export function detectCompletionMode(
  prefixLastLines: string,
  language: string
): CompletionMode {
  // Get the last non-empty line of the prefix
  const lines = prefixLastLines.split('\n');
  let lastLine = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      lastLine = lines[i].trimEnd();
      break;
    }
  }

  if (!lastLine) return 'inline';

  // Python: after `def foo():` or `class Foo:` or `if x:` etc.
  if (language === 'python' && BLOCK_OPENERS_COLON.test(lastLine)) {
    return 'block';
  }

  // C-style languages: after `function foo() {` or `if (x) {` etc.
  if (BLOCK_OPENERS_BRACE.test(lastLine)) {
    return 'block';
  }

  // Arrow function with open brace: `() => {`
  if (ARROW_FUNCTION.test(lastLine)) {
    return 'block';
  }

  // Empty body: `function foo() {}`  with cursor inside
  if (EMPTY_BODY.test(lastLine) && lastLine.includes('{')) {
    return 'block';
  }

  return 'inline';
}

export function getBlockHint(mode: CompletionMode): string {
  if (mode === 'block') {
    return '\nThe cursor is at the start of a code block. Generate the complete block body with proper indentation.';
  }
  return '';
}
