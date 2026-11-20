/**
 * A drawing as plain data: SVG elements, their attributes and their text.
 *
 * The 2D view and the picture function both build one of these and nothing else. The view
 * hands it to React (`canvas2d/toReact.tsx`); the picture writes it out with `toSvg`. Both
 * end up with the same markup because they start from the same tree.
 *
 * Pure: no DOM, no React.
 */

/** `undefined` leaves the attribute out. A boolean is written as `true` or `false`. */
export type AttrValue = string | number | boolean | undefined

export type Attrs = Readonly<Record<string, AttrValue>>

export interface SvgNode {
  readonly tag: string
  /** Attribute names as they appear in the markup: `pointer-events`, `class`, `data-id`. */
  readonly attrs: Attrs
  readonly children: readonly SvgChild[]
  /** Identity among its siblings, for React. Never written out. */
  readonly key?: string
}

export type SvgChild = SvgNode | string

export function el(tag: string, attrs: Attrs, children: readonly SvgChild[] = [], key?: string): SvgNode {
  return key === undefined ? { tag, attrs, children } : { tag, attrs, children, key }
}

/** An attribute's text, as React writes it, or `null` when it is left out. */
export function attrText(value: AttrValue): string | null {
  return value === undefined ? null : String(value)
}

// The same escaping a browser uses when it serialises an SVG element inside a page, minus the
// `&nbsp;` entity, which XML does not know. Both are valid XML.
function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The markup for some nodes. Every element gets an end tag (`<path …></path>`), which is how
 * a browser writes SVG inside a page and is also valid XML.
 */
export function toSvg(nodes: SvgChild | readonly SvgChild[]): string {
  const list: readonly SvgChild[] = Array.isArray(nodes) ? nodes : [nodes as SvgChild]
  let out = ''
  for (const node of list) {
    if (typeof node === 'string') {
      out += escapeText(node)
      continue
    }
    out += `<${node.tag}`
    for (const [name, value] of Object.entries(node.attrs)) {
      const text = attrText(value)
      if (text !== null) out += ` ${name}="${escapeAttr(text)}"`
    }
    out += `>${toSvg(node.children)}</${node.tag}>`
  }
  return out
}
