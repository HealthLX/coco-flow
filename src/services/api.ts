const BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface TransformFileEntry {
  transform_file: string
  resource_type?: string
}

export interface Build {
  canonical_name: string
  root_element_name: string
  schema_file_name: string
  output_file_name: string
  transform_file: string | null
  transform_files?: TransformFileEntry[] | null
  /** Folder-driven transforms: every *.xsl in this dir runs (resolved server-side). */
  transform_dir?: string | null
  provider_directory_child?: string | null
  fhir_profile?: string | null
}

function normKey(row: Record<string, unknown>, snake: string, camel: string): unknown {
  if (snake in row && row[snake] !== undefined) return row[snake]
  if (camel in row && row[camel] !== undefined) return row[camel]
  return undefined
}

/** Normalize canonical / schema ids from API (trim + lowercase). */
export function normCanonicalId(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
}

/** Provider builds use transform_files in YAML; infer true if list missing but row matches official layout. */
function inferProviderBuildHasTransforms(b: Build): boolean {
  if (normCanonicalId(b.canonical_name) !== 'providerdirectory') return false
  const schema = normCanonicalId(b.schema_file_name)
  if (schema !== 'provider-directory.xsd') return false
  const out = String(b.output_file_name ?? '')
    .trim()
    .toLowerCase()
  return out.startsWith('provider-directory-') && out.endsWith('-sample.xml')
}

/** True if this build has at least one XSLT (single, list, or folder-driven dir). */
export function buildHasTransforms(b: Build): boolean {
  if (b.transform_file && String(b.transform_file).trim()) return true
  const list = b.transform_files
  if (Array.isArray(list) && list.length > 0) return true
  if (b.transform_dir && String(b.transform_dir).trim()) return true
  return inferProviderBuildHasTransforms(b)
}

/** Number of XSLT steps for this build (roster: 1; provider variant: length of transform_files). */
export function countXsltSteps(b: Build): number {
  let n = 0
  if (b.transform_file && String(b.transform_file).trim()) n += 1
  if (Array.isArray(b.transform_files)) n += b.transform_files.length
  if (n > 0) return n
  if (inferProviderBuildHasTransforms(b)) {
    const child = normCanonicalId(b.provider_directory_child)
    if (child === 'providing_organization') return 4
    return 5
  }
  return 0
}

/** Full sample_builds.yaml payload from GET /config (includes nested transform_files). */
export interface SampleBuildsConfig {
  core_schema_path?: string
  builds?: Build[] | null
}

function normalizeBuildRow(row: unknown): Build {
  if (!row || typeof row !== 'object') {
    return {
      canonical_name: '',
      root_element_name: '',
      schema_file_name: '',
      output_file_name: '',
      transform_file: null,
    }
  }
  const b = row as Record<string, unknown>
  const tf = normKey(b, 'transform_file', 'transformFile')
  const transform_file = typeof tf === 'string' && tf.trim() ? tf : null

  let transform_files: TransformFileEntry[] | undefined
  const rawList = normKey(b, 'transform_files', 'transformFiles')
  const list: unknown[] = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === 'object'
      ? Object.values(rawList as object)
      : []
  if (list.length > 0) {
    const entries: TransformFileEntry[] = []
    for (const x of list) {
      if (x == null || typeof x !== 'object') continue
      const e = x as Record<string, unknown>
      const pathRaw = normKey(e, 'transform_file', 'transformFile')
      const path =
        typeof pathRaw === 'string'
          ? pathRaw
          : pathRaw != null
            ? String(pathRaw)
            : ''
      if (!path.trim()) continue
      const rt = normKey(e, 'resource_type', 'resourceType')
      const item: TransformFileEntry = { transform_file: path.trim() }
      if (typeof rt === 'string' && rt) item.resource_type = rt
      entries.push(item)
    }
    if (entries.length > 0) transform_files = entries
  }

  const tdir = normKey(b, 'transform_dir', 'transformDir')
  const transform_dir = typeof tdir === 'string' && tdir.trim() ? tdir.trim() : null
  const pdc = normKey(b, 'provider_directory_child', 'providerDirectoryChild')
  const fhir = normKey(b, 'fhir_profile', 'fhirProfile')
  const canon = normKey(b, 'canonical_name', 'canonicalName')
  const rootEl = normKey(b, 'root_element_name', 'rootElementName')
  const schemaFn = normKey(b, 'schema_file_name', 'schemaFileName')
  const outFn = normKey(b, 'output_file_name', 'outputFileName')

  return {
    canonical_name: String(canon ?? '').trim(),
    root_element_name: String(rootEl ?? '').trim(),
    schema_file_name: String(schemaFn ?? '').trim(),
    output_file_name: String(outFn ?? '').trim(),
    transform_file,
    transform_files,
    transform_dir,
    provider_directory_child:
      pdc == null || pdc === '' ? null : String(pdc).trim(),
    fhir_profile: fhir == null || fhir === '' ? undefined : String(fhir).trim(),
  }
}

