import { useMemo, type ReactNode } from 'react'
import { DriverContext } from './driver'
import { createLiveDriver } from './liveDriver'
import { createFixtureDriver } from './fixtures/fixtureDriver'

/**
 * Fixtures let the app be demoed with no backend at all — `npm run dev:proto`, or `?fixtures=1`
 * on a deployed build. Everything downstream of here is identical either way.
 */
export function useFixturesEnabled(): boolean {
  return (
    import.meta.env.VITE_COCO_FIXTURES === '1' ||
    new URLSearchParams(window.location.search).has('fixtures')
  )
}

export function DriverProvider({ children }: { children: ReactNode }) {
  const fixtures = useFixturesEnabled()
  const driver = useMemo(
    () => (fixtures ? createFixtureDriver() : createLiveDriver()),
    [fixtures],
  )

  return <DriverContext.Provider value={driver}>{children}</DriverContext.Provider>
}
