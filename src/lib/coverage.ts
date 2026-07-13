import {
  FHIR_RESOURCE_TYPES,
  normCanonicalId,
  usCoreProfileFor,
  type Build,
  type TransformFile,
} from '../services/api'
import { CANONICALS } from '../pipeline/derive'

/**
 * Which XSLTs a build actually runs.
 *
 * Mirrors `collect_transform_specs` in coco-canonical/tools/transform_schema.py. The API
 * doesn't expose the resolved list, so the client has to derive it — pinned by tests
 * (Clinical → 26, Roster → 1) so drift from the Python shows up as a failure, not a bug.
 */
const TRANSFORM_EXCLUDE = /_flat\.xsl$/i

export interface TransformSpec {
  /** Path relative to transforms/v10.0/, e.g. "Clinical/Clinical_Patient.xsl". */
  file: string
  resourceType: string | null
}

export function transformSpecsForBuild(build: Build, transforms: TransformFile[]): TransformSpec[] {
  // Explicit list wins: the YAML pinned both the file and its resource type.
  if (build.transform_files?.length) {
    return build.transform_files.map((entry) => ({
      file: entry.transform_file,
      resourceType: entry.resource_type ?? resourceTypeFromXsltName(entry.transform_file).type,
    }))
  }

  if (build.transform_dir) {
    const dir = build.transform_dir.replace(/\/$/, '')
    return transforms
      .filter((t) => {
        const path = t.filename
        return (
          path.toLowerCase().startsWith(`${dir.toLowerCase()}/`) &&
          path.toLowerCase().endsWith('.xsl') &&
          !TRANSFORM_EXCLUDE.test(path)
        )
      })
      .sort((a, b) => a.filename.toLowerCase().localeCompare(b.filename.toLowerCase()))
      .map((t) => ({ file: t.filename, resourceType: resourceTypeFromXsltName(t.filename).type }))
  }

  if (build.transform_file) {
    return [
      {
        file: build.transform_file,
        resourceType: resourceTypeFromXsltName(build.transform_file).type,
      },
    ]
  }

  return []
}

const GROUP_PREFIX = /^(Clinical|Provider|EOB|Formulary|Roster|Insurance)[_-]/i

/**
 * "Clinical_DiagnosticReport_Notes.xsl" → { type: "DiagnosticReport", variant: "Notes" }
 *
 * Takes the longest leading run of tokens that names a real FHIR resource type, so
 * multi-word types (DiagnosticReport, MedicationRequest) win over their first word, and
 * whatever is left over is the variant.
 */
export function resourceTypeFromXsltName(file: string): {
  type: string | null
  variant: string | null
} {
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.xslt?$/i, '')
  const tokens = base.replace(GROUP_PREFIX, '').split(/[_-]/).filter(Boolean)
  if (!tokens.length) return { type: null, variant: null }

  for (let take = tokens.length; take >= 1; take--) {
    const candidate = tokens.slice(0, take).join('')
    const match = matchResourceType(candidate)
    if (match) {
      const variant = tokens.slice(take).join(' ')
      return { type: match, variant: variant || null }
    }
  }
  return { type: null, variant: tokens.join(' ') }
}

/** Case-insensitive lookup, retrying the singular for plural filenames ("Endpoints"). */
function matchResourceType(candidate: string): string | null {
  const lower = candidate.toLowerCase()
  for (const type of FHIR_RESOURCE_TYPES) {
    if (type.toLowerCase() === lower) return type
  }
  if (lower.endsWith('s')) {
    const singular = lower.slice(0, -1)
    for (const type of FHIR_RESOURCE_TYPES) {
      if (type.toLowerCase() === singular) return type
    }
  }
  return null
}

// ── Coverage matrix ────────────────────────────────────────────────────────

export type CellState =
  /** The XSLT runs and its output is checked against a US Core profile. */
  | 'profiled'
  /** The XSLT runs, but only base FHIR R4 applies. */
  | 'wired'
  /** The XSLT is on disk but no build ever reaches it. */
  | 'orphan'
  | 'none'

export interface CoverageCell {
  state: CellState
  file: string | null
  variant: string | null
  usCoreProfile: string | null
}

export interface CoverageRow {
  canonical: string
  label: string
  cells: Record<string, CoverageCell>
  wiredCount: number
  orphanCount: number
}

export interface CoverageMatrix {
  resourceTypes: string[]
  rows: CoverageRow[]
}

/** Which canonical folder an on-disk XSLT belongs to, e.g. "Clinical/x.xsl" → clinical. */
function canonicalOfTransform(path: string): string | null {
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (!dir) return null
  const key = normCanonicalId(dir.replace(/-/g, ''))
  const hit = CANONICALS.find((c) => normCanonicalId(c.name) === key)
  return hit?.name ?? null
}

export function buildCoverageMatrix(builds: Build[], transforms: TransformFile[]): CoverageMatrix {
  const rows: CoverageRow[] = []
  const typeSet = new Set<string>()

  for (const canonical of CANONICALS) {
    const cells: Record<string, CoverageCell> = {}
    const wanted = normCanonicalId(canonical.name)

    const specs = builds
      .filter((b) => normCanonicalId(b.canonical_name) === wanted)
      .flatMap((b) => transformSpecsForBuild(b, transforms))

    const wiredFiles = new Set(specs.map((s) => s.file.toLowerCase()))

    for (const spec of specs) {
      if (!spec.resourceType) continue
      typeSet.add(spec.resourceType)
      const profile = usCoreProfileFor(spec.resourceType)
      const { variant } = resourceTypeFromXsltName(spec.file)
      // A resource reached by several XSLTs keeps the strongest cell state.
      const existing = cells[spec.resourceType]
      if (existing?.state === 'profiled') continue
      cells[spec.resourceType] = {
        state: profile ? 'profiled' : 'wired',
        file: spec.file,
        variant,
        usCoreProfile: profile,
      }
    }

    // XSLTs sitting in this canonical's folder that no build ever runs. `_flat` helpers are
    // library code, not outputs, so they don't count as orphans.
    let orphanCount = 0
    for (const t of transforms) {
      if (canonicalOfTransform(t.filename) !== canonical.name) continue
      if (TRANSFORM_EXCLUDE.test(t.filename)) continue
      if (wiredFiles.has(t.filename.toLowerCase())) continue

      const { type, variant } = resourceTypeFromXsltName(t.filename)
      if (!type) continue
      orphanCount++
      typeSet.add(type)
      if (!cells[type]) {
        cells[type] = { state: 'orphan', file: t.filename, variant, usCoreProfile: null }
      }
    }

    rows.push({
      canonical: canonical.name,
      label: canonical.label,
      cells,
      wiredCount: specs.filter((s) => s.resourceType).length,
      orphanCount,
    })
  }

  return { resourceTypes: [...typeSet].sort((a, b) => a.localeCompare(b)), rows }
}
