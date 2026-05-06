"use client"

import { buildVfFilter } from "../video-resizer/constants"
import { VideoClip, AudioClip, TransitionClip, TextClip, SelectedAsset, TEXT_FONTS } from "./types"

// ── text filter helpers ───────────────────────────────────────────────────────

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

// ── pipeline ──────────────────────────────────────────────────────────────────

export interface RunPipelineParams {
  sortedClips: VideoClip[]
  audioClips: AudioClip[]
  transitionClips: TransitionClip[]
  textClips: TextClip[]
  assets: SelectedAsset[]
  durations: Record<string, number>
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  format: { width: number; height: number }
  vfOverride?: string
  normFps?: number
  disableFades?: boolean
  codecArgs: string[]
  outputFile: string
  mime: string
  setProgress: (s: string) => void
}

let _coreURLPromise: Promise<string> | null = null
let _wasmURLPromise: Promise<string> | null = null

async function loadFFmpegCore(ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg) {
  const { toBlobURL } = await import("@ffmpeg/util")
  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
  if (!_coreURLPromise) _coreURLPromise = toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript")
  if (!_wasmURLPromise) _wasmURLPromise = toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm")
  await ffmpeg.load({ coreURL: await _coreURLPromise, wasmURL: await _wasmURLPromise })
}

