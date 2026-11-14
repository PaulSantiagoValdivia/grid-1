import type { PlanOpening, PlanRoom, PlanWall } from '@ongrid/core/geometry'
import { pathOf } from './viewport'

/**
 * The shapes the canvas draws for rooms, walls and openings.
 *
 * They exist so the current plan and the ghosts of the version before are
 * drawn by the same code: a ghost wall is a wall, and only the attributes around
 * it differ. The caller decides who the shape is (`data-id`, selection, diff
 * markers) through `attrs`; geometry and `data-part` come from here.
 */

export type ShapeAttrs = Readonly<Record<string, string | boolean | undefined>>

export function RoomShape({ room, attrs }: { room: PlanRoom; attrs: ShapeAttrs }): JSX.Element {
  return <path d={pathOf(room.polygon)} data-part="room" {...attrs} />
}

/** A solid wall is one path per run between its openings; a virtual wall is a line. */
export function WallShape({ wall, attrs }: { wall: PlanWall; attrs: ShapeAttrs }): JSX.Element {
  if (wall.virtual) {
    return (
      <path
        d={`M${wall.centerline.map((p) => `${p.x},${-p.y}`).join('L')}`}
        data-part="virtual"
        {...attrs}
      />
    )
  }
  return (
    <g>
      {wall.slices.map((slice, index) => (
        <path
          key={index}
          d={pathOf(slice)}
          data-part="wall"
          data-exposure={wall.exposure}
          {...attrs}
        />
      ))}
    </g>
  )
}

export function OpeningShape({
  opening,
  attrs
}: {
  opening: PlanOpening
  attrs: ShapeAttrs
}): JSX.Element {
  const nx = (opening.normal.x * opening.thickness) / 2
  const ny = (opening.normal.y * opening.thickness) / 2
  return (
    <path
      d={pathOf([
        { x: opening.from.x + nx, y: opening.from.y + ny },
        { x: opening.to.x + nx, y: opening.to.y + ny },
        { x: opening.to.x - nx, y: opening.to.y - ny },
        { x: opening.from.x - nx, y: opening.from.y - ny }
      ])}
      data-part="opening"
      data-type={opening.type}
      {...attrs}
    />
  )
}
