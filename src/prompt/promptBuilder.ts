import { CodeContext } from '../context/types';

export const COMPLETION_SYSTEM_PROMPT = `You are a code completion engine. You receive code with a <CURSOR/> marker indicating where the user is typing. Output ONLY the code that should be inserted at the cursor position.

Rules:
- Output raw code only — no markdown, no backticks, no explanations, no comments about the completion
- Match the surrounding code style (indentation, naming conventions, quotes)
- Complete the current statement or expression naturally
- If the completion is a multi-line block, include appropriate indentation
- Do not repeat code that already exists before or after the cursor
- Use the related files section (if present) to understand available functions, types, and imports
- If you cannot determine a useful completion, output exactly: <NO_COMPLETION/>`;

export function buildSystemPrompt(customInstructions: string): string {
  if (!customInstructions) {
    return COMPLETION_SYSTEM_PROMPT;
  }
  return `${COMPLETION_SYSTEM_PROMPT}

Additional instructions from the user:
${customInstructions}`;
}

export function buildPrompt(context: CodeContext): string {
  let prompt = '';

  // Include related files context if available
  if (context.relatedFiles && context.relatedFiles.length > 0) {
    prompt += 'Related files (for reference — do not repeat this code):\n\n';
    for (const rf of context.relatedFiles) {
      prompt += `--- ${rf.fileName} (${rf.language}) ---\n${rf.snippet}\n\n`;
    }
    prompt += '---\n\n';
  }

  prompt += `File: ${context.fileName} (${context.language})\n\n`;
  prompt += `${context.prefix}<CURSOR/>${context.suffix}`;

  return prompt;
}
