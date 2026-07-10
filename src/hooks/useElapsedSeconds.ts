import { useEffect, useState } from 'react'

/**
 * Seconds since `startedAt`, ticking while it is set. Pass null to stop.
 * Ticks faster than 1Hz because cached validations resolve in well under a second,
 * and a 1s tick would show them all as "0s".
 */
export function useElapsedSeconds(startedAt: number | null): number | null {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (startedAt === null) return
    setElapsedMs(Date.now() - startedAt)
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 100)
    return () => clearInterval(id)
  }, [startedAt])

  return startedAt === null ? null : elapsedMs / 1000
}

/** Consistent "2.1s" rendering for both live and settled timings. */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}
