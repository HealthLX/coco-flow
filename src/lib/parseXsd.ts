/**
 * Dependency-free, browser-side XSD parser for an interactive (Oxygen-style) tree view.
 *
 * Parses an XML Schema with the native DOMParser and exposes a *lazy* API: top-level
 * elements are read up-front, and each node's children are resolved on demand via
 * getChildren(). Laziness keeps large schemas (100KB–400KB) cheap to render and
 * structurally prevents runaway on recursive/cyclic types.
 *
 * Type resolution is local-name based. CoCo v10.0 schemas define their rich types
 * in-file (identifier, organization, telecom, address, …) so those drill down; `xs:*`
 * are XML primitives (leaves) and `core:*` resolve against the small imported
 * Core-Model.xsd (simpleTypes → leaves with a pattern/restriction).
 */

const XS_NS = 'http://www.w3.org/2001/XMLSchema'

export type NodeKind = 'element' | 'choice' | 'inherited'
export type TypeOrigin = 'local' | 'core' | 'primitive'

export interface XsdTreeNode {
  /** Element local name, or a synthetic label for choice/inherited rows. */
  name: string
  /** Raw type reference, e.g. "identifier" | "xs:string" | "core:NPI"; null when none. */
  type: string | null
  minOccurs: number
  maxOccurs: number | 'unbounded'
  /** First own xs:documentation text, if any. */
  documentation?: string
  /** Allowed values for inline or referenced simpleType enumerations. */
  enumValues?: string[]
  /** Pattern/restriction note for primitive-ish leaves (e.g. Core-Model simpleTypes). */
  restriction?: string
  kind: NodeKind
  /** True when the node has children to drill into (in-file complexType or inline type). */
  resolvable: boolean
  typeOrigin?: TypeOrigin
  /** Backing DOM element (for inline types and lazy child walks). */
  el: Element | null
}

export interface ParsedXsd {
  roots: XsdTreeNode[]
  getChildren(node: XsdTreeNode): XsdTreeNode[]
  error?: string
}

/** Strip a namespace prefix ("core:NPI" → "NPI"). */
function localName(typeRef: string): string {
  const i = typeRef.indexOf(':')
  return i === -1 ? typeRef : typeRef.slice(i + 1)
}

function typeOriginOf(typeRef: string | null): TypeOrigin {
  if (!typeRef) return 'local'
  if (typeRef.startsWith('xs:')) return 'primitive'
  if (typeRef.startsWith('core:')) return 'core'
  return 'local'
}

function parseMinOccurs(el: Element): number {
  const raw = el.getAttribute('minOccurs')
  if (raw == null) return 1
  const n = Number(raw)
  return Number.isFinite(n) ? n : 1
}

function parseMaxOccurs(el: Element): number | 'unbounded' {
  const raw = el.getAttribute('maxOccurs')
  if (raw == null) return 1
  if (raw === 'unbounded') return 'unbounded'
  const n = Number(raw)
  return Number.isFinite(n) ? n : 1
}

/** First xs:documentation belonging to this element's own xs:annotation (not descendants'). */
function ownDoc(el: Element): string | undefined {
  for (const child of Array.from(el.children)) {
    if (child.namespaceURI === XS_NS && child.localName === 'annotation') {
      const doc = Array.from(child.children).find(
        (c) => c.namespaceURI === XS_NS && c.localName === 'documentation',
      )
      const text = doc?.textContent?.trim()
      if (text) return text.replace(/\s+/g, ' ')
    }
  }
  return undefined
}

/** Direct xs:* children with the given local name. */
function xsChildren(el: Element, name: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.namespaceURI === XS_NS && c.localName === name,
  )
}

function firstXsChild(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find(
    (c) => c.namespaceURI === XS_NS && c.localName === name,
  )
}

/** Collect enumeration values from an xs:simpleType element (inline or referenced). */
function enumValuesFrom(simpleType: Element | undefined): string[] | undefined {
  if (!simpleType) return undefined
  const restriction = firstXsChild(simpleType, 'restriction')
  if (!restriction) return undefined
  const values = xsChildren(restriction, 'enumeration')
    .map((e) => e.getAttribute('value') ?? '')
    .filter(Boolean)
  return values.length ? values : undefined
}

/** Build a short human note for a simpleType restriction (base + pattern). */
function restrictionNote(simpleType: Element | undefined): string | undefined {
  if (!simpleType) return undefined
  const restriction = firstXsChild(simpleType, 'restriction')
  if (!restriction) return undefined
  const base = restriction.getAttribute('base')
  const pattern = firstXsChild(restriction, 'pattern')?.getAttribute('value')
  const parts: string[] = []
  if (base) parts.push(`base ${base}`)
  if (pattern) parts.push(`pattern ${pattern}`)
  return parts.length ? parts.join(' · ') : undefined
}

