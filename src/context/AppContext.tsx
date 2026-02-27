import React, { createContext, useContext, useState, useCallback } from 'react'

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'success' | 'error' | 'info' | 'pending'
  message: string
}

interface AppContextValue {
  selectedCanonical: string
  setSelectedCanonical: (v: string) => void
  logs: LogEntry[]
  pushLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedCanonical, setSelectedCanonical] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])

  const pushLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, timestamp: new Date(), level, message },
    ])
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  return (
    <AppContext.Provider value={{ selectedCanonical, setSelectedCanonical, logs, pushLog, clearLogs }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
