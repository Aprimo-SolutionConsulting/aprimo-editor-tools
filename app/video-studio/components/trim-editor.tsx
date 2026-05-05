"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectedAsset, formatTimecode } from "../types"

interface TrimEditorProps {
  clip: { assetId: string; trimIn: number; duration: number }
  asset: SelectedAsset
  sourceDuration: number
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  onTrimChange: (trimIn: number, duration: number) => void
}

export function TrimEditor({ clip, asset, sourceDuration, cropMode, zoom, rotation, onTrimChange }: TrimEditorProps) {
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

      <div className="flex items-center gap-2">
        <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted font-mono select-none" onClick={() => stepFrame(-1)} title="Back 1 frame">‹ frame</button>
        <span className="font-mono text-sm tabular-nums w-28 text-center">{formatTimecode(currentTime)}</span>
        <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted font-mono select-none" onClick={() => stepFrame(1)} title="Forward 1 frame">frame ›</button>
      </div>

      <div className="flex items-center gap-3 w-full">
        <Button size="sm" variant="outline" onClick={setIn}>Set In</Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTimecode(clip.trimIn)}</span>
        <div className="flex-1 text-center text-xs text-muted-foreground">{formatTimecode(clip.duration)}</div>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTimecode(trimOut)}</span>
        <Button size="sm" variant="outline" onClick={setOut}>Set Out</Button>
      </div>

      <div
        ref={sliderRef}
        className="relative w-full h-7 bg-muted rounded cursor-pointer select-none"
        onClick={seekOnSlider}
      >
        <div
          className="absolute top-0 h-full bg-blue-500/25 border-x-2 border-blue-500 pointer-events-none"
          style={{ left: `${(clip.trimIn / src) * 100}%`, width: `${(clip.duration / src) * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-3 bg-blue-500 rounded-l flex items-center justify-center cursor-ew-resize z-10"
          style={{ left: `calc(${(clip.trimIn / src) * 100}% - 6px)` }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging("in"); setDragStart({ x: e.clientX, inValue: clip.trimIn, outValue: trimOut }) }}
        >
          <div className="w-0.5 h-3 bg-white/70 rounded" />
        </div>
        <div
          className="absolute top-0 bottom-0 w-3 bg-blue-500 rounded-r flex items-center justify-center cursor-ew-resize z-10"
          style={{ left: `calc(${(trimOut / src) * 100}% - 6px)` }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragging("out"); setDragStart({ x: e.clientX, inValue: clip.trimIn, outValue: trimOut }) }}
        >
          <div className="w-0.5 h-3 bg-white/70 rounded" />
        </div>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
          style={{ left: `${(currentTime / src) * 100}%` }}
        />
      </div>
    </div>
  )
}