export function parseXsd(mainXsd: string, coreXsd?: string): ParsedXsd {
  const noop: ParsedXsd = { roots: [], getChildren: () => [] }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(mainXsd, 'application/xml')
  } catch {
    return { ...noop, error: 'Could not parse the schema.' }
  }
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    return { ...noop, error: 'Schema is not well-formed XML.' }
  }

  // Name → Element maps for the main document.
  const complexTypes = new Map<string, Element>()
  const simpleTypes = new Map<string, Element>()
  for (const ct of Array.from(doc.getElementsByTagNameNS(XS_NS, 'complexType'))) {
    const name = ct.getAttribute('name')
    if (name) complexTypes.set(name, ct)
  }
  for (const st of Array.from(doc.getElementsByTagNameNS(XS_NS, 'simpleType'))) {
    const name = st.getAttribute('name')
    if (name) simpleTypes.set(name, st)
  }

  // Core-Model (imported) simpleTypes, resolved for `core:` references.
  const coreSimpleTypes = new Map<string, Element>()
  if (coreXsd) {
    try {
      const coreDoc = new DOMParser().parseFromString(coreXsd, 'application/xml')
      if (!coreDoc.querySelector('parsererror') && coreDoc.documentElement) {
        for (const st of Array.from(coreDoc.getElementsByTagNameNS(XS_NS, 'simpleType'))) {
          const name = st.getAttribute('name')
          if (name) coreSimpleTypes.set(name, st)
        }
      }
    } catch {
      /* core resolution is best-effort */
    }
  }

  /** Resolve the inline or referenced simpleType element for a node, if any. */
  function simpleTypeFor(el: Element | null, typeRef: string | null): Element | undefined {
    const inline = el ? firstXsChild(el, 'simpleType') : undefined
    if (inline) return inline
    if (!typeRef) return undefined
    if (typeRef.startsWith('core:')) return coreSimpleTypes.get(localName(typeRef))
    if (!typeRef.startsWith('xs:')) return simpleTypes.get(localName(typeRef))
    return undefined
  }

  /** The complexType (inline or in-file) a node can drill into, if any. */
  function complexTypeFor(el: Element | null, typeRef: string | null): Element | undefined {
    const inline = el ? firstXsChild(el, 'complexType') : undefined
    if (inline) return inline
    if (!typeRef) return undefined
    if (typeRef.startsWith('xs:') || typeRef.startsWith('core:')) return undefined
    return complexTypes.get(localName(typeRef))
  }

  /** Build an XsdTreeNode from an xs:element DOM node. */
  function nodeFromElement(el: Element): XsdTreeNode {
    const type = el.getAttribute('type')
    const simpleType = simpleTypeFor(el, type)
    return {
      name: el.getAttribute('name') ?? '(anonymous)',
      type,
      minOccurs: parseMinOccurs(el),
      maxOccurs: parseMaxOccurs(el),
      documentation: ownDoc(el),
      enumValues: enumValuesFrom(simpleType),
      restriction: type?.startsWith('core:') ? restrictionNote(simpleType) : undefined,
      kind: 'element',
      resolvable: !!complexTypeFor(el, type),
      typeOrigin: typeOriginOf(type),
      el,
    }
  }

  // Roots: xs:element that are direct children of xs:schema.
  const roots: XsdTreeNode[] = Array.from(doc.documentElement.children)
    .filter((c) => c.namespaceURI === XS_NS && c.localName === 'element')
    .map(nodeFromElement)

  /** Find the model group (sequence/choice/all) inside a complexType, honoring extension. */
  function modelGroupContainers(complexType: Element): { extensionBase?: string; groups: Element[] } {
    const complexContent = firstXsChild(complexType, 'complexContent')
    let host: Element = complexType
    let extensionBase: string | undefined
    if (complexContent) {
      const extension =
        firstXsChild(complexContent, 'extension') ?? firstXsChild(complexContent, 'restriction')
      if (extension) {
        host = extension
        extensionBase = extension.getAttribute('base') ?? undefined
      }
    }
    const groups = [
      ...xsChildren(host, 'sequence'),
      ...xsChildren(host, 'choice'),
      ...xsChildren(host, 'all'),
    ]
    return { extensionBase, groups }
  }

  /** Walk one model group into child nodes (elements + nested choices). */
  function walkGroup(group: Element): XsdTreeNode[] {
    if (group.localName === 'choice') {
      const choiceNode: XsdTreeNode = {
        name: '(choice)',
        type: null,
        minOccurs: parseMinOccurs(group),
        maxOccurs: parseMaxOccurs(group),
        documentation: ownDoc(group),
        kind: 'choice',
        resolvable: xsChildren(group, 'element').length > 0,
        el: group,
      }
      return [choiceNode]
    }
    // sequence / all
    const out: XsdTreeNode[] = []
    for (const child of Array.from(group.children)) {
      if (child.namespaceURI !== XS_NS) continue
      if (child.localName === 'element') out.push(nodeFromElement(child))
      else if (child.localName === 'choice') out.push(...walkGroup(child))
    }
    return out
  }

  function getChildren(node: XsdTreeNode): XsdTreeNode[] {
    if (node.kind === 'inherited') return []

    // A choice node's children are its inline option elements.
    if (node.kind === 'choice' && node.el) {
      return xsChildren(node.el, 'element').map(nodeFromElement)
    }

    const complexType = complexTypeFor(node.el, node.type)
    if (!complexType) return []

    const { extensionBase, groups } = modelGroupContainers(complexType)

    const children: XsdTreeNode[] = []
    if (extensionBase) {
      const baseCt = complexTypes.get(localName(extensionBase))
      if (baseCt) {
        const { groups: baseGroups } = modelGroupContainers(baseCt)
        for (const g of baseGroups) children.push(...walkGroup(g))
      } else {
        children.push({
          name: `inherited from ${extensionBase}`,
          type: extensionBase,
          minOccurs: 1,
          maxOccurs: 1,
          kind: 'inherited',
          resolvable: false,
          el: null,
        })
      }
    }
    for (const g of groups) children.push(...walkGroup(g))
    return children
  }

  return { roots, getChildren }
}
