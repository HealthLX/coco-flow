import { createContext, useContext } from 'react'
import type {
  Build,
  FhirFileToValidate,
  FhirFileValidation,
  FhirTransformPart,
  FhirTransformResult,
  FhirValidatorConfig,
  TransformFile,
  ValidationResult,
} from '../services/api'

/**
 * Everything the pipeline can ask the outside world to do — and nothing else.
 *
 * This is the seam that lets the fixture prototype and the live app run the exact same
 * components. `liveDriver` is the only module that talks to services/api.ts; `fixtureDriver`
 * replays checked-in sample files on a timer. Components never know which one they have.
 */
export interface PipelineDriver {
  listBuilds(): Promise<Build[]>
  listTransforms(): Promise<TransformFile[]>

  generate(canonical: string): Promise<{ xml: string; filename: string }>
  generateFromXsd(file: File, rootElement: string): Promise<{ xml: string; filename: string }>

  validateCanonical(xml: string, schemaFile: string): Promise<ValidationResult>
  validateCanonicalCustom(xml: string, filename: string, xsd: File): Promise<ValidationResult>

  /** Server-side sample path: fast, but transforms the file on disk. Used when not dirty. */
  transform(canonical: string): Promise<FhirTransformResult>
  /**
   * Edited-XML path. The API has no route that transforms posted content with a built-in
   * build's XSLTs, so this fans out over /transform/upload — one call per XSLT. `onPart`
   * fires as each lands, so the rail can stream resources in rather than waiting for all 26.
   */
  transformContent(
    canonical: string,
    xml: string,
    filename: string,
    onPart?: (part: FhirTransformPart) => void,
  ): Promise<FhirTransformResult>
  transformWithXslt(xml: string, filename: string, xslt: File): Promise<string>

  fhirValidatorConfig(): Promise<FhirValidatorConfig>
  validateFhirResource(doc: FhirFileToValidate): Promise<FhirFileValidation>
}

export const DriverContext = createContext<PipelineDriver | null>(null)

export function useDriver(): PipelineDriver {
  const driver = useContext(DriverContext)
  if (!driver) throw new Error('useDriver must be used within a DriverContext.Provider')
  return driver
}
