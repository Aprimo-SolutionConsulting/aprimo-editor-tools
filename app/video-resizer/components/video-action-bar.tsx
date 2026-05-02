"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2 } from "lucide-react"

interface Format {
  label: string
  width: number
  height: number
}

interface VideoActionBarProps {
  isProcessing: boolean
  progress: string | null
  progressPct: number
  videoUrl: string | null
  videoSize: { width: number; height: number } | null
  selectedFormat: Format
  onCreateRendition: () => void
  onCreateAndDownload: () => void
}

export function VideoActionBar({
  isProcessing,
  progress,
  progressPct,
  videoUrl,
  videoSize,
  selectedFormat,
  onCreateRendition,
  onCreateAndDownload,
}: VideoActionBarProps) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-background px-8 shrink-0 z-10">
      {isProcessing && progressPct > 0 && (
        <Progress value={progressPct} className="h-0.5 rounded-none" />
      )}
      <div className="h-14 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {isProcessing && progress ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress}
            </span>
          ) : (
            <>
              {videoSize && <Badge variant="outline">Source {videoSize.width}×{videoSize.height}</Badge>}
              <Badge variant="outline">Output {selectedFormat.width}×{selectedFormat.height}</Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8 px-4 text-sm"
            disabled={isProcessing || !videoUrl}
            onClick={onCreateAndDownload}
          >
            Create & Download
          </Button>
          <Button
            className="h-8 px-6 text-sm"
            disabled={isProcessing || !videoUrl}
            onClick={onCreateRendition}
          >
            {isProcessing
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</>
              : "Create Rendition"
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
