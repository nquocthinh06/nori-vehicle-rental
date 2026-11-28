'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { ExternalLink, NoriLink } from '@/components/ui'
import {
  parseSafeMarkdownBlocks,
  type SafeMarkdownBlockNode,
  type SafeMarkdownInlineNode,
} from '@/lib/ai/markdown'

function renderInlineNodes(
  nodes: SafeMarkdownInlineNode[],
  onNavigate?: () => void,
  keyPrefix = 'in',
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-ink">
            {renderInlineNodes(node.children, onNavigate, key)}
          </strong>
        )
      case 'em':
        return (
          <em key={key} className="italic">
            {renderInlineNodes(node.children, onNavigate, key)}
          </em>
        )
      case 'code':
        return (
          <code
            key={key}
            className="rounded-sm bg-subtle px-1.5 py-0.5 font-mono text-[12px] font-medium text-ink"
          >
            {node.value}
          </code>
        )
      case 'link':
        if (node.internal) {
          return (
            <NoriLink
              key={key}
              href={node.href}
              onClick={onNavigate}
              className="font-medium text-brand underline underline-offset-4"
            >
              {renderInlineNodes(node.label, onNavigate, key)}
            </NoriLink>
          )
        }
        return (
          <ExternalLink
            key={key}
            href={node.href}
            target={node.href.startsWith('http') ? '_blank' : undefined}
            className="font-medium text-brand"
          >
            {renderInlineNodes(node.label, onNavigate, key)}
          </ExternalLink>
        )
    }
  })
}

function renderBlockNode(
  block: SafeMarkdownBlockNode,
  index: number,
  onNavigate?: () => void,
): ReactNode {
  const key = `blk-${index}`
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h3' : 'h4'
      return (
        <Tag key={key} className="text-small font-semibold text-ink">
          {renderInlineNodes(block.children, onNavigate, key)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={key} className="leading-relaxed text-ink">
          {block.lines.map((lineNodes, lineIdx) => (
            <Fragment key={`${key}-l-${lineIdx}`}>
              {lineIdx > 0 && <br />}
              {renderInlineNodes(lineNodes, onNavigate, `${key}-l-${lineIdx}`)}
            </Fragment>
          ))}
        </p>
      )
    case 'unordered-list':
      return (
        <ul key={key} className="list-disc space-y-1 pl-4 text-ink marker:text-brand">
          {block.items.map((itemNodes, itemIdx) => (
            <li key={`${key}-u-${itemIdx}`} className="leading-relaxed">
              {renderInlineNodes(itemNodes, onNavigate, `${key}-u-${itemIdx}`)}
            </li>
          ))}
        </ul>
      )
    case 'ordered-list':
      return (
        <ol key={key} className="list-decimal space-y-1 pl-4 text-ink marker:font-semibold">
          {block.items.map((itemNodes, itemIdx) => (
            <li key={`${key}-o-${itemIdx}`} className="leading-relaxed">
              {renderInlineNodes(itemNodes, onNavigate, `${key}-o-${itemIdx}`)}
            </li>
          ))}
        </ol>
      )
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-brand bg-subtle/70 px-3 py-1.5 text-caption text-muted"
        >
          {renderInlineNodes(block.children, onNavigate, key)}
        </blockquote>
      )
    case 'code-block':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-control border border-line bg-subtle p-2.5 font-mono text-[12px] text-ink"
        >
          <code>{block.code}</code>
        </pre>
      )
  }
}

export function AIMarkdown({ content, onNavigate }: { content: string; onNavigate?: () => void }) {
  const blocks = useMemo(() => parseSafeMarkdownBlocks(content), [content])
  if (blocks.length === 0) return null

  return (
    <div data-testid="ai-markdown-body" className="space-y-2 text-small leading-relaxed text-ink">
      {blocks.map((block, index) => renderBlockNode(block, index, onNavigate))}
    </div>
  )
}
