/**
 * Mentions travel inside message text as tokens: `@[Display Name](userId)`.
 * The composer inserts them; the server re-reads them, keeps only valid room
 * members, and stores the result in `ChatMessage.mentions`.
 */

// Bounded classes and an exact 24-hex id: no nested quantifiers, so crafted
// input can't make this backtrack badly.
const MENTION_TOKEN = /@\[([^\]\n]{1,80})\]\(([a-f0-9]{24})\)/gi;

/** Keeps one message from fanning out to a whole company. */
export const MAX_MENTIONS_PER_MESSAGE = 20;

/** Unique user ids tagged in `content`, in order of first appearance. */
export const extractMentionIds = (content: string): string[] => {
  const ids = new Set<string>();
  for (const match of content.matchAll(MENTION_TOKEN)) {
    const id = match[2];
    if (id) ids.add(id.toLowerCase());
    if (ids.size >= MAX_MENTIONS_PER_MESSAGE) break;
  }
  return [...ids];
};

/** `@[Priya](id)` -> `@Priya`, for previews and notification text. */
export const mentionsToPlainText = (content: string): string =>
  content.replace(MENTION_TOKEN, "@$1");
