"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Copy, Check, ExternalLink, FolderOpen, X, Clapperboard, Film, Layers, Scissors, Volume2, VolumeX, Music2, Type } from "lucide-react"
import { toast } from "sonner"
import { VideoSettingsPanel } from "../video-resizer/components/video-settings-panel"
import { PLATFORMS, OUTPUT_FORMATS, buildVfFilter } from "../video-resizer/constants"

const TRANSITIONS = [
  "fade","fadeblack","fadewhite","fadefast","fadeslow","fadegrays","dissolve",
  "wipeleft","wiperight","wipeup","wipedown","wipetl","wipetr","wipebl","wipebr",
  "slideleft","slideright","slideup","slidedown",
  "smoothleft","smoothright","smoothup","smoothdown",
  "coverleft","coverright","coverup","coverdown",
  "revealleft","revealright","revealup","revealdown",
  "circlecrop","circleopen","circleclose","rectcrop","radial",
  "vertopen","vertclose","horzopen","horzclose",
  "diagtl","diagtr","diagbl","diagbr",
  "hlslice","hrslice","vuslice","vdslice",
  "hlwind","hrwind","vuwind","vdwind",
  "pixelize","distance","hblur","squeezeh","squeezev","zoomin",
]

type MediaType = "video" | "audio" | "unknown"

