import { AlertTriangle, ArrowRight, Download, FileCode2, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import XmlPreview from '../../components/XmlPreview'
import ValidationResult from '../../components/ValidationResult'
import FhirValidationRow from '../../components/fhir/FhirValidationRow'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { canonicalDef, downloadXmlFromMemory } from '../../pipeline/derive'
import { STAGE_META, type StageId } from '../../pipeline/types'
import type { PipelineRun } from '../../pipeline/usePipelineRun'
import CanonicalEditor from './CanonicalEditor'
import LinkedSplitView from './LinkedSplitView'

export type FhirView = 'compare' | 'raw'

/** Every panel gets the same frame, so switching stages doesn't reflow the page. */
function PanelFrame({
  stage,
  actions,
  children,
}: {
  stage: StageId
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const meta = STAGE_META[stage]
  return (
    <section className="flex h-full min-h-0 flex-col animate-fade-up">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-fg">{meta.label}</h2>
          <p className="text-xs text-fg-muted">{meta.hint}</p>
        </div>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  )
}

function StageError({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-err-border bg-err-bg p-3 text-xs text-err">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <pre className="whitespace-pre-wrap font-sans">{message}</pre>
    </div>
  )
}

export default function StagePanel({
  stage,
  run,
  busy,
  fhirView,
  onFhirViewChange,
  onTransform,
}: {
  stage: StageId
  run: PipelineRun
  busy: boolean
  fhirView: FhirView
  onFhirViewChange: (view: FhirView) => void
  /** Runs the transform and, on success, switches the open panel to FHIR to show what it produced. */
  onTransform: () => void
}) {
  const { state, fhirDocs, schemaFile, hasTransforms, fhirValidationSupported, actions } = run
  const { artifacts, stages, selection, validatorConfig } = state
  const status = stages[stage]
  const def = canonicalDef(selection.canonical)

  switch (stage) {
    case 'schema': {
      if (!def) {
        return (
          <PanelFrame stage={stage}>
            <EmptyState
              icon={<FileCode2 className="h-8 w-8" />}
              title="Pick a canonical model"
              description="Choose one of the five CoCo schemas above, then run the pipeline to see it become FHIR."
            />
          </PanelFrame>
        )
      }
      return (
        <PanelFrame
          stage={stage}
          actions={
            <Link to="/designer">
              <Button variant="subtle" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                Open in Schema Explorer
              </Button>
            </Link>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-fg">{def.label}</h3>
              <Badge tone="xsd">{def.schemaFile}</Badge>
              {hasTransforms ? (
                <Badge tone="fhir">FHIR transform available</Badge>
              ) : (
                <Badge tone="neutral">No XSLT configured</Badge>
              )}
            </div>
            <p className="max-w-2xl text-sm text-fg-body">{def.description}</p>
          </div>
        </PanelFrame>
      )
    }

    case 'generate':
      return (
        <PanelFrame
          stage={stage}
          actions={
            // The empty state already offers this action; don't put it on screen twice.
            artifacts.canonicalXml && (
              <Button
                variant="secondary"
                size="sm"
                onClick={actions.generate}
                loading={status.state === 'running'}
                disabled={busy}
              >
                Regenerate
              </Button>
            )
          }
        >
          {status.error && <StageError message={status.error} />}
          {artifacts.canonicalXml ? (
            <CanonicalEditor run={run} />
          ) : (
            <EmptyState
              title="No sample yet"
              description="CoCo builds a synthetic XML document from the schema — every element populated, cardinalities respected."
              action={
                <Button
                  onClick={actions.generate}
                  loading={status.state === 'running'}
                  disabled={busy || !selection.canonical}
                >
                  Generate sample
                </Button>
              }
            />
          )}
        </PanelFrame>
      )

    case 'validate-xsd':
      return (
        <PanelFrame
          stage={stage}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={actions.validateXsd}
              loading={status.state === 'running'}
              disabled={busy || !artifacts.canonicalXml}
            >
              Validate against XSD
            </Button>
          }
        >
          {status.error && !artifacts.xsdValidation && <StageError message={status.error} />}
          {artifacts.xsdValidation ? (
            <ValidationResult result={artifacts.xsdValidation} />
          ) : (
            <EmptyState
              title="Not validated yet"
              description={
                schemaFile
                  ? `Check the sample against ${schemaFile}. Errors come back with the line they occurred on.`
                  : 'Pick a schema first.'
              }
            />
          )}
        </PanelFrame>
      )

    case 'transform':
      return (
        <PanelFrame
          stage={stage}
          actions={
            <Button
              size="sm"
              onClick={onTransform}
              loading={status.state === 'running'}
              disabled={busy || !artifacts.canonicalXml || !hasTransforms}
              title={hasTransforms ? undefined : 'This canonical has no XSLT configured'}
            >
              Transform to FHIR
            </Button>
          }
        >
          {status.error && <StageError message={status.error} />}
          {status.state === 'skipped' && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs text-fg-muted">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {status.detail ?? 'Skipped.'}
            </div>
          )}
          {artifacts.fhirResult ? (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">
                {status.detail} produced {fhirDocs.length} resource{fhirDocs.length === 1 ? '' : 's'}.
                {artifacts.canonicalDirty && ' Run from the edited sample.'}
              </p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {fhirDocs.map((doc) => (
                  <li key={doc.fileName} className="flex items-center gap-2 px-3 py-2">
                    <Badge tone="fhir">{doc.resourceType ?? 'FHIR'}</Badge>
                    <span className="truncate font-mono text-xs text-fg-body">{doc.fileName}</span>
                    <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
                      {doc.profile ? doc.profile.split('/').pop() : 'base R4'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState
              title="Not transformed yet"
              description={
                hasTransforms
                  ? 'Run the XSLTs to turn the canonical XML into FHIR resources.'
                  : 'No XSLT is configured for this canonical, so there is nothing to run.'
              }
            />
          )}
        </PanelFrame>
      )

    case 'fhir':
      return (
        <PanelFrame
          stage={stage}
          actions={
            fhirDocs.length > 0 &&
            artifacts.canonicalXml && (
              <SegmentedControl
                size="sm"
                aria-label="FHIR view"
                value={fhirView}
                onChange={onFhirViewChange}
                segments={[
                  { value: 'compare', label: 'Compare' },
                  { value: 'raw', label: 'Raw' },
                ]}
              />
            )
          }
        >
          {fhirDocs.length === 0 ? (
            <EmptyState title="No FHIR yet" description="Run the transform to produce resources." />
          ) : fhirView === 'compare' && artifacts.canonicalXml ? (
            <LinkedSplitView
              canonicalXml={artifacts.canonicalXml}
              canonicalFilename={artifacts.canonicalFilename ?? 'sample.xml'}
              fhirDocs={fhirDocs}
            />
          ) : (
            <div className="space-y-4">
              {fhirDocs.map((doc) => (
                <XmlPreview
                  key={doc.fileName}
                  content={doc.xml}
                  title={doc.fileName}
                  badgeClass="badge-fhir"
                  badgeLabel={doc.resourceType ?? 'FHIR'}
                  allowJson
                />
              ))}
            </div>
          )}
        </PanelFrame>
      )

    case 'validate-fhir':
      return (
        <PanelFrame
          stage={stage}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={actions.validateFhir}
              loading={status.state === 'running'}
              disabled={busy || fhirDocs.length === 0 || !fhirValidationSupported}
            >
              Validate against US Core
            </Button>
          }
        >
          {!fhirValidationSupported ? (
            <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs text-fg-muted">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Profile validation is wired for Roster today. Other canonicals transform fine, but
              their resources aren't checked against a US Core profile yet.
            </div>
          ) : fhirDocs.length === 0 ? (
            <EmptyState title="Nothing to validate" description="Run the transform first." />
          ) : (
            <div className="space-y-5">
              {status.error && <StageError message={status.error} />}
              {fhirDocs.map((doc) => (
                <FhirValidationRow
                  key={doc.fileName}
                  doc={doc}
                  state={artifacts.fhirRows[doc.fileName] ?? { status: 'queued' }}
                  config={validatorConfig ?? undefined}
                />
              ))}
            </div>
          )}
        </PanelFrame>
      )

    case 'export':
      return (
        <PanelFrame stage={stage}>
          {!artifacts.canonicalXml ? (
            <EmptyState title="Nothing to export" description="Generate a sample first." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={<Download className="h-4 w-4" />}
                  onClick={() =>
                    downloadXmlFromMemory(
                      artifacts.canonicalXml!,
                      artifacts.canonicalFilename ?? 'sample.xml',
                    )
                  }
                >
                  Canonical XML
                </Button>
                <Button
                  variant="secondary"
                  icon={<Download className="h-4 w-4" />}
                  onClick={() => fhirDocs.forEach((d) => downloadXmlFromMemory(d.xml, d.fileName))}
                  disabled={fhirDocs.length === 0}
                >
                  FHIR ({fhirDocs.length})
                </Button>
                <Button
                  icon={<Download className="h-4 w-4" />}
                  onClick={actions.exportAll}
                  disabled={fhirDocs.length === 0}
                >
                  Everything
                </Button>
              </div>
              <p className="text-xs text-fg-muted">
                Downloads what's on screen, including any edits you made to the sample.
              </p>
            </div>
          )}
        </PanelFrame>
      )
  }
}
