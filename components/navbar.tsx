"use client"

import { Wifi, WifiOff } from "lucide-react"
import Link from "next/link"
import { useAprimo } from "@/context/aprimo-context"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import Image from "next/image"

export function Navbar() {
  const { isConnected, connection } = useAprimo()

  return (
    <nav className="bg-background sticky top-0 z-50">
      <div className="border-b border-border px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/">
            <Image src="/images/aprimo-logo.svg" alt="Aprimo" width={120} height={54} />
          </Link>

          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => window.dispatchEvent(new Event("aprimo:open-config"))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Connect
            </button>
            {isConnected && (
              <Link href="/bulk-upload" className="text-muted-foreground hover:text-foreground transition-colors">
                Bulk Upload
              </Link>
            )}
            <Link href="/getting-started" className="text-muted-foreground hover:text-foreground transition-colors">
              Getting Started
            </Link>
            {isConnected ? (
              <Badge variant="outline" className="flex items-center gap-1.5 border-success text-success">
                <Wifi className="h-3 w-3" />
                {connection?.environment}
              </Badge>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1.5 border-muted-foreground text-muted-foreground">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </Badge>
            )}
          </div>
        </div>
      </div>

      <PageHeader />
    </nav>
  )
}
