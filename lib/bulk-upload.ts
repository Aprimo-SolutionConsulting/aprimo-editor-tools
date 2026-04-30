export type SupportedDataType = "SingleLineText" | "MultiLineText" | "ClassificationList" | "Numeric"
export type Scope = "shared" | "per-asset"

export interface ClassificationSelection {
  id: string
  label: string
}

export interface ColDef {
  uid: string
  fieldId: string
  fieldName: string
  label: string
  dataType: SupportedDataType
  rootId: string | null
  acceptMultiple: boolean
  scope: Scope
  sharedTextValue: string
  sharedClassifications: ClassificationSelection[]
}

export interface CellValue {
  textValue: string
  classifications: ClassificationSelection[]
}

export interface UploadItem {
  uid: string
  file: File
  thumbnailUrl: string | null
  values: Record<string, CellValue>
  progress: number
  status: "pending" | "uploading" | "creating" | "done" | "error"
  recordId?: string
  error?: string
}

export const newUid = () => Math.random().toString(36).slice(2)
export const emptyCell = (): CellValue => ({ textValue: "", classifications: [] })
