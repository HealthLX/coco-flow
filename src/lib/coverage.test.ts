import { describe, expect, it } from 'vitest'
import { buildCoverageMatrix, resourceTypeFromXsltName, transformSpecsForBuild } from './coverage'
import { BUILDS, TRANSFORM_FILENAMES } from '../pipeline/fixtures/fixtureDriver'
import type { TransformFile } from '../services/api'

const TRANSFORMS: TransformFile[] = TRANSFORM_FILENAMES.map((filename) => ({ filename }))
const build = (name: string) => BUILDS.find((b) => b.canonical_name === name)!

describe('resourceTypeFromXsltName', () => {
  it('takes the longest leading run that names a real resource type', () => {
    // "DiagnosticReport" must win over "Diagnostic" + report-as-variant.
    expect(resourceTypeFromXsltName('Clinical/Clinical_DiagnosticReport_Notes.xsl')).toEqual({
      type: 'DiagnosticReport',
      variant: 'Notes',
    })
    expect(resourceTypeFromXsltName('Clinical/Clinical_Observation_Lab.xsl')).toEqual({
      type: 'Observation',
      variant: 'Lab',
    })
    expect(resourceTypeFromXsltName('Clinical/Clinical_MedicationRequest.xsl')).toEqual({
      type: 'MedicationRequest',
      variant: null,
    })
  })

  it('falls back to the singular for pluralised filenames', () => {
    expect(resourceTypeFromXsltName('Clinical/Clinical_Endpoints.xsl').type).toBe('Endpoint')
  })

  it('handles the lowercase, hyphenated Roster outlier', () => {
    expect(resourceTypeFromXsltName('Roster/roster-patient.xsl')).toEqual({
      type: 'Patient',
      variant: null,
    })
  })

  it('strips a group prefix that is not itself a resource type', () => {
    expect(resourceTypeFromXsltName('Core-Model/Insurance_InsurancePlan.xsl').type).toBe(
      'InsurancePlan',
    )
    expect(resourceTypeFromXsltName('Provider-Directory/Provider_HealthcareService.xsl').type).toBe(
      'HealthcareService',
    )
  })
})

describe('transformSpecsForBuild', () => {
  // Mirrors collect_transform_specs in coco-canonical/tools/transform_schema.py. If the Python
  // changes, these numbers change with it — that is the point of pinning them.
  it('resolves a transform_dir to every .xsl in the folder except _flat helpers', () => {
    expect(transformSpecsForBuild(build('clinical'), TRANSFORMS)).toHaveLength(26)

    const eob = transformSpecsForBuild(build('eob'), TRANSFORMS)
    expect(eob).toHaveLength(4)
    expect(eob.map((s) => s.file)).not.toContain('EOB/EOB_5.2_flat.xsl')
  })

  it('resolves a single transform_file to exactly that XSLT', () => {
    const roster = transformSpecsForBuild(build('roster'), TRANSFORMS)
    expect(roster).toEqual([{ file: 'Roster/roster-patient.xsl', resourceType: 'Patient' }])
  })

  it('resolves an explicit transform_files list, honouring its pinned resource types', () => {
    const pd = transformSpecsForBuild(build('providerdirectory'), TRANSFORMS)
    expect(pd).toHaveLength(6)
    expect(pd.map((s) => s.resourceType)).toContain('OrganizationAffiliation')
  })

  it('sorts folder-driven transforms case-insensitively, as the CLI does', () => {
    const files = transformSpecsForBuild(build('clinical'), TRANSFORMS).map((s) => s.file)
    expect(files).toEqual([...files].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())))
  })
})

describe('buildCoverageMatrix', () => {
  const matrix = buildCoverageMatrix(BUILDS, TRANSFORMS)
  const row = (name: string) => matrix.rows.find((r) => r.canonical === name)!

  it('reports Clinical as the widest canonical', () => {
    expect(row('clinical').wiredCount).toBe(26)
    expect(row('clinical').orphanCount).toBe(0)
  })

  it('surfaces the Roster XSLTs that exist on disk but no build ever runs', () => {
    // Roster_Patient / Roster_Coverage / Roster_Observation ship but are unreachable;
    // Roster_flat is a helper and does not count.
    expect(row('roster').wiredCount).toBe(1)
    expect(row('roster').orphanCount).toBe(3)
  })

  it('marks Patient as profiled for Roster and leaves unprofiled types as wired', () => {
    expect(row('roster').cells.Patient.state).toBe('profiled')
    expect(row('roster').cells.Patient.usCoreProfile).toContain('us-core-patient')
    expect(row('formulary').cells.InsurancePlan.state).toBe('wired')
  })

  it('lists every resolved resource type once, sorted', () => {
    expect(matrix.resourceTypes).toEqual([...new Set(matrix.resourceTypes)].sort())
  })
})
