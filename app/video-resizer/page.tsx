"use client"

import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Expander } from "aprimo-js"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ZoomIn, ZoomOut, Play, Pause, Volume2, VolumeX, RotateCcw, Loader2, Video } from "lucide-react"
import { toast } from "sonner"
import type { AprimoRecord } from "@/models/aprimo"

const PLATFORMS: Record<string, { label: string; width: number; height: number }[]> = {
  Instagram: [
    { label: "Feed Landscape — 16:9", width: 1080, height: 608 },
    { label: "Feed Square — 1:1", width: 1080, height: 1080 },
    { label: "Feed Portrait — 4:5", width: 1080, height: 1350 },
    { label: "Story / Reels — 9:16", width: 1080, height: 1920 },
  ],
  YouTube: [
    { label: "Standard — 16:9", width: 1920, height: 1080 },
    { label: "Shorts — 9:16", width: 1080, height: 1920 },
  ],
  TikTok: [
    { label: "Standard — 9:16", width: 1080, height: 1920 },
  ],
  Facebook: [
    { label: "Feed — 16:9", width: 1280, height: 720 },
    { label: "Story — 9:16", width: 1080, height: 1920 },
  ],
  LinkedIn: [
    { label: "Landscape — 16:9", width: 1920, height: 1080 },
    { label: "Square — 1:1", width: 1080, height: 1080 },
  ],
  X: [
    { label: "Landscape — 16:9", width: 1280, height: 720 },
    { label: "Square — 1:1", width: 720, height: 720 },
  ],
}

