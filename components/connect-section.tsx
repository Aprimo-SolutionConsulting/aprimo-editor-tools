"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Globe, Key, Eye, EyeOff, CheckCircle, Loader2, LogOut, ExternalLink } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { useAprimo } from "@/context/aprimo-context"
import { generatePKCE, buildAuthorizationUrl } from "@/lib/pkce"

export function ConnectSection() {
  const { isConnected, connection, setConnection, clearConnection } = useAprimo()
  const [environment, setEnvironment] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleClientCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!environment || !clientId || !clientSecret) {
      toast.error("Please fill in all fields")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/aprimo/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment,
          clientId,
          clientSecret,
          grantType: "client_credentials",
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setConnection(
          {
            accessToken: data.access_token,
            tokenType: data.token_type,
            expiresAt: Date.now() + data.expires_in * 1000,
            environment,
          },
          { environment, clientId, clientSecret }
        )
        toast.success("Connection validated and token stored!")
      } else {
        console.error("Connection failed:", response.status, data.error)
        toast.error(data.error || "Connection failed. Please verify your environment and credentials.")
      }
    } catch (error) {
      toast.error("Connection failed: Unable to reach the service. Check your environment and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePKCELogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!environment || !clientId || !clientSecret) {
      toast.error("Please fill in all fields")
      return
    }

    try {
      const { codeVerifier, codeChallenge } = await generatePKCE()
      const redirectUri = `${window.location.origin}/oauth/callback`

      console.log("[v0] PKCE Login - Redirect URI:", redirectUri)
      console.log("[v0] PKCE Login - Environment:", environment)
      console.log("[v0] PKCE Login - Client ID:", clientId)

      sessionStorage.setItem("pkce_environment", environment)
      sessionStorage.setItem("pkce_client_id", clientId)
      sessionStorage.setItem("pkce_code_verifier", codeVerifier)
      sessionStorage.setItem("pkce_client_secret", clientSecret)

      const authUrl = buildAuthorizationUrl(environment, clientId, codeChallenge, redirectUri)
      console.log("[v0] PKCE Login - Full Auth URL:", authUrl)
      
      window.location.href = authUrl
    } catch (error) {
      console.error("[v0] PKCE Login Error:", error)
      toast.error("Failed to initiate PKCE login")
    }
  }

  const credentialFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="environment" className="flex items-center gap-2 text-foreground">
          <Globe className="h-4 w-4 text-primary" />
          Aprimo Environment
        </Label>
        <Input
          id="environment"
          placeholder="mycompany"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          className="bg-muted/50 border-border focus:border-primary"
        />
        <p className="text-xs text-muted-foreground">
          The subdomain of your Aprimo instance (e.g. mycompany for mycompany.aprimo.com)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientId" className="flex items-center gap-2 text-foreground">
          <Key className="h-4 w-4 text-primary" />
          Client ID
        </Label>
        <Input
          id="clientId"
          placeholder="your-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="bg-muted/50 border-border focus:border-primary font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientSecret" className="flex items-center gap-2 text-foreground">
          <Lock className="h-4 w-4 text-primary" />
          Client Secret
        </Label>
        <div className="relative">
          <Input
            id="clientSecret"
            type={showSecret ? "text" : "password"}
            placeholder="your-client-secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="bg-muted/50 border-border focus:border-primary font-mono text-sm pr-12"
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Connect your environment
          </h1>
          <p className="text-muted-foreground">
            You will need to create a client credential registration to use this tool.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6 shadow-sm"
        >
          <Tabs defaultValue="client-credentials" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="client-credentials">Client Credentials</TabsTrigger>
              <TabsTrigger value="pkce">PKCE Login</TabsTrigger>
            </TabsList>

            <TabsContent value="client-credentials">
              <form onSubmit={handleClientCredentials} className="space-y-6">
                {credentialFields}
                <Button type="submit" className="w-full" disabled={isLoading || isConnected}>
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {isLoading ? "Validating..." : isConnected ? "Connected" : "Connect"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="pkce">
              <form onSubmit={handlePKCELogin} className="space-y-6">
                {credentialFields}
                <Button type="submit" className="w-full" disabled={isConnected}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {isConnected ? "Connected" : "Login with Aprimo"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {isConnected && (
            <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
              <p className="text-sm text-success flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Connected to {connection?.environment}.aprimo.com
              </p>
              <Button variant="outline" size="sm" onClick={clearConnection}>
                <LogOut className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
