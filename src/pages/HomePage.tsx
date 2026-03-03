import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileCode2, Shuffle, Download } from 'lucide-react'
import cocoLogo from '../assets/coco.png'

const SCHEMAS = [
  {
    name: 'Roster',
    file: 'Roster.xsd',
    description: 'Health plan member and patient demographics, coverage identifiers, addresses, and related persons.',
    transform: 'FHIR Patient',
  },
  {
    name: 'EOB',
    file: 'EOB.xsd',
    description: 'Explanation of Benefits: claims, adjudication, line items, and cost-sharing data.',
    transform: null,
  },
  {
    name: 'Formulary',
    file: 'Formulary.xsd',
    description: 'Drug formulary entries, coverage tiers, prior authorization requirements, and medication plans.',
    transform: null,
  },
  {
    name: 'Provider Directory',
    file: 'Provider-Directory.xsd',
    description: 'Practitioners and organizations: NPIs, specialties, locations, networks, and affiliations.',
    transform: null,
  },
  {
    name: 'Clinical',
    file: 'Clinical.xsd',
    description: 'Clinical patient data including diagnoses, procedures, encounters, and observations.',
    transform: null,
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: FileCode2,
    title: 'Select a Canonical Schema',
    description:
      'Choose one of the five CoCo XSD schemas, or upload your own, as the starting point for your data model.',
  },
  {
    step: '02',
    icon: Shuffle,
    title: 'Generate & Transform',
    description:
      'CoCo generates a compliant sample XML from the schema. Where available, apply an XSLT to produce a FHIR-compatible output.',
  },
  {
    step: '03',
    icon: Download,
    title: 'Preview & Export',
    description:
      'Inspect the canonical XML and FHIR output inline, then download either or both files to your machine.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-full">
      {/* Hero */}
      <div
        className="px-10 py-14 flex items-center justify-between gap-10"
        style={{
          background: 'linear-gradient(135deg, #10243a 0%, #1c3a52 60%, #0f2233 100%)',
        }}
      >
        <div className="max-w-2xl">
          <div
            className="inline-block text-xs font-bold tracking-[0.2em] uppercase px-3 py-1 rounded mb-5"
            style={{ backgroundColor: 'rgba(192,57,43,0.2)', color: '#c0392b' }}
          >
            CMS-9115-F · CMS-0057-F Compliance
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight mb-4">
            CoCo Data: Canonical Models<br />
            for Healthcare Payer Compliance
          </h1>
          <p className="text-base text-white/60 leading-relaxed mb-8">
            CoCo (Canonical Compliance Objects) defines a neutral, inspectable XML layer between
            payer source systems and FHIR APIs. It makes CMS compliance observable and auditable
            rather than opaque, with open schemas, sample generation, and XSLT transforms.
          </p>
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#c0392b' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#96281b')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#c0392b')}
          >
            Open Workspace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Logo mark */}
        <div className="hidden lg:flex flex-col items-center gap-4 flex-shrink-0 opacity-90 mr-10">
          <img
            src={cocoLogo}
            alt="CoCo"
            className="w-72 h-72 rounded-2xl object-contain"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px' }}
          />
          <span className="text-sm font-bold tracking-[0.25em] uppercase" style={{ color: '#c0392b' }}>
            COCO DATA
          </span>
          <span className="text-[11px] text-white/30 tracking-widest uppercase">Flow v0.1</span>
        </div>
      </div>

      <div className="px-10 py-10 max-w-5xl">
        {/* How it works */}
        <section className="mb-12">
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400 mb-6">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, description }) => (
              <div key={step} className="card p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: '#c0392b' }}
                  >
                    {step}
                  </span>
                  <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
                </div>
                <div className="text-sm font-semibold text-gray-900 mb-1.5">{title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Canonical schemas */}
        <section>
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-gray-400 mb-4">
            Canonical Schemas (v10.0)
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Schema
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    XSD File
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    FHIR Transform
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {SCHEMAS.map(({ name, file, description, transform }) => (
                  <tr key={name} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-900">{name}</td>
                    <td className="px-5 py-3.5">
                      <span className="badge-xsd font-mono">{file}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {transform ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {transform}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 hidden lg:table-cell max-w-sm">
                      {description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Full FHIR mapping bindings for Smile, Health Samurai, and Firely are available
              commercially through{' '}
              <a
                href="https://healthlx.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-coco-red hover:underline"
              >
                HealthLX
              </a>
              .
            </p>
            <Link
              to="/workspace"
              className="btn-primary text-xs whitespace-nowrap"
            >
              Go to Workspace
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Temp file store (still used by WorkspacePage for custom XSD passing) ─────
const _tempFiles = new Map<string, File>()

export function storeFileTemp(file: File): string {
  const key = `xsd-${Date.now()}-${Math.random().toString(36).slice(2)}`
  _tempFiles.set(key, file)
  return key
}

export function retrieveTempFile(key: string): File | undefined {
  return _tempFiles.get(key)
}
