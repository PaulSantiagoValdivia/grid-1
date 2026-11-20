import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { SvgChild, SvgNode } from '../picture/svgNode'

/**
 * A drawing tree (`picture/svgNode.ts`) as React elements, attribute for attribute.
 *
 * Attribute names in the tree are the markup's own (`pointer-events`, `class`); React wants
 * its prop names (`pointerEvents`, `className`), and writes them back out as the markup's.
 * React sets attributes in the order it is given them, so the DOM keeps the tree's order.
 *
 * `extra` adds props that are not markup, such as event handlers, to the nodes that need
 * them.
 */
export type ExtraProps = (node: SvgNode) => Record<string, unknown> | undefined

function propName(name: string): string {
  if (name === 'class') return 'className'
  if (name.startsWith('data-') || name.startsWith('aria-')) return name
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toChild(child: SvgChild, extra: ExtraProps | undefined): ReactElement | string {
  return typeof child === 'string' ? child : toReact(child, extra)
}

export function toReact(node: SvgNode, extra?: ExtraProps): ReactElement {
  const props: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(node.attrs)) props[propName(name)] = value
  if (node.key !== undefined) props.key = node.key
  Object.assign(props, extra?.(node))
  return createElement(node.tag, props, ...node.children.map((child) => toChild(child, extra)))
}
