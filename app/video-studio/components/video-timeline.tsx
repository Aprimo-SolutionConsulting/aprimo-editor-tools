"use client"

import { useEffect, useRef, useState } from "react"
import { Film, Layers, Music2, Scissors, Type, Volume2, VolumeX, X } from "lucide-react"
import { toast } from "sonner"
import {
  VideoClip, TransitionClip, AudioClip, SelectedAsset,
  PIXELS_PER_SECOND, DEFAULT_CLIP_DURATION,
} from "../types"

const TRACKS = [
  { label: "Text",        icon: Type,   color: "text-orange-500", bg: "bg-orange-500/10" },
  { label: "Transitions", icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10" },
  { label: "Video",       icon: Film,   color: "text-blue-500",   bg: "bg-blue-500/10"   },
  { label: "Audio",       icon: Music2, color: "text-green-500",  bg: "bg-green-500/10"  },
] as const

interface VideoTimelineProps {
  sortedClips: VideoClip[]
  setVideoClips: React.Dispatch<React.SetStateAction<VideoClip[]>>
  transitionClips: TransitionClip[]
  setTransitionClips: React.Dispatch<React.SetStateAction<TransitionClip[]>>
  audioClips: AudioClip[]
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>
  assets: SelectedAsset[]
  durations: Record<string, number>
  playIndex: number
  setPlayIndex: React.Dispatch<React.SetStateAction<number>>
  trimClipId: string | null
  setTrimClipId: (id: string | null) => void
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  draggingTransitionType: string | null
  setDraggingTransitionType: (t: string | null) => void
  videoEndTime: number
}

export function VideoTimeline({
  sortedClips,
  setVideoClips,
  transitionClips,
  setTransitionClips,
  audioClips,
  setAudioClips,
  assets,
  durations,
  playIndex,
  setPlayIndex,
  trimClipId,
  setTrimClipId,
  draggingId,
  setDraggingId,
  draggingTransitionType,
  setDraggingTransitionType,
  videoEndTime,
}: VideoTimelineProps) {
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState(false)
  const [transitionDropTarget, setTransitionDropTarget] = useState(false)
  const [audioDropTarget, setAudioDropTarget] = useState(false)
  const [draggingClip, setDraggingClip] = useState<{ assetId: string; grabOffsetPx: number } | null>(null)
  const [draggingTransitionClip, setDraggingTransitionClip] = useState<{ id: string; grabOffsetPx: number } | null>(null)
  const [draggingAudioClip, setDraggingAudioClip] = useState<{ id: string; grabOffsetPx: number } | null>(null)
  const [resizingTransition, setResizingTransition] = useState<{ id: string; startX: number; startDuration: number } | null>(null)
  const [resizingAudioClip, setResizingAudioClip] = useState<{ id: string; edge: "left" | "right"; startX: number; startTrimIn: number; startDuration: number; startTime: number } | null>(null)

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
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp) }
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

  function snapStart(raw: number, excludeId?: string): number {
    const SNAP = 0.5
    for (const clip of sortedClips) {
      if (clip.assetId === excludeId) continue
      const end = clip.startTime + clip.duration
      if (Math.abs(raw - end) <= SNAP) return end
      if (Math.abs(raw - clip.startTime) <= SNAP) return clip.startTime
    }
    return Math.round(raw * 2) / 2
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
      if (!sortedClips.some((c) => c.assetId === draggingId)) {
        setVideoClips((prev) => [...prev, { assetId: draggingId!, startTime, duration: durations[draggingId!] ?? DEFAULT_CLIP_DURATION, trimIn: 0, trimSet: false, muted: false }])
      }
      setDraggingId(null)
    }
  }

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

  const safeDur = (c: { assetId: string; duration: number }) =>
    isFinite(c.duration) && c.duration > 0 ? c.duration : DEFAULT_CLIP_DURATION

  const totalDuration = Math.max(
    30,
    ...sortedClips.map((c) => c.startTime + safeDur(c)),
    ...transitionClips.map((c) => c.startTime + c.duration),
    ...audioClips.map((c) => c.startTime + c.duration),
  )
  const totalWidth = totalDuration * PIXELS_PER_SECOND
  const rulerStep = 5
  const marks = Array.from({ length: Math.ceil(totalDuration / rulerStep) + 1 }, (_, i) => i * rulerStep)

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
                  <span className="text-muted-foreground pl-1" style={{ fontSize: 9 }}>{t}s</span>
                </div>
              ))}
            </div>

            {/* Track lanes */}
            {TRACKS.map(({ label }) => (
              <div
                key={label}
                className={`h-12 border-b border-border last:border-0 relative transition-colors ${label === "Video" && dropTarget ? "bg-blue-500/10" : ""} ${label === "Transitions" && transitionDropTarget ? "bg-purple-500/10" : ""} ${label === "Audio" && audioDropTarget ? "bg-green-500/10" : ""}`}
                onDragEnter={label === "Audio" ? (e) => e.preventDefault() : undefined}
                onDragOver={
                  label === "Video" ? (e) => { e.preventDefault(); setDropTarget(true) }
                  : label === "Transitions" ? (e) => { e.preventDefault(); setTransitionDropTarget(true) }
                  : label === "Audio" ? (e) => { e.preventDefault(); setAudioDropTarget(true) }
                  : undefined
                }
                onDragLeave={
                  label === "Video" ? () => setDropTarget(false)
                  : label === "Transitions" ? () => setTransitionDropTarget(false)
                  : label === "Audio" ? () => setAudioDropTarget(false)
                  : undefined
                }
                onDrop={
                  label === "Video" ? handleVideoDrop
                  : label === "Transitions" ? handleTransitionDrop
                  : label === "Audio" ? (e) => onAudioLaneDrop(e, timelineScrollRef.current?.scrollLeft ?? 0)
                  : undefined
                }
              >
                {label === "Video" && sortedClips.length === 0 && (
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">Drop assets here</span>
                )}
                {label === "Transitions" && transitionClips.length === 0 && (
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">Drop transitions here</span>
                )}
                {label === "Audio" && audioClips.length === 0 && (
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground opacity-40">Drag audio assets here</span>
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
                      <Film className="h-3 w-3 shrink-0 text-blue-500" />
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
}
