"use client"

import { Wifi, WifiOff } from "lucide-react"
import Link from "next/link"
import { useAprimo } from "@/context/aprimo-context"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

export function Navbar() {
  const { isConnected, connection } = useAprimo()

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Image src="/images/logo.png" alt="aprimo logo" width="100" height="50" />
          </Link>

          <div className="flex items-center gap-6">
            <button
              onClick={() => window.dispatchEvent(new Event("aprimo:open-config"))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Connect
            </button>
            <Link 
              href="/getting-started" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
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
    </nav>
  )
}
