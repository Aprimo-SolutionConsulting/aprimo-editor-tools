export type MediaType = "video" | "audio" | "image" | "text" | "unknown"

export interface FontOption {
  label: string
  value: string   // CSS font-family name
  ttfUrl: string  // direct TTF download URL for FFmpeg
}

export const TEXT_FONTS: FontOption[] = [
  { label: "Roboto",           value: "Roboto",           ttfUrl: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf" },
  { label: "Lato",             value: "Lato",             ttfUrl: "https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXiWtFCc.ttf" },
  { label: "Poppins",          value: "Poppins",          ttfUrl: "https://fonts.gstatic.com/s/poppins/v21/pxiEyp8kv8JHgFVrJJfecg.ttf" },
  { label: "Montserrat",       value: "Montserrat",       ttfUrl: "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459Wlhyw.ttf" },
  { label: "Oswald",           value: "Oswald",           ttfUrl: "https://fonts.gstatic.com/s/oswald/v49/TK3_WkUHHAIjg75cFRf3bXL8LICs1_FvsUhiZTaI.ttf" },
  { label: "Merriweather",     value: "Merriweather",     ttfUrl: "https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZM.ttf" },
  { label: "Playfair Display", value: "Playfair Display", ttfUrl: "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFiD-vYSZviVYUb_rj3ij__anPXBYf9lW4e5vEpz_V2LpffKnvuEA.ttf" },
  { label: "Ubuntu",           value: "Ubuntu",           ttfUrl: "https://fonts.gstatic.com/s/ubuntu/v20/4iCs6KVjbNBYlgoKcg72j00.ttf" },
]

export type TextPosition =
  | "top-left"    | "top-center"    | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right"

export function detectMediaType(url: string): MediaType {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""
  if (["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "aac", "m4a", "flac", "opus"].includes(ext)) return "audio"
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "tiff", "tif", "bmp", "avif"].includes(ext)) return "image"
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
  heading?: string    // heading text rendered in video (large)
  headingSize?: number  // heading font size in px, default 48
  body?: string       // body text rendered in video (smaller)
  textColor?: string

  textPosition?: TextPosition
  textFont?: string   // FontOption.value
  textOpacity?: number  // 0–100, default 100
  textSize?: number   // font size in px, default 32
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

export interface TextClip {
  id: string
  assetId: string
  startTime: number
  duration: number
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
  "fade","fadeblack","fadewhite","fadegrays","dissolve",
  "wipeleft","wiperight","wipeup","wipedown",
  "slideleft","slideright","slideup","slidedown",
  "smoothleft","smoothright","smoothup","smoothdown",
  "circlecrop","circleopen","circleclose","rectcrop","radial",
  "diagtl","diagtr","diagbl","diagbr",
  "hlslice","hrslice","vuslice","vdslice",
  "hlwind","hrwind","vuwind","vdwind",
  "pixelize","distance","hblur","squeezeh","squeezev","zoomin",
]
