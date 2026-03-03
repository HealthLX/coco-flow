export interface HistoryEntry {
  id: string
  timestamp: string
  label: string
  actionType: 'generated' | 'transformed'
  fileType: 'canonical' | 'fhir'
  serverFilename: string | null
}

const HISTORY_KEY = 'coco-flow-history'

export function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addToHistory(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
  const full: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
  }
  const existing = getHistory()
  localStorage.setItem(HISTORY_KEY, JSON.stringify([full, ...existing].slice(0, 200)))
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}
