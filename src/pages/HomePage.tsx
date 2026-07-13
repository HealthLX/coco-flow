import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  Github,
  Shuffle,
} from 'lucide-react'
import { buildHasTransforms, getBuilds, normCanonicalId, type Build } from '../services/api'
import Hero from '../features/home/Hero'
import CoverageMatrix from '../features/home/CoverageMatrix'

// The store moved to lib/tempFiles; re-exported here so existing importers keep working.
export { storeFileTemp, retrieveTempFile } from '../lib/tempFiles'

// `canonicalName` matches the API's canonical_name so transform availability is resolved live.
const SCHEMAS = [
  {
    name: 'Roster',
    file: 'Roster.xsd',
    canonicalName: 'roster',
    description:
      'Health plan member and patient demographics, coverage identifiers, addresses, and related persons.',
    transformLabel: 'FHIR Patient',
  },
  {
    name: 'EOB',
    file: 'EOB.xsd',
    canonicalName: 'eob',
    description: 'Explanation of Benefits: claims, adjudication, line items, and cost-sharing data.',
    transformLabel: 'FHIR ExplanationOfBenefit',
  },
  {
    name: 'Formulary',
    file: 'Formulary.xsd',
    canonicalName: 'formulary',
    description:
      'Drug formulary entries, coverage tiers, prior authorization requirements, and medication plans.',
    transformLabel: 'FHIR Formulary',
  },
  {
    name: 'Provider Directory',
    file: 'Provider-Directory.xsd',
    canonicalName: 'providerdirectory',
    description:
      'Practitioner and organization rows in one canonical file: NPIs, specialties, locations, networks, affiliations.',
    transformLabel: 'FHIR Provider (multi-resource)',
  },
  {
    name: 'Clinical',
    file: 'Clinical.xsd',
    canonicalName: 'clinical',
    description:
      'Clinical patient data including diagnoses, procedures, encounters, and observations.',
    transformLabel: 'FHIR Clinical (multi-resource)',
  },
]

/** Schema has at least one build with an XSLT in the live API config. */
function schemaHasTransforms(builds: Build[], canonicalName: string): boolean {
  const want = normCanonicalId(canonicalName)
  return builds.some((b) => normCanonicalId(b.canonical_name) === want && buildHasTransforms(b))
}

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: FileCode2,
    title: 'Select a canonical schema',
    description:
      'Choose one of the five CoCo XSD schemas, or upload your own, as the starting point for your data model.',
  },
  {
    step: '02',
    icon: Shuffle,
    title: 'Generate and transform',
    description:
      'CoCo generates a compliant sample XML from the schema. Where available, apply an XSLT to produce a FHIR-compatible output.',
  },
  {
    step: '03',
    icon: Download,
    title: 'Inspect and export',
    description:
      'Read the canonical XML and FHIR output side by side, then download either or both files.',
  },
]

const RESOURCES = [
  {
    href: 'https://github.com/HealthLX/coco-canonical',
    icon: Github,
    title: 'coco-canonical',
    description:
      'Source repository for the canonical XSD schemas and XSLT transforms. For developers working with or contributing to the CoCo data models.',
  },
  {
    href: 'https://healthlx.github.io/coco-canonical/Core-model_Guide.html',
    icon: BookOpen,
    title: 'Schema documentation',
    description:
      'Live Core Model Guide with field-level documentation for the canonical schemas, published from the source repository.',
  },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-fg-muted">{children}</h2>
  )
}

export default function HomePage() {
  const { data: builds = [], isPending: buildsLoading } = useQuery({
    queryKey: ['coco-sample-builds'],
    queryFn: getBuilds,
    staleTime: 60_000,
  })

  return (
    <div className="min-h-full">
      <Hero />

      <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
        {/* The numbering earns its place here: this really is a sequence. */}
        <section className="mb-12">
          <SectionTitle>How it works</SectionTitle>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, description }) => (
              <div
                key={step}
                className="card p-5 transition-all hover:border-line-strong hover:shadow-md"
              >
                <div className="mb-3 flex items-start gap-3">
                  <span className="text-xs font-bold tabular-nums text-brand">{step}</span>
                  <Icon className="mt-0.5 h-4 w-4 text-fg-muted" />
                </div>
                <div className="mb-1.5 text-sm font-semibold text-fg">{title}</div>
                <div className="text-xs leading-relaxed text-fg-body">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Canonical schemas (v10.0)</SectionTitle>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left">
                  {['Schema', 'XSD file', 'FHIR transform'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-fg-muted"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="hidden px-5 py-3 text-xs font-semibold uppercase tracking-wider text-fg-muted lg:table-cell">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SCHEMAS.map(({ name, file, canonicalName, description, transformLabel }) => {
                  const available = buildsLoading ? null : schemaHasTransforms(builds, canonicalName)
                  return (
                    <tr key={name} className="transition-colors hover:bg-surface-2">
                      <td className="px-5 py-3.5 font-semibold text-fg">{name}</td>
                      <td className="px-5 py-3.5">
                        <span className="badge-xsd font-mono">{file}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {available === null ? (
                          <span className="text-xs text-fg-subtle">…</span>
                        ) : available ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {transformLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="hidden max-w-sm px-5 py-3.5 text-xs text-fg-body lg:table-cell">
                        {description}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="text-xs text-fg-muted">
              Full FHIR mapping bindings for Smile, Health Samurai, and Firely are available
              commercially through{' '}
              <a
                href="https://healthlx.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                HealthLX
              </a>
              .
            </p>
            <Link to="/flow" className="btn-primary whitespace-nowrap text-xs">
              Open the pipeline
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <SectionTitle>Resources</SectionTitle>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {RESOURCES.map(({ href, icon: Icon, title, description }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="card group flex items-start gap-3 p-5 transition-all hover:border-line-strong hover:shadow-md"
              >
                <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-fg-muted" />
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg">
                    {title}
                    <ExternalLink className="h-3 w-3 text-fg-subtle transition-colors group-hover:text-brand" />
                  </div>
                  <div className="text-xs leading-relaxed text-fg-body">{description}</div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <CoverageMatrix />
        </section>
      </div>
    </div>
  )
}
