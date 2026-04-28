"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

function MyItemContent() {
  const searchParams = useSearchParams()
  const recordId = searchParams.get("record")

  return (
    <main className="p-8">
      {recordId
        ? <p className="text-sm text-muted-foreground font-mono">{recordId}</p>
        : <p className="text-sm text-muted-foreground">No record ID provided.</p>}
    </main>
  )
}

export default function MyItemPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <Suspense>
        <MyItemContent />
      </Suspense>
      <Footer />
    </div>
  )
}
