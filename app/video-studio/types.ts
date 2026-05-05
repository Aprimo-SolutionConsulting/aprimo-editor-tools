export type MediaType = "video" | "audio" | "unknown"

export function detectMediaType(url: string): MediaType {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  if (["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "aac", "m4a", "flac", "opus"].includes(ext)) return "audio"
  return "unknown"
}

export interface SelectedAsset {
  id: string
  title: string
  thumbnailUrl: string | null
  publicLink: string | null
  loading: boolean
  error: string | null
  mediaType: MediaType
}

export interface VideoClip {
  assetId: string
  startTime: number
  duration: number
  trimIn: number
  trimSet: boolean
  muted: boolean
}

export interface TransitionClip {
  id: string
  type: string
  startTime: number
  duration: number
}

export interface AudioClip {
  id: string
  url: string
  name: string
  startTime: number
  trimIn: number
  duration: number
  sourceDuration: number
}

export function formatTimecode(s: number): string {
  const c = Math.max(0, s)
  const ms = Math.floor((c % 1) * 1000)
  const sec = Math.floor(c % 60)
  const min = Math.floor(c / 60)
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
}

export const PIXELS_PER_SECOND = 60
export const DEFAULT_CLIP_DURATION = 10

export const TRANSITIONS = [
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
