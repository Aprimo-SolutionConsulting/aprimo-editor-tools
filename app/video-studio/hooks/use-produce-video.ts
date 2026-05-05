"use client"

import { useState } from "react"
import { toast } from "sonner"
import { buildVfFilter } from "../../video-resizer/constants"
import { VideoClip, AudioClip, TransitionClip, SelectedAsset } from "../types"

interface UseProduceVideoParams {
  sortedClips: VideoClip[]
  audioClips: AudioClip[]
  assets: SelectedAsset[]
  durations: Record<string, number>
  transitionClips: TransitionClip[]
  selectedFormat: { width: number; height: number }
  cropMode: "fill" | "fit"
  zoom: number
  rotation: number
  outputFormat: string
}

export function useProduceVideo({
  sortedClips,
  audioClips,
  assets,
  durations,
  transitionClips,
  selectedFormat,
  cropMode,
  zoom,
  rotation,
  outputFormat,
}: UseProduceVideoParams) {
  const [producing, setProducing] = useState(false)
  const [produceProgress, setProduceProgress] = useState<string | null>(null)

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

      // expectedDuration is set just before exec so log handler can use it.
      // We parse time= from FFmpeg stderr instead of using the progress event,
      // because progress uses input duration as denominator — which is wrong when
      // the output is shorter than the input (e.g. trimmed clips).
      let expectedDuration = 0

      ffmpeg.on("log", ({ message }) => {
        console.log("[ffmpeg]", message)
        if (expectedDuration <= 0) return
        const m = message.match(/time=(-?\d+):(\d+):(\d+\.?\d*)/)
        if (!m) return
        const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
        if (secs <= 0) return
        setProduceProgress(`Encoding… ${Math.min(100, Math.round((secs / expectedDuration) * 100))}%`)
      })

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
        const videoAf = c0.muted
          ? `atrim=start=${c0.trimIn}:duration=${c0.duration},asetpts=PTS-STARTPTS,volume=0`
          : `atrim=start=${c0.trimIn}:duration=${c0.duration},asetpts=PTS-STARTPTS`

        expectedDuration = c0.duration
        setProduceProgress("Encoding… 0%")

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

        // Output duration = sum of all clip durations minus all transition overlaps
        expectedDuration = Math.max(0.1, cumDur + sortedClips[sortedClips.length - 1].duration - cumTrans)
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

  return { produceVideo, producing, produceProgress }
}
