"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Expander } from "aprimo-js"
import { buildVfFilter } from "../../video-resizer/constants"
import { VideoClip, AudioClip, TransitionClip, TextClip, SelectedAsset, TEXT_FONTS } from "../types"
import { useAprimo } from "@/context/aprimo-context"

interface UseProduceVideoParams {
  sortedClips: VideoClip[]
  audioClips: AudioClip[]
  assets: SelectedAsset[]
  durations: Record<string, number>
  transitionClips: TransitionClip[]
  textClips: TextClip[]
  platform: string
  selectedFormat: { label?: string; width: number; height: number }
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  outputFormat: string
  previewWidth: 360 | 720 | 1280
  initialRecordId?: string | null
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getVsSetting(envValue: string | undefined, lsKey: string): string {
  return envValue || (typeof window !== "undefined" ? localStorage.getItem(lsKey) ?? "" : "")
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\n/g, "\\n")
}

function toFfmpegColor(color: string | undefined): string {
  if (!color || color === "transparent") return "white"
  return color.startsWith("#") ? `0x${color.slice(1)}` : color
}

function buildDrawtextChain(
  textClips: TextClip[],
  assets: SelectedAsset[],
  fontPathMap: Map<string, string>,
): string {
  const filters: string[] = []

  for (const tc of textClips) {
    const asset = assets.find((a) => a.id === tc.assetId)
    if (!asset || asset.mediaType !== "text") continue

    const headingText = escapeDrawtext(asset.heading ?? "")
    const bodyText = escapeDrawtext(asset.body ?? "")
    if (!headingText && !bodyText) continue

    const textColor = toFfmpegColor(asset.textColor)
    const opacity = (asset.textOpacity ?? 100) / 100

    const fontValue = asset.textFont ?? TEXT_FONTS[0].value
    const fontPath = fontPathMap.get(fontValue) ?? [...fontPathMap.values()][0] ?? "/tmp/font.ttf"

    const pos = asset.textPosition ?? "middle-center"
    const [v, h] = pos.split("-") as ["top" | "middle" | "bottom", "left" | "center" | "right"]

    const pad = 20
    const headingSize = asset.headingSize ?? 48
    const bodySize = asset.textSize ?? 32
    const headingLineH = headingText ? Math.round(headingSize * 1.3) : 0
    const bodyLineH = bodyText ? Math.round(bodySize * 1.3) : 0
    const gap = headingText && bodyText ? 8 : 0
    const totalH = headingLineH + bodyLineH + gap

    const xFor = () => h === "left" ? `${pad}` : h === "right" ? `w-tw-${pad}` : `(w-tw)/2`
    const blockTop = v === "top" ? `${pad}` : v === "bottom" ? `h-${totalH}-${pad}` : `(h-${totalH})/2`
    const bodyY = v === "top"
      ? `${pad + headingLineH + gap}`
      : v === "bottom"
        ? `h-${totalH}-${pad}+${headingLineH + gap}`
        : `(h-${totalH})/2+${headingLineH + gap}`

    const start = tc.startTime
    const end = tc.startTime + tc.duration
    const fade = Math.min(0.3, tc.duration / 4)
    // Encode visibility entirely in alpha — avoids enable edge-cases at frame boundaries.
    // Returns 0 outside [start, end), fades in/out at the edges.
    const alpha = `max(0,${opacity}*if(lt(t,${start}),0,if(gte(t,${end}),0,if(lt(t-${start},${fade}),(t-${start})/${fade},if(gt(t,${end}-${fade}),(${end}-t)/${fade},1)))))`

    if (headingText) {
      filters.push(
        `drawtext=fontfile=${fontPath}:text='${headingText}':fontcolor=${textColor}:fontsize=${headingSize}:x=${xFor()}:y=${blockTop}:alpha='${alpha}'`
      )
    }
    if (bodyText) {
      filters.push(
        `drawtext=fontfile=${fontPath}:text='${bodyText}':fontcolor=${textColor}:fontsize=${bodySize}:x=${xFor()}:y=${bodyY}:alpha='${alpha}'`
      )
    }
  }

  return filters.join(",")
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useProduceVideo({
  sortedClips,
  audioClips,
  assets,
  durations,
  transitionClips,
  textClips,
  platform,
  selectedFormat,
  cropMode,
  zoom,
  rotation,
  outputFormat,
  previewWidth,
  initialRecordId,
}: UseProduceVideoParams) {
  const { client, connection } = useAprimo()
  const [producing, setProducing] = useState(false)
  const [produceProgress, setProduceProgress] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewProgress, setPreviewProgress] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(initialRecordId ?? null)
  const [savedFileName, setSavedFileName] = useState<string | null>(null)
  const [savedRecordUrl, setSavedRecordUrl] = useState<string | null>(null)

  useEffect(() => {
    if (initialRecordId && connection && !savedRecordUrl) {
      setSavedRecordUrl(`https://${connection.environment}.dam.aprimo.com/dam/contentitems/${initialRecordId.replace(/-/g, "")}`)
    }
  }, [initialRecordId, connection])

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  // Shared FFmpeg pipeline — loads assets, encodes, returns a Blob
  async function runPipeline({
    format,
    vfOverride,
    normFps,
    codecArgs,
    outputFile,
    mime,
    setProgress,
  }: {
    format: { width: number; height: number }
    vfOverride?: string
    normFps?: number
    codecArgs: string[]
    outputFile: string
    mime: string
    setProgress: (s: string) => void
  }): Promise<Blob> {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg")
    const { toBlobURL, fetchFile } = await import("@ffmpeg/util")

    setProgress("Loading FFmpeg…")
    const ffmpeg = new FFmpeg()

    let expectedDuration = 0
    ffmpeg.on("log", ({ message }: { message: string }) => {
      console.log("[ffmpeg]", message)
      if (expectedDuration <= 0) return
      const m = message.match(/time=(-?\d+):(\d+):(\d+\.?\d*)/)
      if (!m) return
      const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
      if (secs <= 0) return
      setProgress(`Encoding… ${Math.min(99, Math.round((secs / expectedDuration) * 100))}%`)
    })

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    })

    try {

    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i]
      const asset = assets.find((a) => a.id === clip.assetId)
      if (!asset?.publicLink) throw new Error(`Missing download link for clip ${i + 1}`)
      setProgress(`Loading clip ${i + 1} of ${sortedClips.length}…`)
      const fileData = await fetchFile(asset.publicLink)
      await ffmpeg.writeFile(`input${i}.mp4`, fileData)
    }

    const sortedAudio = audioClips.slice().sort((a, b) => a.startTime - b.startTime)
    for (let i = 0; i < sortedAudio.length; i++) {
      setProgress(`Loading audio ${i + 1} of ${sortedAudio.length}…`)
      const fileData = await fetchFile(sortedAudio[i].url)
      await ffmpeg.writeFile(`audio${i}`, fileData)
    }

    const activeTextClips = textClips.filter((tc) => assets.find((a) => a.id === tc.assetId)?.mediaType === "text")
    const fontPathMap = new Map<string, string>()
    if (activeTextClips.length > 0) {
      const uniqueFonts = [...new Set(
        activeTextClips.map((tc) => assets.find((x) => x.id === tc.assetId)?.textFont ?? TEXT_FONTS[0].value)
      )]
      for (const fontValue of uniqueFonts) {
        const fontDef = TEXT_FONTS.find((f) => f.value === fontValue) ?? TEXT_FONTS[0]
        const fontPath = `/tmp/font_${fontValue.replace(/\s+/g, "_")}.ttf`
        setProgress(`Loading font ${fontDef.label}…`)
        await ffmpeg.writeFile(fontPath, await fetchFile(fontDef.ttfUrl))
        fontPathMap.set(fontValue, fontPath)
      }
    }
    const textChain = buildDrawtextChain(activeTextClips, assets, fontPathMap)

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
    const { width, height } = format
    const vf = vfOverride ?? buildVfFilter(width, height, cropMode, zoom, rotation)

    const isImageAsset = (assetId: string) =>
      assets.find((a) => a.id === assetId)?.mediaType === "image"
    const imageVideoFilter = (dur: number) =>
      `loop=loop=-1:size=1:start=0,trim=duration=${dur},setpts=PTS-STARTPTS,${vf}`

    function applyTextToVf(baseVf: string): string {
      return textChain ? `${baseVf},${textChain}` : baseVf
    }
    function applyTextToFc(filters: string[], videoOutLabel: string): { filters: string[]; mapLabel: string } {
      if (!textChain) return { filters, mapLabel: videoOutLabel.replace(/[\[\]]/g, "") }
      const finalLabel = "finalv"
      return {
        filters: [...filters, `${videoOutLabel}${textChain}[${finalLabel}]`],
        mapLabel: finalLabel,
      }
    }

    if (sortedClips.length === 1) {
      const c0 = sortedClips[0]
      const isImg = isImageAsset(c0.assetId)
      expectedDuration = c0.duration
      setProgress("Encoding… 0%")

      if (isImg) {
        const audioTrackFilters = sortedAudio.map((ac, i) =>
          `[${audioOffset + i}:a]atrim=start=${ac.trimIn}:duration=${ac.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(ac.startTime * 1000)}:all=1,aresample=44100[at${i}]`
        )
        const silFilter = `aevalsrc=0:c=stereo:s=44100:d=${c0.duration}[sil]`
        const baseVFilters = sortedAudio.length === 0
          ? [`[0:v]${imageVideoFilter(c0.duration)}[outv]`, silFilter]
          : [`[0:v]${imageVideoFilter(c0.duration)}[outv]`, silFilter, ...audioTrackFilters, `[sil]${sortedAudio.map((_, i) => `[at${i}]`).join("")}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`]
        const { filters: fcFilters, mapLabel } = applyTextToFc(baseVFilters, "[outv]")
        await ffmpeg.exec([...inputs, "-filter_complex", fcFilters.join(";"), "-map", `[${mapLabel}]`, "-map", sortedAudio.length === 0 ? "[sil]" : "[finala]", ...codecArgs, outputFile])
      } else {
        const fpsFilter = normFps ? `,fps=${normFps}` : ""
        const trimVf = applyTextToVf(`trim=start=${c0.trimIn}:duration=${c0.duration},setpts=PTS-STARTPTS,${vf}${fpsFilter}`)
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
          const filterComplex = [`[0:a]${videoAf}[va]`, ...audioTrackFilters, `${mixInputs}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`].join(";")
          await ffmpeg.exec([...inputs, "-vf", trimVf, "-filter_complex", filterComplex, "-map", "0:v", "-map", "[finala]", ...codecArgs, outputFile])
        }
      }
    } else {
      const fps = normFps ?? 30
      const normFilters: string[] = []
      for (let i = 0; i < sortedClips.length; i++) {
        const ci = sortedClips[i]
        if (isImageAsset(ci.assetId)) {
          normFilters.push(`[${i}:v]${imageVideoFilter(ci.duration)},fps=fps=${fps},settb=AVTB,setsar=1[nv${i}]`)
          normFilters.push(`aevalsrc=0:c=stereo:s=44100:d=${ci.duration}[na${i}]`)
        } else {
          normFilters.push(`[${i}:v]trim=start=${ci.trimIn}:duration=${ci.duration},setpts=PTS-STARTPTS,fps=fps=${fps},settb=AVTB,${vf},setsar=1[nv${i}]`)
          if (ci.muted) {
            normFilters.push(`aevalsrc=0:c=stereo:s=44100:d=${ci.duration}[na${i}]`)
          } else {
            normFilters.push(`[${i}:a]atrim=start=${ci.trimIn}:duration=${ci.duration},asetpts=PTS-STARTPTS,aresample=44100[na${i}]`)
          }
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

      expectedDuration = Math.max(0.1, cumDur + sortedClips[sortedClips.length - 1].duration - cumTrans)
      setProgress("Encoding… 0%")

      if (sortedAudio.length === 0) {
        const { filters: fcFilters, mapLabel } = applyTextToFc([...normFilters, ...vFilters, ...aFilters], "[outv]")
        await ffmpeg.exec([...inputs, "-filter_complex", fcFilters.join(";"), "-map", `[${mapLabel}]`, "-map", "[outa]", ...codecArgs, outputFile])
      } else {
        const audioTrackFilters = sortedAudio.map((ac, i) =>
          `[${audioOffset + i}:a]atrim=start=${ac.trimIn}:duration=${ac.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(ac.startTime * 1000)}:all=1,aresample=44100[at${i}]`
        )
        const mixInputs = ["[outa]", ...sortedAudio.map((_, i) => `[at${i}]`)].join("")
        const mixFilter = `${mixInputs}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`
        const { filters: fcFilters, mapLabel } = applyTextToFc([...normFilters, ...vFilters, ...aFilters, ...audioTrackFilters, mixFilter], "[outv]")
        await ffmpeg.exec([...inputs, "-filter_complex", fcFilters.join(";"), "-map", `[${mapLabel}]`, "-map", "[finala]", ...codecArgs, outputFile])
      }
    }

    setProgress("Encoding… 100%")
    const data = await ffmpeg.readFile(outputFile) as Uint8Array
    return new Blob([data], { type: mime })

    } finally {
      // ffmpeg instance is discarded after each run; worker is GC'd
    }
  }

  async function produceVideo(projectName?: string) {
    if (sortedClips.length === 0) {
      toast.error("Add clips to the video track first")
      return
    }
    if (!client) {
      toast.error("Not connected to Aprimo")
      return
    }
    setProducing(true)
    setProduceProgress("")
    try {
      const ext = outputFormat.toLowerCase()
      const mime = outputFormat === "WebM" ? "video/webm" : outputFormat === "MOV" ? "video/quicktime" : "video/mp4"
      const codecArgs = outputFormat === "WebM"
        ? ["-c:v", "libvpx-vp9", "-c:a", "libopus", "-lag-in-frames", "0"]
        : ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast", "-bf", "0", "-x264-params", "rc-lookahead=0"]

      const blob = await runPipeline({
        format: selectedFormat,
        codecArgs,
        outputFile: `output.${ext}`,
        mime,
        setProgress: setProduceProgress,
      })

      const filename = projectName ? `${projectName}.${ext}` : savedFileName ?? `video-studio-${Date.now()}.${ext}`
      const file = new File([blob], filename, { type: mime })

      setProduceProgress("Uploading…")
      const uploadResult = await client.uploader.uploadFile(file, {
        onProgress: (uploaded: number, total: number) => {
          setProduceProgress(`Uploading… ${Math.round((uploaded / total) * 100)}%`)
        },
      })
      if (!uploadResult.ok) throw new Error(uploadResult.error?.message ?? "Upload failed")
      const token = uploadResult.data!.token

      const jsonFieldName = getVsSetting(process.env.NEXT_PUBLIC_VIDEO_STUDIO_JSON_FIELD, "aprimo_vs_json_field")

      // Resolve field name → field definition ID
      let jsonFieldId: string | null = null
      if (jsonFieldName) {
        outer: for await (const result of client.fieldDefinitions.getPaged()) {
          if (!result.ok) break
          const items = (result.data?.items ?? []) as unknown as { id: string; name: string }[]
          for (const item of items) {
            if (item.name === jsonFieldName) { jsonFieldId = item.id; break outer }
          }
        }
      }

      const metadata = {
        output: { platform, format: selectedFormat, cropMode, zoom, rotation, outputFormat },
        assets: assets.map((a) => ({ ...a, duration: durations[a.id] ?? null })),
        videoClips: sortedClips,
        transitionClips,
        audioClips,
        textClips: textClips.map((tc) => ({ ...tc, asset: assets.find((a) => a.id === tc.assetId) })),
      }

      if (savedRecordId) {
        // Fetch master file ID so we can target the correct file for the new version
        setProduceProgress("Updating asset…")
        const expander = Expander.create()
        ;(expander.for("record") as any).expand("masterfile")
        const recRes = await client.search.records(
          { searchExpression: { expression: `id='${savedRecordId}'` } },
          expander,
        )
        if (!recRes.ok) throw new Error((recRes as any).error?.message ?? "Failed to fetch record")
        const masterFileId = (recRes.data?.items?.[0] as any)?._embedded?.masterfile?.id as string | undefined
        if (!masterFileId) throw new Error("Could not determine master file ID")

        const updateBody: any = {
          files: {
            addOrUpdate: [{ id: masterFileId, versions: { addOrUpdate: [{ id: token, fileName: filename }] } }],
          },
        }
        if (jsonFieldId) {
          updateBody.fields = {
            addOrUpdate: [{ id: jsonFieldId, localizedValues: [{ value: JSON.stringify(metadata) }] }],
          }
        }
        const updateRes = await client.records.update(savedRecordId, updateBody as never)
        if (!updateRes.ok) throw new Error((updateRes as any).error?.message ?? "Failed to update asset")
        setSavedFileName(filename)
        toast.success("Asset updated in Aprimo", { description: filename })
      } else {
        // Create new record
        setProduceProgress("Creating asset…")
        const contentType = getVsSetting(process.env.NEXT_PUBLIC_VIDEO_STUDIO_CONTENT_TYPE, "aprimo_vs_content_type")
        const classificationId = getVsSetting(process.env.NEXT_PUBLIC_VIDEO_STUDIO_CLASSIFICATION_ID, "aprimo_vs_classification_id")

        const recordBody: any = {
          title: filename,
          files: {
            master: token,
            addOrUpdate: [{ versions: { addOrUpdate: [{ id: token, fileName: filename }] } }],
          },
        }
        if (contentType) recordBody.contentType = contentType
        if (classificationId) recordBody.classifications = { addOrUpdate: [{ id: classificationId }] }
        if (jsonFieldId) {
          recordBody.fields = {
            addOrUpdate: [{ id: jsonFieldId, localizedValues: [{ value: JSON.stringify(metadata) }] }],
          }
        }

        const createRes = await client.records.create(recordBody as never)
        if (!createRes.ok) throw new Error(createRes.error?.message ?? "Failed to create asset")

        const recordId = (createRes.data as any)?.id
        if (recordId) {
          setSavedRecordId(recordId)
          setSavedFileName(filename)
          if (connection) {
            setSavedRecordUrl(`https://${connection.environment}.dam.aprimo.com/dam/contentitems/${recordId.replace(/-/g, "")}`)
          }
        }
        toast.success("Asset saved to Aprimo", { description: filename })
      }
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setProducing(false)
      setProduceProgress(null)
    }
  }

  async function downloadVideo() {
    if (sortedClips.length === 0) {
      toast.error("Add clips to the video track first")
      return
    }
    setDownloading(true)
    setDownloadProgress("")
    try {
      const ext = outputFormat.toLowerCase()
      const mime = outputFormat === "WebM" ? "video/webm" : outputFormat === "MOV" ? "video/quicktime" : "video/mp4"
      const codecArgs = outputFormat === "WebM"
        ? ["-c:v", "libvpx-vp9", "-c:a", "libopus", "-lag-in-frames", "0"]
        : ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast", "-bf", "0", "-x264-params", "rc-lookahead=0"]

      const blob = await runPipeline({
        format: selectedFormat,
        codecArgs,
        outputFile: `output.${ext}`,
        mime,
        setProgress: setDownloadProgress,
      })

      const filename = `video-studio-${Date.now()}.${ext}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  async function generatePreview() {
    if (sortedClips.length === 0) {
      toast.error("Add clips to the video track first")
      return
    }
    setPreviewing(true)
    setPreviewProgress("")
    try {
      const maxW = previewWidth === 1280 ? 1920 : previewWidth === 720 ? 1280 : 640
      const pw = Math.min(maxW, Math.floor(selectedFormat.width / 2) * 2)
      const ph = Math.round((pw * selectedFormat.height) / selectedFormat.width / 2) * 2

      const previewVf = buildVfFilter(pw, ph, cropMode, zoom, rotation)

      const isSmall = previewWidth === 360
      const isMedium = previewWidth === 720

      const blob = await runPipeline({
        format: { width: pw, height: ph },
        vfOverride: previewVf,
        normFps: isSmall ? 10 : undefined,
        codecArgs: isSmall
          ? ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "40", "-b:a", "64k", "-ar", "22050"]
          : isMedium
            ? ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "28", "-bf", "0", "-x264-params", "rc-lookahead=0"]
            : ["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23", "-bf", "0", "-x264-params", "rc-lookahead=0"],
        outputFile: "preview.mp4",
        mime: "video/mp4",
        setProgress: setPreviewProgress,
      })

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      toast.error(`Preview failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPreviewing(false)
      setPreviewProgress(null)
    }
  }

  return { produceVideo, producing, produceProgress, savedRecordId, savedRecordUrl, downloadVideo, downloading, downloadProgress, generatePreview, previewing, previewProgress, previewUrl, clearPreview }
}
