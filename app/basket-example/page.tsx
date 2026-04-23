"use client"

import { useCallback, useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useAprimo } from "@/context/aprimo-context"
import { supabase } from "@/lib/supabase"
import { Expander } from "aprimo-js"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, LayoutGrid, List } from "lucide-react"
import ExcelJS from "exceljs"

type AprimoField = {
  fieldName: string
  dataType?: string
  localizedValues?: Array<{ value?: string; values?: string[] }>
}

type AprimoRecord = {
  id: string
  title?: string | null
  contentType?: string
  status?: string
  _embedded?: {
    fields?: { items?: AprimoField[] }
    masterfilelatestversion?: {
      _embedded?: {
        thumbnail?: { uri?: string }
        preview?: { uri?: string }
      }
    }
  }
  [key: string]: unknown
}

function getThumbnailUri(record: AprimoRecord): string | undefined {
  return record._embedded?.masterfilelatestversion?._embedded?.thumbnail?.uri
}

function getPreviewUri(record: AprimoRecord): string | undefined {
  return record._embedded?.masterfilelatestversion?._embedded?.preview?.uri
}

type FieldDef = {
  id: string
  name: string
  label: string
  dataType: string
}

function getFieldValue(record: AprimoRecord, fieldName: string): string {
  const field = record._embedded?.fields?.items?.find((f) => f.fieldName === fieldName)
  if (!field?.localizedValues?.[0]) return ""
  const lv = field.localizedValues[0]
  if (Array.isArray(lv.values)) return lv.values.join(", ")
  return lv.value ?? ""
}

async function exportToExcel(records: AprimoRecord[], extraFields: string[], fieldDefs: FieldDef[]) {
  const labelFor = (name: string) => fieldDefs.find((d) => d.name === name)?.label ?? name

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Records")

  worksheet.columns = [
    { header: "", key: "thumb", width: 22 },
    { header: "ID", key: "id", width: 36 },
    { header: "Asset Title", key: "assetTitle", width: 30 },
    { header: "Content Type", key: "contentType", width: 20 },
    { header: "Status", key: "status", width: 15 },
    ...extraFields.map((f) => ({ header: labelFor(f), key: f, width: 20 })),
  ]

  worksheet.getRow(1).font = { bold: true }

  const thumbBuffers = await Promise.all(
    records.map(async (record) => {
      const uri = getThumbnailUri(record)
      if (!uri) return null
      try {
        const res = await fetch(uri)
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null
      } catch {
        return null
      }
    })
  )

  const ROW_HEIGHT = 90

  records.forEach((record, i) => {
    const rowNum = i + 2
    const row = worksheet.getRow(rowNum)
    row.height = ROW_HEIGHT
    row.getCell("id").value = record.id
    row.getCell("assetTitle").value = getFieldValue(record, "_PMAssetTitle")
    row.getCell("contentType").value = record.contentType ?? ""
    row.getCell("status").value = record.status ?? ""
    for (const field of extraFields) {
      row.getCell(field).value = getFieldValue(record, field)
    }
    row.commit()

    const buf = thumbBuffers[i]
    if (buf) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageId = workbook.addImage({ buffer: buf as any, extension: "jpeg" })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      worksheet.addImage(imageId, { tl: { col: 0, row: i + 1 } as any, ext: { width: 150, height: 100 }, editAs: "oneCell" })
    }
  })

  const buf = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "records.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}

