"use client"

import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { Expander } from "aprimo-js"
import { Button } from "@/components/ui/button"
import { Loader2, Copy, Check, ExternalLink, FolderOpen, X, Clapperboard, Film, Layers } from "lucide-react"
import { toast } from "sonner"

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

interface SelectedAsset {
  id: string
  title: string
  thumbnailUrl: string | null
  publicLink: string | null
  loading: boolean
  error: string | null
}

function VideoStudioContent() {
  const { client, isConnected, connection } = useAprimo()
  const [assets, setAssets] = useState<SelectedAsset[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingClip, setDraggingClip] = useState<{ assetId: string; grabOffsetPx: number } | null>(null)
  const [videoClips, setVideoClips] = useState<{ assetId: string; startTime: number; duration: number }[]>([])
  const [playIndex, setPlayIndex] = useState(0)
  const [dropTarget, setDropTarget] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<"assets" | "transitions">("assets")
  const [draggingTransitionType, setDraggingTransitionType] = useState<string | null>(null)
  const [transitionClips, setTransitionClips] = useState<{ id: string; type: string; startTime: number; duration: number }[]>([])
  const [transitionDropTarget, setTransitionDropTarget] = useState(false)
  const [draggingTransitionClip, setDraggingTransitionClip] = useState<{ id: string; grabOffsetPx: number } | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [producing, setProducing] = useState(false)
  const [produceProgress, setProduceProgress] = useState<string | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const videoCacheRef = useRef<Record<string, Uint8Array>>({})
  const downloadedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => { setPlayIndex(0) }, [videoClips.length])

  useEffect(() => {
    setVideoClips((prev) => {
      const next = prev.map((c) =>
        durations[c.assetId] !== undefined ? { ...c, duration: durations[c.assetId] } : c
      )
      return next.some((c, i) => c.duration !== prev[i].duration) ? next : prev
    })
  }, [durations])

  const PIXELS_PER_SECOND = 60
  const DEFAULT_CLIP_DURATION = 10

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

  function openSelector() {
    if (!connection) return
    const tenantUrl = `https://${connection.environment}.dam.aprimo.com`
    const options = {
      targetOrigin: window.location.origin,
      select: "multiple",
    }
    const encoded = window.btoa(JSON.stringify(options))
    const url = `${tenantUrl}/dam/selectcontent#options=${encoded}`
    window.open(url, "aprimo-select", "width=1200,height=800,resizable=yes,scrollbars=yes")
  }

  const downloadMasterFile = useCallback(async (recordId: string) => {
    if (!client) return
    try {
      const { fetchFile } = await import("@ffmpeg/util")

      const expander = Expander.create()
      ;(expander.for("record") as any).expand("masterfilelatestversion")
      ;(expander.for("fileversion") as any).expand("thumbnail")

      const [recordRes, orderRes] = await Promise.all([
        client.search.records({ searchExpression: { expression: `id='${recordId}'` } }, expander),
        client.orders.create({
          type: "download",
          targets: [{ recordId, targetTypes: ["Document"], assetType: "LatestVersionOfMasterFile" } as never],
        }),
      ])

      if (recordRes.ok) {
        const record = recordRes.data?.items?.[0] as any
        const title: string = record?.title ?? record?.id ?? recordId
        const thumbnailUrl: string | null =
          record?._embedded?.masterfilelatestversion?._embedded?.thumbnail?.uri ?? null
        setAssets((prev) => prev.map((a) => a.id === recordId ? { ...a, title, thumbnailUrl } : a))
      }

      if (!orderRes.ok || !orderRes.data) {
        throw new Error(orderRes.error?.message ?? "Failed to create download order")
      }

      const orderId = orderRes.data.id

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const pollRes = await client.orders.getById(orderId)
        const order = pollRes.data
        if (!order) continue
        if (order.status === "Failed") throw new Error("Download order failed")

        if (order.status === "Completed" || order.status === "Success") {
          const delivered = (order as unknown as { deliveredFiles?: string[] }).deliveredFiles
          const fileUrl = Array.isArray(delivered) && delivered.length > 0
            ? delivered[0]
            : await (async () => {
                const dlRes = await client.downloadLinks.getById(orderId)
                return (dlRes.data as unknown as { deliveredFiles?: string[] })?.deliveredFiles?.[0] ?? null
              })()

          if (!fileUrl) continue

          setAssets((prev) => prev.map((a) =>
            a.id === recordId ? { ...a, publicLink: fileUrl, loading: false } : a
          ))
          probeDuration(recordId, fileUrl)

          // Fetch and cache master file bytes while the URL is fresh
          const data = await fetchFile(fileUrl)
          videoCacheRef.current[recordId] = data
          console.log(`[video-studio] cached ${recordId}: ${data.byteLength} bytes`)
          return
        }
      }

      throw new Error("Timed out waiting for download order")
    } catch (err) {
      console.error(`[video-studio] downloadMasterFile failed for ${recordId}:`, err)
      setAssets((prev) =>
        prev.map((a) => a.id === recordId
          ? { ...a, loading: false, error: err instanceof Error ? err.message : "Download failed" }
          : a
        )
      )
    }
  }, [client])

  useEffect(() => {
    const tenantUrl = connection ? `https://${connection.environment}.dam.aprimo.com` : null

    function handleMessage(event: MessageEvent) {
      if (tenantUrl && event.origin !== tenantUrl) return
      const data = event.data
      if (!data || data.result !== "accept") return

      const selection: Array<{ id: string; title?: string; publicUri?: string; uri?: string }> = data.selection ?? []
      if (selection.length === 0) return

      console.log("[video-studio] selection payload:", JSON.stringify(data.selection, null, 2))

      setAssets((prev) => {
        const existingIds = new Set(prev.map((a) => a.id))
        const newEntries: SelectedAsset[] = selection
          .filter((r) => !existingIds.has(r.id))
          .map((r) => ({
            id: r.id,
            title: r.title ?? r.id,
            thumbnailUrl: null,
            publicLink: r.publicUri ?? r.uri ?? null,
            loading: true,
            error: null,
          }))
        return [...prev, ...newEntries]
      })

      selection.forEach((r) => {
        if (!downloadedIdsRef.current.has(r.id)) {
          downloadedIdsRef.current.add(r.id)
          downloadMasterFile(r.id)
        }
      })
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [downloadMasterFile, connection])

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
      const { toBlobURL } = await import("@ffmpeg/util")

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
        const fileData = videoCacheRef.current[clip.assetId]
        if (!fileData || fileData.byteLength === 0) throw new Error(`Clip ${i + 1} is not ready — wait for the download to finish`)
        console.log(`[video-studio] writing clip ${i + 1}: ${fileData.byteLength} bytes`)
        await ffmpeg.writeFile(`input${i}.mp4`, fileData)
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

      const inputs = sortedClips.flatMap((_, i) => ["-i", `input${i}.mp4`])

      if (sortedClips.length === 1) {
        setProduceProgress("Encoding…")
        await ffmpeg.exec([...inputs, "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "output.mp4"])
      } else {
        const vFilters: string[] = []
        const aFilters: string[] = []
        let cumDur = 0
        let cumTrans = 0

        for (let i = 0; i < sortedClips.length - 1; i++) {
          const t = getTransition(i)
          cumDur += durations[sortedClips[i].assetId] ?? sortedClips[i].duration
          const offset = Math.max(0, cumDur - cumTrans - t.duration)
          cumTrans += t.duration

          const isLast = i === sortedClips.length - 2
          const vIn = i === 0 ? `[${i}:v]` : `[v${i - 1}]`
          const aIn = i === 0 ? `[${i}:a]` : `[a${i - 1}]`
          const vOut = isLast ? "[outv]" : `[v${i}]`
          const aOut = isLast ? "[outa]" : `[a${i}]`

          vFilters.push(`${vIn}[${i + 1}:v]xfade=transition=${t.type}:duration=${t.duration}:offset=${offset.toFixed(3)}${vOut}`)
          aFilters.push(`${aIn}[${i + 1}:a]acrossfade=d=${t.duration}${aOut}`)
        }

        setProduceProgress("Encoding… 0%")
        await ffmpeg.exec([
          ...inputs,
          "-filter_complex", [...vFilters, ...aFilters].join(";"),
          "-map", "[outv]", "-map", "[outa]?",
          "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast",
          "output.mp4",
        ])
      }

      setProduceProgress("Preparing download…")
      const data = await ffmpeg.readFile("output.mp4")
      const blob = new Blob([data as Uint8Array], { type: "video/mp4" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "produced-video.mp4"
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

  const readyCount = assets.filter((a) => a.publicLink).length
  const sortedClips = [...videoClips].sort((a, b) => a.startTime - b.startTime)
  const activeClip = sortedClips[playIndex] ?? null
  const activeAsset = activeClip ? assets.find((a) => a.id === activeClip.assetId) : null

  const TRACKS = [
    { label: "Transitions", icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Video",       icon: Film,   color: "text-blue-500",   bg: "bg-blue-500/10"   },
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
                    className={`flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-muted/40 group cursor-grab active:cursor-grabbing ${draggingId === asset.id ? "opacity-50" : ""}`}
                  >
                    <div className="w-12 h-8 shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
                      {asset.thumbnailUrl
                        ? <img src={asset.thumbnailUrl} alt={asset.title} className="w-full h-full object-cover" />
                        : <Clapperboard className="h-4 w-4 text-muted-foreground opacity-40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight" title={asset.title}>{asset.title}</p>
                      {asset.loading && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          <span>Downloading…</span>
                        </div>
                      )}
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

        {/* Main preview area */}
        <div className="flex-1 flex items-center justify-center bg-black">
          {activeAsset?.publicLink ? (
            <video
              key={activeClip!.assetId}
              src={activeAsset.publicLink}
              controls
              autoPlay={playIndex > 0}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration
                if (activeClip && isFinite(d) && d > 0) {
                  setDurations((prev) => ({ ...prev, [activeClip.assetId]: d }))
                }
              }}
              onEnded={() => setPlayIndex((i) => (i + 1) % sortedClips.length)}
              className="max-w-full max-h-full"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Clapperboard className="h-10 w-10 opacity-20" />
              <p className="text-sm opacity-40">Drop a clip onto the Video track to preview</p>
            </div>
          )}
        </div>

      </div>

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
          const d = durations[c.assetId] ?? c.duration
          return isFinite(d) && d > 0 ? d : DEFAULT_CLIP_DURATION
        }
        const clipEnd = (c: { assetId: string; startTime: number; duration: number }) =>
          c.startTime + safeDur(c)
        const totalDuration = Math.max(
          30,
          ...sortedClips.map(clipEnd),
          ...transitionClips.map((c) => c.startTime + c.duration),
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

        function handleVideoDrop(e: React.DragEvent<HTMLDivElement>) {
          e.preventDefault()
          setDropTarget(false)
          const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left + scrollLeft

          if (draggingClip) {
            const newStart = Math.max(0, Math.round((x - draggingClip.grabOffsetPx) / PIXELS_PER_SECOND * 2) / 2)
            setVideoClips((prev) => prev.map((c) =>
              c.assetId === draggingClip.assetId ? { ...c, startTime: newStart } : c
            ))
            setDraggingClip(null)
          } else if (draggingId) {
            const startTime = Math.max(0, Math.round(x / PIXELS_PER_SECOND * 2) / 2)
            if (!videoClips.some((c) => c.assetId === draggingId)) {
              setVideoClips((prev) => [...prev, { assetId: draggingId!, startTime, duration: durations[draggingId!] ?? DEFAULT_CLIP_DURATION }])
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
                      className={`h-12 border-b border-border last:border-0 relative transition-colors ${label === "Video" && dropTarget ? "bg-blue-500/10" : ""} ${label === "Transitions" && transitionDropTarget ? "bg-purple-500/10" : ""}`}
                      onDragOver={label === "Video"
                        ? (e) => { e.preventDefault(); setDropTarget(true) }
                        : label === "Transitions"
                          ? (e) => { e.preventDefault(); setTransitionDropTarget(true) }
                          : undefined}
                      onDragLeave={label === "Video"
                        ? () => setDropTarget(false)
                        : label === "Transitions"
                          ? () => setTransitionDropTarget(false)
                          : undefined}
                      onDrop={label === "Video" ? handleVideoDrop : label === "Transitions" ? handleTransitionDrop : undefined}
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
                          </div>
                        )
                      })}
                      {label === "Video" && sortedClips.map((clip, idx) => {
                        const asset = assets.find((a) => a.id === clip.assetId)
                        const isMoving = draggingClip?.assetId === clip.assetId
                        const isActive = idx === playIndex
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
                            className={`absolute top-1.5 bottom-1.5 rounded flex items-center gap-1 px-2 overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${isMoving ? "opacity-40" : ""} ${isActive ? "bg-blue-500/40 border-2 border-blue-500" : "bg-blue-500/20 border border-blue-500/40"}`}
                            style={{ left: clip.startTime * PIXELS_PER_SECOND, width: safeDur(clip) * PIXELS_PER_SECOND }}
                          >
                            <Film className={`h-3 w-3 shrink-0 ${color}`} />
                            <span className="text-xs text-blue-600 dark:text-blue-400 truncate">{asset?.title ?? clip.assetId}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setVideoClips((prev) => prev.filter((c) => c.assetId !== clip.assetId)) }}
                              className="shrink-0 opacity-60 hover:opacity-100 ml-auto"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
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