/** Prefer GET /config so nested transform_lists match sample_builds.yaml; fall back to GET /builds. */
export async function getSampleBuildsConfig(): Promise<SampleBuildsConfig> {
  return apiFetch<SampleBuildsConfig>('/config')
}

/** Legacy: sample_builds.yaml multi-row Provider Directory disambiguation only. Omit in normal use. */
export type ProviderDirectoryChild = 'practitioner' | 'providing_organization'

/** Prefer unified PD build (no `provider_directory_child`); else first PD build with XSLT. */
export function selectProviderDirectoryBuild(builds: Build[]): Build | undefined {
  const pd = builds.filter(
    (b) => normCanonicalId(b.canonical_name) === 'providerdirectory' && buildHasTransforms(b),
  )
  const unified = pd.find((b) => !String(b.provider_directory_child ?? '').trim())
  return unified ?? pd[0]
}

export interface SampleFile {
  filename: string
  type: 'canonical' | 'fhir'
  target: string
  path?: string
  size?: number
  modified?: string
}

export interface SchemaFile {
  filename: string
  path?: string
  size?: number
  version?: string
}

export interface TransformFile {
  filename: string
  /** Basename for display (e.g. "Clinical_Patient.xsl"); derived from filename. */
  displayName?: string
  /** Schema subfolder when transforms are organized (e.g. "Clinical"); undefined for flat layout. */
  group?: string
  path?: string
  size?: number
  source?: string
  target_format?: string
}

export interface GenerateResult {
  success: boolean
  target: string
  filename?: string
  message?: string
  error?: string
}

export interface TransformResult {
  success: boolean
  target: string
  filename?: string
  message?: string
  error?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/** Fetch a file as a blob and trigger a browser download. */
export async function downloadFile(apiPath: string, suggestedName?: string): Promise<void> {
  const res = await fetch(`${BASE}${apiPath}`)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const contentDisposition = res.headers.get('content-disposition')
  const serverFilename = contentDisposition?.match(/filename="?([^";\n]+)"?/)?.[1]
  a.download = serverFilename ?? suggestedName ?? 'download'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Config / Discovery ───────────────────────────────────────────────────────

/** GET /canonicals — returns list of canonical names (e.g. ["roster","eob",...]) */
export async function getCanonicls(): Promise<string[]> {
  return apiFetch<string[]>('/canonicals')
}

/** All builds from sample config (normalized). Uses /config first for complete YAML nesting. */
export async function getBuilds(): Promise<Build[]> {
  try {
    const cfg = await getSampleBuildsConfig()
    const raw = cfg.builds
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((row) => normalizeBuildRow(row))
    }
  } catch {
    /* older API hosts may lack /config */
  }
  const rows = await apiFetch<unknown[]>('/builds')
  if (!Array.isArray(rows)) return []
  return rows.map((row) => normalizeBuildRow(row))
}

// ── Samples ──────────────────────────────────────────────────────────────────

