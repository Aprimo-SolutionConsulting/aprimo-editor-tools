"use client"

import { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from "react"
import { createClient } from "aprimo-js"
import { toast } from "sonner"

interface AprimoConnection {
  accessToken: string
  tokenType: string
  expiresAt: number
  environment: string
}

interface AprimoCredentials {
  environment: string
  clientId: string
  clientSecret: string
}

interface AprimoContextType {
  connection: AprimoConnection | null
  isConnected: boolean
  setConnection: (conn: AprimoConnection, creds?: AprimoCredentials) => void
  clearConnection: () => void
  getAuthHeader: () => string | null
  getBaseUrl: () => string | null
  client: ReturnType<typeof createClient> | null
  selectedLanguageId: string | null
  setSelectedLanguageId: (id: string | null) => void
}

const AprimoContext = createContext<AprimoContextType | undefined>(undefined)

async function fetchToken(creds: AprimoCredentials): Promise<AprimoConnection> {
  const tokenUrl = `https://${creds.environment}.aprimo.com/login/connect/token`
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "api",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  })

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!response.ok) {
    console.error("Token refresh failed:", response.status, response.statusText)
    throw new Error("Token refresh failed")
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresAt: Date.now() + data.expires_in * 1000,
    environment: creds.environment,
  }
}

export function AprimoProvider({ children }: { children: ReactNode }) {
  const [connection, setConnectionState] = useState<AprimoConnection | null>(null)
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | null>(null)
  const credentialsRef = useRef<AprimoCredentials | null>(null)
  const refreshingRef = useRef<Promise<string> | null>(null)

  const isConnected = connection !== null && Date.now() < connection.expiresAt

  const refreshToken = useCallback(async (): Promise<string> => {
    if (refreshingRef.current) return refreshingRef.current

    const creds = credentialsRef.current
    if (!creds) throw new Error("No credentials stored for token refresh")

    refreshingRef.current = (async () => {
      try {
        const newConn = await fetchToken(creds)
        setConnectionState(newConn)
        toast.success("Session refreshed automatically")
        return newConn.accessToken
      } catch (err) {
        setConnectionState(null)
        toast.error("Session expired — please reconnect")
        throw err
      } finally {
        refreshingRef.current = null
      }
    })()

    return refreshingRef.current
  }, [])

  const setConnection = useCallback((conn: AprimoConnection, creds?: AprimoCredentials) => {
    setConnectionState(conn)
    if (creds) {
      credentialsRef.current = creds
    }
  }, [])

  const clearConnection = useCallback(() => {
    setConnectionState(null)
    setSelectedLanguageId(null)
    credentialsRef.current = null
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
      tokenProvider: async () => {
        if (Date.now() < connection.expiresAt - 30000) {
          return connection.accessToken
        }
        return refreshToken()
      },
    })
  }, [connection, refreshToken])

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
