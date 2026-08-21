import type {
  Build,
  FhirFileToValidate,
  FhirFileValidation,
  FhirTransformPart,
  FhirTransformResult,
  FhirValidatorConfig,
  TransformFile,
  ValidationIssue,
  ValidationResult,
} from '../../services/api'
import type { PipelineDriver } from '../driver'
import { xmlToJson } from '../../lib/xmlToJson'

import rosterSample from './data/roster-sample.xml?raw'
import rosterPatientFhir from './data/roster-patient-fhir.xml?raw'
import formularySample from './data/formulary-sample.xml?raw'
import formularyInsurancePlan from './data/Formulary_InsurancePlan-fhir.xml?raw'
import formularyMedicationKnowledge from './data/Formulary_MedicationKnowledge-fhir.xml?raw'
import formularyList from './data/Formulary_List-fhir.xml?raw'
import formularyBasic from './data/Formulary_Basic-fhir.xml?raw'

/**
 * Replays checked-in sample files on a timer so the whole pipeline can be driven — and
 * demoed — with no backend running. The XML is the real generator output, not mock data,
 * so what the prototype renders is what the live app renders.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Real shape from GET /builds, trimmed to the five canonicals. */
export const BUILDS: Build[] = [
  {
    canonical_name: 'roster',
    root_element_name: 'roster',
    schema_file_name: 'Roster.xsd',
    output_file_name: 'roster-sample.xml',
    transform_file: 'Roster/roster-patient.xsl',
    fhir_profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  },
  {
    canonical_name: 'eob',
    root_element_name: 'eob_list',
    schema_file_name: 'EOB.xsd',
    output_file_name: 'eob-sample.xml',
    transform_file: null,
    transform_dir: 'EOB',
  },
  {
    canonical_name: 'formulary',
    root_element_name: 'coverage_plans',
    schema_file_name: 'Formulary.xsd',
    output_file_name: 'formulary-sample.xml',
    transform_file: null,
    transform_dir: 'Formulary',
  },
  {
    canonical_name: 'providerdirectory',
    root_element_name: 'providers',
    schema_file_name: 'Provider-Directory.xsd',
    output_file_name: 'provider-directory-sample.xml',
    transform_file: null,
    transform_files: [
      { transform_file: 'Provider-Directory/Provider_Practitioner.xsl', resource_type: 'Practitioner' },
      { transform_file: 'Provider-Directory/Provider_PractitionerRole.xsl', resource_type: 'PractitionerRole' },
      { transform_file: 'Provider-Directory/Provider_Organization.xsl', resource_type: 'Organization' },
      { transform_file: 'Provider-Directory/Provider_Location.xsl', resource_type: 'Location' },
      { transform_file: 'Provider-Directory/Provider_HealthcareService.xsl', resource_type: 'HealthcareService' },
      { transform_file: 'Provider-Directory/Provider_OrganizationAffiliation.xsl', resource_type: 'OrganizationAffiliation' },
    ],
  },
  {
    canonical_name: 'clinical',
    root_element_name: 'clinicals',
    schema_file_name: 'Clinical.xsd',
    output_file_name: 'clinical-sample.xml',
    transform_file: null,
    transform_dir: 'Clinical',
  },
]

