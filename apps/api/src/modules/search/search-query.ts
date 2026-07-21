export interface LSearchTerms {
  completed: string;
  prefix: string;
}

/**
 * Splits human input into English-stemmed completed terms and one source-text prefix.
 *
 * Only Unicode letters, numbers, and underscores reach `to_tsquery`; other punctuation
 * remains inert rather than becoming tsquery syntax. The final lexical token is always the
 * live prefix, even after whitespace, so editing a space cannot briefly broaden the result.
 */
export function lSearchTerms(q: string): LSearchTerms | null {
  const tokens = q.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens?.length) return null;

  return {
    completed: tokens.slice(0, -1).join(' '),
    prefix: tokens.at(-1)!,
  };
}
