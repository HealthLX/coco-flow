/**
 * Dependency-free, browser-side XML → JSON conversion for a *structural* preview.
 *
 * NOTE: This is a generic structural mapping (elements → keys, repeated siblings → arrays,
 * attributes → "@name"). It is intentionally NOT spec-canonical FHIR JSON — FHIR has specific
 * JSON rules (value[x] typing, primitive extensions, choice elements) that a generic converter
 * cannot honor. Conformant FHIR JSON comes from the commercial HealthLX mappings. This view is
 * a readability aid only.
 */

type JsonValue = string | JsonNode | JsonValue[]
interface JsonNode {
  [key: string]: JsonValue
}

function elementToValue(el: Element): JsonValue {
  const obj: JsonNode = {}

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
    obj[`@${attr.name}`] = attr.value
  }

  const childEls = Array.from(el.children)

  if (childEls.length === 0) {
    const text = el.textContent?.trim() ?? ''
    // Pure leaf with no attributes → just the text value.
    if (Object.keys(obj).length === 0) return text
    if (text) obj['#text'] = text
    return obj
  }

  for (const child of childEls) {
    const key = child.localName
    const value = elementToValue(child)
    const existing = obj[key]
    if (existing === undefined) {
      obj[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      obj[key] = [existing, value]
    }
  }

  return obj
}

/**
 * Convert an XML string to a pretty-printed JSON string.
 * Throws if the input is not well-formed XML.
 */
export function xmlToJson(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    throw new Error('Input is not well-formed XML')
  }
  const root = doc.documentElement
  const out: JsonNode = { [root.localName]: elementToValue(root) }
  return JSON.stringify(out, null, 2)
}
