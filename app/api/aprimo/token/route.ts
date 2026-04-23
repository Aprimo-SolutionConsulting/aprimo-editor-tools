import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { environment, clientId, grantType, code, codeVerifier, redirectUri } = body
    const clientSecret = body.clientSecret ?? process.env.APRIMO_CLIENT_SECRET

    if (!environment || !clientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const tokenUrl = `https://${environment}.aprimo.com/login/connect/token`
    const params = new URLSearchParams()

    if (grantType === "authorization_code") {
      // PKCE flow
      params.append("grant_type", "authorization_code")
      params.append("client_id", clientId)
      params.append("code", code)
      params.append("code_verifier", codeVerifier)
      params.append("redirect_uri", redirectUri)
      if (clientSecret) {
        params.append("client_secret", clientSecret)
      }
    } else {
      // Client credentials flow
      params.append("grant_type", "client_credentials")
      params.append("scope", "api")
      params.append("client_id", clientId)
      params.append("client_secret", clientSecret)
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("[v0] Aprimo token error:", response.status, data)
      return NextResponse.json(
        { error: data.error_description || data.error || "Token request failed" },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Token route error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
