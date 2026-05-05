"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check, ExternalLink, FolderOpen, X, Clapperboard, Film, Music2 } from "lucide-react"
import { toast } from "sonner"
import { SelectedAsset, TRANSITIONS, detectMediaType } from "../types"

interface StudioSidebarProps {
  assets: SelectedAsset[]
  setAssets: React.Dispatch<React.SetStateAction<SelectedAsset[]>>
  setDurations: React.Dispatch<React.SetStateAction<Record<string, number>>>
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  draggingTransitionType: string | null
  setDraggingTransitionType: (t: string | null) => void
  isConnected: boolean
  connection: { environment: string } | null
}

export function StudioSidebar({
  assets,
  setAssets,
  setDurations,
  draggingId,
  setDraggingId,
  draggingTransitionType,
  setDraggingTransitionType,
  isConnected,
  connection,
}: StudioSidebarProps) {
  const [sidebarTab, setSidebarTab] = useState<"assets" | "transitions">("assets")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const downloadedIdsRef = useRef<Set<string>>(new Set())

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

  const readyCount = assets.filter((a) => a.publicLink).length

  return (
    <div className="w-60 shrink-0 border-r border-border flex flex-col min-h-0">
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
  )
}
