/**
 * Every code a result line can carry, each with its one wording, what is needed and the fix
 * (MSG-1). The wording is written here and nowhere else: a line's `message` is always made by
 * its code's `says`, so one code cannot be worded two ways (AU4-1). A finding's wording is its
 * check's own (`checks/messages.ts`, `planCheckWordings`), so the report, the notes and the
 * record say the same words.
 *
 * Changing a wording here changes it everywhere at once, and goes in the contract's changelog
 * (`docs/result-contract.md`). A code is never reused for another meaning.
 *
 * Plain English, never anything that reads as "this plan complies".
 */

import { figureText, planCheckWordings, tolerance, wordingText } from '@ongrid/floorplan/geometry'
import { quoted } from '@ongrid/floorplan/types/floorplan'
import { wordings as figureWordings } from '../checks/messages'
import type { AppliedFigure, NotChecked, RuleFinding } from '../checks/types'

/** What a line's code is told about the thing, to word it. */
export interface Subject {
  /** The thing as the line names it: `Wall "w1"`, `Room "Kitchen"`, `Floor "Ground"`, `The plan`. */
  readonly label: string
  /** The name of the room or floor alone, as the plan writes it (the id when it has none). */
  readonly name: string
  /** The floor's name, as the plan writes it. Empty for a line about the whole plan. */
  readonly floorName: string
  /** The check's own sentence about the thing, word for word. Empty when there is none. */
  readonly said: string
  /** The ids of the other parts the line names. */
  readonly also: readonly string[]
  /** The names of the rooms a finding or notice names, as the plan writes them. */
  readonly names: readonly string[]
  /** How many floors the plan has. */
  readonly floors: number
  readonly finding?: RuleFinding
  readonly notice?: NotChecked
  /** The country the check was asked about, as stated. Empty when none was. */
  readonly country: string
  /** On a refusal: the place in the file, as `walls[2].thickness`. */
  readonly place?: string
  /** On a refusal: what the format wants there, in words. */
  readonly wants?: string
}

export interface CodeEntry {
  /** The one wording. */
  readonly says: (s: Subject) => string
  /** What was found. The check's own sentence when not given. */
  readonly found?: (s: Subject) => string
  readonly needed: (s: Subject) => string
  readonly fix: (s: Subject) => string
}

const fixed = (text: string) => (): string => text
const FAR = tolerance('farFromOrigin')
const TIDY = 'grid tidy lists this fault and can make the fix it names. Otherwise correct the walls by hand.'
const SIZE_QUESTION = 'If the size is meant, leave it. If not, correct it: every size is in metres.'

/** A figure a finding applied, by key, as "6.5 m²". */
function figure(finding: RuleFinding | undefined, key: AppliedFigure['key']): string | null {
  const found = finding?.figures?.find((f) => f.key === key)
  return found === undefined ? null : `${figureText(found.value)} ${found.unit}`
}

const area = (value: number | undefined): string => (value === undefined ? 'its area as drawn' : `${figureText(value)} m²`)
const metres = (value: number | undefined): string => (value === undefined ? 'as drawn' : `${figureText(value)} m`)

/** The rooms a route finding opens into, by id. */
function through(finding: RuleFinding | undefined): string {
  const rooms = [...new Set((finding?.through ?? []).map((step) => step.room))]
  return rooms.length === 0 ? 'no door or opening that leads on' : `it opens only into ${rooms.map(quoted).join(', ')}`
}

