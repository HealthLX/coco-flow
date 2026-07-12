import { Link } from 'react-router-dom'
import { ArrowRight, FileCode2, FileText, Play, ShieldCheck, Shuffle, Sparkles } from 'lucide-react'
import cocoLogo from '../../assets/coco.png'

const GLYPH_STAGES = [
  { icon: FileCode2, label: 'XSD' },
  { icon: FileText, label: 'XML' },
  { icon: ShieldCheck, label: 'Valid' },
  { icon: Shuffle, label: 'XSLT' },
  { icon: Sparkles, label: 'FHIR' },
]

/**
 * The product, in one glance: data moving through the pipeline. It runs on a loop rather
 * than on scroll or hover, because the point is that this is a thing that *flows* — the
 * page shouldn't have to be poked before it says so.
 */
function PipelineGlyph() {
  return (
    // items-start, not items-center: the labels sit below the circles, so centring against the
    // whole column would drop the connectors below the circles they're meant to join. The
    // circles are h-10 (40px), so their centre is 20px down.
    <div className="flex items-start" aria-hidden>
      {GLYPH_STAGES.map(({ icon: Icon, label }, i) => (
        <div key={label} className="flex items-start">
          {i > 0 && (
            <div className="relative mt-[20px] h-px w-8 sm:w-12">
              <svg className="absolute inset-0 h-px w-full overflow-visible">
                <line
                  x1="0"
                  y1="0"
                  x2="100%"
                  y2="0"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  className="animate-flow-dash stroke-accent/70"
                />
              </svg>
              <span
                className="absolute -top-[3px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent))] animate-flow-packet"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 backdrop-blur-sm">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Hero() {
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(135deg,#3d1a1a_0%,#2d1f1f_60%,#1a1010_100%)] py-14">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-10 px-6 sm:px-10">
        <div className="max-w-2xl">
          <div className="mb-5 inline-block rounded bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white/95">
            CMS-9115-F · CMS-0057-F Compliance
          </div>

          <h1 className="mb-3 text-3xl font-bold leading-snug">
            <span className="text-brand">C</span>
            <span className="text-white">ompliance </span>
            <span className="text-brand">O</span>
            <span className="text-white">pen Source</span>
            <br />
            <span className="text-brand">C</span>
            <span className="text-white">anonical </span>
            <span className="text-brand">O</span>
            <span className="text-white">ffering</span>
          </h1>

          <p className="mb-5 text-sm font-semibold tracking-wider text-accent">CoCo Data</p>

          {/* Sits directly under the title: the pipeline is the claim, the paragraph explains it. */}
          <div className="mb-6">
            <PipelineGlyph />
          </div>

          <p className="mb-8 text-base leading-relaxed text-white/90">
            CoCo defines a neutral, inspectable XML layer between payer source systems and FHIR
            APIs. It makes CMS compliance observable and auditable rather than opaque, with open
            schemas, sample generation, and XSLT transforms.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/flow?canonical=roster&autorun=1"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
            >
              <Play className="h-4 w-4" />
              Run the Roster pipeline
            </Link>
            <Link
              to="/workspace"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
            >
              Open Workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="hidden flex-shrink-0 flex-col items-center gap-4 opacity-90 lg:flex">
          <img
            src={cocoLogo}
            alt="CoCo"
            className="h-64 w-64 rounded-2xl bg-white/5 object-contain p-5"
          />
          <span className="text-sm font-bold tracking-wider text-brand">CoCo Data</span>
          <span className="text-[11px] uppercase tracking-widest text-white/90">Flow v0.1</span>
        </div>
      </div>
    </div>
  )
}