/** The real transforms/v10.0/ tree, verbatim — including the `_flat` helpers that never run. */
export const TRANSFORM_FILENAMES: string[] = [
  'Clinical/Clinical_AllergyIntolerance.xsl',
  'Clinical/Clinical_CarePlan.xsl',
  'Clinical/Clinical_CareTeam.xsl',
  'Clinical/Clinical_Condition.xsl',
  'Clinical/Clinical_Device.xsl',
  'Clinical/Clinical_DiagnosticReport.xsl',
  'Clinical/Clinical_DiagnosticReport_Lab.xsl',
  'Clinical/Clinical_DiagnosticReport_Notes.xsl',
  'Clinical/Clinical_DocumentReference.xsl',
  'Clinical/Clinical_Encounter.xsl',
  'Clinical/Clinical_Endpoint.xsl',
  'Clinical/Clinical_Endpoints.xsl',
  'Clinical/Clinical_Goal.xsl',
  'Clinical/Clinical_Immunization.xsl',
  'Clinical/Clinical_Location.xsl',
  'Clinical/Clinical_Medication.xsl',
  'Clinical/Clinical_MedicationRequest.xsl',
  'Clinical/Clinical_Observation_Lab.xsl',
  'Clinical/Clinical_Observation_Smoking.xsl',
  'Clinical/Clinical_Observation_Vital.xsl',
  'Clinical/Clinical_Organization.xsl',
  'Clinical/Clinical_Patient.xsl',
  'Clinical/Clinical_Practitioner.xsl',
  'Clinical/Clinical_PractitionerRole.xsl',
  'Clinical/Clinical_Procedure.xsl',
  'Clinical/Clinical_Provenance.xsl',
  'Core-Model/Insurance_InsurancePlan.xsl',
  'Core-Model/Insurance_Organization.xsl',
  'EOB/EOB_5.2_flat.xsl',
  'EOB/EOB_Claim.xsl',
  'EOB/EOB_ExplanationOfBenefit.xsl',
  'EOB/EOB_Organization.xsl',
  'EOB/EOB_Practitioner.xsl',
  'Formulary/Formulary_Basic.xsl',
  'Formulary/Formulary_InsurancePlan.xsl',
  'Formulary/Formulary_List.xsl',
  'Formulary/Formulary_MedicationKnowledge.xsl',
  'Provider-Directory/Provider_HealthcareService.xsl',
  'Provider-Directory/Provider_Location.xsl',
  'Provider-Directory/Provider_Organization.xsl',
  'Provider-Directory/Provider_OrganizationAffiliation.xsl',
  'Provider-Directory/Provider_Practitioner.xsl',
  'Provider-Directory/Provider_PractitionerRole.xsl',
  // On disk but wired to no build — the coverage matrix is what surfaces this.
  'Roster/Roster_Coverage.xsl',
  'Roster/Roster_Observation.xsl',
  'Roster/Roster_Patient.xsl',
  'Roster/Roster_flat.xsl',
  'Roster/roster-patient.xsl',
]

const TRANSFORMS: TransformFile[] = TRANSFORM_FILENAMES.map((filename) => ({
  filename,
  displayName: filename.slice(filename.lastIndexOf('/') + 1),
  group: filename.slice(0, filename.lastIndexOf('/')),
}))

const SAMPLES: Record<string, string> = {
  roster: rosterSample,
  formulary: formularySample,
}

const FHIR_OUTPUT: Record<string, FhirTransformResult> = {
  roster: { kind: 'single', xml: rosterPatientFhir },
  formulary: {
    kind: 'multipart',
    parts: [
      { filename: 'Formulary_InsurancePlan-fhir.xml', resourceType: 'InsurancePlan', xml: formularyInsurancePlan },
      { filename: 'Formulary_MedicationKnowledge-fhir.xml', resourceType: 'MedicationKnowledge', xml: formularyMedicationKnowledge },
      { filename: 'Formulary_List-fhir.xml', resourceType: 'List', xml: formularyList },
      { filename: 'Formulary_Basic-fhir.xml', resourceType: 'Basic', xml: formularyBasic },
    ],
  },
}

/** Elements the Roster schema requires at the top of the document. */
const REQUIRED_ROSTER_ELEMENTS = ['schema_version', 'sender_id', 'date_time_reported']

/**
 * A real-enough XSD check: well-formedness plus the required top-level elements. It runs
 * against whatever is in the editor, so breaking the sample in the prototype produces a
 * genuine failure on the genuine line — not a canned error.
 */
function checkCanonical(xml: string, schemaFile: string): ValidationResult {
  const errors: ValidationIssue[] = []
  const lines = xml.split('\n')
  const lineOf = (needle: string) => {
    const i = lines.findIndex((l) => l.includes(needle))
    return i === -1 ? null : i + 1
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    const text = parseError.textContent ?? 'Document is not well-formed'
    const lineMatch = text.match(/line[: ]+(\d+)/i)
    errors.push({
      message: text.split('\n')[0].trim(),
      line: lineMatch ? Number(lineMatch[1]) : 1,
      path: null,
    } as ValidationIssue)
  } else if (schemaFile === 'Roster.xsd') {
    for (const el of REQUIRED_ROSTER_ELEMENTS) {
      if (doc.getElementsByTagName(el).length === 0) {
        errors.push({
          message: `Element '{http://cocodata.org}roster': Missing child element(s). Expected is ( {http://cocodata.org}${el} ).`,
          line: lineOf('<roster') ?? 1,
          path: '/roster',
        } as ValidationIssue)
      }
    }
    if (doc.getElementsByTagName('member').length === 0) {
      errors.push({
        message: `Element '{http://cocodata.org}roster': Missing child element(s). Expected is ( {http://cocodata.org}member ).`,
        line: lineOf('<roster') ?? 1,
        path: '/roster',
      } as ValidationIssue)
    }
  }

  return {
    valid: errors.length === 0,
    schema: schemaFile,
    error_count: errors.length,
    errors,
  }
}

