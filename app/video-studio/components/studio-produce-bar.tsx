"use client"

import { Loader2, Braces, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { VideoClip } from "../types"

interface StudioProduceBarProps {
  isBusy: boolean
  activeProgress: string
  progressValue: number | null
  producing: boolean
  downloading: boolean
  savedRecordUrl: string | null
  savedRecordId: string | null
  vsSettingsReady: boolean
  sortedClips: VideoClip[]
  isDev: boolean
  disableFades: boolean
  onDisableFadesChange: (v: boolean) => void
  onDownload: () => void
  onSaveOrUpdate: () => void
  onOpenStateDialog: () => void
  onOpenLoadDialog: () => void
}

export function StudioProduceBar({
  isBusy, activeProgress, progressValue,
  producing, downloading,
  savedRecordUrl, savedRecordId, vsSettingsReady,
  sortedClips, isDev, disableFades, onDisableFadesChange,
  onDownload, onSaveOrUpdate, onOpenStateDialog, onOpenLoadDialog,
}: StudioProduceBarProps) {
  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="h-1 bg-muted overflow-hidden">
        {isBusy && (
          progressValue != null
            ? <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressValue}%` }} />
            : <div className="h-full bg-primary/70 animate-pulse w-full" />
        )}
      </div>

      <div className="px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{activeProgress}</span>
          <div className="flex items-center gap-1.5">
            <Switch id="disable-fades" checked={disableFades} onCheckedChange={onDisableFadesChange} disabled={isBusy} />
            <Label htmlFor="disable-fades" className="text-xs cursor-pointer">Disable Transitions</Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDev && (
            <>
              <Button size="sm" variant="outline" onClick={onOpenLoadDialog}>
                <Braces className="h-3.5 w-3.5" />
                Load
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenStateDialog}>
                <Braces className="h-3.5 w-3.5" />
                State
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onDownload}
            disabled={isBusy || sortedClips.length === 0}
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Creating…" : "Create and Download"}
          </Button>
          {savedRecordUrl && !isBusy && (
            <Button size="sm" variant="outline" onClick={() => window.open(savedRecordUrl, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Aprimo
            </Button>
          )}
          <Button
            size="sm"
            onClick={onSaveOrUpdate}
            disabled={isBusy || sortedClips.length === 0 || !vsSettingsReady}
            title={!vsSettingsReady ? "Configure Video Studio settings via the gear icon" : undefined}
          >
            {producing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {producing ? "Saving…" : savedRecordId ? "Update Asset" : "Save as Asset"}
          </Button>
        </div>
      </div>
    </div>
  )
}
