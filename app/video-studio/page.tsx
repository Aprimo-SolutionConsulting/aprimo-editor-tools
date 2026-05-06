"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Expander } from "aprimo-js"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Clapperboard, Play, Braces, Download, ExternalLink } from "lucide-react"
import { VideoSettingsPanel } from "../video-resizer/components/video-settings-panel"
import { PLATFORMS } from "../video-resizer/constants"
import { SelectedAsset, VideoClip, TransitionClip, AudioClip, TextClip } from "./types"
import { TrimEditor } from "./components/trim-editor"
import { StudioSidebar } from "./components/studio-sidebar"
import { VideoTimeline } from "./components/video-timeline"
import { useProduceVideo } from "./hooks/use-produce-video"

// ── page ─────────────────────────────────────────────────────────────────────

function VideoStudioContent() {
  const { isConnected, connection, client } = useAprimo()
  const searchParams = useSearchParams()
  const recordParam = searchParams.get("record")

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

  // State inspector / loader
  const [stateJson, setStateJson] = useState<string | null>(null)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [loadInput, setLoadInput] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  // Save to Aprimo
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [projectNameInput, setProjectNameInput] = useState("")

  // Video Studio save settings — env vars or localStorage
  const [vsSettingsReady, setVsSettingsReady] = useState(false)
  useEffect(() => {
    const ct = process.env.NEXT_PUBLIC_VIDEO_STUDIO_CONTENT_TYPE || localStorage.getItem("aprimo_vs_content_type")
    const cid = process.env.NEXT_PUBLIC_VIDEO_STUDIO_CLASSIFICATION_ID || localStorage.getItem("aprimo_vs_classification_id")
    const jf = process.env.NEXT_PUBLIC_VIDEO_STUDIO_JSON_FIELD || localStorage.getItem("aprimo_vs_json_field")
    setVsSettingsReady(!!(ct && cid && jf))
  }, [])

  // Record auto-load (from ?record query param)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const recordLoadedRef = useRef(false)

  function buildStateJson() {
    const state = {
      output: { platform, format: selectedFormat, cropMode, zoom, rotation, outputFormat },
      assets: assets.map((a) => ({ ...a, duration: durations[a.id] ?? null })),
      videoClips: sortedClips,
      transitionClips,
      audioClips,
      textClips: textClips.map((tc) => ({ ...tc, asset: assets.find((a) => a.id === tc.assetId) })),
    }
    setStateJson(JSON.stringify(state, null, 2))
  }

  function loadState(json: string) {
    const s = JSON.parse(json)

    const restoredAssets: SelectedAsset[] = (s.assets ?? []).map(({ duration: _d, ...a }: any) => ({
      ...a, thumbnailUrl: a.thumbnailUrl ?? null, loading: false, error: null,
    }))
    setAssets(restoredAssets)

    const restoredDurations: Record<string, number> = {}
    ;(s.assets ?? []).forEach((a: any) => { if (a.duration != null) restoredDurations[a.id] = a.duration })
    setDurations(restoredDurations)

    setVideoClips(s.videoClips ?? [])
    setTransitionClips(s.transitionClips ?? [])
    setAudioClips(s.audioClips ?? [])
    setTextClips((s.textClips ?? []).map(({ asset: _a, ...tc }: any) => tc))

    if (s.output) {
      const p = s.output.platform ?? "YouTube"
      setPlatform(p)
      setCropMode(s.output.cropMode ?? "fit")
      setZoom(s.output.zoom ?? 100)
      setRotation(s.output.rotation ?? 0)
      setOutputFormat(s.output.outputFormat ?? "MP4")
      const fmts = PLATFORMS[p] ?? []
      const idx = fmts.findIndex((f) => f.label === s.output.format?.label)
      setFormatIndex(idx >= 0 ? idx : 0)
    }
  }

  useEffect(() => {
    if (!recordParam || !client || !isConnected || recordLoadedRef.current) return
    recordLoadedRef.current = true

    const jsonFieldName = process.env.NEXT_PUBLIC_VIDEO_STUDIO_JSON_FIELD
    if (!jsonFieldName) return

    setLoadingRecord(true)

    const expander = Expander.create()
    ;(expander.for("record") as any).expand("fields")
    expander.selectRecordFields(jsonFieldName)

    client.search.records({ searchExpression: { expression: `id='${recordParam}'` } }, expander)
      .then((result: any) => {
        if (!result.ok) throw new Error(result.error?.message ?? "Failed to load record")
        const record = result.data?.items?.[0] as any
        if (!record) throw new Error("Record not found")

        const fields: any[] = record._embedded?.fields?.items ?? []
        const field = fields.find((f: any) => f.fieldName === jsonFieldName)
        if (!field) throw new Error(`Field "${jsonFieldName}" not found on record`)

        const value = field.localizedValues?.[0]?.value
        if (!value) throw new Error("Field has no value")

        loadState(value)
        toast.success("Project loaded")
      })
      .catch((err: unknown) => {
        toast.error(`Failed to load record: ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => setLoadingRecord(false))
  }, [recordParam, client, isConnected])

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
    produceVideo, producing, produceProgress, savedRecordId, savedRecordUrl,
    downloadVideo, downloading, downloadProgress,
    generatePreview, previewing, previewProgress,
    previewUrl, clearPreview,
  } = useProduceVideo({
    sortedClips, audioClips, assets, durations, transitionClips, textClips,
    platform, selectedFormat, cropMode, zoom, rotation, outputFormat, previewWidth,
    initialRecordId: recordParam,
  })

  const isBusy         = producing || previewing || downloading || loadingRecord
  const activeProgress = loadingRecord ? "Loading project…" : previewProgress ?? produceProgress ?? downloadProgress ?? ""
  const progressPct    = activeProgress.match(/(\d+)%/)?.[1]
  const progressValue  = progressPct != null ? parseInt(progressPct) : null

  return (
    <main className="flex-1 flex flex-col min-h-0">

      {/* ── Load state dialog ── */}
      <Dialog open={loadDialogOpen} onOpenChange={(open) => { setLoadDialogOpen(open); if (!open) { setLoadInput(""); setLoadError(null) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Load State</DialogTitle>
          </DialogHeader>
          <textarea
            className="flex-1 min-h-64 text-xs font-mono bg-muted rounded p-3 outline-none resize-none focus:ring-1 focus:ring-ring"
            placeholder="Paste state JSON here…"
            value={loadInput}
            onChange={(e) => { setLoadInput(e.target.value); setLoadError(null) }}
          />
          {loadError && <p className="text-xs text-destructive">{loadError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoadDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!loadInput.trim()} onClick={() => {
              try {
                loadState(loadInput)
                setLoadDialogOpen(false)
                setLoadInput("")
                setLoadError(null)
              } catch (e) {
                setLoadError(e instanceof Error ? e.message : "Invalid JSON")
              }
            }}>Load</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── State inspector dialog ── */}
      <Dialog open={!!stateJson} onOpenChange={(open) => { if (!open) setStateJson(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>State</DialogTitle>
          </DialogHeader>
          <pre className="flex-1 overflow-auto text-xs bg-muted rounded p-3 font-mono whitespace-pre">{stateJson}</pre>
        </DialogContent>
      </Dialog>

      {/* ── Save to Aprimo dialog ── */}
      <Dialog open={saveDialogOpen} onOpenChange={(open) => { setSaveDialogOpen(open); if (!open) setProjectNameInput("") }}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Save as Asset</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            placeholder="Project name (used as filename)"
            value={projectNameInput}
            onChange={(e) => setProjectNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && projectNameInput.trim()) {
                setSaveDialogOpen(false)
                produceVideo(projectNameInput.trim())
                setProjectNameInput("")
              }
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!projectNameInput.trim()} onClick={() => {
              setSaveDialogOpen(false)
              produceVideo(projectNameInput.trim())
              setProjectNameInput("")
            }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setLoadInput(""); setLoadError(null); setLoadDialogOpen(true) }}>
              <Braces className="h-3.5 w-3.5" />
              Load
            </Button>
            <Button size="sm" variant="outline" onClick={buildStateJson}>
              <Braces className="h-3.5 w-3.5" />
              State
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadVideo}
              disabled={isBusy || sortedClips.length === 0}
            >
              {downloading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              {downloading ? "Creating…" : "Create and Download"}
            </Button>
            {savedRecordUrl && !isBusy && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(savedRecordUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Aprimo
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => savedRecordId ? produceVideo() : setSaveDialogOpen(true)}
              disabled={isBusy || sortedClips.length === 0 || !vsSettingsReady}
              title={!vsSettingsReady ? "Configure Video Studio settings via the gear icon" : undefined}
            >
              {producing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {producing ? "Saving…" : savedRecordId ? "Update Asset" : "Save as Asset"}
            </Button>
          </div>
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
