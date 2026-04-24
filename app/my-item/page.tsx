"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

function MyItemContent() {
  const searchParams = useSearchParams()
  const recordId = searchParams.get("record")

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">My Item</h1>
      {recordId
        ? <p className="text-sm text-muted-foreground font-mono">{recordId}</p>
        : <p className="text-sm text-muted-foreground">No record ID provided.</p>}
    </main>
  )
}

export default function MyItemPage() {
  return (
    <Suspense>
      <MyItemContent />
    </Suspense>
  )
}
