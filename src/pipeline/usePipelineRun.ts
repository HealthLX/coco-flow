import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  FHIR_PROFILE_OPTIONS,
  normCanonicalId,
  pinUsCoreVersion,
  usCoreProfileFor,
  type FhirTransformResult,
} from '../services/api'
import { addToHistory } from '../lib/history'
import {
  FHIR_VALIDATE_CONCURRENCY,
  canonicalDef,
  deriveFhirDocs,
  downloadXmlFromMemory,
  runPool,
  schemaHasBuiltinTransforms,
  type FhirDoc,
} from './derive'
import { useDriver } from './driver'
import { initialState, pipelineReducer } from './reducer'
import type { StageId } from './types'

/**
 * Owns the run: what's selected, where each stage is, and what it produced.
 *
 * It deliberately does NOT own view state (which panel is open, editor scroll, hover links) —
 * that stays local to the page, so opening a panel can't re-render a running pipeline.
 */
export function usePipelineRun() {
  const driver = useDriver()
  const [state, dispatch] = useReducer(pipelineReducer, undefined, initialState)

  // A stale response from an abandoned run must not write into the current one.
  const runIdRef = useRef(state.runId)
  runIdRef.current = state.runId
  const isCurrent = (id: number) => runIdRef.current === id

  /**
   * `runAll` awaits several actions in sequence, so each one runs against state that was
   * dispatched *after* the closure was created — generate() produces the XML that
   * validateXsd() then needs. Reading `state` directly would give every step the snapshot
   * from the render where the run started, and the chain would stop at the first hand-off.
   */
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let alive = true
    driver.listBuilds().then(
      (builds) => alive && dispatch({ type: 'builds/loaded', builds }),
      () => {},
    )
    driver.fhirValidatorConfig().then(
      (config) => alive && dispatch({ type: 'validatorConfig/loaded', config }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [driver])

  const { selection, artifacts, builds } = state
  const canonical = selection.canonical

  const schemaFile =
    selection.mode === 'builtin'
      ? (canonicalDef(canonical)?.schemaFile ?? null)
      : (selection.xsdFile?.name ?? null)

  /** Profile configured for this build in sample_builds.yaml — only Roster sets one. */
  const configuredProfile = useMemo(() => {
    if (selection.mode !== 'builtin' || !canonical) return null
    const build = builds.find((b) => normCanonicalId(b.canonical_name) === normCanonicalId(canonical))
    return build?.fhir_profile ?? null
  }, [builds, canonical, selection.mode])

  const profileForResource = useCallback(
    (resourceType: string | null): string | null => {
      if (selection.mode === 'custom' || selection.xsltFile) {
        return FHIR_PROFILE_OPTIONS[0].value
      }
      if (configuredProfile) return pinUsCoreVersion(configuredProfile)
      return usCoreProfileFor(resourceType)
    },
    [configuredProfile, selection.mode, selection.xsltFile],
  )

  const fhirDocs = useMemo(
    () => deriveFhirDocs(artifacts.fhirResult, canonical, profileForResource),
    [artifacts.fhirResult, canonical, profileForResource],
  )

  const hasTransforms =
    selection.mode === 'builtin' && !!canonical && schemaHasBuiltinTransforms(builds, canonical)

  /** FHIR profile validation is wired for Roster only; elsewhere the stage is skipped, not failed. */
  const fhirValidationSupported =
    selection.mode === 'builtin' && normCanonicalId(canonical) === 'roster'

  const fail = (stage: StageId, err: unknown) =>
    dispatch({
      type: 'stage/fail',
      stage,
      at: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    })

  // ── Actions ─────────────────────────────────────────────────────────────

  const selectBuiltin = useCallback((name: string) => {
    dispatch({ type: 'select/builtin', canonical: name })
  }, [])

  const selectCustom = useCallback((xsdFile: File | null, rootElement: string) => {
    dispatch({ type: 'select/custom', xsdFile, rootElement })
  }, [])

  const setXslt = useCallback((xsltFile: File | null) => {
    dispatch({ type: 'select/xslt', xsltFile })
  }, [])

  const generate = useCallback(async (): Promise<boolean> => {
    const id = runIdRef.current
    const selection = stateRef.current.selection
    const canonical = selection.canonical

    dispatch({ type: 'stage/start', stage: 'generate', at: Date.now() })
    try {
      const out =
        selection.mode === 'builtin' && canonical
          ? await driver.generate(canonical)
          : await driver.generateFromXsd(selection.xsdFile!, selection.rootElement)
      if (!isCurrent(id)) return false

      dispatch({ type: 'generate/done', xml: out.xml, filename: out.filename })
      dispatch({
        type: 'stage/pass',
        stage: 'generate',
        at: Date.now(),
        artifactCount: out.xml.split('\n').length,
        detail: out.filename,
      })
      addToHistory({
        label: out.filename,
        actionType: 'generated',
        fileType: 'canonical',
        serverFilename: out.filename,
      })
      return true
    } catch (err) {
      if (isCurrent(id)) fail('generate', err)
      return false
    }
  }, [driver])

  const validateXsd = useCallback(async (): Promise<boolean> => {
    const id = runIdRef.current
    const { selection, artifacts } = stateRef.current
    const xml = artifacts.canonicalXml
    const schemaFile =
      selection.mode === 'builtin'
        ? (canonicalDef(selection.canonical)?.schemaFile ?? null)
        : (selection.xsdFile?.name ?? null)
    if (!xml || !schemaFile) return false

    dispatch({ type: 'stage/start', stage: 'validate-xsd', at: Date.now() })
    try {
      const result =
        selection.mode === 'builtin'
          ? await driver.validateCanonical(xml, schemaFile)
          : await driver.validateCanonicalCustom(
              xml,
              artifacts.canonicalFilename ?? 'sample.xml',
              selection.xsdFile!,
            )
      if (!isCurrent(id)) return false

      dispatch({ type: 'xsd/done', result })
      dispatch(
        result.valid
          ? { type: 'stage/pass', stage: 'validate-xsd', at: Date.now(), artifactCount: 0, detail: schemaFile }
          : {
              type: 'stage/fail',
              stage: 'validate-xsd',
              at: Date.now(),
              artifactCount: result.error_count,
              error: `${result.error_count} schema violation${result.error_count === 1 ? '' : 's'}`,
            },
      )
      return result.valid
    } catch (err) {
      if (isCurrent(id)) fail('validate-xsd', err)
      return false
    }
  }, [driver])

  /** Returns the transform result so a caller mid-run can use it without waiting for a re-render. */
  const transform = useCallback(async (): Promise<FhirTransformResult | null> => {
    const id = runIdRef.current
    const { selection, artifacts } = stateRef.current
    const canonical = selection.canonical
    const xml = artifacts.canonicalXml
    if (!xml || !canonical) return null

    dispatch({ type: 'stage/start', stage: 'transform', at: Date.now() })
    dispatch({ type: 'stage/start', stage: 'fhir', at: Date.now() })
    try {
      const result: FhirTransformResult = selection.xsltFile
        ? {
            kind: 'single',
            xml: await driver.transformWithXslt(
              xml,
              artifacts.canonicalFilename ?? 'sample.xml',
              selection.xsltFile,
            ),
          }
        : artifacts.canonicalDirty
          ? // The sample was edited, so the copy on the server is not what's on screen.
            await driver.transformContent(canonical, xml, artifacts.canonicalFilename ?? 'sample.xml')
          : await driver.transform(canonical)

      if (!isCurrent(id)) return null

      const count = result.kind === 'single' ? 1 : result.parts.length
      dispatch({ type: 'transform/done', result })
      dispatch({
        type: 'stage/pass',
        stage: 'transform',
        at: Date.now(),
        artifactCount: count,
        detail: `${count} XSLT${count === 1 ? '' : 's'}`,
      })
      dispatch({ type: 'stage/pass', stage: 'fhir', at: Date.now(), artifactCount: count })
      addToHistory({
        label: `${canonicalDef(canonical)?.label ?? canonical} → FHIR`,
        actionType: 'transformed',
        fileType: 'fhir',
        serverFilename: null,
      })
      return result
    } catch (err) {
      if (isCurrent(id)) {
        fail('transform', err)
        fail('fhir', err)
      }
      return null
    }
  }, [driver])

  /**
   * Takes the docs explicitly rather than reading the memo, so a caller inside an in-flight
   * run can pass what the transform just produced — the memo won't have updated yet.
   */
  const validateFhirDocs = useCallback(
    async (docs: FhirDoc[]): Promise<boolean> => {
      const id = runIdRef.current
      if (docs.length === 0) return false

      dispatch({ type: 'fhirRows/reset', fileNames: docs.map((d) => d.fileName) })
      dispatch({ type: 'stage/start', stage: 'validate-fhir', at: Date.now() })

      let failures = 0
      await runPool(docs, FHIR_VALIDATE_CONCURRENCY, async (doc) => {
        const startedAt = Date.now()
        if (!isCurrent(id)) return
        dispatch({
          type: 'fhirRow/set',
          fileName: doc.fileName,
          state: { status: 'running', startedAt },
        })
        try {
          const result = await driver.validateFhirResource(doc)
          if (!isCurrent(id)) return
          if (!result.valid) failures++
          dispatch({
            type: 'fhirRow/set',
            fileName: doc.fileName,
            state: { status: 'done', elapsedMs: Date.now() - startedAt, result },
          })
        } catch (err) {
          if (!isCurrent(id)) return
          failures++
          dispatch({
            type: 'fhirRow/set',
            fileName: doc.fileName,
            state: {
              status: 'error',
              elapsedMs: Date.now() - startedAt,
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
      })

      if (!isCurrent(id)) return false
      dispatch(
        failures === 0
          ? {
              type: 'stage/pass',
              stage: 'validate-fhir',
              at: Date.now(),
              artifactCount: docs.length,
              detail: `${docs.length} resource${docs.length === 1 ? '' : 's'}`,
            }
          : {
              type: 'stage/fail',
              stage: 'validate-fhir',
              at: Date.now(),
              artifactCount: failures,
              error: `${failures} of ${docs.length} resource${docs.length === 1 ? '' : 's'} failed profile validation`,
            },
      )
      return failures === 0
    },
    [driver],
  )

  const validateFhir = useCallback(() => validateFhirDocs(fhirDocs), [validateFhirDocs, fhirDocs])

  const editCanonical = useCallback((xml: string) => {
    dispatch({ type: 'canonical/edit', xml })
  }, [])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const exportAll = useCallback(() => {
    if (artifacts.canonicalXml && artifacts.canonicalFilename) {
      downloadXmlFromMemory(artifacts.canonicalXml, artifacts.canonicalFilename)
    }
    for (const doc of fhirDocs) {
      downloadXmlFromMemory(doc.xml, doc.fileName)
    }
  }, [artifacts.canonicalXml, artifacts.canonicalFilename, fhirDocs])

  /**
   * Walk the whole pipeline, stopping at the first failure. Powers the one-click demo.
   * A failed XSD check still transforms — the whole point of the run is to see where it breaks.
   */
  const runAllRef = useRef<() => Promise<void>>()
  runAllRef.current = async () => {
    if (!(await generate())) return
    await validateXsd()

    // Re-read after the awaits above: `selection` from the enclosing render is fine here
    // (it can't change mid-run), but `hasTransforms` depends on builds, which may have
    // landed since.
    const sel = stateRef.current.selection
    const canRun =
      (sel.mode === 'builtin' &&
        !!sel.canonical &&
        schemaHasBuiltinTransforms(stateRef.current.builds, sel.canonical)) ||
      !!sel.xsltFile

    if (!canRun) {
      dispatch({ type: 'stage/skip', stage: 'transform', detail: 'No XSLT configured' })
      dispatch({ type: 'stage/skip', stage: 'fhir' })
      dispatch({ type: 'stage/skip', stage: 'validate-fhir' })
      return
    }

    const result = await transform()
    if (!result) return

    if (!(sel.mode === 'builtin' && normCanonicalId(sel.canonical) === 'roster')) {
      dispatch({ type: 'stage/skip', stage: 'validate-fhir', detail: 'Roster only, for now' })
      return
    }
    // Derive the docs from what the transform just returned; the memo is a render behind.
    await validateFhirDocs(deriveFhirDocs(result, sel.canonical, profileForResource))
  }
  const runAll = useCallback(() => runAllRef.current!(), [])

  return {
    state,
    fhirDocs,
    schemaFile,
    hasTransforms,
    fhirValidationSupported,
    profileForResource,
    actions: {
      selectBuiltin,
      selectCustom,
      setXslt,
      generate,
      validateXsd,
      transform,
      validateFhir,
      validateFhirDocs,
      editCanonical,
      exportAll,
      reset,
      runAll,
    },
  }
}

export type PipelineRun = ReturnType<typeof usePipelineRun>
