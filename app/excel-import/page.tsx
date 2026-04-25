"use client"

import { useRef, useState, useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { FileSpreadsheet, Upload, ChevronsUpDown, Check } from "lucide-react"
import ExcelJS from "exceljs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { useAprimo } from "@/context/aprimo-context"
import type { FieldDef, ClassificationNode } from "@/models/aprimo"

interface ParsedFile {
  headers: string[]
  columnValues: Record<string, string[]>
}

async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], columnValues: {} }

  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  const colIndexByHeader: Record<string, number> = {}
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = String(cell.value ?? "")
    headers.push(h)
    colIndexByHeader[h] = col
  })

  const valueSets: Record<string, Set<string>> = {}
  for (const h of headers) valueSets[h] = new Set()

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    for (const [h, colIdx] of Object.entries(colIndexByHeader)) {
      const val = String(row.getCell(colIdx).value ?? "").trim()
      if (val) valueSets[h].add(val)
    }
  })

  const columnValues: Record<string, string[]> = {}
  for (const h of headers) columnValues[h] = Array.from(valueSets[h]).sort()

  return { headers, columnValues }
}

function ClassificationCombobox({
  classifications,
  value,
  onChange,
}: {
  classifications: ClassificationNode[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = classifications.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-7 w-full max-w-xs justify-between text-xs font-normal">
          <span className="truncate">{selected ? (selected.labelPath || selected.name) : "Select classification…"}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search classifications…" className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">No match found.</CommandEmpty>
            <CommandGroup>
              {classifications.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.labelPath || c.name}
                  onSelect={() => { onChange(c.id); setOpen(false) }}
                  className="text-xs"
                >
                  <Check className={`mr-1 h-3 w-3 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                  {c.labelPath || c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default function ExcelImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { client, isConnected } = useAprimo()

  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [columnValues, setColumnValues] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedHeaders, setSelectedHeaders] = useState<Set<string>>(new Set())
  const [recordIdColumn, setRecordIdColumn] = useState<string>("")
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({})
  // classificationMappings[column][excelValue] = classificationId
  const [classificationMappings, setClassificationMappings] = useState<Record<string, Record<string, string>>>({})

  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([])
  const [classifications, setClassifications] = useState<ClassificationNode[]>([])

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

    async function loadClassifications() {
      const all: ClassificationNode[] = []
      for await (const result of client!.classifications.getPaged(undefined, undefined, "*")) {
        if (!result.ok) break
        all.push(...(result.data?.items ?? []) as unknown as ClassificationNode[])
      }
      setClassifications(all.sort((a, b) => (a.labelPath || a.name).localeCompare(b.labelPath || b.name)))
    }

    loadFieldDefs()
    loadClassifications()
  }, [isConnected, client])

  function toggleHeader(h: string) {
    setSelectedHeaders((prev) => {
      const next = new Set(prev)
      next.has(h) ? next.delete(h) : next.add(h)
      if (!next.has(h)) {
        if (recordIdColumn === h) setRecordIdColumn("")
        setFieldMappings((m) => { const n = { ...m }; delete n[h]; return n })
        setClassificationMappings((m) => { const n = { ...m }; delete n[h]; return n })
      }
      return next
    })
  }

  function setMapping(column: string, fieldName: string) {
    setFieldMappings((prev) => ({ ...prev, [column]: fieldName }))
  }

  function setClassificationMapping(column: string, excelValue: string, classificationId: string) {
    setClassificationMappings((prev) => ({
      ...prev,
      [column]: { ...(prev[column] ?? {}), [excelValue]: classificationId },
    }))
  }

  async function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) return
    setFile(f)
    setHeaders([])
    setColumnValues({})
    setSelectedHeaders(new Set())
    setRecordIdColumn("")
    setFieldMappings({})
    setClassificationMappings({})
    setLoading(true)
    try {
      const parsed = await parseFile(f)
      setHeaders(parsed.headers)
      setColumnValues(parsed.columnValues)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const mappableColumns = Array.from(selectedHeaders).filter((h) => h !== recordIdColumn)

  // Auto-map columns to fields by name/label
  useEffect(() => {
    if (!fieldDefs.length || !mappableColumns.length) return
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")
    setFieldMappings((prev) => {
      const next = { ...prev }
      for (const col of mappableColumns) {
        if (next[col]) continue
        const key = normalize(col)
        const match = fieldDefs.find(
          (d) => normalize(d.name) === key || normalize(d.label ?? "") === key
        )
        if (match) next[col] = match.name
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, mappableColumns.join(",")])

  // Auto-match Excel classification values to Aprimo classifications by name/labelPath
  useEffect(() => {
    if (!classifications.length) return
    const normalize = (s: string) => s.toLowerCase().trim()
    for (const col of mappableColumns) {
      const fieldName = fieldMappings[col]
      if (!fieldName) continue
      const def = fieldDefs.find((d) => d.name === fieldName)
      if (def?.dataType !== "ClassificationList") continue
      const rawValues = columnValues[col] ?? []
      const values = Array.from(
        new Set(rawValues.flatMap((v) => v.split(";").map((s) => s.trim()).filter(Boolean)))
      )
      if (!values.length) continue
      setClassificationMappings((prev) => {
        const colMap = { ...(prev[col] ?? {}) }
        let changed = false
        for (const val of values) {
          if (colMap[val]) continue
          const match = classifications.find(
            (c) => normalize(c.name) === normalize(val) || normalize(c.labelPath || "") === normalize(val)
          )
          if (match) { colMap[val] = match.id; changed = true }
        }
        return changed ? { ...prev, [col]: colMap } : prev
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classifications, fieldMappings, mappableColumns.join(",")])

  const classificationColumns = mappableColumns.filter((col) => {
    const fieldName = fieldMappings[col]
    if (!fieldName) return false
    return fieldDefs.find((d) => d.name === fieldName)?.dataType === "ClassificationList"
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 p-8 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-6">Excel Import</h1>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`
            flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-16 cursor-pointer transition-colors
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}
          `}
        >
          {file ? (
            <>
              <FileSpreadsheet className="h-10 w-10 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · Click to replace</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Drop an Excel file here</p>
              <p className="text-xs text-muted-foreground">or click to browse · .xlsx / .xls</p>
            </>
          )}
        </div>

        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />

        {loading && <p className="mt-6 text-sm text-muted-foreground">Reading file...</p>}

        {!loading && headers.length > 0 && (
          <div className="mt-6 space-y-6">
            {/* Column selector */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {headers.length} column{headers.length !== 1 ? "s" : ""} found
                {selectedHeaders.size > 0 && ` · ${selectedHeaders.size} selected`}
              </p>
              <div className="flex flex-wrap gap-2">
                {headers.map((h, i) => {
                  const selected = selectedHeaders.has(h)
                  return (
                    <button
                      key={i}
                      onClick={() => toggleHeader(h)}
                      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-mono transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted hover:border-primary/50"
                      }`}
                    >
                      {h}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Record ID column */}
            {selectedHeaders.size > 0 && (
              <div className="flex items-center gap-3">
                <Label htmlFor="record-id-col" className="text-sm whitespace-nowrap">Record ID column</Label>
                <Select value={recordIdColumn} onValueChange={setRecordIdColumn}>
                  <SelectTrigger id="record-id-col" className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select a column…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(selectedHeaders).map((h) => (
                      <SelectItem key={h} value={h} className="text-xs font-mono">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Field mappings */}
            {mappableColumns.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-3">Field mappings</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Excel column</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Aprimo field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappableColumns.map((col, i) => (
                        <tr key={col} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                          <td className="px-4 py-2 font-mono text-xs">{col}</td>
                          <td className="px-4 py-2">
                            <Select value={fieldMappings[col] ?? ""} onValueChange={(v) => setMapping(col, v)}>
                              <SelectTrigger className="h-7 text-xs w-full max-w-xs">
                                <SelectValue placeholder="Select a field…" />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldDefs.map((d) => (
                                  <SelectItem key={d.id} value={d.name} className="text-xs">
                                    {d.label ?? d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Classification value mappings */}
            {classificationColumns.map((col) => {
              const rawValues = columnValues[col] ?? []
              const values = Array.from(
                new Set(rawValues.flatMap((v) => v.split(";").map((s) => s.trim()).filter(Boolean)))
              ).sort()
              const colMap = classificationMappings[col] ?? {}
              const fieldDef = fieldDefs.find((d) => d.name === fieldMappings[col])
              return (
                <div key={col}>
                  <p className="text-sm font-medium mb-1">
                    Classification values — <span className="font-mono">{col}</span>
                    <span className="text-muted-foreground font-normal"> → {fieldDef?.label ?? fieldDef?.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Match each Excel value to an Aprimo classification.
                  </p>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Excel value</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Aprimo classification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {values.map((val, i) => (
                          <tr key={val} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                            <td className="px-4 py-2 font-mono text-xs">{val}</td>
                            <td className="px-4 py-2">
                              <ClassificationCombobox
                                classifications={classifications}
                                value={colMap[val] ?? ""}
                                onChange={(id) => setClassificationMapping(col, val, id)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
