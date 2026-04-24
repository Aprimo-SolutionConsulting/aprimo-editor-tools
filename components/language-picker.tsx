"use client"

import { useEffect, useState } from "react"
import { useAprimo } from "@/context/aprimo-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Language = {
  id: string
  name: string
  culture: string
  isEnabledForFields: boolean
}

export function LanguagePicker() {
  const { client, isConnected, selectedLanguageId, setSelectedLanguageId } = useAprimo()
  const [languages, setLanguages] = useState<Language[]>([])

  useEffect(() => {
    if (!client || !isConnected) {
      setLanguages([])
      return
    }

    async function loadLanguages() {
      const all: Language[] = []
      for await (const result of client!.languages.getPaged()) {
        if (!result.ok) break
        all.push(...(result.data?.items ?? []) as unknown as Language[])
      }
      const filtered = all.filter((l) => l.isEnabledForFields)
      setLanguages(filtered)
      if (filtered.length > 0 && !selectedLanguageId) {
        setSelectedLanguageId(filtered[0].id)
      }
    }

    loadLanguages()
  }, [client, isConnected])

  if (!isConnected || languages.length === 0) return null

  return (
    <Select value={selectedLanguageId ?? undefined} onValueChange={setSelectedLanguageId}>
      <SelectTrigger className="h-7 text-xs w-32 border-border">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__system__" className="text-xs">System Name</SelectItem>
        {languages.map((lang) => (
          <SelectItem key={lang.id} value={lang.id} className="text-xs">
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
