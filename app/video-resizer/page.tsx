"use client"

import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Expander } from "aprimo-js"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Play, Pause, Volume2, VolumeX, RotateCcw } from "lucide-react"
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
  const [renditionSuccess, setRenditionSuccess] = useState(false)

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
      setProgress(`Processing… ${Math.round(p * 100)}%`)
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
    setRenditionSuccess(false)
    setError(null)

    try {
      const { blob, filename } = await processVideo()

      setProgress("Uploading…")
      const file = new File([blob], filename, { type: blob.type })
      const uploadResult = await client.uploader.uploadFile(file, {
        onProgress: (uploaded, total) => {
          setProgress(`Uploading… ${Math.round((uploaded / total) * 100)}%`)
        },
      })
      if (!uploadResult.ok) throw new Error(uploadResult.error?.message ?? "Upload failed")
      const token = uploadResult.data!.token

      setProgress("Saving to Aprimo…")
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
      setRenditionSuccess(true)
      setTimeout(() => setRenditionSuccess(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rendition creation failed")
      setProgress(null)
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleCreateAndDownload() {
    setIsProcessing(true)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed")
      setProgress(null)
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
    <div className="flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
      <div className="flex flex-1 overflow-hidden">

        {/* Video area */}
        <div className="flex-1 bg-muted/30 flex flex-col items-center justify-center gap-4">
          {loading && <p className="text-sm text-muted-foreground">{loadingMessage}</p>}
          {error && <p className="text-sm text-destructive px-8 text-center">{error}</p>}
          {!recordId && <p className="text-sm text-muted-foreground">No record ID provided.</p>}

          {videoUrl && (
            <>
              <div
                className="relative overflow-hidden bg-black rounded shadow-lg"
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

              {/* Playback controls */}
              <div className="flex items-center gap-4 text-foreground">
                <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <button onClick={togglePlay} className="text-foreground hover:text-foreground/80 transition-colors">
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <span className="text-sm text-muted-foreground font-mono tabular-nums">
                  {formatTime(currentTime)} / <span className="font-bold text-foreground">{formatTime(duration)}</span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 bg-background border-l border-border flex flex-col gap-8 p-5 overflow-y-auto shrink-0">

          {/* Resize for */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center tracking-wide uppercase">Resize for</p>
            <Select value={platform} onValueChange={(v) => { setPlatform(v); setFormatIndex(0) }}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PLATFORMS).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(formatIndex)} onValueChange={(v) => setFormatIndex(Number(v))}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f, i) => (
                  <SelectItem key={i} value={String(i)}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Crop options */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center tracking-wide uppercase">Crop options</p>
            <div className="grid grid-cols-2 gap-2">
              {(["fill", "fit"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCropMode(mode)}
                  className={`py-2 rounded text-sm font-medium capitalize border transition-colors ${
                    cropMode === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(10, z - 10))}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="flex-1 text-center text-sm tabular-nums">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(300, z + 10))}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <span className="w-px h-4 bg-border mx-1" />
              <span className="text-sm tabular-nums w-8 text-center">{rotation}°</span>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 h-12 bg-background border-t border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          {videoSize && (
            <span>
              Video size, px —{" "}
              <span className="text-foreground">{videoSize.width}×{videoSize.height}</span>
            </span>
          )}
          <span className="flex items-center gap-2">
            Format —
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="bg-transparent text-foreground border-none outline-none text-sm cursor-pointer"
            >
              {OUTPUT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </span>
          {progress && <span className="text-foreground font-medium">{progress}</span>}
          {renditionSuccess && <span className="text-green-600 font-medium">Rendition saved to Aprimo</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8 px-4 text-sm"
            disabled={isProcessing || !videoUrl}
            onClick={handleCreateAndDownload}
          >
            {isProcessing ? "Processing…" : "Create & Download"}
          </Button>
          <Button
            className="h-8 px-6 text-sm"
            disabled={isProcessing || !videoUrl}
            onClick={handleCreateRendition}
          >
            {isProcessing ? "Processing…" : "Create Rendition"}
          </Button>
        </div>
      </div>
    </div>
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
