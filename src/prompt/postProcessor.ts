const NO_COMPLETION_MARKER = '<NO_COMPLETION/>';

/** Markdown code fence patterns — supports language tags like c++, objective-c, etc. */
const CODE_FENCE_START = /^```[\w.+-]*\s*$/;
const CODE_FENCE_END = /^```\s*$/;

/**
 * Clean raw model output into insertable code.
 * Returns null if the model produced no useful completion.
 */
export function postProcess(raw: string): string | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  let cleaned = raw;

  // Check for explicit no-completion marker
  if (cleaned.includes(NO_COMPLETION_MARKER)) {
    return null;
  }

  // Strip trailing explanation first (so code fences become the last line)
  cleaned = stripTrailingExplanation(cleaned);

  // Strip markdown code fences if the output is wrapped in them
  cleaned = stripCodeFences(cleaned);

  // Remove leading/trailing empty lines but preserve internal structure
  cleaned = trimEmptyLines(cleaned);

  if (cleaned.length === 0) {
    return null;
  }

  return cleaned;
}

/**
 * Remove overlap between the start of a completion and the end of the prefix.
 * Prevents duplicate code when the LLM repeats what the user already typed.
 * E.g., prefix ends with "op." and completion starts with "op.create_index("
 * → trim to "create_index("
 */
export function removePrefixOverlap(completion: string, prefix: string): string {
  if (!completion || !prefix) {
    return completion;
  }

  // Get the last line of the prefix (what the user typed on the current line)
  const lastNewline = prefix.lastIndexOf('\n');
  const currentLinePrefix = lastNewline >= 0 ? prefix.slice(lastNewline + 1) : prefix;
  const trimmedLinePrefix = currentLinePrefix.trimStart();

  if (!trimmedLinePrefix) {
    return completion;
  }

  // Check if the completion starts with the current line prefix text.
  // Try from longest match to shortest, but require at least 2 chars
  // to avoid false positives on single-character matches.
  const completionTrimmed = completion.trimStart();
  for (let len = trimmedLinePrefix.length; len >= 2; len--) {
    const prefixTail = trimmedLinePrefix.slice(-len);
    if (completionTrimmed.startsWith(prefixTail)) {
      return completionTrimmed.slice(len);
    }
  }

  return completion;
}

/**
 * Remove overlap between the end of a completion and the beginning of the suffix.
 * Prevents duplicate code when the LLM repeats what already exists after the cursor.
 */
export function removeSuffixOverlap(completion: string, suffix: string): string {
  if (!completion || !suffix) {
    return completion;
  }

  // Find the longest suffix of `completion` that matches a prefix of `suffix`
  const maxCheck = Math.min(completion.length, suffix.length);
  let overlapLen = 0;

  for (let len = 1; len <= maxCheck; len++) {
    const completionTail = completion.slice(-len);
    const suffixHead = suffix.slice(0, len);
    if (completionTail === suffixHead) {
      overlapLen = len;
    }
  }

  if (overlapLen > 0) {
    return completion.slice(0, -overlapLen);
  }

  return completion;
}

/**
 * Normalize indentation style only (tabs↔spaces conversion).
 * Does NOT adjust indent depth — the LLM sees the surrounding code context
 * and returns correctly indented completions. Re-computing indent levels
 * from the cursor position destroys correct indentation for continuation
 * lines, method chains, function arguments, etc.
 */
export function normalizeIndentation(
  completion: string,
  _cursorLineIndent: string,
  useTabs: boolean,
  tabSize: number
): string {
  if (useTabs) {
    // Convert spaces to tabs
    return completion.replace(/^( +)/gm, (match) => {
      const tabs = Math.floor(match.length / tabSize);
      const remainingSpaces = match.length % tabSize;
      return '\t'.repeat(tabs) + ' '.repeat(remainingSpaces);
    });
  } else {
    // Convert tabs to spaces
    return completion.replace(/^(\t+)/gm, (match) => {
      return ' '.repeat(match.length * tabSize);
    });
  }
}

function stripCodeFences(text: string): string {
  const lines = text.split('\n');

  if (lines.length < 2) {
    return text;
  }

  // Check if first line is a code fence opening and last line is closing
  if (CODE_FENCE_START.test(lines[0].trim()) && CODE_FENCE_END.test(lines[lines.length - 1].trim())) {
    return lines.slice(1, -1).join('\n');
  }

  return text;
}

function stripTrailingExplanation(text: string): string {
  const lines = text.split('\n');
  const explanationPrefixes = [
    'This ',
    'Here ',
    'I ',
    'The ',
    'Note:',
    'Note ',
    'Explanation:',
    '// This completes',
    '// This adds',
    '// This is',
    '/* ',
  ];

  // Walk backwards from the end, removing trailing explanation + blank lines.
  // A blank line is only stripped if it's followed (toward the end) by explanation or more blanks.
  // Once we hit a non-explanation, non-blank line, we stop.
  let endIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) {
      // Blank line — tentatively strip only if everything after it was already stripped
      if (i + 1 >= endIdx) {
        endIdx = i;
      } else {
        break;
      }
      continue;
    }
    const isExplanation = explanationPrefixes.some((prefix) =>
      trimmed.startsWith(prefix)
    );
    if (isExplanation) {
      endIdx = i;
    } else {
      break;
    }
  }

  return lines.slice(0, endIdx).join('\n');
}

function trimEmptyLines(text: string): string {
  const lines = text.split('\n');

  // Find first non-empty line
  let start = 0;
  while (start < lines.length && lines[start].trim().length === 0) {
    start++;
  }

  // Find last non-empty line
  let end = lines.length - 1;
  while (end >= start && lines[end].trim().length === 0) {
    end--;
  }

  if (start > end) {
    return '';
  }

  return lines.slice(start, end + 1).join('\n');
}
