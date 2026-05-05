"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Clapperboard } from "lucide-react"
import { VideoSettingsPanel } from "../video-resizer/components/video-settings-panel"
import { PLATFORMS } from "../video-resizer/constants"
import { SelectedAsset, VideoClip, TransitionClip, AudioClip, TextClip } from "./types"
import { TrimEditor } from "./components/trim-editor"
import { StudioSidebar } from "./components/studio-sidebar"
import { VideoTimeline } from "./components/video-timeline"
import { useProduceVideo } from "./hooks/use-produce-video"

function VideoStudioContent() {
  const { isConnected, connection } = useAprimo()
  const [assets, setAssets] = useState<SelectedAsset[]>([])
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingTransitionType, setDraggingTransitionType] = useState<string | null>(null)
  const [videoClips, setVideoClips] = useState<VideoClip[]>([])
  const [transitionClips, setTransitionClips] = useState<TransitionClip[]>([])
  const [audioClips, setAudioClips] = useState<AudioClip[]>([])
  const [textClips, setTextClips] = useState<TextClip[]>([])
  const [selectedTextClipId, setSelectedTextClipId] = useState<string | null>(null)
  const [trimClipId, setTrimClipId] = useState<string | null>(null)
  const [playIndex, setPlayIndex] = useState(0)
  const [platform, setPlatform] = useState("YouTube")
  const [formatIndex, setFormatIndex] = useState(0)
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fit")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [outputFormat, setOutputFormat] = useState("MP4")
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 640, h: 480 })

  useEffect(() => { setPlayIndex(0) }, [videoClips.length])

  useEffect(() => {
    setVideoClips((prev) => {
      const next = prev.map((c) =>
        !c.trimSet && durations[c.assetId] !== undefined ? { ...c, duration: durations[c.assetId] } : c
      )
      return next.some((c, i) => c.duration !== prev[i].duration) ? next : prev
    })
  }, [durations])

  useEffect(() => {
    const el = previewContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize({ w: Math.max(100, width - 16), h: Math.max(100, height - 16) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const formats = PLATFORMS[platform] ?? PLATFORMS["YouTube"]
  const selectedFormat = formats[Math.min(formatIndex, formats.length - 1)]
  const fmtRatio = selectedFormat.width / selectedFormat.height
  const containerRatio = containerSize.w / containerSize.h
  const previewW = fmtRatio >= containerRatio ? containerSize.w : Math.round(containerSize.h * fmtRatio)
  const previewH = fmtRatio >= containerRatio ? Math.round(containerSize.w / fmtRatio) : containerSize.h

  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime)
  const videoEndTime = sortedClips.length > 0
    ? Math.max(...sortedClips.map((c) => c.startTime + c.duration))
    : 0
  const activeClip = sortedClips[playIndex] ?? null
  const activeAsset = activeClip ? assets.find((a) => a.id === activeClip.assetId) : null
  const trimClip = trimClipId ? videoClips.find((c) => c.assetId === trimClipId) ?? null : null
  const trimAsset = trimClip ? assets.find((a) => a.id === trimClip.assetId) ?? null : null
  const selectedTextClip = selectedTextClipId ? textClips.find((c) => c.id === selectedTextClipId) ?? null : null
  const activeTextAsset = selectedTextClip ? assets.find((a) => a.id === selectedTextClip.assetId) ?? null : null

  function handleTrimChange(trimIn: number, duration: number) {
    if (!trimClipId) return
    setVideoClips((prev) => prev.map((c) =>
      c.assetId === trimClipId ? { ...c, trimIn, duration, trimSet: true } : c
    ))
  }

  const { produceVideo, producing, produceProgress } = useProduceVideo({
    sortedClips,
    audioClips,
    assets,
    durations,
    transitionClips,
    textClips,
    selectedFormat,
    cropMode,
    zoom,
    rotation,
    outputFormat,
  })

  return (
    <main className="flex-1 flex flex-col min-h-0">
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

        {/* Main preview area */}
        <div ref={previewContainerRef} className="flex-1 flex items-center justify-center bg-muted/30 overflow-auto">
          {activeAsset?.publicLink ? (
            <div
              className="relative overflow-hidden bg-black"
              style={{ width: previewW, height: previewH }}
            >
              {activeTextAsset && (() => {
                const pos = activeTextAsset.textPosition ?? "middle-center"
                const [v, h] = pos.split("-") as ["top"|"middle"|"bottom", "left"|"center"|"right"]
                const justify = v === "top" ? "justify-start" : v === "bottom" ? "justify-end" : "justify-center"
                const items   = h === "left" ? "items-start"  : h === "right"  ? "items-end"   : "items-center"
                return (
                  <div
                    className={`absolute inset-0 z-10 flex flex-col p-5 pointer-events-none transition-opacity duration-300 ${justify} ${items}`}
                    style={{ opacity: (activeTextAsset.textOpacity ?? 100) / 100 }}
                  >
                    <div style={{ fontFamily: activeTextAsset.textFont ? `'${activeTextAsset.textFont}', sans-serif` : undefined, color: activeTextAsset.textColor ?? "#ffffff", lineHeight: 1.4, textAlign: h as "left" | "center" | "right" }}>
                      {activeTextAsset.heading && (
                        <div style={{ fontSize: activeTextAsset.headingSize ?? 48, whiteSpace: "pre-line" }}>
                          {activeTextAsset.heading}
                        </div>
                      )}
                      {activeTextAsset.body && (
                        <div style={{ fontSize: activeTextAsset.textSize ?? 32, whiteSpace: "pre-line" }}>
                          {activeTextAsset.body}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
              {activeAsset.mediaType === "image" ? (
                <img
                  key={activeClip!.assetId}
                  src={activeAsset.publicLink}
                  alt={activeAsset.title}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: cropMode === "fill" ? "cover" : "contain",
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transformOrigin: "center",
                  }}
                />
              ) : (
                <video
                  key={activeClip!.assetId}
                  src={activeAsset.publicLink}
                  controls
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration
                    if (activeClip && isFinite(d) && d > 0) {
                      setDurations((prev) => ({ ...prev, [activeClip.assetId]: d }))
                    }
                    e.currentTarget.currentTime = activeClip?.trimIn ?? 0
                  }}
                  onTimeUpdate={(e) => {
                    if (!activeClip) return
                    const trimOut = activeClip.trimIn + activeClip.duration
                    if (e.currentTarget.currentTime >= trimOut) {
                      e.currentTarget.pause()
                      e.currentTarget.currentTime = activeClip.trimIn
                      setPlayIndex((i) => (i + 1) % sortedClips.length)
                    }
                  }}
                  onEnded={() => setPlayIndex((i) => (i + 1) % sortedClips.length)}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: cropMode === "fill" ? "cover" : "contain",
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transformOrigin: "center",
                  }}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Clapperboard className="h-10 w-10 opacity-20" />
              <p className="text-sm opacity-40">Drop a clip onto the Video track to preview</p>
            </div>
          )}
        </div>

        {/* Right settings panel */}
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

      {/* Trim editor modal */}
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

      {/* Produce bar */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{produceProgress ?? ""}</span>
        <Button
          size="sm"
          onClick={produceVideo}
          disabled={producing || sortedClips.length === 0}
        >
          {producing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {producing ? "Producing…" : "Produce Video"}
        </Button>
      </div>

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
        playIndex={playIndex}
        setPlayIndex={setPlayIndex}
        trimClipId={trimClipId}
        setTrimClipId={setTrimClipId}
        draggingId={draggingId}
        setDraggingId={setDraggingId}
        draggingTransitionType={draggingTransitionType}
        setDraggingTransitionType={setDraggingTransitionType}
        videoEndTime={videoEndTime}
      />

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