function BasketExampleContent() {
  const searchParams = useSearchParams()
  const requestId = searchParams.get("requestId")
  const { client, isConnected } = useAprimo()

  const [records, setRecords] = useState<AprimoRecord[]>([])
  const [recordIds, setRecordIds] = useState<string[]>([])
  const [requestedCount, setRequestedCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([])
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [tableFields, setTableFields] = useState<string[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [gridShowPreview, setGridShowPreview] = useState(false)

  useEffect(() => {
    if (!isConnected || !client) return

    async function loadFieldDefs() {
      const allDefs: FieldDef[] = []
      for await (const result of client!.fieldDefinitions.getPaged()) {
        if (!result.ok) break
        allDefs.push(...(result.data?.items ?? []) as unknown as FieldDef[])
      }
      setFieldDefs(
        allDefs
          .filter((d) => !["RecordLink", "Json", "HyperlinkList", "Duration"].includes(d.dataType))
          .sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name))
      )
    }
    loadFieldDefs()
  }, [isConnected, client])

  const fetchRecords = useCallback(async (ids: string[], fields: string[]) => {
    if (!client) return []

    const expander = Expander.create()
    ;(expander.for("record") as { expand: (...f: string[]) => Expander }).expand("fields", "masterfilelatestversion")
    ;(expander.for("fileversion") as { expand: (...f: string[]) => Expander }).expand("thumbnail", "preview")
    if (fields.length > 0) expander.selectRecordFields(...fields)

    const BATCH_SIZE = 50
    const batches: string[][] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE))
    }

    const batchResults = await Promise.all(
      batches.map((batch) => {
        const expression = batch.map((id) => `id='${id}'`).join(" OR ")
        return client.search.records({ searchExpression: { expression } }, expander)
      })
    )

    const failed = batchResults.filter((r) => !r.ok)
    if (failed.length) throw new Error(failed.map((r) => r.error?.message ?? "Search failed").join(", "))

    return batchResults.flatMap((r) => r.data?.items ?? []) as unknown as AprimoRecord[]
  }, [client])

  useEffect(() => {
    if (!requestId || !isConnected || !client) return

    async function load() {
      setLoading(true)
      setError(null)

      const { data: row, error: dbError } = await supabase
        .from("requested_records")
        .select("recordList")
        .eq("requestId", requestId)
        .single()

      if (dbError || !row) {
        setError(dbError?.message ?? "Request not found")
        setLoading(false)
        return
      }

      setRequestedCount(row.recordList.length)
      setRecordIds(row.recordList)

      await supabase.from("requested_records").delete().eq("requestId", requestId)

      try {
        const fetched = await fetchRecords(row.recordList, ["_PMAssetTitle"])
        setRecords(fetched)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed")
      }

      setLoading(false)
    }

    load()
  }, [requestId, isConnected, client, fetchRecords])

  function toggleField(name: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function handleFetchAndExport() {
    if (!recordIds.length) return
    setExporting(true)
    setError(null)
    try {
      const fields = ["_PMAssetTitle", ...Array.from(selectedFields).filter((f) => f !== "_PMAssetTitle")]
      const fetched = await fetchRecords(recordIds, fields)
      setRecords(fetched)
      await exportToExcel(fetched, fields, fieldDefs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  if (!requestId) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-4">Basket Example</h1>
        <p className="text-sm text-muted-foreground">No requestId provided.</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Basket Example</h1>

      {fieldDefs.length > 0 && (
        <Collapsible open={panelOpen} onOpenChange={setPanelOpen} className="mb-6 border rounded-lg print:hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
            Field Definitions ({fieldDefs.length})
            {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-64 border-t px-4 py-3">
              {Object.entries(
                fieldDefs.reduce<Record<string, FieldDef[]>>((groups, def) => {
                  const key = def.dataType ?? "Other"
                  ;(groups[key] ??= []).push(def)
                  return groups
                }, {})
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dataType, defs]) => (
                  <div key={dataType} className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {dataType}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {defs.map((def) => (
                        <div key={def.id} className="flex items-center gap-2">
                          <Checkbox
                            id={def.id}
                            checked={selectedFields.has(def.name)}
                            onCheckedChange={() => toggleField(def.name)}
                          />
                          <Label htmlFor={def.id} className="text-xs cursor-pointer truncate" title={def.name}>
                            {def.label || def.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </ScrollArea>
            <div className="border-t px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {selectedFields.size} field{selectedFields.size !== 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const fields = ["_PMAssetTitle", ...Array.from(selectedFields).filter((f) => f !== "_PMAssetTitle")]
                    setTableFields(Array.from(selectedFields))
                    setError(null)
                    try {
                      const fetched = await fetchRecords(recordIds, fields)
                      setRecords(fetched)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Reload failed")
                    }
                  }}
                  disabled={!selectedFields.size || !recordIds.length}
                >
                  Add to Table
                </Button>
                <Button
                  size="sm"
                  onClick={handleFetchAndExport}
                  disabled={exporting || !recordIds.length}
                >
                  {exporting ? "Exporting…" : "Fetch & Export to Excel"}
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading records...</p>}

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {records.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 print:hidden">
            <p className="text-sm font-medium">
              {records.length} record{records.length !== 1 ? "s" : ""} returned
              {requestedCount !== null && ` (${requestedCount} requested)`}
            </p>
            <div className="flex items-center gap-2">
              {viewMode === "grid" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => setGridShowPreview((v) => !v)}
                >
                  {gridShowPreview ? "Thumbnail" : "Preview"}
                </Button>
              )}
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {viewMode === "table" ? (
            <table className="mt-4 w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium w-20"></th>
                  <th className="pb-2 pr-4 font-medium">ID</th>
                  <th className="pb-2 pr-4 font-medium">Asset Title</th>
                  <th className="pb-2 pr-4 font-medium">Content Type</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  {tableFields.map((f) => (
                    <th key={f} className="pb-2 pr-4 font-medium">
                      {fieldDefs.find((d) => d.name === f)?.label ?? f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {getThumbnailUri(record)
                        ? <img src={getThumbnailUri(record)} alt="" className="w-16 h-16 object-cover rounded" />
                        : <div className="w-16 h-16 bg-muted rounded" />}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{record.id}</td>
                    <td className="py-2 pr-4">{getFieldValue(record, "_PMAssetTitle")}</td>
                    <td className="py-2 pr-4">{record.contentType ?? "-"}</td>
                    <td className="py-2 pr-4">{record.status ?? "-"}</td>
                    {tableFields.map((f) => (
                      <td key={f} className="py-2 pr-4">{getFieldValue(record, f) || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {records.map((record) => {
                const thumb = gridShowPreview ? getPreviewUri(record) ?? getThumbnailUri(record) : getThumbnailUri(record)
                const title = getFieldValue(record, "_PMAssetTitle")
                return (
                  <div key={record.id} className="border rounded-lg overflow-hidden">
                    {thumb
                      ? <img src={thumb} alt="" className="w-full aspect-video object-cover" />
                      : <div className="w-full aspect-video bg-muted" />}
                    <div className="p-2 space-y-0.5">
                      {title && <p className="text-xs font-medium">{title}</p>}
                      {record.contentType && <p className="text-xs text-muted-foreground">{record.contentType}</p>}
                      {record.status && <p className="text-xs text-muted-foreground">{record.status}</p>}
                      {tableFields.map((f) => {
                        const value = getFieldValue(record, f)
                        if (!value) return null
                        return (
                          <p key={f} className="text-xs text-muted-foreground">
                            <span className="font-medium">{fieldDefs.find((d) => d.name === f)?.label ?? f}:</span> {value}
                          </p>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </>
      )}
    </main>
  )
}

export default function BasketExamplePage() {
  return (
    <Suspense>
      <BasketExampleContent />
    </Suspense>
  )
}
