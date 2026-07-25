import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FlowPage from './FlowPage'
import { ThemeProvider } from '../context/ThemeContext'
import { DriverContext } from '../pipeline/driver'
import { createFixtureDriver } from '../pipeline/fixtures/fixtureDriver'

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <DriverContext.Provider value={createFixtureDriver()}>
            <FlowPage />
          </DriverContext.Provider>
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** The stage's button in the rail; its accessible name starts with the stage label. */
const railNode = (label: string) =>
  screen.getAllByRole('button').find((b) => b.textContent?.startsWith(label))!

describe('FlowPage', () => {
  it('runs the whole pipeline and lands every stage', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: 'Roster' }))
    await user.click(screen.getByRole('button', { name: /run pipeline/i }))

    // Generate → XSD check → transform → FHIR → US Core validation, all driven by fixtures.
    await waitFor(
      () => {
        expect(railNode('US Core')).toHaveAttribute('aria-current', 'step')
      },
      { timeout: 15_000 },
    )

    // Every stage landed, in order, with a timing — this is the run actually completing
    // rather than stalling at a hand-off between steps.
    for (const label of ['Sample XML', 'XSD Check', 'Transform', 'FHIR', 'US Core']) {
      expect(railNode(label)).toHaveTextContent(/\d+(\.\d+)?s/)
    }
    expect(railNode('Export')).toBeEnabled()

    // The US Core panel shows a row per resource. The filename appears twice by design —
    // once as the row title, once inside the validator-call metadata block.
    expect(await screen.findAllByText(/roster-fhir\.xml/)).not.toHaveLength(0)
    expect(screen.getAllByText(/us-core-patient/).length).toBeGreaterThan(0)
  }, 30_000)

  // Regression: transform/done used to leave `validate-fhir` blocked, so its rail node stayed
  // disabled and US Core could only be reached by "Run pipeline" — never by clicking through.
  it('lets you drive the pipeline one stage at a time, US Core included', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: 'Roster' }))

    await user.click(railNode('Sample XML'))
    await user.click(await screen.findByRole('button', { name: /^generate sample$/i }))
    await waitFor(() => expect(railNode('Transform')).toBeEnabled(), { timeout: 10_000 })

    await user.click(railNode('Transform'))
    await user.click(await screen.findByRole('button', { name: /transform to fhir/i }))

    // The US Core node must become reachable off the back of the transform alone.
    await waitFor(() => expect(railNode('US Core')).toBeEnabled(), { timeout: 10_000 })
    await user.click(railNode('US Core'))

    const validate = await screen.findByRole('button', { name: /validate against us core/i })
    expect(validate).toBeEnabled()
    await user.click(validate)

    await waitFor(() => expect(railNode('US Core')).toHaveTextContent(/\d+(\.\d+)?s/), {
      timeout: 15_000,
    })
    expect(screen.getAllByText(/us-core-patient/).length).toBeGreaterThan(0)
  }, 30_000)

  it('jumps to the FHIR panel automatically once a transform produces resources', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: 'Roster' }))

    await user.click(railNode('Sample XML'))
    await user.click(await screen.findByRole('button', { name: /^generate sample$/i }))
    await waitFor(() => expect(railNode('Transform')).toBeEnabled(), { timeout: 10_000 })

    await user.click(railNode('Transform'))
    await user.click(await screen.findByRole('button', { name: /transform to fhir/i }))

    // No explicit click on the FHIR rail node — the panel should follow the run there on its own.
    await waitFor(() => expect(railNode('FHIR')).toHaveAttribute('aria-current', 'step'), {
      timeout: 10_000,
    })
  }, 20_000)

  it('unblocks the downstream stages once a sample exists', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: 'Roster' }))

    // Downstream stages are unreachable until something upstream has produced their input.
    expect(railNode('XSD Check')).toBeDisabled()

    await user.click(railNode('Sample XML'))
    await user.click(await screen.findByRole('button', { name: /^generate sample$/i }))

    await waitFor(() => expect(railNode('XSD Check')).toBeEnabled(), { timeout: 10_000 })
  }, 20_000)
})

// jsdom has no layout, so CodeMirror's measuring throws; the editor is lazy and not needed here.
vi.mock('../components/editor/CodeEditor', () => ({
  default: ({ value }: { value: string }) => <div data-testid="editor">{value.slice(0, 40)}</div>,
}))
