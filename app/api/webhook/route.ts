import { NextRequest, NextResponse } from "next/server"
import actionMap from "./actions.json"
import { supabase } from "@/lib/supabase"

async function verifySignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return true // Skip verification if no secret is configured

  const signature = request.headers.get("x-webhook-signature") ?? request.headers.get("x-hub-signature-256")
  if (!signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody))
  const expectedSignature = "sha256=" + Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  // Constant-time comparison
  const sigToCheck = signature.startsWith("sha256=") ? signature : `sha256=${signature}`
  if (sigToCheck.length !== expectedSignature.length) return false

  let mismatch = 0
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ sigToCheck.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    const isValid = await verifySignature(request, rawBody)
    if (!isValid) {
      console.warn("[webhook] Invalid signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    let payload: unknown
    const contentType = request.headers.get("content-type") ?? ""

    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawBody)
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      payload = Object.fromEntries(new URLSearchParams(rawBody))
    } else {
      payload = rawBody
    }

    const action = request.nextUrl.searchParams.get("action")
    if (!action) {
      return NextResponse.json({ error: "Missing action query parameter" }, { status: 400 })
    }

    const returnUrl = actionMap[action as keyof typeof actionMap]
    if (!returnUrl) {
      console.warn(`[webhook] Unknown action: "${action}"`)
      return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 404 })
    }

    const { recordIds } = payload as { recordIds?: string }
    let finalUrl = returnUrl

    if (recordIds) {
      const requestId = crypto.randomUUID()
      const recordList = recordIds.split(";").map((id) => id.trim()).filter(Boolean)

      const { error } = await supabase
        .from("requested_records")
        .insert({ requestId, recordList })

      if (error) {
        console.error("[webhook] Supabase insert error:", error)
        return NextResponse.json({ error: "Failed to save records" }, { status: 500 })
      }

      const url = new URL(returnUrl)
      url.searchParams.set("requestId", requestId)
      finalUrl = url.toString()
    }

    return NextResponse.json({ url: finalUrl }, { status: 200 })
  } catch (error) {
    console.error("[webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 })
  }
}
