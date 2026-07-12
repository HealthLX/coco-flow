import { parser } from '@lezer/xml'

export type Dialect = 'canonical' | 'fhir'

export interface Leaf {
  id: string
  /** Element path, e.g. "roster/member/us_core_race/code". */
  path: string
  /** Nearest repeating ancestor — a canonical <member>, or the FHIR resource root. */
  recordId: string
  value: string
  /** Casefolded, whitespace-collapsed — what matching actually compares. */
  norm: string
  from: number
  to: number
}

export function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Values too common to carry information. Matching on them links everything to everything —
 * "official" appears in half the FHIR document and means nothing about provenance.
 */
const STOPWORDS = new Set([
  'true', 'false', '0', '1', 'official', 'usual', 'temp', 'nickname', 'anonymous', 'old', 'maiden',
  'home', 'work', 'mobile', 'both', 'postal', 'physical', 'generated', 'additional', 'active',
  'inactive', 'unknown', 'male', 'female', 'other', 'm', 'f', 'phone', 'fax', 'email', 'pager',
  'url', 'sms', 'preferred', 'final', 'current',
])

export function isDistinctive(norm: string): boolean {
  return norm.length >= 2 && !STOPWORDS.has(norm)
}

/**
 * Index every leaf value with its source offsets.
 *
 * Uses @lezer/xml rather than DOMParser because the highlight decorations need character
 * offsets into the original text, and DOMParser throws those away.
 *
 * The dialects genuinely differ: canonical XML puts data in text nodes (`<code>2106-3</code>`),
 * FHIR puts it in `value` attributes (`<code value="2106-3"/>`). Index the wrong one and the
 * map comes back empty.
 */
export function parseLeaves(text: string, dialect: Dialect): Leaf[] {
  const tree = parser.parse(text)
  const leaves: Leaf[] = []

  const stack: string[] = []
  /** Depth-1 element (child of the document root) that owns the current leaf. */
  let record: string | null = null
  let recordDepth = -1
  let recordSeq = 0
  /** The FHIR narrative restates name and DOB as prose; matching against it invents links. */
  let narrativeDepth = -1

  const push = (name: string) => {
    stack.push(name)
    if (dialect === 'fhir' && narrativeDepth === -1 && (name === 'div' || name === 'xhtml:div')) {
      narrativeDepth = stack.length
    }
    // A canonical document is root > record > …; a FHIR document is one resource, one record.
    if (dialect === 'canonical' && stack.length === 2) {
      record = `${name}#${recordSeq++}`
      recordDepth = 2
    }
  }

  const pop = () => {
    if (narrativeDepth === stack.length) narrativeDepth = -1
    if (recordDepth === stack.length) {
      record = null
      recordDepth = -1
    }
    stack.pop()
  }

  const inNarrative = () => narrativeDepth !== -1
  const currentRecord = () =>
    dialect === 'fhir' ? (stack[0] ?? 'resource') : (record ?? stack[0] ?? 'root')

  const add = (value: string, from: number, to: number) => {
    const norm = normalize(value)
    if (!norm) return
    leaves.push({
      id: `${from}:${to}`,
      path: stack.join('/'),
      recordId: currentRecord(),
      value: value.trim(),
      norm,
      from,
      to,
    })
  }

  let pendingTag = false

  tree.iterate({
    enter: (node) => {
      switch (node.name) {
        case 'Element':
          pendingTag = true
          return true

        case 'TagName':
          // The first TagName inside an Element is its open tag; later ones close it.
          if (pendingTag) {
            push(text.slice(node.from, node.to))
            pendingTag = false
          }
          return false

        case 'Attribute': {
          if (dialect !== 'fhir' || inNarrative()) return false
          const nameNode = node.node.getChild('AttributeName')
          const valueNode = node.node.getChild('AttributeValue')
          if (!nameNode || !valueNode) return false
          if (text.slice(nameNode.from, nameNode.to) !== 'value') return false
          // AttributeValue spans the quotes; the value is what's between them.
          add(text.slice(valueNode.from + 1, valueNode.to - 1), valueNode.from + 1, valueNode.to - 1)
          return false
        }

        case 'Text': {
          if (dialect !== 'canonical' || inNarrative()) return false
          const raw = text.slice(node.from, node.to)
          if (!raw.trim()) return false
          const lead = raw.length - raw.trimStart().length
          const trail = raw.length - raw.trimEnd().length
          add(raw, node.from + lead, node.to - trail)
          return false
        }

        default:
          return true
      }
    },
    leave: (node) => {
      if (node.name === 'Element') pop()
    },
  })

  return leaves
}
