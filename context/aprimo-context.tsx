"use client"

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react"
import { createClient } from "aprimo-js"

interface AprimoConnection {
  accessToken: string
  tokenType: string
  expiresAt: number
  environment: string
}

interface AprimoContextType {
  connection: AprimoConnection | null
  isConnected: boolean
  setConnection: (conn: AprimoConnection) => void
  clearConnection: () => void
  getAuthHeader: () => string | null
  getBaseUrl: () => string | null
  client: ReturnType<typeof createClient> | null
  selectedLanguageId: string | null
  setSelectedLanguageId: (id: string | null) => void
}

const AprimoContext = createContext<AprimoContextType | undefined>(undefined)

export function AprimoProvider({ children }: { children: ReactNode }) {
  const [connection, setConnectionState] = useState<AprimoConnection | null>(null)
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | null>(null)

  const isConnected = connection !== null && Date.now() < connection.expiresAt

  const setConnection = useCallback((conn: AprimoConnection) => {
    setConnectionState(conn)
  }, [])

  const clearConnection = useCallback(() => {
    setConnectionState(null)
    setSelectedLanguageId(null)
  }, [])

  const getAuthHeader = useCallback(() => {
    if (!connection || Date.now() >= connection.expiresAt) return null
    return `${connection.tokenType} ${connection.accessToken}`
  }, [connection])

  const getBaseUrl = useCallback(() => {
    if (!connection) return null
    return `https://${connection.environment}.dam.aprimo.com/api/core`
  }, [connection])

  const client = useMemo(() => {
    if (!connection) return null
    return createClient({
      type: "custom",
      environment: connection.environment,
      tokenProvider: async () => connection.accessToken,
    })
  }, [connection])

  return (
    <AprimoContext.Provider
      value={{
        connection,
        isConnected,
        setConnection,
        clearConnection,
        getAuthHeader,
        getBaseUrl,
        client,
        selectedLanguageId,
        setSelectedLanguageId,
      }}
    >
      {children}
    </AprimoContext.Provider>
  )
}

export function useAprimo() {
  const context = useContext(AprimoContext)
  if (!context) throw new Error("useAprimo must be used within AprimoProvider")
  return context
}
