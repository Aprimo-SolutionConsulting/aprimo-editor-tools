"use client"

import { useState, useEffect, useRef } from "react"
import { useAprimo } from "@/context/aprimo-context"
import { generatePKCE, buildAuthorizationUrl } from "@/lib/pkce"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function startOAuth(environment: string, clientId: string, clientSecret: string) {
  generatePKCE().then(({ codeVerifier, codeChallenge }) => {
    const redirectUri = `${window.location.origin}/oauth/callback`
    sessionStorage.setItem("pkce_environment", environment)
    sessionStorage.setItem("pkce_client_id", clientId)
    sessionStorage.setItem("pkce_client_secret", clientSecret)
    sessionStorage.setItem("pkce_code_verifier", codeVerifier)
    sessionStorage.setItem("pkce_return_url", window.location.href)
    window.location.href = buildAuthorizationUrl(environment, clientId, codeChallenge, redirectUri)
  })
}

export function AprimoConfigDialog() {
  const { isConnected } = useAprimo()
  const [open, setOpen] = useState(false)
  const [environment, setEnvironment] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const hasAttempted = useRef(false)

  function openWithCurrentValues() {
    setEnvironment(localStorage.getItem("aprimo_environment") ?? "")
    setClientId(localStorage.getItem("aprimo_client_id") ?? "")
    setClientSecret(localStorage.getItem("aprimo_client_secret") ?? "")
    setOpen(true)
  }

  useEffect(() => {
    window.addEventListener("aprimo:open-config", openWithCurrentValues)
    return () => window.removeEventListener("aprimo:open-config", openWithCurrentValues)
  }, [])

  useEffect(() => {
    if (isConnected) return
    if (window.location.pathname.startsWith("/oauth")) return

    const params = new URLSearchParams(window.location.search)
    if (params.get("auth_failed") === "1") {
      params.delete("auth_failed")
      const newSearch = params.toString()
      history.replaceState(null, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""))
      openWithCurrentValues()
      return
    }

    if (hasAttempted.current) return
    hasAttempted.current = true

    const env = localStorage.getItem("aprimo_environment")
    const cid = localStorage.getItem("aprimo_client_id")
    const secret = localStorage.getItem("aprimo_client_secret") ?? ""
    if (!env || !cid) {
      openWithCurrentValues()
    } else {
      startOAuth(env, cid, secret)
    }
  }, [isConnected])

  function handleConnect() {
    const env = environment.trim()
    const cid = clientId.trim()
    const secret = clientSecret.trim()
    localStorage.setItem("aprimo_environment", env)
    localStorage.setItem("aprimo_client_id", cid)
    localStorage.setItem("aprimo_client_secret", secret)
    setOpen(false)
    startOAuth(env, cid, secret)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprimo Configuration</DialogTitle>
          <DialogDescription>
            Enter your Aprimo credentials. These will be saved in your browser for future use.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="config-environment">Environment</Label>
            <Input
              id="config-environment"
              placeholder="yourcompany"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The subdomain of your Aprimo instance (e.g. <span className="font-mono">yourcompany</span> for yourcompany.aprimo.com)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="config-client-id">Client ID</Label>
            <Input
              id="config-client-id"
              placeholder="your-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="config-client-secret">Client Secret</Label>
            <Input
              id="config-client-secret"
              type="password"
              placeholder="your-client-secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!environment.trim() || !clientId.trim()}
            onClick={handleConnect}
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