/**
 * One resource fails on purpose. A prototype where everything passes doesn't show what the
 * failure state looks like, which is the state the UI most needs to get right.
 */
const FAILING_RESOURCE = /Observation|MedicationKnowledge/

function fakeValidation(doc: FhirFileToValidate): FhirFileValidation {
  const shouldFail = FAILING_RESOURCE.test(doc.fileName)
  return {
    fileName: doc.fileName,
    schema: doc.profile ?? 'FHIR R4 (base)',
    valid: !shouldFail,
    error_count: shouldFail ? 2 : 0,
    errors: shouldFail
      ? [
          {
            message:
              'Observation.category: minimum required = 1, but only found 0 (from http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab)',
            line: 4,
            path: 'Observation',
          } as ValidationIssue,
          {
            message: 'Unknown code "gas" in the CodeSystem — the terminology server could not resolve it',
            line: 11,
            path: 'Observation.code.coding[0]',
          } as ValidationIssue,
        ]
      : [],
  }
}

export function createFixtureDriver(): PipelineDriver {
  return {
    async listBuilds() {
      await sleep(120)
      return BUILDS
    },

    async listTransforms() {
      await sleep(120)
      return TRANSFORMS
    },

    async generate(canonical) {
      await sleep(400)
      const xml = SAMPLES[canonical]
      if (!xml) {
        throw new Error(
          `No fixture sample for "${canonical}". The prototype ships Roster and Formulary; run against the live API for the rest.`,
        )
      }
      return { xml, filename: `${canonical}-sample.xml` }
    },

    async generateFromXsd(file) {
      await sleep(500)
      return { xml: rosterSample, filename: file.name.replace(/\.xsd$/i, '-sample.xml') }
    },

    async validateCanonical(xml, schemaFile) {
      await sleep(250)
      return checkCanonical(xml, schemaFile)
    },

    async validateCanonicalCustom(xml, _filename, xsd) {
      await sleep(250)
      return checkCanonical(xml, xsd.name)
    },

    async transform(canonical) {
      await sleep(900)
      const out = FHIR_OUTPUT[canonical]
      if (!out) throw new Error(`No fixture FHIR output for "${canonical}".`)
      return out
    },

    async transformContent(canonical, _xml, _filename, onPart) {
      const out = FHIR_OUTPUT[canonical]
      if (!out) throw new Error(`No fixture FHIR output for "${canonical}".`)
      if (out.kind === 'single') {
        await sleep(900)
        return out
      }
      // Stream the parts, as the live fan-out over /transform/upload does.
      const parts: FhirTransformPart[] = []
      for (const part of out.parts) {
        await sleep(240)
        parts.push(part)
        onPart?.(part)
      }
      return { kind: 'multipart', parts }
    },

    async transformWithXslt() {
      await sleep(800)
      return rosterPatientFhir
    },

    async fhirValidatorConfig() {
      await sleep(80)
      return {
        endpoint: 'https://validator.fhir.org/validate',
        method: 'POST',
        fhirVersion: '4.0.1',
        igs: ['hl7.fhir.us.core#6.1.0'],
        txServer: 'http://tx.fhir.org',
        sessionActive: true,
        timeoutMs: 120_000,
        maxAttempts: 3,
      } satisfies FhirValidatorConfig
    },

    async validateFhirResource(doc) {
      // Spread the timings so the rows visibly resolve one at a time.
      await sleep(1200 + Math.random() * 3300)
      return fakeValidation(doc)
    },

    // No backend in fixture/proto mode, so this reuses the same browser-side converter the
    // live app uses for JSON exports match structurally.
    async xmlToJson(xml) {
      await sleep(150)
      return xmlToJson(xml)
    },
  }
}
