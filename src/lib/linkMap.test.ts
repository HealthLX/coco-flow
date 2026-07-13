import { describe, expect, it } from 'vitest'
import { buildLinkMap } from './linkMap'
import { parseLeaves } from './xmlLeaves'
import rosterSample from '../pipeline/fixtures/data/roster-sample.xml?raw'
import rosterFhir from '../pipeline/fixtures/data/roster-patient-fhir.xml?raw'

const DOCS = [{ fileName: 'roster-patient-fhir.xml', xml: rosterFhir }]

describe('parseLeaves', () => {
  it('reads canonical values out of text nodes', () => {
    const leaves = parseLeaves(rosterSample, 'canonical')
    const birthDate = leaves.find((l) => l.path.endsWith('birth_date'))
    expect(birthDate?.value).toBe('1985-11-21')
    // The offsets must point back at the source text, or highlights land on the wrong line.
    expect(rosterSample.slice(birthDate!.from, birthDate!.to)).toBe('1985-11-21')
  })

  it('reads FHIR values out of @value attributes, not text nodes', () => {
    const leaves = parseLeaves(rosterFhir, 'fhir')
    const birthDate = leaves.find((l) => l.path.endsWith('birthDate'))
    expect(birthDate?.value).toBe('1985-11-21')
    expect(rosterFhir.slice(birthDate!.from, birthDate!.to)).toBe('1985-11-21')
  })

  it('ignores the FHIR narrative, which restates name and DOB as prose', () => {
    const leaves = parseLeaves(rosterFhir, 'fhir')
    expect(leaves.some((l) => l.path.includes('div'))).toBe(false)
    expect(leaves.some((l) => l.value.startsWith('Patient:'))).toBe(false)
  })
})

describe('buildLinkMap', () => {
  const map = buildLinkMap(rosterSample, DOCS)
  const canonical = (path: string) =>
    map.canonicalLeaves.find((l) => l.path.endsWith(path))!
  const linkFor = (path: string) => map.byCanonical.get(canonical(path).id)

  it('links a value the transform carried across unchanged', () => {
    const link = linkFor('member/birth_date')
    expect(link?.confidence).toBe('exact')
    expect(link?.targets.some((t) => t.leaf.path.endsWith('birthDate'))).toBe(true)
  })

  it('links the race code to the FHIR extension it became', () => {
    const link = map.byCanonical.get(
      map.canonicalLeaves.find((l) => l.value === '2106-3')!.id,
    )
    expect(link?.confidence).toBe('exact')
    expect(link?.targets.some((t) => t.leaf.path.includes('valueCoding'))).toBe(true)
  })

  it('links a value the transform decorated rather than replaced', () => {
    // <member_id>summer</member_id> → <id value="-summer"/> and <value value="summer"/>
    const leaf = map.canonicalLeaves.find((l) => l.value === 'summer')
    expect(leaf).toBeDefined()
    const link = map.byCanonical.get(leaf!.id)
    expect(link).toBeDefined()
    expect(link!.targets.length).toBeGreaterThan(0)
  })

  it('reports the second race code as unmapped — the transform really does drop it', () => {
    // Roster.xsd allows repeated <code>, but the XSLT only carries the first into ombCategory.
    expect(rosterSample).toContain('2076-8')
    expect(rosterFhir).not.toContain('2076-8')
    expect(map.unmapped.some((l) => l.value === '2076-8')).toBe(true)
  })

  it('builds a reverse index so a FHIR element can name its canonical sources', () => {
    const link = linkFor('member/birth_date')!
    const target = link.targets[0]
    const sources = map.byFhir.get(`${target.docIndex}:${target.leaf.id}`)
    expect(sources?.some((l) => l.path.endsWith('birth_date'))).toBe(true)
  })

  it('leaves FHIR-only literals out of the canonical map', () => {
    // The profile/OID URLs are injected by the XSLT; nothing in the canonical produced them.
    const injected = map.fhirLeaves.filter((t) => t.leaf.value.startsWith('urn:oid:'))
    expect(injected.length).toBeGreaterThan(0)
    for (const t of injected) {
      expect(map.byFhir.has(`${t.docIndex}:${t.leaf.id}`)).toBe(false)
    }
  })
})
