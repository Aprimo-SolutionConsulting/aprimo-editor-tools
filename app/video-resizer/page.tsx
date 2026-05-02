"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAprimo } from "@/context/aprimo-context"
import { PLATFORMS } from "./constants"
import { useVideoRecord } from "./hooks/use-video-record"
import { useVideoProcessing } from "./hooks/use-video-processing"
import { VideoPreviewCard } from "./components/video-preview-card"
import { VideoSettingsPanel } from "./components/video-settings-panel"
import { VideoActionBar } from "./components/video-action-bar"

const MAX_PREVIEW_W = 640
const MAX_PREVIEW_H = 500

function VideoResizerContent() {
  const searchParams = useSearchParams()
  const recordId = searchParams.get("record")
  const { client, isConnected } = useAprimo()

  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)

  const [platform, setPlatform] = useState("Instagram")
  const [formatIndex, setFormatIndex] = useState(0)
  const [cropMode, setCropMode] = useState<"fill" | "fit">("fill")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [outputFormat, setOutputFormat] = useState("MP4")

  const formats = PLATFORMS[platform]
  const selectedFormat = formats[formatIndex] ?? formats[0]

  const { videoUrl, loading, loadingMessage, error, masterFileId, latestVersionId } =
    useVideoRecord(recordId, client, isConnected)

  const { isProcessing, progress, progressPct, handleCreateRendition, handleCreateAndDownload } =
    useVideoProcessing({
      videoUrl, client, recordId, masterFileId, latestVersionId,
      selectedFormat, platform, cropMode, zoom, rotation, outputFormat,
    })

  const fmtRatio = selectedFormat.width / selectedFormat.height
  const previewW = fmtRatio >= MAX_PREVIEW_W / MAX_PREVIEW_H ? MAX_PREVIEW_W : Math.round(MAX_PREVIEW_H * fmtRatio)
  const previewH = fmtRatio >= MAX_PREVIEW_W / MAX_PREVIEW_H ? Math.round(MAX_PREVIEW_W / fmtRatio) : MAX_PREVIEW_H

  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-1 min-h-0 gap-6 p-8 overflow-hidden">
        <VideoPreviewCard
          videoUrl={videoUrl}
          loading={loading}
          loadingMessage={loadingMessage}
          error={error}
          recordId={recordId}
          cropMode={cropMode}
          zoom={zoom}
          rotation={rotation}
          previewW={previewW}
          previewH={previewH}
          onVideoSize={setVideoSize}
        />
        <VideoSettingsPanel
          platform={platform}
          formatIndex={formatIndex}
          cropMode={cropMode}
          zoom={zoom}
          rotation={rotation}
          outputFormat={outputFormat}
          formats={formats}
          selectedFormat={selectedFormat}
          onPlatformChange={(v) => { setPlatform(v); setFormatIndex(0) }}
          onFormatIndexChange={setFormatIndex}
          onCropModeChange={setCropMode}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onOutputFormatChange={setOutputFormat}
        />
      </div>
      <VideoActionBar
        isProcessing={isProcessing}
        progress={progress}
        progressPct={progressPct}
        videoUrl={videoUrl}
        videoSize={videoSize}
        selectedFormat={selectedFormat}
        onCreateRendition={handleCreateRendition}
        onCreateAndDownload={handleCreateAndDownload}
      />
    </main>
  )
}

export default function VideoResizerPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <Suspense>
        <VideoResizerContent />
      </Suspense>
      <Footer />
    </div>
  )
}