export const CODES = {
  // --- Reading: the plan could not be read, so nothing else ran ---------------------------------
  'plan/not-json': {
    says: fixed('The plan is not JSON'),
    found: (s) => s.said,
    needed: fixed('a plan file in JSON'),
    fix: fixed('Write the plan as one JSON object with walls, rooms and openings.')
  },
  'plan/not-an-object': {
    says: fixed('The plan is not a JSON object'),
    found: fixed('JSON that is not an object'),
    needed: fixed('one JSON object with walls, rooms and openings'),
    fix: fixed('Write the plan as one JSON object with walls, rooms and openings.')
  },
  'plan/missing-field': {
    says: (s) => `${s.label} is missing a field the format needs`,
    found: (s) => `nothing at ${s.place}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Add ${s.place}.`
  },
  'plan/wrong-type': {
    says: (s) => `${s.label} has a field of the wrong type`,
    found: (s) => s.said,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Write ${s.place} as ${s.wants}.`
  },
  'plan/unknown-word': {
    says: (s) => `${s.label} has a word the format does not know`,
    found: (s) => `a word the format does not know at ${s.place}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Write ${s.place} as one of the words the format knows, letter for letter.`
  },
  'plan/out-of-range': {
    says: (s) => `${s.label} has a value out of range`,
    found: (s) => `a value out of range at ${s.place}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Correct ${s.place}. Sizes are in metres.`
  },
  'plan/not-in-format': {
    says: (s) => `${s.label} has a field the format cannot read`,
    found: (s) => `${s.place}: ${s.said}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Correct ${s.place}.`
  },

  // --- Grid itself ----------------------------------------------------------------------------
  'plan/check-failed': {
    says: fixed('A check could not run on this plan: something went wrong inside Grid'),
    needed: fixed('the check to run to the end'),
    fix: fixed('Nothing to change in the plan for this line. The other lines still hold; tell the people who make Grid.')
  },

  // --- The plan as a whole --------------------------------------------------------------------
  'plan/far-from-origin': {
    says: fixed(`The plan reaches more than ${FAR} m from the origin`),
    needed: fixed(`every point within ${FAR} m of the origin (0, 0)`),
    fix: fixed('Check the units and look for a slipped coordinate. If the plan is in map or survey coordinates, move it so it starts near the origin.')
  },
  'plan/duplicate-id': {
    says: (s) => `Id ${s.label} names more than one wall, room or opening`,
    needed: fixed('every id on one wall, room or opening only'),
    fix: fixed('Rename all but one, and update what should point at the renamed one. Until then all of them are left out.')
  },
  'plan/similar-floor-id': {
    says: (s) => `${s.label} has an id that differs from another floor's only in capitals or spaces`,
    needed: fixed('floor ids that differ in more than capitals or spaces'),
    fix: fixed('Use one spelling for one floor, or give the two floors ids that tell them apart.')
  },
  'plan/duplicate-floor': {
    says: (s) => `${s.label} is listed more than once`,
    needed: fixed('each floor listed once'),
    fix: fixed('Remove the second entry, or give that floor its own id. Grid uses the first entry.')
  },
  'plan/units-question': {
    says: fixed('The plan may not be in metres'),
    needed: fixed('every length in metres'),
    fix: fixed('If the plan was typed in another unit, multiply every length so it reads in metres, as the line found says.')
  },

  // --- Walls ----------------------------------------------------------------------------------
  'wall/too-large': {
    says: (s) => `${s.label} has a number Grid does not accept`,
    needed: fixed('finite numbers within the size Grid accepts'),
    fix: fixed('Correct the number. Every size is in metres.')
  },
  'wall/zero-length': {
    says: (s) => `${s.label} has no length`,
    needed: fixed('a start and an end at different points'),
    fix: fixed('Give the wall two different points, or remove it.')
  },
  'wall/no-thickness': {
    says: (s) => `${s.label} has no thickness`,
    needed: fixed('a thickness above 0, or a virtual wall for a line with no substance'),
    fix: fixed('Give it its thickness, or mark it virtual.')
  },
  'wall/no-height': {
    says: (s) => `${s.label} has no height`,
    needed: fixed('a height above 0, or a virtual wall for a line with no substance'),
    fix: fixed('Give it its height, or mark it virtual.')
  },
  'wall/unknown-floor': {
    says: (s) => `${s.label} is on a floor the plan does not list`,
    needed: fixed("a floor from the plan's floors"),
    fix: fixed('Add the floor to the floors list, or put the wall on a floor it lists.')
  },
  'wall/kind-differs': {
    says: (s) => `${s.label} is stated as one kind, but the rooms on its sides show another`,
    needed: fixed('a kind that matches the rooms on its sides'),
    fix: fixed('Leave out its kind, or state the kind the rooms beside it show.')
  },
  'wall/size-question': {
    says: (s) => `${s.label} has a size that may not be meant`,
    needed: fixed('the size of a wall in a building'),
    fix: fixed(`${SIZE_QUESTION} A line on the floor with no substance is a virtual wall.`)
  },
  'wall/short': {
    says: (s) => `${s.label} stops short of a corner`,
    needed: fixed('wall ends that meet at the corner'),
    fix: fixed(TIDY)
  },
  'wall/gap': {
    says: (s) => `${s.label} leaves a gap in a straight side of a room`,
    needed: fixed('the walls of a side meeting end to end'),
    fix: fixed(TIDY)
  },
  'wall/overrun': {
    says: (s) => `${s.label} runs past its corner`,
    needed: fixed('a wall that ends at its corner'),
    fix: fixed(TIDY)
  },
  'wall/duplicate': {
    says: (s) => `${s.label} lies over another wall`,
    needed: fixed('each wall drawn once'),
    fix: fixed(TIDY)
  },
  'wall/line-on-wall': {
    says: (s) => `${s.label} is a dividing line drawn over a wall`,
    needed: fixed('a wall or a dividing line, not both'),
    fix: fixed(TIDY)
  },
  'wall/crosses-room': {
    says: (s) => `${s.label} runs across a room that does not list it`,
    needed: fixed('every wall across a room listed by the rooms on its sides'),
    fix: fixed(TIDY)
  },
  'wall/stands-in-room': {
    says: (s) => `${s.label} stands inside a room that does not list it`,
    needed: fixed('a wall inside a room drawn as part of a room'),
    fix: fixed('If it is a room inside the room (a pod, a cupboard, a column), draw that room and mark it "inside". Otherwise remove the wall or move it.')
  },

  // --- Openings -------------------------------------------------------------------------------
  'opening/too-large': {
    says: (s) => `${s.label} has a number Grid does not accept`,
    needed: fixed('finite numbers within the size Grid accepts'),
    fix: fixed('Correct the number. Every size is in metres.')
  },
  'opening/broken-wall': {
    says: (s) => `${s.label} is on a wall that cannot be drawn`,
    needed: fixed('a wall that can be drawn'),
    fix: fixed('Correct its wall first: this line goes away with it.')
  },
  'opening/missing-wall': {
    says: (s) => `${s.label} is on a wall that is not in the plan`,
    needed: fixed('the id of a wall in the plan'),
    fix: fixed('Name a wall the plan has, letter for letter, or add the wall.')
  },
  'opening/degenerate': {
    says: (s) => `${s.label} has no size`,
    needed: fixed('a width and a height above 0'),
    fix: fixed('Give it its width and its height.')
  },
  'opening/out-of-wall': {
    says: (s) => `${s.label} runs off its wall`,
    needed: fixed("its offset and width within the wall's length"),
    fix: fixed('Move it along the wall, or make it narrower, as the line found says.')
  },
  'opening/too-tall': {
    says: (s) => `${s.label} reaches above the top of its wall`,
    needed: fixed('its sill and height together no higher than the wall'),
    fix: fixed('Lower its height or its sill.')
  },
  'opening/negative-sill': {
    says: (s) => `${s.label} has its sill below the floor`,
    needed: fixed('a sill at 0 or above'),
    fix: fixed('Set the sill at the floor (0) or above.')
  },
  'opening/overlap': {
    says: (s) => `${s.label} overlaps another opening on its wall`,
    needed: fixed('openings on one wall that share no part of it'),
    fix: fixed('Move one of them along the wall, or make one narrower. Until then the later one is left out.')
  },
  'opening/size-question': {
    says: (s) => `${s.label} has a size that may not be meant`,
    needed: fixed('the size of a door or window in a building'),
    fix: fixed(SIZE_QUESTION)
  },
  'opening/swing-without-hinge': {
    says: (s) => `${s.label} says which way it opens but not which side it hangs on`,
    found: fixed('a swing and no hinge, so it is drawn without a swing and its sweep is not checked'),
    needed: fixed('both its hinge ("start" or "end") and its swing ("left" or "right")'),
    fix: fixed('Add its hinge, or leave out its swing.')
  },
  'opening/hinge-without-swing': {
    says: (s) => `${s.label} says which side it hangs on but not which way it opens`,
    found: fixed('a hinge and no swing, so it is drawn without a swing and its sweep is not checked'),
    needed: fixed('both its hinge ("start" or "end") and its swing ("left" or "right")'),
    fix: fixed('Add its swing, or leave out its hinge.')
  },
  'opening/door-blocked': {
    says: (s) => `${s.label} hits a wall when it opens`,
    found: (s) => `its leaf sweeps into ${s.also.length === 1 ? 'wall' : 'walls'} ${s.also.map(quoted).join(', ')}`,
    needed: fixed('floor clear of walls where its leaf swings'),
    fix: fixed('Hang it from its other end, open it the other way, or move it clear of that wall.')
  },
  'opening/doors-collide': {
    says: (s) => `${s.label} hits another door when they open`,
    found: (s) => `its leaf and the leaf of door ${s.also.map(quoted).join(', ')} sweep the same floor`,
    needed: fixed('door sweeps that do not overlap'),
    fix: fixed('Turn one of them to open the other way or hang it from its other end, or move them apart.')
  },

  // --- Rooms ----------------------------------------------------------------------------------
  'room/unknown-floor': {
    says: (s) => `${s.label} is on a floor the plan does not list`,
    needed: fixed("a floor from the plan's floors"),
    fix: fixed('Add the floor to the floors list, or put the room on a floor it lists.')
  },
  'room/cross-floor': {
    says: (s) => `${s.label} rests on a wall of another floor`,
    needed: fixed('every wall it lists on its own floor'),
    fix: fixed('Put the room on the floor of its walls, or list walls of its own floor.')
  },
  'room/broken-wall': {
    says: (s) => `${s.label} rests on a wall that cannot be drawn`,
    needed: fixed('walls that can be drawn'),
    fix: fixed('Correct those walls first: this line goes away with them.')
  },
  'room/empty': {
    says: (s) => `${s.label} encloses no floor`,
    needed: fixed('walls that enclose some floor'),
    fix: fixed('Check that it lists the walls that surround it, and that they are not thicker than the room is wide.')
  },
  'room/unclosed': {
    says: (s) => `${s.label} cannot be closed from the walls it lists`,
    needed: fixed('at least three walls in the plan, each meeting the next, round the room'),
    fix: fixed('List the walls in order round the room, each touching the next. A side open to another room is a virtual wall.')
  },
  'room/out-of-order': {
    says: (s) => `${s.label} lists its walls out of order`,
    needed: fixed('its walls in order round the room, each meeting the next'),
    fix: fixed('List the walls in order round the room, each touching the next.')
  },
  'room/inside-out': {
    says: (s) => `${s.label} has walls thicker than the gap between them`,
    needed: fixed('inner wall faces that do not cross'),
    fix: fixed('Move the walls apart or make them thinner.')
  },
  'room/not-enclosed': {
    says: (s) => `${s.label} is not enclosed by its walls`,
    needed: fixed('walls that reach each other round the room'),
    fix: fixed('Check that its walls reach each other.')
  },
  'room/space-mismatch': {
    says: (s) => `${s.label} does not match the space its walls enclose`,
    needed: fixed('a room that covers the space its walls close off, and no more'),
    fix: fixed('List the walls that close the room, as the line found says, or draw the rest as a room of its own.')
  },
  'room/inside-no-host': {
    says: (s) => `${s.label} is marked as inside another room, but no room holds it`,
    needed: fixed('a room on its floor that holds it'),
    fix: fixed('Draw it within the room it sits in, or leave out "inside".')
  },
  'room/overlap': {
    says: (s) => `${s.label} overlaps another room`,
    needed: fixed('rooms that share no floor, or one marked inside the other'),
    fix: fixed('Move the wall between them, or mark the smaller one "inside" if it sits within the larger.')
  },
  'room/overlap-unknown': {
    says: (s) => `${s.label} could not be compared with another room to see whether they overlap`,
    needed: fixed('room outlines Grid can compare'),
    fix: fixed('Correct the walls of the two rooms; the comparison runs once their outlines can be worked out.')
  },
  'room/wall-listed-twice': {
    says: (s) => `${s.label} lists a wall more than once`,
    needed: fixed('each wall once in its list'),
    fix: fixed(TIDY)
  },
  'room/size-question': {
    says: (s) => `${s.label} has a size that may not be meant`,
    needed: fixed('the size of a room in a building'),
    fix: fixed(`${SIZE_QUESTION} Check its walls' coordinates and thickness.`)
  },

  // --- Floors ---------------------------------------------------------------------------------
  'floor/unclaimed': {
    says: (s) => `${s.label} has enclosed floor that no room claims`,
    needed: fixed('every enclosed floor in a room'),
    fix: fixed("If it is a room, draw it as one. If it is part of a room, list the walls that take it into that room's outline.")
  },
  'floor/spaces-unknown': {
    says: (s) => `The spaces the walls enclose on ${s.label.replace(/^Floor/, 'floor')} could not be worked out`,
    needed: fixed('walls Grid can join into spaces'),
    fix: fixed('Correct the walls the other lines name. Floor no room claims is looked for once the spaces can be worked out.')
  },
  'floor/overlaps-unknown': {
    says: (s) => `The rooms on ${s.label.replace(/^Floor/, 'floor')} were not all compared to see whether they overlap`,
    needed: fixed('fewer pairs of rooms lying over each other'),
    fix: fixed('Correct the overlaps already listed. The rest are compared once there are fewer.')
  },

  // --- Findings of the plan checks --------------------------------------------------------------
  'floor/no-exit': {
    says: (s) => wordingText(planCheckWordings.noExit(s.floorName)),
    found: fixed('no door or opening on this floor leads outside'),
    needed: fixed('at least one door to the outside'),
    fix: fixed('Add a door in an outside wall, or mark the wall a door is in as exterior if it leads outside.')
  },
  'room/no-door': {
    says: (s) => wordingText(planCheckWordings.roomWithoutDoor(s.name)),
    found: fixed('no door, opening or open side'),
    needed: fixed('a door, an opening or an open side to another space'),
    fix: fixed('Add a door or an opening in a wall it shares with another room, or make an open side a virtual wall.')
  },
  'room/no-route-out': {
    says: (s) => wordingText(planCheckWordings.noRoute(s.name)),
    found: (s) => through(s.finding),
    needed: fixed('a route through doors and openings to a door to the outside'),
    fix: fixed('Add a door from it, or from a room it opens into, toward a room that reaches the outside.')
  },
  'room/no-route-to-door-out': {
    says: (s) => wordingText(planCheckWordings.noRouteToAnyDoorOut(s.name)),
    found: (s) => through(s.finding),
    needed: fixed('a route to a door to the outside, or to the door into the space not drawn'),
    fix: fixed('Add a door from it, or from a room it opens into, toward the way out.')
  },
  'opening/to-undrawn-space': {
    says: (s) => wordingText(planCheckWordings.doorToUndrawnSpace(s.name)),
    found: fixed('no room and no outside wall on the far side of the door'),
    needed: fixed('a room, or the outside, on the far side'),
    fix: fixed('If that space is a shared landing or a stair, draw it as a room. If the door leads outside, mark its wall as exterior.')
  },
  'room/too-small': {
    says: (s) => wordingText(figureWordings.roomTooSmall(s.name, s.finding?.minimum ?? 0)),
    found: (s) => `${area(s.finding?.area)} net`,
    needed: (s) => `at least ${area(s.finding?.minimum)}`,
    fix: fixed('Make the room larger, or check the use it is given.')
  },
  'room/no-escape-opening': {
    says: (s) => wordingText(figureWordings.noEscapeOpening(s.name)),
    found: fixed('no window or door in an outside wall'),
    needed: fixed('a window or door to the outside that someone can climb through'),
    fix: fixed('Add a window or a door in one of its outside walls.')
  },
  'room/escape-window-too-small': {
    says: (s) => wordingText(figureWordings.escapeWindowTooSmall(s.name)),
    found: (s) => `${area(s.finding?.area)} as drawn, ${metres(s.finding?.width)} wide and ${metres(s.finding?.height)} high`,
    needed: (s) => {
      const parts = [
        s.finding?.minimum === undefined ? null : `${area(s.finding.minimum)}`,
        figure(s.finding, 'escapeOpeningMinWidth') === null ? null : `${figure(s.finding, 'escapeOpeningMinWidth')} wide`,
        figure(s.finding, 'escapeOpeningMinHeight') === null ? null : `${figure(s.finding, 'escapeOpeningMinHeight')} high`
      ].filter((part): part is string => part !== null)
      return parts.length === 0 ? 'a window someone can climb through' : `at least ${parts.join(', ')}`
    },
    fix: fixed('Make the window larger, or add one that is.')
  },
  'room/escape-window-too-high': {
    says: (s) => wordingText(figureWordings.escapeWindowTooHigh(s.name)),
    found: (s) => `a sill ${metres(s.finding?.sill)} above the floor`,
    needed: (s) => (s.finding?.maximum === undefined ? 'a lower sill' : `a sill at most ${metres(s.finding.maximum)} above the floor`),
    fix: fixed("Lower the window's sill.")
  },

  // --- What a check could not look at -----------------------------------------------------------
  'floor/not-checked-no-stairs': {
    says: (s) => wordingText(planCheckWordings.noStairs(s.floorName)),
    found: fixed('a floor off the ground, and no stairs in the plan'),
    needed: fixed('stairs, which the plan cannot hold yet'),
    fix: fixed('Nothing to change in the plan: Grid does not yet check the way down from an upper floor.')
  },
  'floor/not-checked-way-out-not-drawn': {
    says: (s) => wordingText(planCheckWordings.wayOutNotDrawn(s.floorName)),
    found: fixed('its only doors out lead to a space that is not drawn'),
    needed: fixed('the space beyond its doors drawn as a room, or a door to the outside'),
    fix: fixed('If that space is a shared landing or a stair, draw it as a room.')
  },
  'floor/not-checked-rooms-not-drawn': {
    says: (s) => wordingText(planCheckWordings.roomsNotDrawn(s.floorName, s.names)),
    found: fixed('rooms that cannot be drawn'),
    needed: fixed('rooms that can be drawn'),
    fix: fixed('Correct the lines that leave those rooms out; they are checked once they can be drawn.')
  },
  'floor/not-checked-doors-not-drawn': {
    says: (s) => wordingText(planCheckWordings.doorsNotDrawn(s.floorName)),
    found: fixed('doors that cannot be drawn'),
    needed: fixed('doors that can be drawn'),
    fix: fixed('Correct the lines that leave those doors out; the routes are checked once they can be drawn.')
  },
  'floor/not-checked-no-use': {
    says: (s) => wordingText(figureWordings.noUse(s.floorName, s.names.length)),
    found: fixed('rooms with no use stated'),
    needed: fixed('a use on every room (bedroom, living, dining and so on)'),
    fix: fixed('State what each room is for.')
  },
  'plan/not-checked-sizes-for-place': {
    says: (s) => wordingText(figureWordings.noFiguresForPlace('Room sizes', s.country)),
    found: (s) => `a plan for ${s.country}, and figures carried for the US only`,
    needed: fixed('figures for the place, looked up and given to the check'),
    fix: fixed('Look up the figures for the place and give them to the check, or read the local rules.')
  },
  'plan/not-checked-escapes-for-place': {
    says: (s) => wordingText(figureWordings.noFiguresForPlace('Escape openings', s.country)),
    found: (s) => `a plan for ${s.country}, and figures carried for the US only`,
    needed: fixed('figures for the place, looked up and given to the check'),
    fix: fixed('Look up the figures for the place and give them to the check, or read the local rules.')
  }
} as const satisfies Record<string, CodeEntry>

export type LineCode = keyof typeof CODES

export function isLineCode(code: string): code is LineCode {
  return Object.hasOwn(CODES, code)
}