export async function runPipeline({
  sortedClips,
  audioClips,
  transitionClips,
  textClips,
  assets,
  durations,
  cropMode,
  zoom,
  rotation,
  format,
  vfOverride,
  normFps,
  disableFades,
  codecArgs,
  outputFile,
  mime,
  setProgress,
}: RunPipelineParams): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg")
  const { fetchFile } = await import("@ffmpeg/util")

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

  await loadFFmpegCore(ffmpeg)

  const vfsFiles: string[] = []
  const writeFile = async (name: string, data: Parameters<typeof ffmpeg.writeFile>[1]) => {
    await ffmpeg.writeFile(name, data)
    vfsFiles.push(name)
  }

  try {
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i]
      const asset = assets.find((a) => a.id === clip.assetId)
      if (!asset?.publicLink) throw new Error(`Missing download link for clip ${i + 1}`)
      setProgress(`Loading clip ${i + 1} of ${sortedClips.length}…`)
      await writeFile(`input${i}.mp4`, await fetchFile(asset.publicLink))
    }

    const sortedAudio = audioClips.slice().sort((a, b) => a.startTime - b.startTime)
    for (let i = 0; i < sortedAudio.length; i++) {
      setProgress(`Loading audio ${i + 1} of ${sortedAudio.length}…`)
      await writeFile(`audio${i}`, await fetchFile(sortedAudio[i].url))
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
        await writeFile(fontPath, await fetchFile(fontDef.ttfUrl))
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

    const isImageAsset = (assetId: string) => assets.find((a) => a.id === assetId)?.mediaType === "image"
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
      // Split video and audio normalization so pass 1 can be video-only
      const videoNormFilters: string[] = []
      const audioNormFilters: string[] = []
      for (let i = 0; i < sortedClips.length; i++) {
        const ci = sortedClips[i]
        if (isImageAsset(ci.assetId)) {
          videoNormFilters.push(`[${i}:v]${imageVideoFilter(ci.duration)},fps=fps=${fps},settb=AVTB,setsar=1[nv${i}]`)
          audioNormFilters.push(`aevalsrc=0:c=stereo:s=44100:d=${ci.duration}[na${i}]`)
        } else {
          videoNormFilters.push(`[${i}:v]trim=start=${ci.trimIn}:duration=${ci.duration},setpts=PTS-STARTPTS,fps=fps=${fps},settb=AVTB,${vf},setsar=1[nv${i}]`)
          audioNormFilters.push(ci.muted
            ? `aevalsrc=0:c=stereo:s=44100:d=${ci.duration}[na${i}]`
            : `[${i}:a]atrim=start=${ci.trimIn}:duration=${ci.duration},asetpts=PTS-STARTPTS,aresample=44100[na${i}]`
          )
        }
      }

      let vFilters: string[]
      let aFilters: string[]

      if (disableFades) {
        const n = sortedClips.length
        vFilters = [`${sortedClips.map((_, i) => `[nv${i}]`).join("")}concat=n=${n}:v=1:a=0[outv]`]
        aFilters = [`${sortedClips.map((_, i) => `[na${i}]`).join("")}concat=n=${n}:v=0:a=1[outa]`]
        expectedDuration = Math.max(0.1, sortedClips.reduce((s, c) => s + c.duration, 0))
      } else {
        vFilters = []
        aFilters = []
        let cumDur = 0
        let cumTrans = 0
        for (let i = 0; i < sortedClips.length - 1; i++) {
          const raw = getTransition(i)
          const maxDur = Math.min(
            1.5,
            sortedClips[i].duration / 2,
            sortedClips[i + 1].duration / 2,
          )
          const t = { ...raw, duration: Math.min(raw.duration, maxDur) }
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
      }
      setProgress("Encoding… 0%")

      const videoInputs = sortedClips.flatMap((_, i) => ["-i", `input${i}.mp4`])

      if (sortedAudio.length === 0) {
        const { filters: fcFilters, mapLabel } = applyTextToFc([...videoNormFilters, ...vFilters, ...aFilters], "[outv]")
        await ffmpeg.exec([...videoInputs, "-filter_complex", fcFilters.join(";"), "-map", `[${mapLabel}]`, "-map", "[outa]", ...codecArgs, outputFile])
      } else {
        // Two-pass workaround: xfade + amix in one filter_complex deadlocks in single-threaded
        // WASM because the muxer's audio queue fills while xfade buffers clip 0 frames.
        // Pass 1 — video only (no circular audio/video dependency):
        const { filters: pass1Filters, mapLabel: videoLabel } = applyTextToFc([...videoNormFilters, ...vFilters], "[outv]")
        vfsFiles.push("temp_pass1.mkv")
        await ffmpeg.exec([
          ...videoInputs,
          "-filter_complex", pass1Filters.join(";"),
          "-map", `[${videoLabel}]`,
          "-an",
          ...codecArgs,
          "temp_pass1.mkv",
        ])

        // Pass 2 — audio only, then mux with the encoded video (copy):
        // Input layout: [0]=temp_pass1.mkv, [1..N]=original video files, [N+1..]=audio files
        setProgress("Mixing audio…")
        const pass2AudioNorm = audioNormFilters.map((f) =>
          f.replace(/\[(\d+):a\]/g, (_, n) => `[${parseInt(n) + 1}:a]`)
        )
        const extOffset = 1 + sortedClips.length
        const externalAudioFilters = sortedAudio.map((ac, i) =>
          `[${extOffset + i}:a]atrim=start=${ac.trimIn}:duration=${ac.duration},asetpts=PTS-STARTPTS,adelay=${Math.round(ac.startTime * 1000)}:all=1,aresample=44100[at${i}]`
        )
        const mixInputLabels = ["[outa]", ...sortedAudio.map((_, i) => `[at${i}]`)].join("")
        const mixFilter = `${mixInputLabels}amix=inputs=${1 + sortedAudio.length}:normalize=0[finala]`

        await ffmpeg.exec([
          "-i", "temp_pass1.mkv",
          ...videoInputs,
          ...sortedAudio.flatMap((_, i) => ["-i", `audio${i}`]),
          "-filter_complex", [...pass2AudioNorm, ...aFilters, ...externalAudioFilters, mixFilter].join(";"),
          "-map", "0:v",
          "-map", "[finala]",
          "-c:v", "copy",
          "-c:a", "aac",
          outputFile,
        ])
      }
    }

    setProgress("Encoding… 100%")
    vfsFiles.push(outputFile)
    const data = await ffmpeg.readFile(outputFile)
    return new Blob([data instanceof Uint8Array ? new Uint8Array(data) : data], { type: mime })
  } finally {
    for (const f of vfsFiles) {
      try { await ffmpeg.deleteFile(f) } catch { /* already gone */ }
    }
    try { ffmpeg.terminate() } catch { /* worker already gone */ }
  }
}
