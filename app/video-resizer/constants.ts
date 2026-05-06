export const PLATFORMS: Record<string, { label: string; width: number; height: number }[]> = {
  General: [
    { label: "4K UHD — 16:9",    width: 3840, height: 2160 },
    { label: "1080p — 16:9",     width: 1920, height: 1080 },
    { label: "720p — 16:9",      width: 1280, height: 720  },
    { label: "Square — 1:1",     width: 1080, height: 1080 },
    { label: "Portrait — 9:16",  width: 1080, height: 1920 },
  ],
  Instagram: [
    { label: "Feed Landscape — 16:9", width: 1080, height: 608 },
    { label: "Feed Square — 1:1", width: 1080, height: 1080 },
    { label: "Feed Portrait — 4:5", width: 1080, height: 1350 },
    { label: "Story / Reels — 9:16", width: 1080, height: 1920 },
  ],
  YouTube: [
    { label: "Standard — 16:9", width: 1920, height: 1080 },
    { label: "Shorts — 9:16", width: 1080, height: 1920 },
  ],
  TikTok: [
    { label: "Standard — 9:16", width: 1080, height: 1920 },
  ],
  Facebook: [
    { label: "Feed — 16:9", width: 1280, height: 720 },
    { label: "Story — 9:16", width: 1080, height: 1920 },
  ],
  LinkedIn: [
    { label: "Landscape — 16:9", width: 1920, height: 1080 },
    { label: "Square — 1:1", width: 1080, height: 1080 },
  ],
  X: [
    { label: "Landscape — 16:9", width: 1280, height: 720 },
    { label: "Square — 1:1", width: 720, height: 720 },
  ],
}

export const OUTPUT_FORMATS = ["MP4", "MOV", "WebM"]

export function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

export function buildVfFilter(
  width: number,
  height: number,
  cropMode: "fill" | "fit",
  zoom: number,
  rotation: number
): string {
  const filters: string[] = []

  if (zoom !== 100) {
    const s = zoom / 100
    filters.push(`scale=iw*${s}:ih*${s}`)
  }

  if (rotation === 90) filters.push("transpose=1")
  else if (rotation === 180) filters.push("transpose=1,transpose=1")
  else if (rotation === 270) filters.push("transpose=2")

  if (cropMode === "fill") {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`)
    filters.push(`crop=${width}:${height}`)
  } else {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`)
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`)
  }

  return filters.join(",")
}
