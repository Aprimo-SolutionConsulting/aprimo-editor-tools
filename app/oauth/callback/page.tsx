"use client"

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAprimo } from "@/context/aprimo-context"
import { exchangeCodeForToken } from "@/lib/pkce"

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setConnection } = useAprimo()

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code")
      const errorParam = searchParams.get("error")
      const returnUrl = sessionStorage.getItem("pkce_return_url") ?? "/"

      if (errorParam) {
        toast.error(`Authorization denied: ${errorParam}`)
        router.push(returnUrl)
        return
      }

      if (!code) {
        toast.error("No authorization code received")
        router.push(returnUrl)
        return
      }

      const environment = sessionStorage.getItem("pkce_environment")
      const clientId = sessionStorage.getItem("pkce_client_id")
      const clientSecret = sessionStorage.getItem("pkce_client_secret") ?? undefined
      const codeVerifier = sessionStorage.getItem("pkce_code_verifier")

      if (!environment || !clientId || !codeVerifier) {
        toast.error("Missing session data — please try connecting again")
        router.push(returnUrl)
        return
      }

      try {
        const redirectUri = `${window.location.origin}/oauth/callback`
        const data = await exchangeCodeForToken(environment, clientId, code, codeVerifier, redirectUri, clientSecret)

        setConnection({
          accessToken: data.access_token,
          tokenType: data.token_type,
          expiresAt: Date.now() + data.expires_in * 1000,
          environment,
        })

        sessionStorage.removeItem("pkce_environment")
        sessionStorage.removeItem("pkce_client_id")
        sessionStorage.removeItem("pkce_client_secret")
        sessionStorage.removeItem("pkce_code_verifier")
        sessionStorage.removeItem("pkce_return_url")

        toast.success("Connected!")
        router.push(returnUrl)
      } catch (err) {
        console.error("Token exchange error:", err)
        toast.error("Authentication failed — please check your credentials")
        router.push(returnUrl)
      }
    }

    handleCallback()
  }, [searchParams, setConnection, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="mt-4 text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackContent />
    </Suspense>
  )
}
