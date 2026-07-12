/**
 * Pure derivation logic for the canonical → FHIR pipeline.
 *
 * Shared by /workspace (the original stepped page) and /flow (the pipeline rail), so
 * the two cannot drift on what gets validated, against which profile, under what name.
 * Nothing here touches React or the network.
 */
import {
  buildHasTransforms,
  explodeFhirXml,
  normCanonicalId,
  type Build,
  type FhirFileValidation,
  type FhirTransformResult,
} from '../services/api'

// ── Canonical definitions ─────────────────────────────────────────────────

export interface CanonicalDef {
  name: string
  label: string
  schemaFile: string
  description: string
}

export const CANONICALS: CanonicalDef[] = [
  {
    name: 'roster',
    label: 'Roster',
    schemaFile: 'Roster.xsd',
    description: 'Member demographics, coverage, addresses and related persons',
  },
  {
    name: 'eob',
    label: 'EOB',
    schemaFile: 'EOB.xsd',
    description: 'Explanation of Benefits: claims and adjudication data',
  },
  {
    name: 'formulary',
    label: 'Formulary',
    schemaFile: 'Formulary.xsd',
    description: 'Drug formulary entries and medication coverage plans',
  },
  {
    name: 'providerdirectory',
    label: 'Provider Directory',
    schemaFile: 'Provider-Directory.xsd',
    description:
      'Practitioner and organization providers in one canonical file: NPIs, specialties, networks',
  },
  {
    name: 'clinical',
    label: 'Clinical',
    schemaFile: 'Clinical.xsd',
    description: 'Clinical patient data, diagnoses, procedures and encounters',
  },
]

export function canonicalDef(name: string | null): CanonicalDef | undefined {
  if (!name) return undefined
  const want = normCanonicalId(name)
  return CANONICALS.find((c) => normCanonicalId(c.name) === want)
}

// ── FHIR validation row model ─────────────────────────────────────────────

/** One resource queued for validation, with the profile it will be checked against. */
export interface FhirDoc {
  fileName: string
  xml: string
  resourceType: string | null
  profile: string | null
}

/** Each resource validates on its own, so each carries its own status and timing. */
export type FhirRowState =
  | { status: 'queued' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; elapsedMs: number; result: FhirFileValidation }
  | { status: 'error'; elapsedMs: number; message: string }

/** Upstream is a shared public validator, so keep only a few resources in flight at once. */
export const FHIR_VALIDATE_CONCURRENCY = 4

// ── Helpers ───────────────────────────────────────────────────────────────

export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++])
    }
  })
  await Promise.all(runners)
}

/** Schema has at least one build with XSLT (transform_file or transform_files in YAML). */
export function schemaHasBuiltinTransforms(builds: Build[], canonicalName: string): boolean {
  const want = normCanonicalId(canonicalName)
  return builds.some((b) => normCanonicalId(b.canonical_name) === want && buildHasTransforms(b))
}

export function canonicalSampleFilename(canonicalName: string): string {
  if (canonicalName === 'providerdirectory') return 'provider-directory-sample.xml'
  return `${canonicalName}-sample.xml`
}

/** Base name for single-FHIR download/preview titles (multipart uses each part filename from the API). */
export function fhirExportBasename(canonicalName: string): string {
  if (canonicalName === 'providerdirectory') return 'providerdirectory'
  return canonicalName
}

/** "…/us-core-patient|6.1.0" → "us-core-patient|6.1.0"; base-R4 label passes through. */
export function profileLabel(schema: string): string {
  return schema.includes('/') ? (schema.split('/').pop() ?? schema) : schema
}

/**
 * The resources that will be validated, one row each. Drives both the pre-click profile
 * preview and the post-click rows, so the two cannot drift. Transforms that wrap their
 * output in a collection element are split here into one resource per child.
 */
export function deriveFhirDocs(
  fhirResult: FhirTransformResult | null,
  selectedCanonical: string | null,
  profileForResource: (resourceType: string | null) => string | null,
): FhirDoc[] {
  if (!fhirResult) return []
  const base = selectedCanonical ? fhirExportBasename(selectedCanonical) : 'fhir-output'
  const documents =
    fhirResult.kind === 'single'
      ? [{ fileName: `${base}-fhir.xml`, xml: fhirResult.xml }]
      : fhirResult.parts.map((p) => ({ fileName: p.filename, xml: p.xml }))

  return documents
    .flatMap((d) => explodeFhirXml(d.fileName, d.xml))
    .map((d) => ({ ...d, profile: profileForResource(d.resourceType) }))
}

export function downloadXmlFromMemory(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
