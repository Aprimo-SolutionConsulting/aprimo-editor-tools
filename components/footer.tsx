import { Activity } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold">Aprimo</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Aprimo. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
