import type { ClassificationNode } from "@/models/aprimo"

export interface ClassificationTreeNode extends ClassificationNode {
  children: ClassificationTreeNode[]
}

export function buildClassificationTree(
  rootId: string,
  classifications: ClassificationNode[]
): ClassificationTreeNode | null {
  const root = classifications.find((c) => c.id === rootId)
  if (!root) return null

  const childrenByParentId = new Map<string, ClassificationNode[]>()
  for (const c of classifications) {
    if (!c.parentId) continue
    const siblings = childrenByParentId.get(c.parentId) ?? []
    siblings.push(c)
    childrenByParentId.set(c.parentId, siblings)
  }

  function build(node: ClassificationNode): ClassificationTreeNode {
    const children = (childrenByParentId.get(node.id) ?? [])
      .sort((a, b) => (a.labelPath || a.name).localeCompare(b.labelPath || b.name))
      .map(build)
    return { ...node, children }
  }

  return build(root)
}

export interface FlatNode {
  id: string
  label: string
  depth: number
}

export function flattenForPicker(tree: ClassificationTreeNode, depth = 0): FlatNode[] {
  const result: FlatNode[] = [{ id: tree.id, label: tree.name, depth }]
  for (const child of tree.children) result.push(...flattenForPicker(child, depth + 1))
  return result
}

export function flattenTree(tree: ClassificationTreeNode): ClassificationTreeNode[] {
  const result: ClassificationTreeNode[] = []
  function walk(node: ClassificationTreeNode) {
    result.push(node)
    for (const child of node.children) walk(child)
  }
  walk(tree)
  return result
}
