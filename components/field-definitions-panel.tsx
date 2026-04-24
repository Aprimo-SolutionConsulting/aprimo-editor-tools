"use client"

import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { AprimoRecord, FieldDef } from "@/models/aprimo"

interface FieldDefinitionsPanelProps {
  fieldDefs: FieldDef[]
  selectedFields: Set<string>
  toggleField: (name: string) => void
  recordIds: string[]
  fetchRecords: (ids: string[], fields: string[]) => Promise<AprimoRecord[]>
  setRecords: (records: AprimoRecord[]) => void
  setTableFields: (fields: string[]) => void
  setError: (error: string | null) => void
  exporting: boolean
  onExport: () => void
}

export function FieldDefinitionsPanel({
  fieldDefs,
  selectedFields,
  toggleField,
  recordIds,
  fetchRecords,
  setRecords,
  setTableFields,
  setError,
  exporting,
  onExport,
}: FieldDefinitionsPanelProps) {
  const [open, setOpen] = useState(false)

  if (fieldDefs.length === 0) return null

  const grouped = Object.entries(
    fieldDefs.reduce<Record<string, FieldDef[]>>((groups, def) => {
      const key = def.dataType ?? "Other"
      ;(groups[key] ??= []).push(def)
      return groups
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  async function handleAddToTable() {
    const fields = Array.from(selectedFields)
    setTableFields(Array.from(selectedFields))
    setError(null)
    try {
      const fetched = await fetchRecords(recordIds, fields)
      setRecords(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed")
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-6 border rounded-lg print:hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        Field Definitions ({fieldDefs.length})
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="h-64 border-t px-4 py-3">
          {grouped.map(([dataType, defs]) => (
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
              onClick={handleAddToTable}
              disabled={!selectedFields.size || !recordIds.length}
            >
              Add to Table
            </Button>
            <Button
              size="sm"
              onClick={onExport}
              disabled={exporting || !recordIds.length}
            >
              {exporting ? "Exporting…" : "Fetch & Export to Excel"}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
