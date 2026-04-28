"use client"

import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { FieldDef } from "@/models/aprimo"

interface Props {
  fieldDefs: FieldDef[]
  value: string | null
  onChange: (id: string, label: string, dataType: string) => void
  dataTypes: string[]
}

export function FieldDefinitionSearch({ fieldDefs, value, onChange, dataTypes }: Props) {
  const filtered = fieldDefs.filter((d) => dataTypes.includes(d.dataType))
  return (
    <Command>
      <CommandInput placeholder="Search fields…" className="text-sm" />
      <CommandList className="max-h-64">
        <CommandEmpty>No fields found.</CommandEmpty>
        <CommandGroup>
          {filtered.map((d) => (
            <CommandItem
              key={d.id}
              value={d.label ?? d.name}
              onSelect={() => onChange(d.id, d.label ?? d.name, d.dataType)}
              className="text-sm"
            >
              <Check className={`mr-2 h-4 w-4 ${value === d.id ? "opacity-100" : "opacity-0"}`} />
              {d.label ?? d.name}
              <Badge variant="secondary" className="ml-auto text-xs">{d.dataType}</Badge>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
