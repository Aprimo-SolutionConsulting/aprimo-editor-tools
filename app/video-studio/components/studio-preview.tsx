"use client"

import { Clapperboard, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VideoClip } from "../types"

interface StudioPreviewProps {
  previewUrl: string | null
  clearPreview: () => void
  generatePreview: () => void
  previewing: boolean
  isBusy: boolean
  sortedClips: VideoClip[]
  previewWidth: 360 | 720 | 1280
  setPreviewWidth: (w: 360 | 720 | 1280) => void
}

export function StudioPreview({
  previewUrl, clearPreview, generatePreview,
  previewing, isBusy, sortedClips, previewWidth, setPreviewWidth,
}: StudioPreviewProps) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-muted/30 overflow-hidden p-2">
        {previewUrl ? (
          <video src={previewUrl} controls className="max-w-full max-h-full rounded shadow-md" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Clapperboard className="h-10 w-10 opacity-20" />
            <p className="text-sm opacity-40">Generate a preview to see your video here</p>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-t border-border bg-background">
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {([360, 720, 1280] as const).map((w, i) => (
            <button
              key={w}
              onClick={() => setPreviewWidth(w)}
              className={`px-3 py-1 transition-colors ${i > 0 ? "border-l border-border" : ""} ${previewWidth === w ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-foreground"}`}
            >
              {w === 1280 ? "1080p" : w === 720 ? "720p" : "360p"}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={generatePreview}
          disabled={isBusy || sortedClips.length === 0}
        >
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {previewing ? "Generating…" : "Generate Preview"}
        </Button>

        {previewUrl && !isBusy && (
          <button onClick={clearPreview} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
