import type { PlanDrawing } from '@ongrid/core/geometry'

/**
 * The selection, as far as the drawing agrees it exists.
 *
 * Derived rather than synchronised: nothing has to remember to clear the
 * selection when the floor changes or when the assistant rewrites the plan and
 * deletes what was selected. If it is not being drawn, it is not selected.
 */
export function retainSelection(drawing: PlanDrawing, selectedId: string | null): string | null {
  if (!selectedId) return null

  const present =
    drawing.walls.some((wall) => wall.id === selectedId) ||
    drawing.rooms.some((room) => room.id === selectedId) ||
    drawing.openings.some((opening) => opening.id === selectedId)

  return present ? selectedId : null
}
