"use client"

import { useRef, useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, Video, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { formatTime } from "../constants"

interface VideoPreviewCardProps {
  videoUrl: string | null
  loading: boolean
  loadingMessage: string
  error: string | null
  recordId: string | null
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  previewW: number
  previewH: number
  onVideoSize: (size: { width: number; height: number }) => void
}

export function VideoPreviewCard({
  videoUrl,
  loading,
  loadingMessage,
  error,
  recordId,
  cropMode,
  zoom,
  rotation,
  previewW,
  previewH,
  onVideoSize,
}: VideoPreviewCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (videoUrl && videoRef.current) videoRef.current.load()
  }, [videoUrl])

  function togglePlay() {
    if (!videoRef.current) return
    if (isPlaying) { videoRef.current.pause() } else { videoRef.current.play() }
    setIsPlaying(!isPlaying)
  }

  function toggleMute() {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          Preview
          {videoSize && (
            <Badge variant="secondary" className="ml-auto font-mono text-xs">
              {videoSize.width}×{videoSize.height}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 flex flex-col items-center justify-center gap-4 p-6 overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{loadingMessage}</p>
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-destructive text-center max-w-sm">{error}</p>
        )}
        {!loading && !recordId && (
          <p className="text-sm text-muted-foreground">No record ID provided.</p>
        )}

        {videoUrl && (
          <>
            <div
              className="relative overflow-hidden bg-black rounded-md shadow"
              style={{ width: previewW, height: previewH }}
            >
              <video
                key={videoUrl}
                ref={videoRef}
                src={videoUrl}
                preload="auto"
                className="absolute inset-0 w-full h-full"
                style={{
                  objectFit: cropMode === "fill" ? "cover" : "contain",
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                  transformOrigin: "center",
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  setDuration(v.duration)
                  const size = { width: v.videoWidth, height: v.videoHeight }
                  setVideoSize(size)
                  onVideoSize(size)
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onEnded={() => setIsPlaying(false)}
              />
            </div>

            <div className="w-full max-w-lg space-y-1">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value)
                  if (videoRef.current) videoRef.current.currentTime = t
                  setCurrentTime(t)
                }}
                className="w-full h-1.5 accent-primary cursor-pointer"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono tabular-nums">{formatTime(currentTime)}</span>
                <div className="flex items-center gap-3">
                  <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button onClick={togglePlay} className="text-foreground hover:text-foreground/80 transition-colors">
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                </div>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">{formatTime(duration)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
