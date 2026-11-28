export type SafeMarkdownInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: SafeMarkdownInlineNode[] }
  | { type: 'em'; children: SafeMarkdownInlineNode[] }
  | { type: 'code'; value: string }
  | {
      type: 'link'
      label: SafeMarkdownInlineNode[]
      href: string
      internal: boolean
    }

export type SafeMarkdownBlockNode =
  | { type: 'heading'; level: 2 | 3 | 4; children: SafeMarkdownInlineNode[] }
  | { type: 'paragraph'; lines: SafeMarkdownInlineNode[][] }
  | { type: 'unordered-list'; items: SafeMarkdownInlineNode[][] }
  | { type: 'ordered-list'; items: SafeMarkdownInlineNode[][] }
  | { type: 'blockquote'; children: SafeMarkdownInlineNode[] }
  | { type: 'code-block'; code: string }

/**
 * Validates and normalizes links in AI responses.
 * Blocks `javascript:`, `data:`, `vbscript:`, protocol-relative `//`, and raw HTML schemes.
 */
export function sanitizeMarkdownHref(rawHref: string): { href: string; internal: boolean } | null {
  const trimmed = rawHref.trim()
  if (!trimmed) return null

  // Allow safe internal app routes starting with a single slash
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (/[\u0000-\u001F\s<>]/.test(trimmed)) return null
    return { href: trimmed, internal: true }
  }

  try {
    const parsed = new URL(trimmed)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'https:' || protocol === 'http:') {
      return { href: parsed.toString(), internal: false }
    }
    if (protocol === 'tel:' || protocol === 'mailto:') {
      return { href: trimmed, internal: false }
    }
    return null
  } catch {
    return null
  }
}

const INLINE_TOKEN_RE =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|(?<!\*)\*([^*\n]+?)\*(?!\*)/g

export function parseSafeMarkdownInline(input: string, depth = 0): SafeMarkdownInlineNode[] {
  if (!input) return []
  if (depth > 3) {
    return [{ type: 'text', value: input.replace(/\*\*/g, '') }]
  }

  const nodes: SafeMarkdownInlineNode[] = []
  let lastIndex = 0
  const regex = new RegExp(INLINE_TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const rawText = input.slice(lastIndex, match.index).replace(/\*\*/g, '')
      if (rawText) nodes.push({ type: 'text', value: rawText })
    }

    const [, codeText, linkLabel, linkHref, boldAsterisk, boldUnderscore, italicAsterisk] = match

    if (codeText !== undefined) {
      nodes.push({ type: 'code', value: codeText })
    } else if (linkLabel !== undefined && linkHref !== undefined) {
      const safeLink = sanitizeMarkdownHref(linkHref)
      const parsedLabel = parseSafeMarkdownInline(linkLabel, depth + 1)
      const fallbackLabel: SafeMarkdownInlineNode[] = [{ type: 'text', value: linkLabel }]
      const resolvedLabel = parsedLabel.length > 0 ? parsedLabel : fallbackLabel
      if (safeLink) {
        nodes.push({
          type: 'link',
          label: resolvedLabel,
          href: safeLink.href,
          internal: safeLink.internal,
        })
      } else {
        nodes.push(...resolvedLabel)
      }
    } else if (boldAsterisk !== undefined || boldUnderscore !== undefined) {
      const inner = boldAsterisk ?? boldUnderscore ?? ''
      nodes.push({
        type: 'strong',
        children: parseSafeMarkdownInline(inner, depth + 1),
      })
    } else if (italicAsterisk !== undefined) {
      nodes.push({
        type: 'em',
        children: parseSafeMarkdownInline(italicAsterisk, depth + 1),
      })
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < input.length) {
    const tail = input.slice(lastIndex).replace(/\*\*/g, '')
    if (tail) nodes.push({ type: 'text', value: tail })
  }

  return nodes
}

export function parseSafeMarkdownBlocks(content: string): SafeMarkdownBlockNode[] {
  const normalized = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!normalized) return []

  const rawLines = normalized.split('\n')
  const blocks: SafeMarkdownBlockNode[] = []
  let idx = 0

  while (idx < rawLines.length) {
    const line = rawLines[idx] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      idx += 1
      continue
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      idx += 1
      while (idx < rawLines.length && !(rawLines[idx] ?? '').trim().startsWith('```')) {
        codeLines.push(rawLines[idx] ?? '')
        idx += 1
      }
      if (idx < rawLines.length) idx += 1
      blocks.push({ type: 'code-block', code: codeLines.join('\n') })
      continue
    }

    // Heading (#, ##, ###, ####)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const hashes = headingMatch[1]?.length ?? 2
      const level: 2 | 3 | 4 = hashes <= 2 ? 2 : hashes === 3 ? 3 : 4
      blocks.push({
        type: 'heading',
        level,
        children: parseSafeMarkdownInline(headingMatch[2] ?? ''),
      })
      idx += 1
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteParts: string[] = []
      while (idx < rawLines.length && (rawLines[idx] ?? '').trim().startsWith('> ')) {
        quoteParts.push((rawLines[idx] ?? '').trim().slice(2).trim())
        idx += 1
      }
      blocks.push({
        type: 'blockquote',
        children: parseSafeMarkdownInline(quoteParts.join(' ')),
      })
      continue
    }

    // Unordered list (-, *, •)
    if (/^(?:[-*•])\s+/.test(trimmed)) {
      const items: SafeMarkdownInlineNode[][] = []
      while (idx < rawLines.length && /^(?:[-*•])\s+/.test((rawLines[idx] ?? '').trim())) {
        const itemText = (rawLines[idx] ?? '').trim().replace(/^(?:[-*•])\s+/, '')
        items.push(parseSafeMarkdownInline(itemText))
        idx += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }

    // Ordered list (1. or 1))
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: SafeMarkdownInlineNode[][] = []
      while (idx < rawLines.length && /^\d+[.)]\s+/.test((rawLines[idx] ?? '').trim())) {
        const itemText = (rawLines[idx] ?? '').trim().replace(/^\d+[.)]\s+/, '')
        items.push(parseSafeMarkdownInline(itemText))
        idx += 1
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }

    // Paragraph (consecutive non-special lines)
    const paragraphLines: SafeMarkdownInlineNode[][] = []
    while (idx < rawLines.length) {
      const candidate = (rawLines[idx] ?? '').trim()
      if (
        !candidate ||
        candidate.startsWith('```') ||
        /^(#{1,4})\s+/.test(candidate) ||
        candidate.startsWith('> ') ||
        /^(?:[-*•])\s+/.test(candidate) ||
        /^\d+[.)]\s+/.test(candidate)
      ) {
        break
      }
      paragraphLines.push(parseSafeMarkdownInline(candidate))
      idx += 1
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraphLines })
    }
  }

  return blocks
}