const OUTPUT_FORMATS = ["MP4", "MOV", "WebM"]

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function buildVfFilter(
  width: number,
  height: number,
  cropMode: "fill" | "fit",
  zoom: number,
  rotation: number
): string {
  const filters: string[] = []

  if (zoom !== 100) {
    const s = zoom / 100
    filters.push(`scale=iw*${s}:ih*${s}`)
  }

  if (rotation === 90) filters.push("transpose=1")
  else if (rotation === 180) filters.push("transpose=1,transpose=1")
  else if (rotation === 270) filters.push("transpose=2")

  if (cropMode === "fill") {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`)
    filters.push(`crop=${width}:${height}`)
  } else {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`)
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`)
  }

  return filters.join(",")
}

function VideoResizerContent() {
  const searchParams = useSearchParams()
  const recordId = searchParams.get("record")
  const { client, isConnected, getAuthHeader } = useAprimo()
  const [loadingMessage, setLoadingMessage] = useState("Loading…")

  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)

  const [platform, setPlatform] = useState("Instagram")
  const [formatIndex, setFormatIndex] = useState(0)
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fill")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [outputFormat, setOutputFormat] = useState("MP4")

  const [additionalFilesHref, setAdditionalFilesHref] = useState<string | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [progressPct, setProgressPct] = useState(0)

  const formats = PLATFORMS[platform]
  const selectedFormat = formats[formatIndex] ?? formats[0]

  useEffect(() => {
    if (!isConnected || !client || !recordId) return

    async function loadRecord() {
      setLoading(true)
      setError(null)
      try {
        // Load record to extract file/version IDs for rendition attachment
        setLoadingMessage("Loading record…")
        const expander = Expander.create()
        ;(expander.for("record") as { expand: (...f: string[]) => Expander }).expand("masterfilelatestversion")

        const result = await client!.search.records(
          { searchExpression: { expression: `id='${recordId}'` } },
          expander
        )
        if (!result.ok) throw new Error(result.error?.message ?? "Failed to load record")

        type FileVersionWithLinks = {
          id?: string
          _links?: Record<string, { href: string }>
        }
        const record = (result.data?.items?.[0]) as unknown as AprimoRecord & {
          _embedded?: { masterfilelatestversion?: FileVersionWithLinks }
        }
        if (!record) throw new Error("Record not found")

        const masterFile = record._embedded?.masterfilelatestversion
        const href = masterFile?._links?.["additionalfiles"]?.href
        if (href) setAdditionalFilesHref(href)

        // Create a download order to get a direct video URL
        setLoadingMessage("Creating download order…")
        const orderRes = await client!.orders.create({
          type: "download",
          targets: [
            {
              recordId: recordId!,
              targetTypes: ["Document"],
              assetType: "LatestVersionOfMasterFile",
            } as never,
          ],
        })
        if (!orderRes.ok || !orderRes.data) {
          throw new Error(orderRes.error?.message ?? "Failed to create download order")
        }

        const orderId = orderRes.data.id

        // Poll until completed
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise((r) => setTimeout(r, 1000))
          setLoadingMessage(`Preparing video… (${attempt + 1}s)`)

          const pollRes = await client!.orders.getById(orderId)
          const order = pollRes.data
          if (!order) continue

          if (order.status === "Failed") throw new Error("Download order failed")

          if (order.status === "Completed" || order.status === "Success") {
            // Try deliveredFiles directly on the order
            const delivered = (order as unknown as { deliveredFiles?: string[] }).deliveredFiles
            if (Array.isArray(delivered) && delivered.length > 0) {
              setVideoUrl(delivered[0])
              return
            }

            // Fallback: downloadLinks endpoint
            try {
              const dlRes = await client!.downloadLinks.getById(orderId)
              const url = (dlRes.data as unknown as { deliveredFiles?: string[] })?.deliveredFiles?.[0]
              if (url) { setVideoUrl(url); return }
            } catch { /* keep polling */ }
          }
        }

        throw new Error("Download order timed out")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video")
      } finally {
        setLoading(false)
      }
    }

    loadRecord()
  }, [isConnected, client, recordId])

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load()
    }
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

  const processVideo = useCallback(async (): Promise<{ blob: Blob; filename: string; ext: string }> => {
    if (!videoUrl) throw new Error("No video loaded")

    const { FFmpeg } = await import("@ffmpeg/ffmpeg")
    const { fetchFile, toBlobURL } = await import("@ffmpeg/util")

    setProgress("Loading FFmpeg…")
    const ffmpeg = new FFmpeg()
    ffmpeg.on("progress", ({ progress: p }) => {
      const pct = Math.round(p * 100)
      setProgress(`Processing… ${pct}%`)
      setProgressPct(pct)
    })

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    })

    setProgress("Fetching video…")
    await ffmpeg.writeFile("input.mp4", await fetchFile(videoUrl))

    const ext = outputFormat === "WebM" ? "webm" : "mp4"
    const outputFile = `output.${ext}`
    const vf = buildVfFilter(selectedFormat.width, selectedFormat.height, cropMode, zoom, rotation)

    const codecArgs =
      outputFormat === "WebM"
        ? ["-c:v", "libvpx-vp9", "-c:a", "libopus", "-b:v", "0", "-crf", "30"]
        : ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast"]

    setProgress("Processing… 0%")
    await ffmpeg.exec(["-i", "input.mp4", "-vf", vf, ...codecArgs, outputFile])

    const data = await ffmpeg.readFile(outputFile)
    const mimeType = outputFormat === "WebM" ? "video/webm" : "video/mp4"
    const blob = new Blob([data], { type: mimeType })
    const filename = `${platform}_${selectedFormat.label.replace(/[^a-z0-9]/gi, "_")}_${selectedFormat.width}x${selectedFormat.height}.${ext}`

    return { blob, filename, ext }
  }, [videoUrl, outputFormat, selectedFormat, cropMode, zoom, rotation, platform])

  async function handleCreateRendition() {
    if (!client || !recordId) return
    setIsProcessing(true)
    setProgressPct(0)
    setError(null)

    try {
      const { blob, filename } = await processVideo()

      setProgress("Uploading…")
      const file = new File([blob], filename, { type: blob.type })
      setProgress("Uploading…")
      setProgressPct(0)
      const uploadResult = await client.uploader.uploadFile(file, {
        onProgress: (uploaded, total) => {
          const pct = Math.round((uploaded / total) * 100)
          setProgress(`Uploading… ${pct}%`)
          setProgressPct(pct)
        },
      })
      if (!uploadResult.ok) throw new Error(uploadResult.error?.message ?? "Upload failed")
      const token = uploadResult.data!.token

      setProgress("Saving to Aprimo…")
      setProgressPct(95)
      if (!additionalFilesHref) throw new Error("No additionalfiles endpoint available")

      const authHeader = getAuthHeader()
      const attachRes = await fetch(additionalFilesHref, {
        method: "POST",
        headers: {
          "API-VERSION": "1",
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          id: token,
          label: `${platform} — ${selectedFormat.label}`,
          filename,
          type: "rendition",
        }),
      })
      if (!attachRes.ok) {
        const msg = await attachRes.text().catch(() => attachRes.statusText)
        throw new Error(`Failed to attach rendition: ${msg}`)
      }

      setProgress(null)
      setProgressPct(0)
      toast.success("Rendition saved", { description: `${platform} — ${selectedFormat.label} attached to the asset` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rendition creation failed"
      setError(msg)
      setProgress(null)
      setProgressPct(0)
      toast.error("Rendition failed", { description: msg })
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleCreateAndDownload() {
    setIsProcessing(true)
    setProgressPct(0)
    setError(null)

    try {
      const { blob, filename } = await processVideo()

      setProgress("Preparing download…")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setProgress(null)
      setProgressPct(0)
      toast.success("Download started", { description: filename })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Processing failed"
      setError(msg)
      setProgress(null)
      setProgressPct(0)
      toast.error("Processing failed", { description: msg })
    } finally {
      setIsProcessing(false)
    }
  }

  const MAX_PREVIEW_W = 640
  const MAX_PREVIEW_H = 500
  const fmtRatio = selectedFormat.width / selectedFormat.height
  const previewW = fmtRatio >= MAX_PREVIEW_W / MAX_PREVIEW_H
    ? MAX_PREVIEW_W
    : Math.round(MAX_PREVIEW_H * fmtRatio)
  const previewH = fmtRatio >= MAX_PREVIEW_W / MAX_PREVIEW_H
    ? Math.round(MAX_PREVIEW_W / fmtRatio)
    : MAX_PREVIEW_H

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-1 min-h-0 gap-6 p-8 overflow-hidden">

        {/* Video card */}
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
                      setVideoSize({ width: v.videoWidth, height: v.videoHeight })
                    }}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onEnded={() => setIsPlaying(false)}
                  />
                </div>

                {/* Seek bar */}
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

        {/* Controls card */}
        <Card className="w-72 shrink-0 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 overflow-y-auto p-5 space-y-6">

            {/* Platform & format */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resize for</p>
              <Select value={platform} onValueChange={(v) => { setPlatform(v); setFormatIndex(0) }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(PLATFORMS).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(formatIndex)} onValueChange={(v) => setFormatIndex(Number(v))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {formats.map((f, i) => (
                    <SelectItem key={i} value={String(i)}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground text-right">
                {selectedFormat.width}×{selectedFormat.height}
              </p>
            </div>

            <Separator />

            {/* Crop mode */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Crop mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(["fill", "fit"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCropMode(mode)}
                    className={`py-2 rounded-md text-sm font-medium capitalize border transition-colors ${
                      cropMode === mode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Zoom */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zoom</p>
                <span className="text-xs font-mono text-muted-foreground">{zoom}%</span>
              </div>
              <div className="flex items-center gap-2">
                <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
                <Slider
                  min={10}
                  max={300}
                  step={5}
                  value={[zoom]}
                  onValueChange={([v]) => setZoom(v)}
                  className="flex-1"
                />
                <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </div>

            {/* Rotation */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rotation</p>
              <div className="flex gap-2">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    onClick={() => setRotation(deg)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      rotation === deg
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Output format */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output format</p>
              <div className="grid grid-cols-3 gap-2">
                {OUTPUT_FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={`py-2 rounded-md text-sm font-medium border transition-colors ${
                      outputFormat === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
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
            <Button variant="outline" className="h-8 px-4 text-sm" disabled={isProcessing || !videoUrl} onClick={handleCreateAndDownload}>
              Create & Download
            </Button>
            <Button className="h-8 px-6 text-sm" disabled={isProcessing || !videoUrl} onClick={handleCreateRendition}>
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</> : "Create Rendition"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function VideoResizerPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <Suspense>
        <VideoResizerContent />
      </Suspense>
      <Footer />
    </div>
  )
}