/** GET /samples/canonical — list all canonical sample files with metadata */
export async function getCanonicalSamples(): Promise<SampleFile[]> {
  const data = await apiFetch<string[] | SampleFile[]>('/samples/canonical')
  return (data as (string | SampleFile)[]).map((item) => {
    if (typeof item === 'string') {
      return { filename: item, type: 'canonical' as const, target: item.replace(/-sample.*\.xml$/, '') }
    }
    return {
      ...item,
      type: 'canonical' as const,
      target: item.target ?? item.filename.replace(/-sample.*\.xml$/, ''),
    }
  })
}

/** GET /samples/fhir — list all FHIR sample files with metadata */
export async function getFhirSamples(): Promise<SampleFile[]> {
  const data = await apiFetch<string[] | SampleFile[]>('/samples/fhir')
  return (data as (string | SampleFile)[]).map((item) => {
    if (typeof item === 'string') {
      return { filename: item, type: 'fhir' as const, target: item.replace(/-fhir.*\.xml$/, '') }
    }
    return {
      ...item,
      type: 'fhir' as const,
      target: item.target ?? item.filename.replace(/-fhir.*\.xml$/, ''),
    }
  })
}

/** POST /samples/generate/{target} — generate a canonical sample */
export async function generateSample(target: string): Promise<GenerateResult> {
  return apiFetch<GenerateResult>(`/samples/generate/${target}`, { method: 'POST' })
}

/** POST /samples/generate (all: true) — generate all samples */
export async function generateAllSamples(): Promise<GenerateResult[]> {
  return apiFetch<GenerateResult[]>('/samples/generate', {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  })
}

/** GET /samples/canonical/{filename} — download a canonical sample XML */
export async function downloadCanonicalSample(filename: string): Promise<void> {
  return downloadFile(`/samples/canonical/${filename}`, filename)
}

/** GET /samples/fhir/{filename} — download a FHIR sample XML */
export async function downloadFhirSample(filename: string): Promise<void> {
  return downloadFile(`/samples/fhir/${filename}`, filename)
}

/** GET /samples/canonical/{target}/regenerate — regenerate + stream back */
export async function regenerateAndDownload(target: string): Promise<void> {
  return downloadFile(`/samples/canonical/${target}/regenerate`, `${target}-sample.xml`)
}

/**
 * POST /samples/generate/{target}/content — generate and return XML as text.
 * Omit `providerDirectoryChild` for the default single providerdirectory build. Pass only when
 * sample_builds.yaml defines multiple providerdirectory rows (legacy).
 */
export async function generateSampleContent(
  target: string,
  options?: { providerDirectoryChild?: ProviderDirectoryChild },
): Promise<string> {
  const params = new URLSearchParams()
  if (options?.providerDirectoryChild) {
    params.set('provider_directory_child', options.providerDirectoryChild)
  }
  const q = params.toString()
  const url = `${BASE}/samples/generate/${encodeURIComponent(target)}/content${q ? `?${q}` : ''}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Generate failed ${res.status}: ${text}`)
  }
  return res.text()
}

