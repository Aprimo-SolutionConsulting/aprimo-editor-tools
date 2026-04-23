import { NextResponse } from "next/server"

export async function GET() {
  const environment = process.env.APRIMO_ENVIRONMENT
  const clientId = process.env.APRIMO_CLIENT_ID
  const clientSecret = process.env.APRIMO_CLIENT_SECRET

  if (!environment || !clientId || !clientSecret) {
    return NextResponse.json({ error: "Aprimo credentials not configured" }, { status: 500 })
  }

  const tokenUrl = `https://${environment}.aprimo.com/login/connect/token`
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "api",
    client_id: clientId,
    client_secret: clientSecret,
  })

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  const data = await response.json()

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error_description || "Token request failed" },
      { status: response.status }
    )
  }

  return NextResponse.json({
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    environment,
  })
}
