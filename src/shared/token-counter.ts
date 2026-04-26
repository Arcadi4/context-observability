import type { SessionMessageLike } from "./types"

const CHARS_PER_TOKEN = 4

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function calculateMessageTokens(message: SessionMessageLike): number {
  const tokens = message.info?.tokens
  if (!tokens) return 0

  return (
    (tokens.input || 0) +
    (tokens.output || 0) +
    (tokens.reasoning || 0) +
    (tokens.cache?.read || 0) +
    (tokens.cache?.write || 0)
  )
}

export function sumTokenCounts(items: Array<{ tokens: number }>): number {
  return items.reduce((sum, item) => sum + item.tokens, 0)
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return count.toString()
}