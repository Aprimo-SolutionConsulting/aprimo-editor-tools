"use client"

import { Suspense, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Clapperboard, Play } from "lucide-react"
import { VideoSettingsPanel } from "../video-resizer/components/video-settings-panel"
import { PLATFORMS } from "../video-resizer/constants"
import { SelectedAsset, VideoClip, TransitionClip, AudioClip, TextClip } from "./types"
import { TrimEditor } from "./components/trim-editor"
import { StudioSidebar } from "./components/studio-sidebar"
import { VideoTimeline } from "./components/video-timeline"
import { useProduceVideo } from "./hooks/use-produce-video"

// ── page ─────────────────────────────────────────────────────────────────────

function VideoStudioContent() {
  const { isConnected, connection } = useAprimo()

  // Assets
  const [assets, setAssets] = useState<SelectedAsset[]>([])
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingTransitionType, setDraggingTransitionType] = useState<string | null>(null)

  // Timeline clips
  const [videoClips, setVideoClips] = useState<VideoClip[]>([])
  const [transitionClips, setTransitionClips] = useState<TransitionClip[]>([])
  const [audioClips, setAudioClips] = useState<AudioClip[]>([])
  const [textClips, setTextClips] = useState<TextClip[]>([])
  const [selectedTextClipId, setSelectedTextClipId] = useState<string | null>(null)
  const [trimClipId, setTrimClipId] = useState<string | null>(null)

  // Output settings
  const [platform, setPlatform] = useState("YouTube")
  const [formatIndex, setFormatIndex] = useState(0)
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fit")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [outputFormat, setOutputFormat] = useState("MP4")

  // Preview
  const [previewWidth, setPreviewWidth] = useState<360 | 720 | 1280>(360)

  // Derived values
  const formats = PLATFORMS[platform] ?? PLATFORMS["YouTube"]
  const selectedFormat = formats[Math.min(formatIndex, formats.length - 1)]

  const sortedClips  = [...videoClips].sort((a, b) => a.startTime - b.startTime)
  const videoEndTime = sortedClips.length > 0 ? Math.max(...sortedClips.map((c) => c.startTime + c.duration)) : 0
  const trimClip     = trimClipId ? videoClips.find((c) => c.assetId === trimClipId) ?? null : null
  const trimAsset    = trimClip   ? assets.find((a) => a.id === trimClip.assetId)   ?? null : null

  function handleTrimChange(trimIn: number, duration: number) {
    if (!trimClipId) return
    setVideoClips((prev) => prev.map((c) =>
      c.assetId === trimClipId ? { ...c, trimIn, duration, trimSet: true } : c
    ))
  }

  const {
    produceVideo, producing, produceProgress,
    generatePreview, previewing, previewProgress,
    previewUrl, clearPreview,
  } = useProduceVideo({
    sortedClips, audioClips, assets, durations, transitionClips, textClips,
    selectedFormat, cropMode, zoom, rotation, outputFormat, previewWidth,
  })

  const isBusy         = producing || previewing
  const activeProgress = previewProgress ?? produceProgress ?? ""
  const progressPct    = activeProgress.match(/(\d+)%/)?.[1]
  const progressValue  = progressPct != null ? parseInt(progressPct) : null

  return (
    <main className="flex-1 flex flex-col min-h-0">

      {/* ── Trim dialog ── */}
      <Dialog open={!!trimClipId} onOpenChange={(open) => { if (!open) setTrimClipId(null) }}>
        <DialogContent className="sm:max-w-fit overflow-hidden p-4" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="truncate">{trimAsset?.title ?? "Trim Clip"}</DialogTitle>
          </DialogHeader>
          {trimClip && trimAsset && (
            <TrimEditor
              clip={trimClip}
              asset={trimAsset}
              sourceDuration={durations[trimClip.assetId] ?? 0}
              cropMode={cropMode}
              zoom={zoom}
              rotation={rotation}
              onTrimChange={handleTrimChange}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lockable area: work area + timeline ── */}
      <div className="relative flex-1 flex flex-col min-h-0">

        {isBusy && (
          <div className="absolute inset-0 z-30 bg-background/60 backdrop-blur-[1px] cursor-wait" />
        )}

        {/* Three-column work area */}
        <div className="flex-1 flex min-h-0">

          <StudioSidebar
            assets={assets}
            setAssets={setAssets}
            setDurations={setDurations}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            draggingTransitionType={draggingTransitionType}
            setDraggingTransitionType={setDraggingTransitionType}
            isConnected={isConnected}
            connection={connection}
          />

          {/* Preview area */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* Video */}
            <div className="flex-1 flex items-center justify-center bg-muted/30 overflow-hidden min-h-0 p-2">
              {previewUrl ? (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-full rounded shadow-md"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Clapperboard className="h-10 w-10 opacity-20" />
                  <p className="text-sm opacity-40">Generate a preview to see your video here</p>
                </div>
              )}
            </div>

            {/* Preview controls */}
            <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-t border-border bg-background">
              {/* Size toggle */}
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
                {previewing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Play className="h-3.5 w-3.5" />}
                {previewing ? "Generating…" : "Generate Preview"}
              </Button>

              {previewUrl && !isBusy && (
                <button
                  onClick={clearPreview}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

          </div>

          {/* Settings panel */}
          <div className="shrink-0 border-l border-border overflow-y-auto">
            <VideoSettingsPanel
              platform={platform}
              formatIndex={formatIndex}
              cropMode={cropMode}
              zoom={zoom}
              rotation={rotation}
              outputFormat={outputFormat}
              formats={formats}
              selectedFormat={selectedFormat}
              onPlatformChange={(v) => { setPlatform(v); setFormatIndex(0) }}
              onFormatIndexChange={setFormatIndex}
              onCropModeChange={setCropMode}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onOutputFormatChange={setOutputFormat}
            />
          </div>

        </div>

        {/* Timeline */}
        <VideoTimeline
          sortedClips={sortedClips}
          setVideoClips={setVideoClips}
          transitionClips={transitionClips}
          setTransitionClips={setTransitionClips}
          audioClips={audioClips}
          setAudioClips={setAudioClips}
          textClips={textClips}
          setTextClips={setTextClips}
          selectedTextClipId={selectedTextClipId}
          setSelectedTextClipId={setSelectedTextClipId}
          assets={assets}
          durations={durations}
          trimClipId={trimClipId}
          setTrimClipId={setTrimClipId}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          draggingTransitionType={draggingTransitionType}
          setDraggingTransitionType={setDraggingTransitionType}
          videoEndTime={videoEndTime}
        />

      </div>

      {/* ── Produce bar (always interactive) ── */}
      <div className="shrink-0 border-t border-border bg-background">

        {/* Progress bar */}
        <div className="h-1 bg-muted overflow-hidden">
          {isBusy && (
            progressValue != null
              ? <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressValue}%` }} />
              : <div className="h-full bg-primary/70 animate-pulse w-full" />
          )}
        </div>

        <div className="px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{activeProgress}</span>
          <Button
            size="sm"
            onClick={produceVideo}
            disabled={isBusy || sortedClips.length === 0}
          >
            {producing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {producing ? "Producing…" : "Produce Video"}
          </Button>
        </div>

      </div>

    </main>
  )
}

export default function VideoStudioPage() {
  return (
    <div className="h-screen bg-background flex flex-col">
      <Navbar />
      <Suspense fallback={null}>
        <VideoStudioContent />
      </Suspense>
      <Footer />
    </div>
  )
}
