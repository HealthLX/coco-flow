const BASE = '/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Build {
  canonical_name: string
  root_element_name: string
  schema_file_name: string
  output_file_name: string
  transform_file: string | null
  provider_directory_child?: string | null
  fhir_profile?: string | null
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

/** GET /builds — returns all build configs */
export async function getBuilds(): Promise<Build[]> {
  return apiFetch<Build[]>('/builds')
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

// ── Transform ────────────────────────────────────────────────────────────────

/** POST /transform/{target} — run XSLT transform for a target */
export async function transformSample(target: string): Promise<TransformResult> {
  return apiFetch<TransformResult>(`/transform/${target}`, { method: 'POST' })
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

/** GET /transforms — list all XSLT transform filenames */
export async function getTransforms(): Promise<TransformFile[]> {
  const data = await apiFetch<string[] | TransformFile[]>('/transforms')
  return (data as (string | TransformFile)[]).map((item) =>
    typeof item === 'string' ? { filename: item } : item
  )
}

/** GET /transforms/{filename} — download a transform file */
export async function downloadTransform(filename: string): Promise<void> {
  return downloadFile(`/transforms/${filename}`, filename)
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
