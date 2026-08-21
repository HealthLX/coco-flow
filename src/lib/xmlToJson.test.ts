import { describe, expect, it } from 'vitest'
import { xmlToJson } from './xmlToJson'
import rosterSample from '../pipeline/fixtures/data/roster-sample.xml?raw'

describe('xmlToJson', () => {
  it('turns a leaf element into a plain text value', () => {
    expect(JSON.parse(xmlToJson('<a>text</a>'))).toEqual({ a: 'text' })
  })

  it('turns attributes into @-prefixed keys', () => {
    expect(JSON.parse(xmlToJson('<a id="1">text</a>'))).toEqual({ a: { '@id': '1', '#text': 'text' } })
  })

  it('omits #text when an attributed leaf has no text', () => {
    expect(JSON.parse(xmlToJson('<a id="1"/>'))).toEqual({ a: { '@id': '1' } })
  })

  it('turns repeated sibling elements into an array', () => {
    const json = JSON.parse(xmlToJson('<roster><member>1</member><member>2</member></roster>'))
    expect(json).toEqual({ roster: { member: ['1', '2'] } })
  })

  it('drops xmlns declarations and strips the element namespace prefix', () => {
    const xml = '<roster xmlns="http://cocodata.org"><member>1</member></roster>'
    expect(JSON.parse(xmlToJson(xml))).toEqual({ roster: { member: '1' } })
  })

  it('throws on malformed XML', () => {
    expect(() => xmlToJson('<a><b></a>')).toThrow()
  })

  it('round-trips a real generated roster sample', () => {
    const json = JSON.parse(xmlToJson(rosterSample))
    expect(Object.keys(json)).toEqual(['roster'])
    expect(json.roster).toBeTruthy()
  })
})