/** POST /samples/generate/custom — upload XSD and return { xml, filename } for preview */
export async function generateCustomXsdContent(
  file: File,
  rootElement: string,
): Promise<{ xml: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('root_element', rootElement)
  const res = await fetch(`${BASE}/samples/generate/custom`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Custom XSD generate failed ${res.status}: ${text}`)
  }
  const xml = await res.text()
  const cd = res.headers.get('content-disposition')
  const filename = cd?.match(/filename="?([^";\n]+)"?/)?.[1] ?? 'custom-sample.xml'
  return { xml, filename }
}

// ── Transform ────────────────────────────────────────────────────────────────

/** POST /transform/{target} — run XSLT transform for a target */
export async function transformSample(target: string): Promise<TransformResult> {
  return apiFetch<TransformResult>(`/transform/${target}`, { method: 'POST' })
}

export interface FhirTransformPart {
  filename: string
  resourceType: string
  xml: string
}

export type FhirTransformResult =
  | { kind: 'single'; xml: string }
  | { kind: 'multipart'; parts: FhirTransformPart[] }

function parseMultipartMixedXml(body: string, contentType: string): FhirTransformPart[] {
  const m = contentType.match(/boundary=([^;\s"]+)/i)
  if (!m) throw new Error('Multipart response missing boundary')
  const boundary = m[1].replace(/^"|"$/g, '')
  const delimiter = `--${boundary}`
  const rawParts = body.split(delimiter)
  const out: FhirTransformPart[] = []
  for (const part of rawParts) {
    let chunk = part.replace(/^\r\n/, '')
    if (chunk.trim() === '' || chunk.trim() === '--') continue
    const crlfSplit = chunk.split(/\r\n\r\n/)
    const lfSplit = chunk.split(/\n\n/)
    let headerBlock = ''
    let payload = ''
    if (crlfSplit.length >= 2) {
      headerBlock = crlfSplit[0]
      payload = crlfSplit.slice(1).join('\r\n\r\n')
    } else if (lfSplit.length >= 2) {
      headerBlock = lfSplit[0]
      payload = lfSplit.slice(1).join('\n\n')
    } else {
      continue
    }
    payload = payload.replace(/\r\n$/, '').replace(/\n$/, '')
    let filename = ''
    let nameField = ''
    for (const line of headerBlock.split(/\r\n/)) {
      const fn = line.match(/filename="([^"]+)"/i)
      const nm = line.match(/;\s*name="([^"]+)"/i)
      if (fn) filename = fn[1]
      if (nm) nameField = nm[1]
    }
    if (!nameField) {
      const cdName = headerBlock.match(/Content-Disposition:[^\n]*\bname="([^"]+)"/i)
      if (cdName) nameField = cdName[1]
    }
    if (payload.trim()) {
      const fn = filename || nameField || 'part.xml'
      out.push({
        filename: fn,
        resourceType: nameField || fn.replace(/-fhir.*$/i, '').replace(/\.xml$/i, '') || 'resource',
        xml: payload,
      })
    }
  }
  return out
}

/**
 * POST /transform/{target}/content — FHIR XML; multipart when a build has multiple XSLTs.
 * Omit `providerDirectoryChild` for the default single providerdirectory build. Pass only for
 * legacy multi-build YAML.
 */
export async function transformSampleContent(
  target: string,
  options?: { providerDirectoryChild?: ProviderDirectoryChild },
): Promise<FhirTransformResult> {
  const params = new URLSearchParams()
  if (options?.providerDirectoryChild) {
    params.set('provider_directory_child', options.providerDirectoryChild)
  }
  const q = params.toString()
  const url = `${BASE}/transform/${encodeURIComponent(target)}/content${q ? `?${q}` : ''}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Transform failed ${res.status}: ${text}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  const body = await res.text()
  if (ct.includes('multipart/')) {
    const parts = parseMultipartMixedXml(body, ct)
    if (!parts.length) throw new Error('Empty multipart transform response')
    return { kind: 'multipart', parts }
  }
  return { kind: 'single', xml: body }
}

/** POST /transform/upload — upload canonical XML + XSLT, get FHIR XML as text */
export async function transformUpload(
  canonicalXml: string,
  canonicalFilename: string,
  xsltFile: File,
): Promise<string> {
  const form = new FormData()
  form.append(
    'canonical_xml',
    new Blob([canonicalXml], { type: 'application/xml' }),
    canonicalFilename,
  )
  form.append('xslt_file', xsltFile)
  const res = await fetch(`${BASE}/transform/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Transform upload failed ${res.status}: ${text}`)
  }
  return res.text()
}

// ── Validation (XSD) ─────────────────────────────────────────────────────────

export interface ValidationIssue {
  message: string
  path?: string | null
  line?: number | null
}

export interface ValidationResult {
  valid: boolean
  schema: string
  error_count: number
  errors: ValidationIssue[]
}

