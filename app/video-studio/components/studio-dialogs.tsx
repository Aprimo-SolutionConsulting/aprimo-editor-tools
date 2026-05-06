"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TrimEditor } from "./trim-editor"
import { VideoClip, SelectedAsset } from "../types"

interface StudioDialogsProps {
  loadDialogOpen: boolean
  setLoadDialogOpen: (open: boolean) => void
  loadInput: string
  setLoadInput: (v: string) => void
  loadError: string | null
  setLoadError: (v: string | null) => void
  onLoad: (json: string) => void

  stateJson: string | null
  setStateJson: (v: string | null) => void

  saveDialogOpen: boolean
  setSaveDialogOpen: (open: boolean) => void
  projectNameInput: string
  setProjectNameInput: (v: string) => void
  onSave: (name: string) => void

  trimClipId: string | null
  setTrimClipId: (id: string | null) => void
  trimClip: VideoClip | null
  trimAsset: SelectedAsset | null
  durations: Record<string, number>
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  onTrimChange: (trimIn: number, duration: number) => void
}

export function StudioDialogs({
  loadDialogOpen, setLoadDialogOpen, loadInput, setLoadInput, loadError, setLoadError, onLoad,
  stateJson, setStateJson,
  saveDialogOpen, setSaveDialogOpen, projectNameInput, setProjectNameInput, onSave,
  trimClipId, setTrimClipId, trimClip, trimAsset, durations, cropMode, zoom, rotation, onTrimChange,
}: StudioDialogsProps) {
  return (
    <>
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
                onLoad(loadInput)
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

      <Dialog open={!!stateJson} onOpenChange={(open) => { if (!open) setStateJson(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>State</DialogTitle>
          </DialogHeader>
          <pre className="flex-1 overflow-auto text-xs bg-muted rounded p-3 font-mono whitespace-pre">{stateJson}</pre>
        </DialogContent>
      </Dialog>

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
                onSave(projectNameInput.trim())
                setProjectNameInput("")
              }
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!projectNameInput.trim()} onClick={() => {
              setSaveDialogOpen(false)
              onSave(projectNameInput.trim())
              setProjectNameInput("")
            }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
              onTrimChange={onTrimChange}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
