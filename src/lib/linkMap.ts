import { isDistinctive, parseLeaves, type Leaf } from './xmlLeaves'

export type Confidence = 'exact' | 'derived' | 'date' | 'ambiguous'

export interface FhirTarget {
  /** Index into the FHIR document list this map was built from. */
  docIndex: number
  leaf: Leaf
}

export interface Link {
  canonical: Leaf
  targets: FhirTarget[]
  confidence: Confidence
}

export interface LinkMap {
  /** Keyed by canonical leaf id. */
  byCanonical: Map<string, Link>
  /** Keyed by `${docIndex}:${fhirLeafId}` → the canonical leaves that reach it. */
  byFhir: Map<string, Leaf[]>
  canonicalLeaves: Leaf[]
  fhirLeaves: FhirTarget[]
  /** Canonical leaves that reach no FHIR element at all. */
  unmapped: Leaf[]
}

export interface FhirDocInput {
  fileName: string
  xml: string
}

/** A value appearing this often across the FHIR output carries no signal. */
const FREQUENCY_CEILING = 8
/** Past this many hits, a highlight would paint half the document. */
const AMBIGUITY_CEILING = 6
/** Below this, a substring match is coincidence rather than derivation. */
const MIN_DERIVED_LENGTH = 4

/** 1985-11-21, 2017-09-17T00:48:18Z — key on the date part, so formatting differences link. */
function asDate(norm: string): string | null {
  const m = norm.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/**
 * Which FHIR element did this canonical field become?
 *
 * There is no machine-readable mapping to read — the XSLTs are the only source of truth, and
 * parsing them is brittle. So this matches on values instead, in two passes: first align each
 * canonical record with the FHIR resources that share its distinctive values (so two members
 * who both live in Boston don't cross-link), then match fields inside those aligned records.
 *
 * Known blind spots, surfaced in the UI rather than hidden:
 *  - Code translations are invisible. If an XSLT maps `M` → `male`, no value is shared, so the
 *    field reads as unmapped even though it was carried across.
 *  - Literals the XSLT injects (profile URLs, `urn:oid:…`, `meta/lastUpdated`) have no canonical
 *    source, and correctly appear only on the FHIR side.
 *  - Fields the XSLT genuinely drops also land in `unmapped` — which is the useful signal, and
 *    is the reason the two cases can't be told apart automatically.
 */
export function buildLinkMap(canonicalXml: string, fhirDocs: FhirDocInput[]): LinkMap {
  const canonicalLeaves = parseLeaves(canonicalXml, 'canonical')

  const fhirLeaves: FhirTarget[] = fhirDocs.flatMap((doc, docIndex) =>
    parseLeaves(doc.xml, 'fhir').map((leaf) => ({ docIndex, leaf })),
  )

  // Auto-stopword: a value repeated across the output is boilerplate, whatever it is.
  const frequency = new Map<string, number>()
  for (const { leaf } of fhirLeaves) {
    frequency.set(leaf.norm, (frequency.get(leaf.norm) ?? 0) + 1)
  }

  const usable = (norm: string) =>
    isDistinctive(norm) && (frequency.get(norm) ?? 0) <= FREQUENCY_CEILING

  const byValue = new Map<string, FhirTarget[]>()
  const byDate = new Map<string, FhirTarget[]>()
  for (const target of fhirLeaves) {
    if (!usable(target.leaf.norm)) continue
    const bucket = byValue.get(target.leaf.norm)
    if (bucket) bucket.push(target)
    else byValue.set(target.leaf.norm, [target])

    const d = asDate(target.leaf.norm)
    if (d) {
      const dates = byDate.get(d)
      if (dates) dates.push(target)
      else byDate.set(d, [target])
    }
  }

  // ── Pass 1: align canonical records with FHIR resources ────────────────
  // Score by how many distinctive values they share. A resource within 60% of the best
  // score for a record is a plausible home for that record's fields.
  const recordKey = (t: FhirTarget) => `${t.docIndex}:${t.leaf.recordId}`
  const allowedResources = new Map<string, Set<string>>()

  const canonicalByRecord = new Map<string, Leaf[]>()
  for (const leaf of canonicalLeaves) {
    const bucket = canonicalByRecord.get(leaf.recordId)
    if (bucket) bucket.push(leaf)
    else canonicalByRecord.set(leaf.recordId, [leaf])
  }

  for (const [recordId, leaves] of canonicalByRecord) {
    const scores = new Map<string, number>()
    for (const leaf of leaves) {
      if (!usable(leaf.norm)) continue
      for (const target of byValue.get(leaf.norm) ?? []) {
        const key = recordKey(target)
        scores.set(key, (scores.get(key) ?? 0) + 1)
      }
    }
    const best = Math.max(0, ...scores.values())
    const allowed = new Set<string>()
    if (best > 0) {
      for (const [key, score] of scores) {
        if (score >= best * 0.6) allowed.add(key)
      }
    }
    allowedResources.set(recordId, allowed)
  }

  // ── Pass 2: match fields within the aligned records ────────────────────
  const byCanonical = new Map<string, Link>()
  const byFhir = new Map<string, Leaf[]>()
  const unmapped: Leaf[] = []

  const record = (link: Link) => {
    byCanonical.set(link.canonical.id, link)
    for (const t of link.targets) {
      const key = `${t.docIndex}:${t.leaf.id}`
      const bucket = byFhir.get(key)
      if (bucket) bucket.push(link.canonical)
      else byFhir.set(key, [link.canonical])
    }
  }

  for (const leaf of canonicalLeaves) {
    if (!isDistinctive(leaf.norm)) {
      unmapped.push(leaf)
      continue
    }

    const allowed = allowedResources.get(leaf.recordId) ?? new Set<string>()
    const scoped = (targets: FhirTarget[]) => {
      const hits = targets.filter((t) => allowed.has(recordKey(t)))
      // A record with no alignment at all (e.g. a lone <schema_version>) still deserves its
      // exact matches — falling back to the unscoped hits is better than reporting nothing.
      return hits.length ? hits : allowed.size === 0 ? targets : []
    }

    const exact = scoped(byValue.get(leaf.norm) ?? [])
    if (exact.length) {
      record({
        canonical: leaf,
        targets: exact,
        confidence: exact.length > AMBIGUITY_CEILING ? 'ambiguous' : 'exact',
      })
      continue
    }

    // Same moment, different formatting: "2017-09-17T00:48:18Z" vs "20170917004818".
    const d = asDate(leaf.norm)
    if (d) {
      const dated = scoped(byDate.get(d) ?? [])
      if (dated.length && dated.length <= AMBIGUITY_CEILING) {
        record({ canonical: leaf, targets: dated, confidence: 'date' })
        continue
      }
    }

    // Substring: the XSLT decorated the value rather than replacing it —
    // <member_id>summer</member_id> becomes <id value="-summer"/>.
    if (leaf.norm.length >= MIN_DERIVED_LENGTH) {
      const derived = fhirLeaves.filter(
        (t) =>
          allowed.has(recordKey(t)) &&
          usable(t.leaf.norm) &&
          (t.leaf.norm.includes(leaf.norm) || leaf.norm.includes(t.leaf.norm)),
      )
      if (derived.length && derived.length <= AMBIGUITY_CEILING) {
        record({ canonical: leaf, targets: derived, confidence: 'derived' })
        continue
      }
    }

    unmapped.push(leaf)
  }

  return { byCanonical, byFhir, canonicalLeaves, fhirLeaves, unmapped }
}