/** POST /validate/{schemaFilename} — validate canonical XML text against a built-in XSD. */
export async function validateCanonicalXml(
  xml: string,
  schemaFilename: string,
): Promise<ValidationResult> {
  const res = await fetch(`${BASE}/validate/${encodeURIComponent(schemaFilename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Validation failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<ValidationResult>
}

/** POST /validate/upload — validate canonical XML against a user-uploaded XSD. */
export async function validateCustomXml(
  xml: string,
  xmlFilename: string,
  xsdFile: File,
): Promise<ValidationResult> {
  const form = new FormData()
  form.append('xml_file', new Blob([xml], { type: 'application/xml' }), xmlFilename)
  form.append('xsd_file', xsdFile)
  const res = await fetch(`${BASE}/validate/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Validation failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<ValidationResult>
}

// ── Validation (FHIR profile) ────────────────────────────────────────────────

export const US_CORE_VERSION = '6.1.0'
const US_CORE_SD = 'http://hl7.org/fhir/us/core/StructureDefinition'

/**
 * US Core 6.1.0 profile per resource type, for the types where US Core defines exactly one.
 *
 * Deliberately omitted:
 *  - Observation (22 profiles), Condition (2), DiagnosticReport (2) — ambiguous; the right
 *    profile depends on the clinical item, which a resource type alone can't tell us.
 *  - ExplanationOfBenefit, Claim, Coverage's InsurancePlan, MedicationKnowledge, List,
 *    HealthcareService, OrganizationAffiliation — US Core 6.1.0 defines no profile for them.
 *
 * Anything not listed here validates against base FHIR R4.
 * The `|6.1.0` suffix pins the version: the validator resolves it and rejects an unknown
 * version rather than ignoring it.
 */
export const US_CORE_PROFILE_BY_TYPE: Record<string, string> = {
  AllergyIntolerance: `${US_CORE_SD}/us-core-allergyintolerance|${US_CORE_VERSION}`,
  CarePlan: `${US_CORE_SD}/us-core-careplan|${US_CORE_VERSION}`,
  CareTeam: `${US_CORE_SD}/us-core-careteam|${US_CORE_VERSION}`,
  Coverage: `${US_CORE_SD}/us-core-coverage|${US_CORE_VERSION}`,
  DocumentReference: `${US_CORE_SD}/us-core-documentreference|${US_CORE_VERSION}`,
  Encounter: `${US_CORE_SD}/us-core-encounter|${US_CORE_VERSION}`,
  Goal: `${US_CORE_SD}/us-core-goal|${US_CORE_VERSION}`,
  Immunization: `${US_CORE_SD}/us-core-immunization|${US_CORE_VERSION}`,
  Location: `${US_CORE_SD}/us-core-location|${US_CORE_VERSION}`,
  Medication: `${US_CORE_SD}/us-core-medication|${US_CORE_VERSION}`,
  MedicationDispense: `${US_CORE_SD}/us-core-medicationdispense|${US_CORE_VERSION}`,
  MedicationRequest: `${US_CORE_SD}/us-core-medicationrequest|${US_CORE_VERSION}`,
  Organization: `${US_CORE_SD}/us-core-organization|${US_CORE_VERSION}`,
  Patient: `${US_CORE_SD}/us-core-patient|${US_CORE_VERSION}`,
  Practitioner: `${US_CORE_SD}/us-core-practitioner|${US_CORE_VERSION}`,
  PractitionerRole: `${US_CORE_SD}/us-core-practitionerrole|${US_CORE_VERSION}`,
  Procedure: `${US_CORE_SD}/us-core-procedure|${US_CORE_VERSION}`,
  Provenance: `${US_CORE_SD}/us-core-provenance|${US_CORE_VERSION}`,
  QuestionnaireResponse: `${US_CORE_SD}/us-core-questionnaireresponse|${US_CORE_VERSION}`,
  RelatedPerson: `${US_CORE_SD}/us-core-relatedperson|${US_CORE_VERSION}`,
  ServiceRequest: `${US_CORE_SD}/us-core-servicerequest|${US_CORE_VERSION}`,
  Specimen: `${US_CORE_SD}/us-core-specimen|${US_CORE_VERSION}`,
}

/** US Core 6.1.0 profile for a resource type, or null when US Core doesn't define one. */
export function usCoreProfileFor(resourceType: string | null | undefined): string | null {
  return resourceType ? (US_CORE_PROFILE_BY_TYPE[resourceType] ?? null) : null
}

/** Ensure a profile canonical carries an explicit version. */
export function pinUsCoreVersion(profile: string): string {
  return profile.includes('|') ? profile : `${profile}|${US_CORE_VERSION}`
}

/**
 * Offered only for custom XSLT output, where no resource type mapping is assumed.
 * Built-in transforms pick a profile per resource automatically.
 */
export const FHIR_PROFILE_OPTIONS: { label: string; value: string | null }[] = [
  {
    label: `US Core ${US_CORE_VERSION} Patient (USCDI v3)`,
    value: `${US_CORE_SD}/us-core-patient|${US_CORE_VERSION}`,
  },
  { label: 'Base FHIR R4 (No Profile)', value: null },
]

const FHIR_NS = 'http://hl7.org/fhir'

/**
 * Resource types the validator can be handed as a document root. The US Core map covers the
 * profiled ones; the rest appear in transform output but validate against base FHIR R4.
 */
export const FHIR_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(US_CORE_PROFILE_BY_TYPE),
  'Basic',
  'Bundle',
  'Claim',
  'Condition',
  'Device',
  'DiagnosticReport',
  'Endpoint',
  'ExplanationOfBenefit',
  'HealthcareService',
  'InsurancePlan',
  'List',
  'MedicationKnowledge',
  'Observation',
  'OrganizationAffiliation',
])

