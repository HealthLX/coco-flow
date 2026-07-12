/**
 * Hands a File from the page that received it to the page that consumes it, without
 * putting a non-serialisable File into router state. The key is passed instead.
 */
const _tempFiles = new Map<string, File>()

export function storeFileTemp(file: File): string {
  const key = `xsd-${Date.now()}-${Math.random().toString(36).slice(2)}`
  _tempFiles.set(key, file)
  return key
}

export function retrieveTempFile(key: string): File | undefined {
  return _tempFiles.get(key)
}
