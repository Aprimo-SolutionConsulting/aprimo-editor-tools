"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ZoomIn, ZoomOut } from "lucide-react"
import { PLATFORMS, OUTPUT_FORMATS } from "../constants"

interface Format {
  label: string
  width: number
  height: number
}

interface VideoSettingsPanelProps {
  platform: string
  formatIndex: number
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  outputFormat: string
  formats: Format[]
  selectedFormat: Format
  onPlatformChange: (v: string) => void
  onFormatIndexChange: (v: number) => void
  onCropModeChange: (v: "fill" | "fit") => void
  onZoomChange: (v: number) => void
  onRotationChange: (v: number) => void
  onOutputFormatChange: (v: string) => void
}

export function VideoSettingsPanel({
  platform,
  formatIndex,
  cropMode,
  zoom,
  rotation,
  outputFormat,
  formats,
  selectedFormat,
  onPlatformChange,
  onFormatIndexChange,
  onCropModeChange,
  onZoomChange,
  onRotationChange,
  onOutputFormatChange,
}: VideoSettingsPanelProps) {
  return (
    <Card className="w-72 shrink-0 flex flex-col overflow-hidden h-full">
      <CardHeader className="p-3 shrink-0">
        <CardTitle className="text-sm">Settings</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 overflow-y-auto p-3 space-y-3">

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output size</p>
          <div className="flex gap-2">
            <Select value={platform} onValueChange={(v) => onPlatformChange(v)}>
              <SelectTrigger className="h-8 text-sm w-auto shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(PLATFORMS).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(formatIndex)} onValueChange={(v) => onFormatIndexChange(Number(v))}>
              <SelectTrigger className="h-8 text-sm flex-1 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {formats.map((f, i) => (
                  <SelectItem key={i} value={String(i)}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {selectedFormat.width}×{selectedFormat.height}
          </p>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Crop mode</p>
          <div className="grid grid-cols-2 gap-2">
            {(["fill", "fit"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onCropModeChange(mode)}
                className={`py-1.5 rounded-md text-sm font-medium capitalize border transition-colors ${
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

        <div className="space-y-2">
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
              onValueChange={([v]) => onZoomChange(v)}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rotation</p>
          <div className="flex gap-2">
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                onClick={() => onRotationChange(deg)}
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

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output format</p>
          <div className="grid grid-cols-3 gap-2">
            {OUTPUT_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => onOutputFormatChange(f)}
                className={`py-1.5 rounded-md text-sm font-medium border transition-colors ${
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
  )
}
