import ExcelJS from "exceljs"
import type { AprimoRecord, FieldDef, FieldValueContext } from "@/models/aprimo"

function getThumbnailUri(record: AprimoRecord): string | undefined {
  return record._embedded?.masterfilelatestversion?._embedded?.thumbnail?.uri
}

function getFieldValue(record: AprimoRecord, fieldName: string, ctx?: FieldValueContext): string {
  const field = record._embedded?.fields?.items?.find((f) => f.fieldName === fieldName)
  if (!field?.localizedValues?.[0]) return ""
  const lv = field.localizedValues[0]
  if (field.dataType === "ClassificationList" && Array.isArray(lv.values)) {
    return lv.values
      .map((id) => {
        const node = ctx?.classificationsById?.get(id)
        if (!node) return id
        if (ctx?.selectedLanguageId === "__system__") return node.name || id
        const langLabel = ctx?.selectedLanguageId
          ? node.labels?.find((l) => l.languageId === ctx.selectedLanguageId)?.value
          : undefined
        return langLabel || node.labelPath || node.name || id
      })
      .join("; ")
  }
  if (field.dataType === "OptionList" && Array.isArray(lv.values)) {
    const items = ctx?.optionItemsByField?.get(fieldName)
    return lv.values
      .map((id) => {
        const item = items?.find((item) => item.id === id)
        if (!item) return id
        if (ctx?.selectedLanguageId === "__system__") return item.name || id
        return item.label || id
      })
      .join("; ")
  }
  if (Array.isArray(lv.values)) return lv.values.join("; ")
  return lv.value ?? ""
}

export async function exportToExcel(
  records: AprimoRecord[],
  extraFields: string[],
  fieldDefs: FieldDef[],
  ctx: FieldValueContext
) {
  const labelFor = (name: string) => fieldDefs.find((d) => d.name === name)?.label ?? name

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Records")

  worksheet.columns = [
    { header: "", key: "thumb", width: 22 },
    { header: "ID", key: "id", width: 36 },
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
    row.getCell("contentType").value = record.contentType ?? ""
    row.getCell("status").value = record.status ?? ""
    for (const field of extraFields) {
      row.getCell(field).value = getFieldValue(record, field, ctx)
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
