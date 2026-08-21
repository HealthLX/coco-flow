import { describe, expect, it } from 'vitest'
import { jsonFilename } from './derive'

describe('jsonFilename', () => {
  it('swaps a .xml extension for .json', () => {
    expect(jsonFilename('roster-sample.xml')).toBe('roster-sample.json')
  })

  it('is case-insensitive on the extension', () => {
    expect(jsonFilename('roster-sample.XML')).toBe('roster-sample.json')
  })

  it('appends .json when there is no .xml suffix', () => {
    expect(jsonFilename('roster-sample')).toBe('roster-sample.json')
  })
})
