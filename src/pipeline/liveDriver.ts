import {
  convertXmlToJson,
  fetchTransformContent,
  generateCustomXsdContent,
  generateSampleContent,
  getBuilds,
  getFhirValidatorConfig,
  getTransforms,
  normCanonicalId,
  transformSampleContent,
  transformUpload,
  validateCanonicalXml,
  validateCustomXml,
  validateFhirXml,
  type Build,
  type FhirTransformPart,
  type FhirTransformResult,
  type TransformFile,
} from '../services/api'
import { transformSpecsForBuild } from '../lib/coverage'
import { FHIR_VALIDATE_CONCURRENCY, canonicalSampleFilename, runPool } from './derive'
import type { PipelineDriver } from './driver'

/** The only module that talks to services/api.ts. Everything else goes through PipelineDriver. */
export function createLiveDriver(): PipelineDriver {
  // /builds and /transforms are needed to resolve the XSLT fan-out; cache them per driver.
  let buildsCache: Promise<Build[]> | null = null
  let transformsCache: Promise<TransformFile[]> | null = null

  const builds = () => (buildsCache ??= getBuilds())
  const transforms = () => (transformsCache ??= getTransforms())

  return {
    listBuilds: builds,
    listTransforms: transforms,

    async generate(canonical) {
      const xml = await generateSampleContent(canonical)
      return { xml, filename: canonicalSampleFilename(canonical) }
    },

    generateFromXsd: (file, rootElement) => generateCustomXsdContent(file, rootElement),

    validateCanonical: (xml, schemaFile) => validateCanonicalXml(xml, schemaFile),
    validateCanonicalCustom: (xml, filename, xsd) => validateCustomXml(xml, filename, xsd),

    transform: (canonical) => transformSampleContent(canonical),

    /**
     * Transform edited XML. POST /transform/{target}/content ignores its body and transforms
     * the file on disk, so edited content has to go through /transform/upload — which takes
     * one XSLT at a time. We resolve the build's XSLT list ourselves and fan out over it.
     */
    async transformContent(canonical, xml, filename, onPart) {
      const [allBuilds, allTransforms] = await Promise.all([builds(), transforms()])
      const want = normCanonicalId(canonical)
      const specs = allBuilds
        .filter((b) => normCanonicalId(b.canonical_name) === want)
        .flatMap((b) => transformSpecsForBuild(b, allTransforms))

      if (specs.length === 0) {
        throw new Error(`No XSLT is configured for "${canonical}".`)
      }

      const parts: (FhirTransformPart | null)[] = new Array(specs.length).fill(null)
      const failures: string[] = []

      await runPool(
        specs.map((spec, i) => ({ spec, i })),
        FHIR_VALIDATE_CONCURRENCY,
        async ({ spec, i }) => {
          try {
            const xsltText = await fetchTransformContent(spec.file)
            const baseName = spec.file.slice(spec.file.lastIndexOf('/') + 1)
            const xsltFile = new File([xsltText], baseName, { type: 'application/xml' })
            const fhirXml = await transformUpload(xml, filename, xsltFile)
            const part: FhirTransformPart = {
              filename: `${baseName.replace(/\.xslt?$/i, '')}-fhir.xml`,
              resourceType: spec.resourceType ?? 'resource',
              xml: fhirXml,
            }
            parts[i] = part
            onPart?.(part)
          } catch (err) {
            // The CLI treats a failing XSLT as skipped rather than fatal; match that, so one
            // bad transform out of 26 doesn't sink the whole run.
            failures.push(`${spec.file}: ${err instanceof Error ? err.message : String(err)}`)
          }
        },
      )

      const ok = parts.filter((p): p is FhirTransformPart => p !== null)
      if (ok.length === 0) {
        throw new Error(`Every transform failed.\n${failures.join('\n')}`)
      }
      if (ok.length === 1) return { kind: 'single', xml: ok[0].xml }
      return { kind: 'multipart', parts: ok }
    },

    transformWithXslt: (xml, filename, xslt) => transformUpload(xml, filename, xslt),

    fhirValidatorConfig: () => getFhirValidatorConfig(),

    async validateFhirResource(doc) {
      const res = await validateFhirXml([doc])
      const file = res.files[0]
      if (!file) throw new Error('Validator returned no result for this resource.')
      return file
    },

    xmlToJson: (xml) => convertXmlToJson(xml),
  } satisfies PipelineDriver
}

export type { FhirTransformResult }