/** Root element of a FHIR XML document, e.g. "Patient". Skips the XML declaration. */
export function rootResourceType(xml: string): string | null {
  return xml.match(/<([A-Za-z][A-Za-z0-9]*)[\s>]/)?.[1] ?? null
}

export interface FhirFileToValidate {
  fileName: string
  xml: string
  /** Profile canonical for this resource; null validates against base FHIR R4. */
  profile: string | null
}

/** One standalone FHIR resource pulled out of a transform's output document. */
export interface FhirResourceDoc {
  fileName: string
  xml: string
  resourceType: string | null
}

/**
 * Several Clinical transforms wrap their resources in a collection element — `<Observations>`,
 * `<Conditions>`, and so on — which is not a FHIR resource, so the validator rejects the
 * document outright. Each child already declares the FHIR namespace, so we hand the validator
 * one resource per child instead. Anything we don't recognise is passed through untouched, so
 * the validator reports the real problem rather than one we invented.
 */
export function explodeFhirXml(fileName: string, xml: string): FhirResourceDoc[] {
  const whole = [{ fileName, xml, resourceType: rootResourceType(xml) }]

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (!root || doc.getElementsByTagName('parsererror').length > 0) return whole
  if (FHIR_RESOURCE_TYPES.has(root.localName)) return whole

  const children = Array.from(root.children)
  const isResource = (el: Element) =>
    el.namespaceURI === FHIR_NS && FHIR_RESOURCE_TYPES.has(el.localName)
  if (children.length === 0 || !children.every(isResource)) return whole

  const serializer = new XMLSerializer()
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''

  return children.map((child, i) => ({
    fileName: `${base}-${child.localName}${i + 1}${ext}`,
    xml: `<?xml version="1.0" encoding="utf-8"?>\n${serializer.serializeToString(child)}`,
    resourceType: child.localName,
  }))
}

/** Validation outcome for a single FHIR resource. */
export interface FhirFileValidation {
  fileName: string
  /** Profile URL used, or a label when validated against base FHIR R4. */
  schema: string
  valid: boolean
  error_count: number
  errors: ValidationIssue[]
}

export interface FhirValidationResponse {
  /** True only when every resource is valid. */
  valid: boolean
  error_count: number
  files: FhirFileValidation[]
}

/** Describes the upstream validator call, so the UI can show what it is doing while it runs. */
export interface FhirValidatorConfig {
  endpoint: string
  method: 'POST'
  fhirVersion: string
  igs: string[]
  txServer: string
  sessionActive: boolean
  timeoutMs: number
  maxAttempts: number
}

/** GET /fhir-validate/config — the endpoint, IG and terminology server used for each call. */
export async function getFhirValidatorConfig(): Promise<FhirValidatorConfig> {
  const res = await fetch(`${BASE}/fhir-validate/config`)
  if (!res.ok) throw new Error(`Could not read validator config: ${res.statusText}`)
  return res.json() as Promise<FhirValidatorConfig>
}