function detectMediaType(url: string): MediaType {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  if (["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "aac", "m4a", "flac", "opus"].includes(ext)) return "audio"
  return "unknown"
}

interface SelectedAsset {
  id: string
  title: string
  thumbnailUrl: string | null
  publicLink: string | null
  loading: boolean
  error: string | null
  mediaType: MediaType
}

function formatTimecode(s: number): string {
  const c = Math.max(0, s)
  const ms = Math.floor((c % 1) * 1000)
  const sec = Math.floor(c % 60)
  const min = Math.floor(c / 60)
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
}

interface TrimEditorProps {
  clip: { assetId: string; trimIn: number; duration: number }
  asset: SelectedAsset
  sourceDuration: number
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  onTrimChange: (trimIn: number, duration: number) => void
}

function TrimEditor({ clip, asset, sourceDuration, cropMode, zoom, rotation, onTrimChange }: TrimEditorProps) {
  const MODAL_MAX_W = 960
  const MODAL_MAX_H = 540
  const [videoNaturalW, setVideoNaturalW] = useState(16)
  const [videoNaturalH, setVideoNaturalH] = useState(9)
  const ratio = videoNaturalW / videoNaturalH
  const videoW = ratio >= MODAL_MAX_W / MODAL_MAX_H ? MODAL_MAX_W : Math.round(MODAL_MAX_H * ratio)
  const videoH = ratio >= MODAL_MAX_W / MODAL_MAX_H ? Math.round(MODAL_MAX_W / ratio) : MODAL_MAX_H
  const videoRef = useRef<HTMLVideoElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(clip.trimIn)
  const [dragging, setDragging] = useState<"in" | "out" | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; inValue: number; outValue: number } | null>(null)
  const onTrimChangeRef = useRef(onTrimChange)
  onTrimChangeRef.current = onTrimChange

  const trimOut = clip.trimIn + clip.duration
  const src = sourceDuration > 0 ? sourceDuration : trimOut

  useEffect(() => {
    if (!dragging || !dragStart || !sliderRef.current) return
    function onMouseMove(e: MouseEvent) {
      const rect = sliderRef.current!.getBoundingClientRect()
      const delta = (e.clientX - dragStart!.x) / rect.width * src
      if (dragging === "in") {
        const newIn = Math.max(0, Math.min(dragStart!.inValue + delta, dragStart!.outValue - 0.1))
        onTrimChangeRef.current(newIn, dragStart!.outValue - newIn)
        if (videoRef.current) videoRef.current.currentTime = newIn
      } else {
        const newOut = Math.max(dragStart!.inValue + 0.1, Math.min(dragStart!.outValue + delta, src))
        onTrimChangeRef.current(dragStart!.inValue, newOut - dragStart!.inValue)
        if (videoRef.current) videoRef.current.currentTime = newOut
      }
    }
    function onMouseUp() { setDragging(null); setDragStart(null) }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [dragging, dragStart, src])

  function setIn() {
    if (!videoRef.current) return
    const t = videoRef.current.currentTime
    if (t >= trimOut) return
    onTrimChange(t, trimOut - t)
  }

  function setOut() {
    if (!videoRef.current) return
    const t = videoRef.current.currentTime
    if (t <= clip.trimIn) return
    onTrimChange(clip.trimIn, t - clip.trimIn)
  }

  function stepFrame(dir: number) {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(src, videoRef.current.currentTime + dir / 30))
  }

  function seekOnSlider(e: React.MouseEvent<HTMLDivElement>) {
    if (!sliderRef.current || dragging) return
    const rect = sliderRef.current.getBoundingClientRect()
    const t = Math.max(0, Math.min(src, ((e.clientX - rect.left) / rect.width) * src))
    if (videoRef.current) videoRef.current.currentTime = t
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="relative overflow-hidden bg-black rounded" style={{ width: videoW, height: videoH }}>
        <video
          ref={videoRef}
          src={asset.publicLink!}
          preload="auto"
          controls
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: cropMode === "fill" ? "cover" : "contain",
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: "center",
          }}
          onLoadedMetadata={(e) => {
            setVideoNaturalW(e.currentTarget.videoWidth || 16)
            setVideoNaturalH(e.currentTarget.videoHeight || 9)
            e.currentTarget.currentTime = clip.trimIn
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
      </div>

      {/* Timecode + frame step */}
      <div className="flex items-center gap-2">
        <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted font-mono select-none" onClick={() => stepFrame(-1)} title="Back 1 frame">‹ frame</button>
        <span className="font-mono text-sm tabular-nums w-28 text-center">{formatTimecode(currentTime)}</span>
        <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted font-mono select-none" onClick={() => stepFrame(1)} title="Forward 1 frame">frame ›</button>
      </div>

      {/* In / Out */}
      <div className="flex items-center gap-3 w-full">
        <Button size="sm" variant="outline" onClick={setIn}>Set In</Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTimecode(clip.trimIn)}</span>
        <div className="flex-1 text-center text-xs text-muted-foreground">{formatTimecode(clip.duration)}</div>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTimecode(trimOut)}</span>
        <Button size="sm" variant="outline" onClick={setOut}>Set Out</Button>
      </div>

      {/* Trim range scrubber */}
      <div
        ref={sliderRef}
        className="relative w-full h-7 bg-muted rounded cursor-pointer select-none"
        onClick={seekOnSlider}
      >
        {/* Trimmed region */}
        <div
          className="absolute top-0 h-full bg-blue-500/25 border-x-2 border-blue-500 pointer-events-none"
          style={{ left: `${(clip.trimIn / src) * 100}%`, width: `${(clip.duration / src) * 100}%` }}
        />
        {/* In handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-blue-500 rounded-l flex items-center justify-center cursor-ew-resize z-10"
          style={{ left: `calc(${(clip.trimIn / src) * 100}% - 6px)` }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging("in"); setDragStart({ x: e.clientX, inValue: clip.trimIn, outValue: trimOut }) }}
        >
          <div className="w-0.5 h-3 bg-white/70 rounded" />
        </div>
        {/* Out handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-blue-500 rounded-r flex items-center justify-center cursor-ew-resize z-10"
          style={{ left: `calc(${(trimOut / src) * 100}% - 6px)` }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging("out"); setDragStart({ x: e.clientX, inValue: clip.trimIn, outValue: trimOut }) }}
        >
          <div className="w-0.5 h-3 bg-white/70 rounded" />
        </div>
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
          style={{ left: `${(currentTime / src) * 100}%` }}
        />
      </div>
    </div>
  )
}

function VideoStudioContent() {
  const { isConnected, connection } = useAprimo()
  const [assets, setAssets] = useState<SelectedAsset[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingClip, setDraggingClip] = useState<{ assetId: string; grabOffsetPx: number } | null>(null)
  const [videoClips, setVideoClips] = useState<{ assetId: string; startTime: number; duration: number; trimIn: number; trimSet: boolean; muted: boolean }[]>([])
  const [trimClipId, setTrimClipId] = useState<string | null>(null)
  const [playIndex, setPlayIndex] = useState(0)
  const [dropTarget, setDropTarget] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<"assets" | "transitions">("assets")
  const [draggingTransitionType, setDraggingTransitionType] = useState<string | null>(null)
  const [transitionClips, setTransitionClips] = useState<{ id: string; type: string; startTime: number; duration: number }[]>([])
  const [transitionDropTarget, setTransitionDropTarget] = useState(false)
  const [draggingTransitionClip, setDraggingTransitionClip] = useState<{ id: string; grabOffsetPx: number } | null>(null)
  const [resizingTransition, setResizingTransition] = useState<{ id: string; startX: number; startDuration: number } | null>(null)
  const [audioClips, setAudioClips] = useState<{ id: string; url: string; name: string; startTime: number; trimIn: number; duration: number; sourceDuration: number }[]>([])
  const [audioDropTarget, setAudioDropTarget] = useState(false)
  const [draggingAudioClip, setDraggingAudioClip] = useState<{ id: string; grabOffsetPx: number } | null>(null)
  const [resizingAudioClip, setResizingAudioClip] = useState<{ id: string; edge: "left" | "right"; startX: number; startTrimIn: number; startDuration: number; startTime: number } | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [producing, setProducing] = useState(false)
  const [produceProgress, setProduceProgress] = useState<string | null>(null)
  const [platform, setPlatform] = useState("YouTube")
  const [formatIndex, setFormatIndex] = useState(0)
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fit")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [outputFormat, setOutputFormat] = useState("MP4")
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const downloadedIdsRef = useRef<Set<string>>(new Set())
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

  const PIXELS_PER_SECOND = 60
  const DEFAULT_CLIP_DURATION = 10

  useEffect(() => {
    if (!resizingTransition) return
    function onMouseMove(e: MouseEvent) {
      const delta = (e.clientX - resizingTransition!.startX) / PIXELS_PER_SECOND
      const newDuration = Math.max(0.25, resizingTransition!.startDuration + delta)
      setTransitionClips((prev) => prev.map((tc) =>
        tc.id === resizingTransition!.id ? { ...tc, duration: newDuration } : tc
      ))
    }
    function onMouseUp() { setResizingTransition(null) }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [resizingTransition])

  useEffect(() => {
    if (!resizingAudioClip) return
    function onMouseMove(e: MouseEvent) {
      const delta = (e.clientX - resizingAudioClip!.startX) / PIXELS_PER_SECOND
      setAudioClips((prev) => prev.map((c) => {
        if (c.id !== resizingAudioClip!.id) return c
        if (resizingAudioClip!.edge === "right") {
          const newDuration = Math.max(0.5, Math.min(resizingAudioClip!.startDuration + delta, c.sourceDuration - c.trimIn))
          return { ...c, duration: newDuration }
        } else {
          const rawTrimIn = resizingAudioClip!.startTrimIn + delta
          const newTrimIn = Math.max(0, Math.min(rawTrimIn, c.sourceDuration - 0.5))
          const actualDelta = newTrimIn - resizingAudioClip!.startTrimIn
          const newDuration = Math.max(0.5, resizingAudioClip!.startDuration - actualDelta)
          const newStartTime = Math.max(0, resizingAudioClip!.startTime + actualDelta)
          return { ...c, trimIn: newTrimIn, duration: newDuration, startTime: newStartTime }
        }
      }))
    }
    function onMouseUp() { setResizingAudioClip(null) }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp) }
  }, [resizingAudioClip])

  function probeDuration(assetId: string, url: string) {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.src = url
    video.onloadedmetadata = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        setDurations((prev) => ({ ...prev, [assetId]: video.duration }))
      }
      video.src = ""
    }
  }

  function probeAudioDuration(id: string, url: string) {
    const audio = document.createElement("audio")
    audio.preload = "metadata"
    audio.src = url
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setAudioClips((prev) => prev.map((c) => c.id === id ? { ...c, duration: audio.duration, sourceDuration: audio.duration } : c))
      }
      audio.src = ""
    }
    audio.onerror = () => { audio.src = "" }
  }

  function snapAudioStart(raw: number, excludeId?: string): number {
    const SNAP = 0.5
    for (const ac of audioClips) {
      if (ac.id === excludeId) continue
      const end = ac.startTime + ac.duration
      if (Math.abs(raw - end) <= SNAP) return end
      if (Math.abs(raw - ac.startTime) <= SNAP) return ac.startTime
    }
    return Math.round(raw * 2) / 2
  }

  function onAudioLaneDrop(e: React.DragEvent<HTMLDivElement>, scrollLeft: number) {
    e.preventDefault()
    setAudioDropTarget(false)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollLeft

    if (draggingAudioClip) {
      const raw = Math.max(0, (x - draggingAudioClip.grabOffsetPx) / PIXELS_PER_SECOND)
      const newStart = snapAudioStart(raw, draggingAudioClip.id)
      setAudioClips((prev) => prev.map((c) => c.id === draggingAudioClip.id ? { ...c, startTime: newStart } : c))
      setDraggingAudioClip(null)
      return
    }

    if (draggingId) {
      const asset = assets.find((a) => a.id === draggingId)
      if (!asset?.publicLink) { setDraggingId(null); return }
      if (asset.mediaType !== "audio") {
        toast.error("Only audio assets can be added to the Audio track")
        setDraggingId(null)
        return
      }
      const startTime = snapAudioStart(Math.max(0, x / PIXELS_PER_SECOND))
      const id = crypto.randomUUID()
      setAudioClips((prev) => [...prev, { id, url: asset.publicLink!, name: asset.title, startTime, trimIn: 0, duration: DEFAULT_CLIP_DURATION, sourceDuration: DEFAULT_CLIP_DURATION }])
      probeAudioDuration(id, asset.publicLink)
      setDraggingId(null)
    }
  }

  function openSelector() {
    if (!connection) return
    const tenantUrl = `https://${connection.environment}.dam.aprimo.com`
    const options = {
      targetOrigin: window.location.origin,
      limitingSearchExpression: "latestversionofmasterfile.haspublicuri = true",
      select: "singlerendition",
    }
    const encoded = window.btoa(JSON.stringify(options))
    const url = `${tenantUrl}/dam/selectcontent#options=${encoded}`
    window.open(url, "aprimo-select", "width=1200,height=800,resizable=yes,scrollbars=yes")
  }


  useEffect(() => {
    const tenantUrl = connection ? `https://${connection.environment}.dam.aprimo.com` : null

    function handleMessage(event: MessageEvent) {
      if (tenantUrl && event.origin !== tenantUrl) return
      const data = event.data
      if (!data || data.result !== "accept") return

      const selection: Array<{ id: string; title?: string; rendition?: { id: string; publicuri: string } }> = data.selection ?? []
      if (selection.length === 0) return

      selection.forEach((r) => {
        if (downloadedIdsRef.current.has(r.id)) return
        downloadedIdsRef.current.add(r.id)

        const cdnUrl = r.rendition?.publicuri ?? null
        if (!cdnUrl) {
          toast.error(`No CDN link for "${r.title ?? r.id}"`)
          return
        }

        setAssets((prev) => {
          if (prev.some((a) => a.id === r.id)) return prev
          return [...prev, {
            id: r.id,
            title: r.title ?? r.id,
            thumbnailUrl: null,
            publicLink: cdnUrl,
            loading: false,
            error: null,
            mediaType: detectMediaType(cdnUrl),
          }]
        })

        probeDuration(r.id, cdnUrl)
      })
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [connection])

  async function copyLink(asset: SelectedAsset) {
    if (!asset.publicLink) return
    await navigator.clipboard.writeText(asset.publicLink)
    setCopiedId(asset.id)
    toast.success("Link copied to clipboard")
    setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 2000)
  }

  async function copyAllLinks() {
    const links = assets.filter((a) => a.publicLink).map((a) => a.publicLink).join("\n")
    if (!links) return
    await navigator.clipboard.writeText(links)
    toast.success("All links copied")
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  async function produceVideo() {
    if (sortedClips.length === 0) {
      toast.error("Add clips to the video track first")
      return
    }
    setProducing(true)
    setProduceProgress("Loading FFmpeg…")
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg")
      const { toBlobURL, fetchFile } = await import("@ffmpeg/util")

      const ffmpeg = new FFmpeg()
      ffmpeg.on("progress", ({ progress: p }) => {
        setProduceProgress(`Encoding… ${Math.round(p * 100)}%`)
      })
      ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message))

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      })

      for (let i = 0; i < sortedClips.length; i++) {
        const clip = sortedClips[i]
        const asset = assets.find((a) => a.id === clip.assetId)
        if (!asset?.publicLink) throw new Error(`Missing download link for clip ${i + 1}`)
        setProduceProgress(`Loading clip ${i + 1} of ${sortedClips.length}…`)
        const fileData = await fetchFile(asset.publicLink)
        await ffmpeg.writeFile(`input${i}.mp4`, fileData)
      }

      const sortedAudio = audioClips.slice().sort((a, b) => a.startTime - b.startTime)
      for (let i = 0; i < sortedAudio.length; i++) {
        setProduceProgress(`Loading audio ${i + 1} of ${sortedAudio.length}…`)
        const fileData = await fetchFile(sortedAudio[i].url)
        await ffmpeg.writeFile(`audio${i}`, fileData)
      }

      const getTransition = (i: number) => {
        const boundary = sortedClips[i].startTime + (durations[sortedClips[i].assetId] ?? sortedClips[i].duration)
        const sorted = transitionClips.slice().sort((a, b) =>
          Math.abs(a.startTime - boundary) - Math.abs(b.startTime - boundary)
        )
        const tc = sorted[0]
        return tc && Math.abs(tc.startTime - boundary) < 10
          ? { type: tc.type, duration: tc.duration }
          : { type: "fade", duration: 1 }
      }

      const inputs = [
        ...sortedClips.flatMap((_, i) => ["-i", `input${i}.mp4`]),
        ...sortedAudio.flatMap((_, i) => ["-i", `audio${i}`]),
      ]
      const audioOffset = sortedClips.length

      const { width, height } = selectedFormat
      const ext = outputFormat.toLowerCase()
      const outputFile = `output.${ext}`
      const mime = outputFormat === "WebM" ? "video/webm" : outputFormat === "MOV" ? "video/quicktime" : "video/mp4"
      const codecArgs = outputFormat === "WebM"
        ? ["-c:v", "libvpx-vp9", "-c:a", "libopus"]
        : ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast"]

      const vf = buildVfFilter(width, height, cropMode, zoom, rotation)

      if (sortedClips.length === 1) {
        const c0 = sortedClips[0]
        const trimVf = `trim=start=${c0.trimIn}:duration=${c0.duration},setpts=PTS-STARTPTS,${vf}`
        setProduceProgress("Encoding…")
        const videoAf = c0.muted
          ? `atrim=start=${c0.trimIn}:duration=${c0.duration},asetpts=PTS-STARTPTS,volume=0`
          : `atrim=start=${c0.trimIn}:duration=${c0.duration},asetpts=PTS-STARTPTS`
        if (sortedAudio.length === 0) {
          await ffmpeg.exec([...inputs, "-vf", trimVf, "-af", videoAf, ...codecArgs, outputFile])
        } else {
          const audioTrackFilters = sortedAudio.map((ac, i) =>
            `[${audioOffset + i}:a]atrim=start=${ac.trimIn}:duration=${ac.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(ac.startTime * 1000)}:all=1,aresample=44100[at${i}]`
          )
          const mixInputs = ["[va]", ...sortedAudio.map((_, i) => `[at${i}]`)].join("")
          const filterComplex = [
            `[0:a]${videoAf}[va]`,
            ...audioTrackFilters,
            `${mixInputs}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`,
          ].join(";")
          await ffmpeg.exec([
            ...inputs, "-vf", trimVf,
            "-filter_complex", filterComplex,
            "-map", "0:v", "-map", "[finala]",
            ...codecArgs, outputFile,
          ])
        }
      } else {
        // Normalize every input to common fps/timebase/resolution/sample-rate so xfade doesn't reject mismatched streams
        const normFilters: string[] = []
        for (let i = 0; i < sortedClips.length; i++) {
          const ci = sortedClips[i]
          normFilters.push(`[${i}:v]trim=start=${ci.trimIn}:duration=${ci.duration},setpts=PTS-STARTPTS,fps=fps=30,settb=AVTB,${vf},setsar=1[nv${i}]`)
          if (ci.muted) {
            normFilters.push(`aevalsrc=0:c=stereo:s=44100:d=${ci.duration}[na${i}]`)
          } else {
            normFilters.push(`[${i}:a]atrim=start=${ci.trimIn}:duration=${ci.duration},asetpts=PTS-STARTPTS,aresample=44100[na${i}]`)
          }
        }

        const vFilters: string[] = []
        const aFilters: string[] = []
        let cumDur = 0
        let cumTrans = 0

        for (let i = 0; i < sortedClips.length - 1; i++) {
          const t = getTransition(i)
          cumDur += sortedClips[i].duration
          const offset = Math.max(0, cumDur - cumTrans - t.duration)
          cumTrans += t.duration

          const isLast = i === sortedClips.length - 2
          const vIn = i === 0 ? "[nv0]" : `[v${i - 1}]`
          const aIn = i === 0 ? "[na0]" : `[a${i - 1}]`
          const vOut = isLast ? "[outv]" : `[v${i}]`
          const aOut = isLast ? "[outa]" : `[a${i}]`

          vFilters.push(`${vIn}[nv${i + 1}]xfade=transition=${t.type}:duration=${t.duration}:offset=${offset.toFixed(3)}${vOut}`)
          aFilters.push(`${aIn}[na${i + 1}]acrossfade=d=${t.duration}${aOut}`)
        }

        setProduceProgress("Encoding… 0%")
        if (sortedAudio.length === 0) {
          await ffmpeg.exec([
            ...inputs,
            "-filter_complex", [...normFilters, ...vFilters, ...aFilters].join(";"),
            "-map", "[outv]", "-map", "[outa]",
            ...codecArgs,
            outputFile,
          ])
        } else {
          const audioTrackFilters = sortedAudio.map((ac, i) =>
            `[${audioOffset + i}:a]atrim=start=${ac.trimIn}:duration=${ac.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(ac.startTime * 1000)}:all=1,aresample=44100[at${i}]`
          )
          const mixInputs = ["[outa]", ...sortedAudio.map((_, i) => `[at${i}]`)].join("")
          const mixFilter = `${mixInputs}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`
          await ffmpeg.exec([
            ...inputs,
            "-filter_complex", [...normFilters, ...vFilters, ...aFilters, ...audioTrackFilters, mixFilter].join(";"),
            "-map", "[outv]", "-map", "[finala]",
            ...codecArgs,
            outputFile,
          ])
        }
      }

      setProduceProgress("Preparing download…")
      const data = await ffmpeg.readFile(outputFile)
      const blob = new Blob([data as Uint8Array], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `produced-video.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Video produced and downloaded!")
    } catch (err) {
      toast.error(`Production failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setProducing(false)
      setProduceProgress(null)
    }
  }

  const formats = PLATFORMS[platform] ?? PLATFORMS["YouTube"]
  const selectedFormat = formats[Math.min(formatIndex, formats.length - 1)]
  const fmtRatio = selectedFormat.width / selectedFormat.height
  const containerRatio = containerSize.w / containerSize.h
  const previewW = fmtRatio >= containerRatio ? containerSize.w : Math.round(containerSize.h * fmtRatio)
  const previewH = fmtRatio >= containerRatio ? Math.round(containerSize.w / fmtRatio) : containerSize.h

  const readyCount = assets.filter((a) => a.publicLink).length
  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime)
  const videoEndTime = sortedClips.length > 0
    ? Math.max(...sortedClips.map((c) => c.startTime + c.duration))
    : 0
  const activeClip = sortedClips[playIndex] ?? null
  const activeAsset = activeClip ? assets.find((a) => a.id === activeClip.assetId) : null
  const trimClip = trimClipId ? videoClips.find((c) => c.assetId === trimClipId) ?? null : null
  const trimAsset = trimClip ? assets.find((a) => a.id === trimClip.assetId) ?? null : null

  function handleTrimChange(trimIn: number, duration: number) {
    if (!trimClipId) return
    setVideoClips((prev) => prev.map((c) =>
      c.assetId === trimClipId ? { ...c, trimIn, duration, trimSet: true } : c
    ))
  }

  const TRACKS = [
    { label: "Text",        icon: Type,   color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Transitions", icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Video",       icon: Film,   color: "text-blue-500",   bg: "bg-blue-500/10"   },
    { label: "Audio",       icon: Music2, color: "text-green-500",  bg: "bg-green-500/10"  },
  ] as const

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">

        {/* Left sidebar — asset list */}
        <div className="w-60 shrink-0 border-r border-border flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setSidebarTab("assets")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${sidebarTab === "assets" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
            >
              Assets
            </button>
            <button
              onClick={() => setSidebarTab("transitions")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${sidebarTab === "transitions" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
            >
              Transitions
            </button>
          </div>

          {sidebarTab === "assets" && (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
                <div className="flex items-center gap-1 ml-auto">
                  {readyCount > 1 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Copy all links" onClick={copyAllLinks}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                  {assets.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setAssets([])}>
                      Clear
                    </Button>
                  )}
                  <Button size="sm" className="h-6 text-xs px-2" onClick={openSelector} disabled={!isConnected}>
                    <FolderOpen className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {assets.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground p-4">
                    <Clapperboard className="h-6 w-6 opacity-40" />
                    <p className="text-xs text-center">No assets yet. Click Add to select from Aprimo.</p>
                  </div>
                )}
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={() => setDraggingId(asset.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`flex items-center gap-2 px-3 py-2 border-b border-border group cursor-grab active:cursor-grabbing ${draggingId === asset.id ? "opacity-50" : ""} ${asset.mediaType === "audio" ? "bg-green-500/10 hover:bg-green-500/20" : "bg-blue-500/10 hover:bg-blue-500/20"}`}
                  >
                    <div className="w-12 h-8 shrink-0 rounded overflow-hidden flex items-center justify-center bg-black/5">
                      {asset.thumbnailUrl && asset.mediaType !== "audio"
                        ? <img src={asset.thumbnailUrl} alt={asset.title} className="w-full h-full object-cover" />
                        : asset.mediaType === "audio"
                          ? <Music2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          : <Film className="h-4 w-4 text-blue-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight" title={asset.title}>{asset.title}</p>
                      {asset.error && <p className="text-xs text-destructive mt-0.5 truncate">{asset.error}</p>}
                      {asset.publicLink && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground" onClick={() => copyLink(asset)}>
                            {copiedId === asset.id ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground" asChild>
                            <a href={asset.publicLink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeAsset(asset.id)} className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {sidebarTab === "transitions" && (
            <div className="flex-1 overflow-auto p-2">
              <div className="grid grid-cols-2 gap-1">
                {TRANSITIONS.map((t) => (
                  <div
                    key={t}
                    draggable
                    onDragStart={() => setDraggingTransitionType(t)}
                    onDragEnd={() => setDraggingTransitionType(null)}
                    className={`text-xs px-2 py-1.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 cursor-grab active:cursor-grabbing truncate select-none ${draggingTransitionType === t ? "opacity-50" : "hover:bg-purple-500/20"}`}
                    title={t}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main preview area / Trim editor */}
        <div ref={previewContainerRef} className="flex-1 flex items-center justify-center bg-muted/30 overflow-auto">
          {activeAsset?.publicLink ? (
            <div
              className="relative overflow-hidden bg-white"
              style={{ width: previewW, height: previewH }}
            >
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
        <DialogContent className="sm:max-w-fit overflow-hidden p-4">
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

      {/* Timeline */}
      {(() => {
        const safeDur = (c: { assetId: string; duration: number }) => {
          return isFinite(c.duration) && c.duration > 0 ? c.duration : DEFAULT_CLIP_DURATION
        }
        const clipEnd = (c: { assetId: string; startTime: number; duration: number }) =>
          c.startTime + safeDur(c)
        const totalDuration = Math.max(
          30,
          ...sortedClips.map(clipEnd),
          ...transitionClips.map((c) => c.startTime + c.duration),
          ...audioClips.map((c) => c.startTime + c.duration),
        )
        const totalWidth = totalDuration * PIXELS_PER_SECOND
        const rulerStep = 5
        const marks = Array.from({ length: Math.ceil(totalDuration / rulerStep) + 1 }, (_, i) => i * rulerStep)

        function handleTransitionDrop(e: React.DragEvent<HTMLDivElement>) {
          e.preventDefault()
          setTransitionDropTarget(false)
          const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left + scrollLeft

          if (draggingTransitionClip) {
            const newStart = Math.max(0, Math.round((x - draggingTransitionClip.grabOffsetPx) / PIXELS_PER_SECOND * 2) / 2)
            setTransitionClips((prev) => prev.map((c) =>
              c.id === draggingTransitionClip.id ? { ...c, startTime: newStart } : c
            ))
            setDraggingTransitionClip(null)
          } else if (draggingTransitionType) {
            const startTime = Math.max(0, Math.round(x / PIXELS_PER_SECOND * 2) / 2)
            setTransitionClips((prev) => [...prev, {
              id: `${draggingTransitionType}-${Date.now()}`,
              type: draggingTransitionType,
              startTime,
              duration: 1,
            }])
            setDraggingTransitionType(null)
          }
        }

        function snapStart(raw: number, excludeId?: string): number {
          const SNAP = 0.5 // seconds
          for (const clip of videoClips) {
            if (clip.assetId === excludeId) continue
            const end = clip.startTime + clip.duration
            if (Math.abs(raw - end) <= SNAP) return end
            if (Math.abs(raw - clip.startTime) <= SNAP) return clip.startTime
          }
          return Math.round(raw * 2) / 2
        }

        function handleVideoDrop(e: React.DragEvent<HTMLDivElement>) {
          e.preventDefault()
          setDropTarget(false)
          const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left + scrollLeft

          if (draggingClip) {
            const raw = Math.max(0, (x - draggingClip.grabOffsetPx) / PIXELS_PER_SECOND)
            const newStart = snapStart(raw, draggingClip.assetId)
            setVideoClips((prev) => prev.map((c) =>
              c.assetId === draggingClip.assetId ? { ...c, startTime: newStart } : c
            ))
            setDraggingClip(null)
          } else if (draggingId) {
            const draggingAsset = assets.find((a) => a.id === draggingId)
            if (draggingAsset?.mediaType === "audio") {
              toast.error("Audio assets can only be added to the Audio track")
              setDraggingId(null)
              return
            }
            const raw = Math.max(0, x / PIXELS_PER_SECOND)
            const startTime = snapStart(raw)
            if (!videoClips.some((c) => c.assetId === draggingId)) {
              setVideoClips((prev) => [...prev, { assetId: draggingId!, startTime, duration: durations[draggingId!] ?? DEFAULT_CLIP_DURATION, trimIn: 0, trimSet: false, muted: false }])
            }
            setDraggingId(null)
          }
        }

        return (
          <div className="shrink-0 border-t border-border bg-background select-none">
            <div className="flex">
              {/* Fixed label column */}
              <div className="w-32 shrink-0 border-r border-border">
                <div className="h-6 border-b border-border flex items-center px-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timeline</p>
                </div>
                {TRACKS.map(({ label, icon: Icon, color, bg }) => (
                  <div key={label} className={`h-12 flex items-center gap-2 px-3 border-b border-border last:border-0 ${bg}`}>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                    <span className={`text-xs font-medium ${color}`}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Scrollable lanes */}
              <div ref={timelineScrollRef} className="flex-1 overflow-x-auto">
                <div style={{ width: totalWidth }}>
                  {/* Time ruler */}
                  <div className="h-6 border-b border-border relative">
                    {marks.map((t) => (
                      <div key={t} className="absolute top-0 flex flex-col" style={{ left: t * PIXELS_PER_SECOND }}>
                        <div className="w-px h-2 bg-border" />
                        <span className="text-muted-foreground pl-1" style={{ fontSize: 9 }}>
                          {t}s
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Track lanes */}
                  {TRACKS.map(({ label, color }) => (
                    <div
                      key={label}
                      className={`h-12 border-b border-border last:border-0 relative transition-colors ${label === "Video" && dropTarget ? "bg-blue-500/10" : ""} ${label === "Transitions" && transitionDropTarget ? "bg-purple-500/10" : ""} ${label === "Audio" && audioDropTarget ? "bg-green-500/10" : ""}`}
                      onDragEnter={label === "Audio" ? (e) => e.preventDefault() : undefined}
                      onDragOver={label === "Video"
                        ? (e) => { e.preventDefault(); setDropTarget(true) }
                        : label === "Transitions"
                          ? (e) => { e.preventDefault(); setTransitionDropTarget(true) }
                          : label === "Audio"
                            ? (e) => { e.preventDefault(); setAudioDropTarget(true) }
                            : undefined}
                      onDragLeave={label === "Video"
                        ? () => setDropTarget(false)
                        : label === "Transitions"
                          ? () => setTransitionDropTarget(false)
                          : label === "Audio"
                            ? () => setAudioDropTarget(false)
                            : undefined}
                      onDrop={label === "Video" ? handleVideoDrop : label === "Transitions" ? handleTransitionDrop : label === "Audio" ? (e) => onAudioLaneDrop(e, timelineScrollRef.current?.scrollLeft ?? 0) : undefined}
                    >
                      {label === "Video" && videoClips.length === 0 && (
                        <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">
                          Drop assets here
                        </span>
                      )}
                      {label === "Transitions" && transitionClips.length === 0 && (
                        <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">
                          Drop transitions here
                        </span>
                      )}
                      {label === "Audio" && audioClips.length === 0 && (
                        <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">
                          Drag audio assets here
                        </span>
                      )}
                      {label === "Transitions" && transitionClips.map((tc) => {
                        const isMoving = draggingTransitionClip?.id === tc.id
                        return (
                          <div
                            key={tc.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              const grabOffsetPx = e.clientX - e.currentTarget.getBoundingClientRect().left
                              setDraggingTransitionClip({ id: tc.id, grabOffsetPx })
                            }}
                            onDragEnd={() => setDraggingTransitionClip(null)}
                            className={`absolute top-1.5 bottom-1.5 rounded flex items-center gap-1 px-2 overflow-hidden cursor-grab active:cursor-grabbing border border-purple-500/40 bg-purple-500/20 transition-opacity ${isMoving ? "opacity-40" : ""}`}
                            style={{ left: tc.startTime * PIXELS_PER_SECOND, width: tc.duration * PIXELS_PER_SECOND }}
                          >
                            <Layers className="h-3 w-3 shrink-0 text-purple-500" />
                            <span className="text-xs text-purple-600 dark:text-purple-400 truncate">{tc.type}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setTransitionClips((prev) => prev.filter((c) => c.id !== tc.id)) }}
                              className="shrink-0 opacity-60 hover:opacity-100 ml-auto"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                            {/* Right-edge resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/50 rounded-r"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setResizingTransition({ id: tc.id, startX: e.clientX, startDuration: tc.duration })
                              }}
                            />
                          </div>
                        )
                      })}
                      {label === "Video" && sortedClips.map((clip, idx) => {
                        const asset = assets.find((a) => a.id === clip.assetId)
                        const isMoving = draggingClip?.assetId === clip.assetId
                        const isActive = idx === playIndex
                        const isTrimming = trimClipId === clip.assetId
                        return (
                          <div
                            key={clip.assetId}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              const grabOffsetPx = e.clientX - e.currentTarget.getBoundingClientRect().left
                              setDraggingClip({ assetId: clip.assetId, grabOffsetPx })
                            }}
                            onDragEnd={() => setDraggingClip(null)}
                            onClick={() => setPlayIndex(idx)}
                            className={`absolute top-1.5 bottom-1.5 rounded flex items-center gap-1 px-2 overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${isMoving ? "opacity-40" : ""} ${isTrimming ? "bg-amber-500/40 border-2 border-amber-500" : isActive ? "bg-blue-500/40 border-2 border-blue-500" : "bg-blue-500/20 border border-blue-500/40"}`}
                            style={{ left: clip.startTime * PIXELS_PER_SECOND, width: safeDur(clip) * PIXELS_PER_SECOND }}
                          >
                            <Film className={`h-3 w-3 shrink-0 ${color}`} />
                            <span className="text-xs text-blue-600 dark:text-blue-400 truncate">{asset?.title ?? clip.assetId}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setTrimClipId(isTrimming ? null : clip.assetId); setPlayIndex(idx) }}
                              className={`shrink-0 ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${isTrimming ? "bg-amber-500 text-white" : "bg-blue-200 hover:bg-blue-300 text-blue-800"}`}
                              title="Edit trim"
                            >
                              <Scissors className="h-3 w-3" />
                              <span>Trim</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setVideoClips((prev) => prev.map((c) => c.assetId === clip.assetId ? { ...c, muted: !c.muted } : c)) }}
                              className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${clip.muted ? "bg-red-200 hover:bg-red-300 text-red-800" : "bg-blue-200 hover:bg-blue-300 text-blue-800"}`}
                              title={clip.muted ? "Unmute audio" : "Mute audio"}
                            >
                              {clip.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setVideoClips((prev) => prev.filter((c) => c.assetId !== clip.assetId)); if (isTrimming) setTrimClipId(null) }}
                              className="shrink-0 opacity-60 hover:opacity-100"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )
                      })}
                      {label === "Audio" && audioClips.map((ac) => {
                        const isMoving = draggingAudioClip?.id === ac.id
                        return (
                          <div
                            key={ac.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              const grabOffsetPx = e.clientX - e.currentTarget.getBoundingClientRect().left
                              setDraggingAudioClip({ id: ac.id, grabOffsetPx })
                            }}
                            onDragEnd={() => setDraggingAudioClip(null)}
                            className={`absolute top-1.5 bottom-1.5 rounded flex items-center gap-1 px-2 overflow-hidden cursor-grab active:cursor-grabbing border border-green-500/40 bg-green-500/20 transition-opacity ${isMoving ? "opacity-40" : ""}`}
                            style={{ left: ac.startTime * PIXELS_PER_SECOND, width: ac.duration * PIXELS_PER_SECOND }}
                          onMouseDown={(e) => { if (resizingAudioClip) e.preventDefault() }}
                          >
                            {/* Left crop handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-green-500/50 rounded-l z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setResizingAudioClip({ id: ac.id, edge: "left", startX: e.clientX, startTrimIn: ac.trimIn, startDuration: ac.duration, startTime: ac.startTime })
                              }}
                            />
                            <Music2 className="h-3 w-3 shrink-0 text-green-600 ml-1" />
                            <span className="text-xs text-green-700 dark:text-green-400 truncate">{ac.name}</span>
                            {videoEndTime > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const available = videoEndTime - ac.startTime
                                  if (available <= 0) return
                                  const newDuration = Math.min(ac.duration, available, ac.sourceDuration - ac.trimIn)
                                  setAudioClips((prev) => prev.map((c) => c.id === ac.id ? { ...c, duration: Math.max(0.1, newDuration) } : c))
                                }}
                                className="shrink-0 ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors bg-green-200 hover:bg-green-300 text-green-800"
                                title="Crop to video length"
                              >
                                <Scissors className="h-3 w-3" />
                                <span>Fit</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setAudioClips((prev) => prev.filter((c) => c.id !== ac.id)) }}
                              className="shrink-0 opacity-60 hover:opacity-100"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                            {/* Right crop handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-green-500/50 rounded-r z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setResizingAudioClip({ id: ac.id, edge: "right", startX: e.clientX, startTrimIn: ac.trimIn, startDuration: ac.duration, startTime: ac.startTime })
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
