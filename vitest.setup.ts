import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only auto-registers cleanup when Vitest globals are on; they aren't here,
// so without this every render accumulates in document.body and queries find duplicates.
afterEach(cleanup)