/**
 * POST /fhir-validate — validate FHIR XML, each resource against its own profile.
 * Handled by the Express server, which forwards to HL7's public validator.
 */
export async function validateFhirXml(
  files: FhirFileToValidate[],
): Promise<FhirValidationResponse> {
  const res = await fetch(`${BASE}/fhir-validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { error?: string; detail?: string }
      detail = body.error ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<FhirValidationResponse>
}

// ── Artifacts (Schemas & Transforms) ─────────────────────────────────────────

/** GET /schemas — list all XSD schema filenames */
export async function getSchemas(): Promise<SchemaFile[]> {
  const data = await apiFetch<string[] | SchemaFile[]>('/schemas')
  return (data as (string | SchemaFile)[]).map((item) =>
    typeof item === 'string' ? { filename: item } : item
  )
}

/** GET /schemas/{filename} — download a schema file */
export async function downloadSchema(filename: string): Promise<void> {
  return downloadFile(`/schemas/${filename}`, filename)
}

/** GET /schemas/{filename} — fetch raw XSD content as text (for in-app preview). */
export async function fetchSchemaContent(filename: string): Promise<string> {
  const res = await fetch(`${BASE}/schemas/${encodeURIComponent(filename)}`)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to load schema ${res.status}: ${text}`)
  }
  return res.text()
}

/**
 * GET /transforms — list all XSLT transform filenames.
 *
 * Works with both backend layouts:
 *  - flat (older coco-canonical): "roster-patient.xsl"
 *  - schema-organized (current): "Roster/roster-patient.xsl", "Clinical/Clinical_Patient.xsl"
 * The returned `filename` is the path relative to transforms/v10.0/ (used as-is for download);
 * `displayName` is the basename for UI, and `group` is the schema folder when present.
 */
export async function getTransforms(): Promise<TransformFile[]> {
  const data = await apiFetch<string[] | TransformFile[]>('/transforms')
  return (data as (string | TransformFile)[]).map((item) => {
    const entry: TransformFile = typeof item === 'string' ? { filename: item } : item
    const rel = entry.filename
    const slash = rel.lastIndexOf('/')
    return {
      ...entry,
      displayName: slash >= 0 ? rel.slice(slash + 1) : rel,
      group: slash >= 0 ? rel.slice(0, slash) : undefined,
    }
  })
}

/**
 * GET /transforms/{filename} — download a transform file.
 * `filename` may be a nested subpath (e.g. "Clinical/Clinical_Patient.xsl"); the slashes are
 * preserved in the URL (the API serves it via a path route) and the saved file uses the basename.
 */
export async function downloadTransform(filename: string): Promise<void> {
  const baseName = filename.slice(filename.lastIndexOf('/') + 1)
  return downloadFile(`/transforms/${filename}`, baseName)
}

/**
 * GET /transforms/{filename} as text.
 *
 * Needed because there is no route that transforms *posted* canonical XML with a built-in
 * build's XSLTs — /transform/{target}/content ignores the body and transforms the file on
 * disk. To transform edited XML we fetch each XSLT and post it to /transform/upload
 * ourselves. `downloadTransform` can't be reused: it triggers a browser save.
 */
export async function fetchTransformContent(filename: string): Promise<string> {
  const res = await fetch(`${BASE}/transforms/${filename}`)
  if (!res.ok) {
    throw new Error(`Could not read transform ${filename}: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

// ── Custom XSD upload ─────────────────────────────────────────────────────────

/**
 * POST /samples/generate/custom — upload an XSD and get back a generated sample XML download.
 * Uses FormData (not JSON) so we omit the Content-Type header and let the browser set it.
 */
export async function uploadCustomXsd(file: File, rootElement: string): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('root_element', rootElement)

  const res = await fetch(`${BASE}/samples/generate/custom`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Upload failed ${res.status}: ${text}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const cd = res.headers.get('content-disposition')
  a.download = cd?.match(/filename="?([^";\n]+)"?/)?.[1] ?? `custom-sample.xml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
