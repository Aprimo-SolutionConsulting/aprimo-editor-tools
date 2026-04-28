"use client"

import { useState, useMemo } from "react"
import { ChevronsUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { ClassificationNode } from "@/models/aprimo"
import type { ClassificationSelection } from "@/lib/bulk-upload"
import { buildClassificationTree, flattenForPicker } from "@/lib/classifications"

interface Props {
  rootId: string | null
  acceptMultiple: boolean
  allClassifications: ClassificationNode[]
  value: ClassificationSelection[]
  onChange: (next: ClassificationSelection[]) => void
  disabled?: boolean
}

export function ClassificationValuePicker({
  rootId,
  acceptMultiple,
  allClassifications,
  value,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)

  const flatNodes = useMemo(() => {
    if (rootId) {
      const tree = buildClassificationTree(rootId, allClassifications)
      if (tree) return flattenForPicker(tree)
    }
    return allClassifications.map((c) => ({ id: c.id, label: c.labelPath || c.name, depth: 0 }))
  }, [rootId, allClassifications])

  const selectedIds = new Set(value.map((v) => v.id))

  function toggle(id: string, label: string) {
    if (acceptMultiple) {
      onChange(selectedIds.has(id) ? value.filter((v) => v.id !== id) : [...value, { id, label }])
    } else {
      if (selectedIds.has(id)) {
        onChange([])
      } else {
        onChange([{ id, label }])
        setOpen(false)
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-8 w-full max-w-xs justify-between text-xs font-normal"
        >
          <span className="truncate">
            {value.length === 0
              ? "Select…"
              : value.length === 1
              ? value[0].label
              : `${value.length} selected`}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">No match.</CommandEmpty>
            <CommandGroup>
              {flatNodes.map((n) => (
                <CommandItem
                  key={n.id}
                  value={n.label}
                  onSelect={() => toggle(n.id, n.label)}
                  className="text-xs"
                  style={{ paddingLeft: `${0.5 + n.depth}rem` }}
                >
                  <Check className={`mr-1 h-3 w-3 shrink-0 ${selectedIds.has(n.id) ? "opacity-100" : "opacity-0"}`} />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
