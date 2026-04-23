// PKCE utilities for Aprimo OAuth

function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length)
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest("SHA-256", data)
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function generatePKCE() {
  const codeVerifier = generateRandomString(64)
  const hashed = await sha256(codeVerifier)
  const codeChallenge = base64UrlEncode(hashed)
  return { codeVerifier, codeChallenge }
}

export function buildAuthorizationUrl(
  environment: string,
  clientId: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "api",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })
  return `https://${environment}.aprimo.com/login/connect/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(
  environment: string,
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientSecret?: string,
) {
  const response = await fetch("/api/aprimo/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      environment,
      clientId,
      clientSecret,
      grantType: "authorization_code",
      code,
      codeVerifier,
      redirectUri,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error("Token exchange error:", response.status, data.error)
    throw new Error(data.error || "Authentication failed. Please check your credentials and try again.")
  }

  return data
}
