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

import { figureText, metresText, passageText, planCheckWordings, tolerance, wordingText, type PlanFix, type WordingPart } from '@ongrid/floorplan/geometry'
import { BUILDING_TYPE_TEXT, quoted } from '@ongrid/floorplan/types/floorplan'
import { RULE_READ_FOR } from '../checks/catalogue'
import { buildingKindsText, findingReadFor, type BuildingKind } from '../checks/figures'
import { wordings as figureWordings } from '../checks/messages'
import { figureNeededText } from '../checks/figureWords'
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
  /** CNT-13: the fixtures a line names, each as `kitchen run "k1"` (`itemName`). */
  readonly items?: readonly string[]
  /** How many floors the plan has. */
  readonly floors: number
  readonly finding?: RuleFinding
  readonly notice?: NotChecked
  /** Grid's name for the place the check was for, as a sentence writes it (`the United States`; COD-3), from its list, never as stated. Empty when there is none. */
  readonly country: string
  /** On a refusal: the place in the file, as `walls[2].thickness`. */
  readonly place?: string
  /** On a refusal: what the format wants there, in words. */
  readonly wants?: string
  /** MSG-7: the changes to the part that would clear the line, as data. */
  readonly fixes?: readonly PlanFix[]
  /** On a word Grid does not read (MSG-4): the word, quoted, or what it is when it is not repeated. */
  readonly word?: string
  /** On a word Grid does not read: the word Grid knows that was most likely meant. */
  readonly nearest?: string | null
  /** On a field Grid does not read: whether the part already has the field most likely meant. */
  readonly nearestWritten?: boolean
  /** On a word Grid does not read: what that place may hold, as `the fields of a wall: id, start, …`. */
  readonly known?: string
  /** MSG-6, on a value read as meant: what it was read as. */
  readonly read?: string
  /** MSG-6, on a value left out: the default used, or null when it is read as not stated. */
  readonly used?: string | null
  /** MSG-6, on a part left out for its id: the part that keeps the id, as a line names it. */
  readonly kept?: string
  /** MSG-6: an id no part has, to rename a part to. */
  readonly rename?: string
  /** MSG-6, on an unfinished merge: what each side adds or changes, in words. */
  readonly sides?: string
  /**
   * MSG-5, on a line that stands for the same note on several rooms (lab MS-14): their names, in
   * order, the first being `name`. The wording lists them where the one name goes.
   */
  readonly group?: readonly string[]
  /** MSG-5, on a "could not be drawn" line: the notes it holds back, in words; empty when none. */
  readonly heldSaid?: string
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
/** How a use reads in a sentence: "a bedroom". */
const USE_WORDS: Readonly<Record<string, string>> = { bedroom: 'a bedroom', living: 'a living room', dining: 'a dining room' }
/**
 * CNT-8: on a finding about a room with zones, the whole room and the use it was checked as,
 * with the zone it was read from when it is not the room's own. Empty on any other.
 */
const wholeRoom = (s: Subject): string => {
  const use = s.finding?.use
  if (use === undefined) return ''
  const as = USE_WORDS[use] ?? `a room used as ${use}`
  return `, the whole room with its zones, checked as ${as}${s.finding?.zone === undefined ? '' : `, the use of its zone ${quoted(s.names[1] ?? s.finding.zone)}`}`
}
/** A figure from a line's fixes (MSG-7), or null. */
const fixOf = (s: Subject, key: 'width' | 'offset' | 'height' | 'sill'): number | null => s.fixes?.find((f) => f[key] !== undefined)?.[key] ?? null
/** The wall most likely meant, from a line's fixes (MSG-7). */
const meantWall = (s: Subject): string | null => s.fixes?.find((f) => f.wall !== undefined)?.wall ?? null
const FAR = tolerance('farFromOrigin')
const TIDY = 'grid tidy lists this fault and can make the fix it names. Otherwise correct the walls by hand.'
const SIZE_QUESTION = 'If the size is meant, leave it. If not, correct it: every size is in metres.'

/**
 * MSG-5: how a finding's wording reads for several rooms at once, part by part: the words that
 * change, singular then plural. Applied only outside the names; a test reads a line's wording
 * back with the same table, so a line for several rooms keeps its code's one wording.
 */
export const PLURALS: readonly (readonly [singular: string, plural: string])[] = [
  ['The window of ', 'The windows of '],
  ['A door from ', 'Doors from '],
  ['An opening from ', 'Openings from '],
  [' has no ', ' have no '],
  [' is too ', ' are too '],
  [' is under ', ' are under '],
  [' leads ', ' lead '],
  ['so it is not a way', 'so they are not ways']
]

/**
 * A finding's one wording for its room, or, on a line for several rooms (MSG-5), with their
 * names listed where the one name goes and the words in `PLURALS` made plural.
 */
function named(s: Subject, parts: readonly WordingPart[]): string {
  const group = s.group ?? []
  if (group.length < 2) return wordingText(parts)
  let listed = false
  const plural = (text: string): string => PLURALS.reduce((out, [one, many]) => out.replace(one, many), text)
  return wordingText(
    parts.flatMap((part): WordingPart[] => {
      if (part.name !== true) return [{ text: plural(part.text) }]
      if (listed) return [part]
      listed = true
      return group.flatMap((name, i): WordingPart[] => (i === 0 ? [{ text: name, name: true }] : [{ text: ', ' }, { text: name, name: true }]))
    })
  )
}

/** "The door is 0.30 m wide" as "the door is 0.30 m wide". */
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * COD-2: after what a figure finding needed, the kind of building its figures were read for, as
 * "; this check's figures were read for homes (houses and flats people live in)".
 */
function readFor(s: Subject): string {
  const kinds = s.finding === undefined ? [] : findingReadFor(s.finding)
  return kinds.length === 0 ? '' : `; this check's figures were read for ${buildingKindsText(kinds)}`
}

/** CNT-5: the kind of building a `not_for_building` notice names, as a sentence names it: "an office". */
function buildingText(s: Subject): string {
  const building = s.notice?.building
  return building === undefined ? 'another kind of building' : BUILDING_TYPE_TEXT[building]
}

/** CNT-5: the kinds of building the figures of a notice's check were read for. */
function ruleReadFor(s: Subject): readonly BuildingKind[] {
  const rule = s.notice?.ruleId
  return rule === 'habitable-room-area' || rule === 'escape-opening' ? RULE_READ_FOR[rule] : []
}

const NOT_FOR_BUILDING_FIX =
  'Nothing to change in the plan if the kind of building is right: read how this is set out for that kind of building where it will be built. If it is not, correct the plan\'s building.'

/** A figure a finding applied, by key, as "6.5 m²". */
function figure(finding: RuleFinding | undefined, key: AppliedFigure['key']): string | null {
  const found = finding?.figures?.find((f) => f.key === key)
  return found === undefined ? null : `${figureText(found.value)} ${found.unit}`
}

/** The figures a finding applied, by key, in the order given: what its `needed` names (MSG-3). */
function figuresOf(finding: RuleFinding | undefined, keys: readonly AppliedFigure['key'][]): AppliedFigure[] {
  return keys.flatMap((key) => finding?.figures?.filter((f) => f.key === key) ?? [])
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

  // --- Reading: words Grid does not read (MSG-4). The plan is read without them --------------
  'plan/unknown-field': {
    says: (s) => `${s.label} has a field Grid does not know, ${s.word}`,
    found: (s) => `${s.word} at ${s.place}, which Grid does not read${s.nearest ? `; the nearest field it knows is ${quoted(s.nearest)}` : ''}`,
    needed: (s) => `one of ${s.known}`,
    fix: (s) =>
      s.nearest && s.nearestWritten
        ? `Did you mean ${quoted(s.nearest)}? It is there too, and is what Grid reads: take ${s.word} out, or move its value to ${quoted(s.nearest)}.`
        : s.nearest
        ? `Did you mean ${quoted(s.nearest)}? Rename ${s.word} to ${quoted(s.nearest)}. Until then Grid reads the plan without it.`
        : 'Grid has no field for this. Take it out, or say it with the fields listed. Until then Grid reads the plan without it.'
  },
  'plan/unknown-use': {
    says: (s) => `${s.label} has a use Grid does not know, ${s.word}`,
    found: (s) => `the use ${s.word} at ${s.place}, read as no use stated${s.nearest ? `; the nearest use Grid knows is ${quoted(s.nearest)}` : ''}`,
    needed: (s) => `one of ${s.known}`,
    fix: (s) =>
      `${s.nearest ? `Did you mean ${quoted(s.nearest)}? Write it if that is what the room is; if none of the uses fits, "other".` : 'If none of the uses Grid knows fits, write "other".'} Until then the room has no use, and the checks that need one skip it.`
  },
  'plan/empty': {
    says: fixed('The plan has nothing in it: no walls, rooms or openings'),
    found: fixed('no walls, no rooms and no openings'),
    needed: fixed('walls, and the rooms and openings they hold'),
    fix: fixed('Add the walls, rooms and openings, or write the plan from rooms text with grid write. If the file was meant to hold a plan, check it is the right file.')
  },
  'plan/unfinished-merge': {
    says: fixed('The plan holds an unfinished git merge'),
    found: (s) => s.said,
    needed: fixed('one plan, with the merge finished'),
    fix: (s) =>
      `Finish the merge: ${s.sides ? `${s.sides}. Keep` : 'keep'} the side that is meant, or both, take out the lines git marks with <<<<<<<, ======= and >>>>>>>, and read the plan again.`
  },

  // --- Reading part by part (MSG-6): the plan is read, and the rest is checked -----------------
  'plan/part-left-out': {
    says: (s) => `${s.label} is left out: a value it needs cannot be read`,
    found: (s) => `${s.said} at ${s.place}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Give ${s.place} ${s.wants}. Until then the part is left out of every view, measure and export, and the rest of the plan is checked without it.`
  },
  'plan/value-left-out': {
    says: (s) => `${s.label} has a value the format cannot read, and is read without it`,
    found: (s) => `${s.said} at ${s.place}, so ${s.used ? `the default, ${s.used}, is used` : 'it is read as not stated'}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Write ${s.place} as ${s.wants}, or leave it out${s.used ? ` to keep the default, ${s.used}` : ''}.`
  },
  'plan/read-as-meant': {
    says: (s) => `${s.label} has a value written another way, and it is read as meant`,
    found: (s) => `${s.said} at ${s.place}, read as ${s.read}`,
    needed: (s) => `${s.wants} at ${s.place}`,
    fix: (s) => `Write ${s.place} as ${s.read}, so the plan says what is read.`
  },
  'plan/blank-id': {
    says: (s) => `${s.label} is left out: its id is blank`,
    needed: fixed('an id of its own on every part, with more than spaces in it'),
    fix: fixed('Give it an id no other part has, and use that id where the plan points at it.')
  },
  'plan/id-clash': {
    says: (s) => `${s.label} is left out: another part has the same id`,
    found: (s) => `the id of ${s.kept} again at ${s.place}`,
    needed: fixed('every id on one part only, across the whole plan'),
    fix: (s) => `Rename it${s.rename ? `, for example to ${s.rename}` : ''}. ${s.kept} keeps its id, and what points at that id points at it.`
  },
  'plan/similar-id': {
    says: (s) => `${s.label} is left out: its id differs from another part's only in capitals or spaces`,
    needed: fixed('ids that differ in more than capitals or spaces'),
    fix: fixed('If it is the other part, use its id letter for letter; if it is a part of its own, rename it. The other part keeps its id.')
  },

  // --- Grid itself ----------------------------------------------------------------------------
  'plan/check-failed': {
    says: fixed('A check could not run on this plan: something went wrong inside Grid'),
    needed: fixed('the check to run to the end'),
    fix: fixed('Nothing to change in the plan for this line. The other lines still hold; tell the people who make Grid.')
  },

  // --- The plan as a whole --------------------------------------------------------------------
  'plan/no-walls': {
    says: fixed('The plan has no walls, but its rooms and openings name walls'),
    needed: fixed('the walls the rooms and openings name'),
    fix: fixed('Put the walls back: every room lists its walls and every opening sits on one. The lines about each room and opening follow from this one and go away with it.')
  },
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

  'plan/level-gap': {
    says: fixed('The plan skips a floor level'),
    needed: fixed('floor levels with no gap, or an elevation in metres on each floor'),
    fix: fixed('If a floor is missing, add it. If not, state where each floor stands with an elevation in metres.')
  },
  'plan/same-level': {
    says: (s) => `${s.label} is at the same level as another floor`,
    needed: fixed('each floor at its own level, or an elevation in metres on each'),
    fix: fixed('Give each floor its own level, or state where each stands with an elevation in metres.')
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
  // CNT-18: a curved wall that cannot be built.
  'wall/arc-ends-apart': {
    says: (s) => `${s.label} does not end where its curve takes it`,
    needed: fixed('an end on the circle where the sweep takes the start round the centre'),
    fix: fixed('Move its end to where the curve reaches, or give the sweep that reaches its end.')
  },
  'wall/arc-too-tight': {
    says: (s) => `${s.label} curves round too small a radius`,
    needed: fixed('a radius, from the centre to the start, over half the wall\'s thickness'),
    fix: fixed('Move its centre further from its ends, or make the wall thinner.')
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
  'wall/ends-in-opening': {
    says: (s) => `${s.label} ends on another wall inside one of its openings`,
    needed: fixed('a wall that meets another clear of its doors and windows'),
    fix: fixed('Move the wall along, or move the opening clear of where the wall meets it.')
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

  'wall/above-storey': {
    says: (s) => `${s.label} is higher than the storey its floor states`,
    needed: fixed("walls no higher than their floor's stated height"),
    fix: fixed("Lower the wall, or raise the floor's height if the wall really is taller.")
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
    needed: (s) => (meantWall(s) === null ? 'the id of a wall in the plan' : `the id of a wall in the plan, most likely ${quoted(meantWall(s)!)}`),
    fix: (s) =>
      meantWall(s) === null
        ? 'Name a wall the plan has, letter for letter, or add the wall.'
        : `Did you mean ${quoted(meantWall(s)!)}? Name it letter for letter, or add the wall.`
  },
  'opening/degenerate': {
    says: (s) => `${s.label} has no size`,
    needed: fixed('a width and a height above 0'),
    fix: fixed('Give it its width and its height.')
  },
  'opening/out-of-wall': {
    says: (s) => `${s.label} runs off its wall`,
    needed: (s) => {
      const fits = [
        fixOf(s, 'offset') === null ? null : `an offset of at most ${metresText(fixOf(s, 'offset')!)} m`,
        fixOf(s, 'width') === null ? null : `a width of at most ${metresText(fixOf(s, 'width')!)} m at its offset`
      ].filter((part): part is string => part !== null)
      return fits.length === 0 ? "its offset and width within the wall's length" : fits.join(', or ')
    },
    fix: (s) => {
      const fits = [
        fixOf(s, 'offset') === null ? null : `move it to an offset of ${metresText(fixOf(s, 'offset')!)} m or less`,
        fixOf(s, 'width') === null ? null : `make it ${metresText(fixOf(s, 'width')!)} m wide or narrower, keeping its start`
      ].filter((part): part is string => part !== null)
      return fits.length === 0 ? 'Move it along the wall, or make it narrower, as the line found says.' : `${fits.join(', or ').replace(/^./, (c) => c.toUpperCase())}.`
    }
  },
  'opening/too-tall': {
    says: (s) => `${s.label} reaches above the top of its wall`,
    needed: (s) =>
      fixOf(s, 'height') === null ? 'its sill and height together no higher than the wall' : `a height of at most ${metresText(fixOf(s, 'height')!)} m at its sill`,
    fix: (s) => (fixOf(s, 'height') === null ? 'Lower its height or its sill.' : `Make it ${metresText(fixOf(s, 'height')!)} m high or lower, or lower its sill.`)
  },
  'opening/above-roof': {
    says: (s) => `${s.label} reaches above the roof over its wall`,
    needed: (s) =>
      fixOf(s, 'height') === null ? 'its sill and height together no higher than the roof over that stretch of its wall' : `a height of at most ${metresText(fixOf(s, 'height')!)} m at its sill`,
    fix: (s) =>
      fixOf(s, 'height') === null
        ? 'Lower it under the roof, move it along the wall to where the roof is higher, or, for a window in the slope, state it as a rooflight in the floor\'s roof.'
        : `Make it ${metresText(fixOf(s, 'height')!)} m high or lower, lower its sill, or move it to where the roof is higher.`
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
  'opening/door-hits-item': {
    says: (s) => `${s.label} hits ${(s.items ?? []).join(', ') || 'a fixture'} when it opens`,
    found: (s) => `its leaf sweeps the floor where ${(s.items ?? []).length === 1 ? 'that fixture stands' : 'those fixtures stand'}`,
    needed: fixed('floor clear of fixtures where its leaf swings'),
    fix: fixed('Hang it from its other end, open it the other way, or move the fixture out of its swing.')
  },
  'opening/doors-collide': {
    says: (s) => `${s.label} hits another door when they open`,
    found: (s) => `its leaf and the leaf of door ${s.also.map(quoted).join(', ')} sweep the same floor`,
    needed: fixed('door sweeps that do not overlap'),
    fix: fixed('Turn one of them to open the other way or hang it from its other end, or move them apart.')
  },

  'opening/crosses-wall': {
    says: (s) => `${s.label} runs into a wall that meets its wall`,
    needed: fixed('an opening within the clear run of its wall, between the walls that meet it'),
    fix: fixed('Move it along its wall to the offset given, or make it narrower. It is cut through its own wall only.')
  },
  'opening/fills-wall': {
    says: (s) => `${s.label} is as long as its wall`,
    needed: fixed('some wall left beside an opening'),
    fix: fixed('Make it narrower, or leave the wall out and let the rooms meet along a dividing line.')
  },
  'opening/on-dividing-line': {
    says: (s) => `${s.label} is on a dividing line`,
    needed: fixed('a door or window in a wall'),
    fix: fixed('Make it a doorless opening if the rooms are open to each other there, or put it on a wall.')
  },
  'opening/window-between-rooms': {
    says: (s) => `${s.label} has rooms on both sides`,
    needed: fixed('a window in a wall with the outside on one side, unless it is a borrowed light'),
    fix: fixed('Leave it if it is a borrowed light between two rooms. Otherwise move it to an outside wall.')
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
  'room/hole-outside': {
    says: (s) => `${s.label} has a hole that does not lie inside it`,
    needed: fixed('a hole inside the room, with floor all round it'),
    fix: fixed('Check the walls the hole lists, or draw the space as a room of its own.')
  },
  'room/holes-overlap': {
    says: (s) => `${s.label} has two holes that overlap or touch`,
    needed: fixed('floor between any two holes'),
    fix: fixed('Move the holes apart. If they are one hole, list its walls once.')
  },
  'room/derived-edited': {
    says: (s) => `${s.label}'s boundary was changed by hand in a plan written rooms first`,
    needed: fixed('walls worked out from the rooms text'),
    fix: fixed('Change the rooms text and write it again (grid write), or take "written" out of the plan to keep it as a hand-written one.')
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
  'room/zone-not-in-room': {
    says: (s) => `${s.label} is marked as a zone of a room it does not lie in`,
    needed: fixed('a room on its floor, not a zone itself, that holds the whole zone'),
    fix: fixed('Draw it within the room it is part of, name that room in "partOf", or leave out "partOf".')
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

  'room/offset-question': {
    says: (s) => `${s.label} stands far above or below its storey's floor`,
    needed: fixed("a room's step within what a storey holds, or a floor of its own"),
    fix: fixed('If it is meant, leave it. If the room is a level of its own, give it its own floor with its elevation.')
  },

  // --- Stairs (LVL-3) --------------------------------------------------------------------------
  'stair/unknown-floor': {
    says: (s) => `${s.label} joins a floor the plan does not know`,
    needed: fixed('the ids of two floors the plan has'),
    fix: fixed("Correct its from or to to a floor id the plan's floors list.")
  },
  'stair/same-floor': {
    says: (s) => `${s.label} starts and ends on one floor`,
    needed: fixed('two different floors'),
    fix: fixed("Make from and to the two floors it joins. A step inside a floor is a room's floorOffset.")
  },
  'stair/no-rise': {
    says: (s) => `${s.label} joins floors that stand at one height`,
    needed: fixed('two floors at different heights'),
    fix: fixed("State the floors' elevations, or join two floors at different heights.")
  },
  'stair/run-too-short': {
    says: (s) => `${s.label} has a stretch of its walking line too short for a flight`,
    needed: fixed('stretches long enough for a tread, once the landings are taken off'),
    fix: fixed('Lengthen the stretch, or leave out the turn.')
  },
  'stair/too-few-risers': {
    says: (s) => `${s.label} states fewer risers than its flights need`,
    needed: fixed('at least two risers on each flight'),
    fix: fixed('State more risers, or leave the number out and Grid works it out.')
  },
  'stair/end-in-no-room': {
    says: (s) => `${s.label} starts or ends in no room, so it joins nothing there`,
    needed: fixed('each end of its walking line in a room'),
    fix: fixed('Draw the room it starts from or arrives in, or move the end of its walking line into one.')
  },
  'stair/duplicate-id': {
    says: (s) => `${s.label} shares its id with another stair`,
    needed: fixed('an id of its own for each stair'),
    fix: fixed('Give the second stair another id; until then it is left out.')
  },

  // --- Opening patterns (LVL-8) ---------------------------------------------------------------
  // What kept a pattern's openings from being placed. The found is the expansion's own sentence:
  // which wall, how much room it needed and had, which opening it would have covered.
  'pattern/unknown-wall': {
    says: (s) => `${s.label} names a wall Grid cannot find`,
    needed: fixed('the id of one wall of the plan'),
    fix: fixed('Name the wall the openings go in by its id, as the plan file holds it; until then none of them is placed.')
  },
  'pattern/does-not-fit': {
    says: (s) => `${s.label} does not fit its wall`,
    needed: fixed('room on the wall, between its margins, for every opening of the pattern'),
    fix: fixed('Make the margins smaller, the openings narrower, the count smaller or the spacing wider, or put the pattern on a longer wall.')
  },
  'pattern/unknown-floor': {
    says: (s) => `${s.label} is to be repeated on a floor the plan does not have`,
    needed: fixed('a floor of the plan in the pattern\'s floors'),
    fix: fixed('Name the floors above by their ids, as the floor list holds them.')
  },
  'pattern/no-wall-above': {
    says: (s) => `${s.label} finds no wall above to repeat on`,
    needed: fixed('on each floor it is repeated on, a wall in the same line as its own, holding the opening\'s whole width'),
    fix: fixed('Draw the wall above in line with the pattern\'s wall, or take that floor out of the pattern\'s floors.')
  },
  'pattern/overlaps-opening': {
    says: (s) => `${s.label} would place an opening over another`,
    needed: fixed('each opening of the pattern clear of the other openings on its wall'),
    fix: fixed('Move the other opening, or change the pattern\'s margins, count or spacing so its openings stand clear of it.')
  },
  'pattern/id-clash': {
    says: (s) => `${s.label} would give an opening an id another part has`,
    needed: fixed('an id of its own for each opening a pattern places: the pattern\'s id, the floor and the number'),
    fix: fixed('Rename the pattern, or the part that has the id.')
  },

  // --- Fixtures (CNT-12) ----------------------------------------------------------------------
  'item/too-large': {
    says: (s) => `${s.label} has a number Grid does not accept`,
    needed: fixed('finite numbers within the size Grid accepts'),
    fix: fixed('Give its place, size and height in metres, and its turn in degrees.')
  },
  'item/no-size': {
    says: (s) => `${s.label} has no size`,
    needed: fixed('a width, a depth and a height above 0'),
    fix: fixed('State its width and depth ("size") and its height, in metres.')
  },
  'item/unknown-kind': {
    says: (s) => `${s.label} is a kind the plan does not hold yet`,
    needed: fixed('a fixture kind: "toilet", "basin", "shower", "bath" or "kitchen-run"'),
    fix: fixed('Give a fixture one of those kinds. Loose furniture, points and seats are not held yet: leave them out of the items for now.')
  },
  'item/duplicate-id': {
    says: (s) => `${s.label} has an id another part of the plan has too`,
    needed: fixed('an id of its own on every item'),
    fix: fixed('Give the item an id no wall, room, opening or other item has.')
  },
  'item/unknown-floor': {
    says: (s) => `${s.label} is on a floor the plan does not have`,
    needed: fixed('a floor of the plan'),
    fix: fixed('Name one of the plan\'s floors, or leave the floor out for the ground floor.')
  },
  'item/outside-rooms': {
    says: (s) => `${s.label} stands in no room`,
    needed: fixed('its middle inside a room on its floor'),
    fix: fixed('Move it into the room it belongs to: its "at" is the middle of its footprint.')
  },
  'item/into-wall': {
    says: (s) => `${s.label} runs into a wall`,
    needed: fixed('its footprint clear of the walls, against their faces at most'),
    fix: fixed('Move it off the wall, turn it, or make it smaller: its "at" is the middle of its footprint.')
  },
  'item/too-tall': {
    says: (s) => `${s.label} is taller than the room it stands in`,
    needed: fixed('a fixture no higher than its room'),
    fix: fixed('Lower its height, or give the room or its floor the height it really has.')
  },
  // CNT-13: use indicators the drawing's check gives. The found is the check's own sentence:
  // what was measured, with what depth, and that it is an indicator.
  'item/blocks-doorway': {
    says: (s) => `${s.label} stands in front of the doorway of ${s.also[0] === undefined ? 'an opening' : quoted(s.also[0])}, an indicator`,
    needed: fixed('the floor in front of a doorway clear of fixtures, within Grid\'s own approach depth'),
    fix: fixed('Move the fixture clear of the doorway, or move the doorway along its wall.')
  },
  'item/blocks-window': {
    says: (s) => `${s.label} stands in front of ${s.also[0] === undefined ? 'a window' : `window ${quoted(s.also[0])}`}, higher than its sill, an indicator`,
    needed: fixed('a fixture in front of a window no higher than its sill, within Grid\'s own approach depth'),
    fix: fixed('Move the fixture along the wall clear of the window, lower it, or raise the sill.')
  },

  // --- Floors ---------------------------------------------------------------------------------
  'floor/unclaimed': {
    says: (s) => `${s.label} has enclosed floor that no room claims`,
    needed: fixed('every enclosed floor in a room'),
    fix: fixed("If it is a room, draw it as one. If it is part of a room, list the walls that take it into that room's outline.")
  },
  'floor/empty-top': {
    says: (s) => `${s.label} is the top floor and has nothing drawn on it`,
    needed: fixed('a top floor with something on it'),
    fix: fixed('Remove the floor if nothing is on it yet: it still counts as a storey and the roof stands on it.')
  },
  'floor/rooflight-misplaced': {
    says: (s) => `${s.label} has a rooflight that does not lie on one slope of its roof`,
    needed: fixed("a rooflight wholly inside the roof and on one of its slopes, clear of the ridge and the hips"),
    fix: fixed("Move the rooflight's middle (at) onto one slope, or make it smaller, so it neither leaves the roof nor crosses where two slopes meet. Until then it is left out.")
  },
  'floor/dormers-not-drawn': {
    says: (s) => `${s.label} lists dormers, which are not supported yet`,
    needed: fixed('a roof Grid can draw: dormers are not supported yet'),
    fix: fixed("Grid draws and measures the roof without its dormers. A window in a dormer's face can be drawn in an outside wall raised to it; a window in the slope is a rooflight.")
  },
  'floor/size-question': {
    says: (s) => `${s.label} states a height that may not be meant`,
    needed: fixed('the height of a storey in a building'),
    fix: fixed(`${SIZE_QUESTION} Walls with no height of their own take the floor's height.`)
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
    says: (s) => named(s, planCheckWordings.roomWithoutDoor(s.name)),
    found: fixed('no door, opening or open side'),
    needed: fixed('a door, an opening or an open side to another space'),
    fix: fixed('Add a door or an opening in a wall it shares with another room, or make an open side a virtual wall.')
  },
  'room/no-route-out': {
    says: (s) => named(s, planCheckWordings.noRoute(s.name)),
    found: (s) => through(s.finding),
    needed: fixed('a route through doors and openings to a door to the outside'),
    fix: fixed('Add a door from it, or from a room it opens into, toward a room that reaches the outside.')
  },
  'room/no-route-to-door-out': {
    says: (s) => named(s, planCheckWordings.noRouteToAnyDoorOut(s.name)),
    found: (s) => through(s.finding),
    needed: fixed('a route to a door to the outside, or to the door into the space not drawn'),
    fix: fixed('Add a door from it, or from a room it opens into, toward the way out.')
  },
  'opening/to-undrawn-space': {
    says: (s) => named(s, planCheckWordings.doorToUndrawnSpace(s.name)),
    found: fixed('no room and no outside wall on the far side of the door'),
    needed: fixed('a room, or the outside, on the far side'),
    fix: fixed('If that space is a shared landing or a stair, draw it as a room. If the door leads outside, mark its wall as exterior.')
  },
  'opening/door-out-above-ground': {
    says: (s) => named(s, planCheckWordings.doorOutAboveGround(s.name, metresText(s.finding?.elevation ?? 0))),
    found: (s) => `a door in an outside wall of a floor ${metresText(s.finding?.elevation ?? 0)} m above the ground`,
    needed: fixed('a way out at ground level, or a stair down to one'),
    fix: fixed('If the door opens onto a balcony or a terrace, draw that space. It is not counted as a way out.')
  },
  'opening/below-ground': {
    says: (s) => s.finding?.message ?? `${s.label} lies below the ground`,
    found: (s) => {
      const b = s.finding?.belowGround
      if (b === undefined) return 'a door or window in an outside wall below the ground level the site states'
      return b.wholly
        ? `a door or window in an outside wall whose top is ${metresText(b.top)} m under the ground level the site states`
        : `a door or window in an outside wall whose foot is ${metresText(b.foot)} m under the ground level the site states, its top above it`
    },
    needed: fixed('a door or window above the ground outside, or a light well or an outside stair in front of it'),
    fix: fixed('If the ground in front of it is dug away, as for a light well or an area, draw that space; if the ground level is not right, change site.ground.')
  },
  'room/stair-out-of-line': {
    says: (s) => s.finding?.message ?? `${s.label} does not line up with the stair below`,
    found: fixed('no room used as a stair on the floor below lies under half of it'),
    needed: fixed('the stair room over the one on the floor below'),
    fix: fixed("Move it over the stair room below, or state the stair in the plan's stairs.")
  },
  'room/lift-out-of-line': {
    says: (s) => s.finding?.message ?? `${s.label} does not line up with the lift shaft below`,
    found: fixed('no room used as a lift on the floor below lies under half of it'),
    needed: fixed('the shaft over the one on the floor below'),
    fix: fixed('Move it over the lift shaft below.')
  },
  'opening/too-small-to-pass': {
    says: (s) => named(s, planCheckWordings.openingTooSmall(s.name)),
    found: (s) => (s.finding?.passage === undefined ? s.said : lowerFirst(passageText(s.finding.passage))),
    needed: (s) => {
      const p = s.finding?.passage
      const size = metresText(p?.passable ?? 0)
      const what = p?.short === 'sill' ? `a sill no more than ${size} m above the floor` : `at least ${size} m ${p?.short === 'height' ? 'high' : 'wide'}`
      return `${what}: Grid's own size for a person to get through, not a code figure`
    },
    fix: fixed('If people go through it, draw it at its real size. If it is a vent or a serving hatch, it is not a way through: give the room a door.')
  },
  'room/too-small': {
    says: (s) => named(s, figureWordings.roomTooSmall(s.name, s.finding?.minimum ?? 0)),
    found: (s) => `${area(s.finding?.area)} net${wholeRoom(s)}`,
    needed: (s) => `${figureNeededText(`at least ${area(s.finding?.minimum)}`, figuresOf(s.finding, ['habitableRoomMinArea']))}${readFor(s)}`,
    fix: fixed('Make the room larger, or check the use it is given.')
  },
  'room/no-escape-opening': {
    says: (s) => named(s, figureWordings.noEscapeOpening(s.name)),
    found: fixed('no window or door in an outside wall'),
    needed: (s) => `a window or door to the outside that someone can climb through${readFor(s)}`,
    fix: fixed('Add a window or a door in one of its outside walls.')
  },
  'room/escape-window-too-small': {
    says: (s) => named(s, figureWordings.escapeWindowTooSmall(s.name)),
    // MSG-7 (lab MS-13): the measure that fails first, against what it needs; the ones that pass after.
    found: (s) => {
      const f = s.finding
      const minWidth = f?.figures?.find((x) => x.key === 'escapeOpeningMinWidth')?.value
      const minHeight = f?.figures?.find((x) => x.key === 'escapeOpeningMinHeight')?.value
      const measures = [
        { text: `${area(f?.area)} in area`, need: f?.minimum === undefined ? null : area(f.minimum), fails: f?.area !== undefined && f.minimum !== undefined && f.area < f.minimum },
        { text: `${metres(f?.width)} wide`, need: minWidth === undefined ? null : metres(minWidth), fails: f?.width !== undefined && minWidth !== undefined && f.width < minWidth },
        { text: `${metres(f?.height)} high`, need: minHeight === undefined ? null : metres(minHeight), fails: f?.height !== undefined && minHeight !== undefined && f.height < minHeight }
      ]
      const failing = measures.filter((m) => m.fails)
      if (failing.length === 0) return `${area(f?.area)} as drawn, ${metres(f?.width)} wide and ${metres(f?.height)} high`
      const passing = measures.filter((m) => !m.fails)
      const short = failing.map((m) => `${m.text}, under the ${m.need} needed`).join(', and ')
      return passing.length === 0 ? short : `${short}; ${passing.map((m) => m.text).join(' and ')}, which ${passing.length === 1 ? 'is' : 'are'} enough`
    },
    needed: (s) => {
      const parts = [
        s.finding?.minimum === undefined ? null : `${area(s.finding.minimum)}`,
        figure(s.finding, 'escapeOpeningMinWidth') === null ? null : `${figure(s.finding, 'escapeOpeningMinWidth')} wide`,
        figure(s.finding, 'escapeOpeningMinHeight') === null ? null : `${figure(s.finding, 'escapeOpeningMinHeight')} high`
      ].filter((part): part is string => part !== null)
      if (parts.length === 0) return `a window someone can climb through${readFor(s)}`
      const used = figuresOf(s.finding, ['escapeOpeningMinArea', 'escapeOpeningMinAreaGrade', 'escapeOpeningMinWidth', 'escapeOpeningMinHeight'])
      return `${figureNeededText(`at least ${parts.join(', ')}`, used)}${readFor(s)}`
    },
    fix: fixed('Make the window larger, or add one that is.')
  },
  'room/escape-window-too-high': {
    says: (s) => named(s, figureWordings.escapeWindowTooHigh(s.name)),
    found: (s) => `a sill ${metres(s.finding?.sill)} above the floor`,
    needed: (s) => `${s.finding?.maximum === undefined ? 'a lower sill' : figureNeededText(`a sill at most ${metres(s.finding.maximum)} above the floor`, figuresOf(s.finding, ['escapeOpeningMaxSill']))}${readFor(s)}`,
    fix: fixed("Lower the window's sill.")
  },

  // --- What a check could not look at -----------------------------------------------------------
  'floor/not-checked-no-stairs': {
    says: (s) => wordingText(planCheckWordings.noStairs(s.floorName)),
    found: fixed('a floor off the ground, and no stair joining it to the ground floor'),
    needed: fixed('a stair joining it, through the floors between, to the ground floor'),
    fix: fixed("State the stair in the plan's stairs, or draw a room used as a stair on each floor, one over the other.")
  },
  'floor/not-checked-way-out-not-drawn': {
    says: (s) => wordingText(planCheckWordings.wayOutNotDrawn(s.floorName)),
    found: fixed('its only doors out lead to a space that is not drawn'),
    needed: fixed('the space beyond its doors drawn as a room, or a door to the outside'),
    fix: fixed('If that space is a shared landing or a stair, draw it as a room.')
  },
  // MSG-5: with the notes held back because they rest on what could not be drawn.
  'floor/not-checked-rooms-not-drawn': {
    says: (s) => wordingText(planCheckWordings.roomsNotDrawn(s.floorName, s.names)),
    found: (s) => `rooms that cannot be drawn${s.heldSaid ? `; held back until they can be: ${s.heldSaid}` : ''}`,
    needed: fixed('rooms that can be drawn'),
    fix: fixed('Correct the lines that leave those rooms out. They are checked once they can be drawn, and so is what rests on them: a note held back comes back if it still holds.')
  },
  'floor/not-checked-doors-not-drawn': {
    says: (s) => wordingText(planCheckWordings.doorsNotDrawn(s.floorName, s.also)),
    found: (s) => `doors or windows that cannot be drawn${s.heldSaid ? `; held back until they can be: ${s.heldSaid}` : ''}`,
    needed: fixed('doors and windows that can be drawn'),
    fix: fixed('Correct the lines that leave those doors or windows out. They are checked once they can be drawn, and so is what rests on them: a note held back comes back if it still holds.')
  },
  'floor/sketch-drawn-only': {
    says: (s) => `On ${s.label.replace(/^Floor /, '')}, the sketch is drawn only: ${s.said}, not measured or checked, and never taken as a wall or a room`,
    found: (s) => `${s.said} on the sketch layer (${s.names.join(', ')})`,
    needed: fixed('nothing: a sketch is for the drawing. A part Grid understands is written as one: a wall, a room, a door, a fixture'),
    fix: fixed('Leave it as a sketch for the drawing. Where it is something Grid holds, such as a fixture, write it as that instead; furniture and site parts will be offered the same way when Grid holds them.')
  },
  'plan/note-no-place': {
    says: (s) => `Note ${s.label} names a room the plan does not have, so it is not drawn`,
    needed: fixed('a room id from the plan, or a point (at)'),
    fix: fixed('Name one of the plan\'s rooms by its id, or place the note at a point.')
  },
  // CNT-3: the front, and which way the plan's y runs.
  'plan/front-not-said': {
    says: (s) => `The front names ${s.label}, which ${s.said}, so no front is said`,
    needed: fixed('a wall that faces outside, or an opening in one, such as the front door'),
    fix: fixed('Name in front a wall of the plan that faces outside (wall), or the front door (opening).')
  },
  'plan/y-down': {
    says: () => 'The plan says its y runs down the page, so every drawing and export shows the building mirrored; which way its walls face is read the right way round',
    found: fixed('yAxis is down: the coordinates are the building\'s mirror image, and Grid draws and exports them with y up'),
    needed: fixed('a plan whose y runs up the page, as Grid draws it'),
    fix: fixed('To have the drawings and exports the right way round, write the plan with y up: every y negated, north as 180 less what it was, and yAxis up.')
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
  },
  // CNT-5 (lab EL-2): a figure check the plan's kind of building leaves out, for the whole plan
  // or one floor of it. The figures carried here were read for homes.
  'plan/not-checked-sizes-for-building': {
    says: (s) => wordingText(figureWordings.notForBuilding('Room sizes', buildingKindsText(ruleReadFor(s)), buildingText(s))),
    found: (s) => `a plan that says it is ${buildingText(s)}`,
    needed: (s) => `figures read for ${buildingText(s)}; the ones here were read for ${buildingKindsText(ruleReadFor(s))}`,
    fix: fixed(NOT_FOR_BUILDING_FIX)
  },
  'plan/not-checked-escapes-for-building': {
    says: (s) => wordingText(figureWordings.notForBuilding('Escape openings', buildingKindsText(ruleReadFor(s)), buildingText(s))),
    found: (s) => `a plan that says it is ${buildingText(s)}`,
    needed: (s) => `figures read for ${buildingText(s)}; the ones here were read for ${buildingKindsText(ruleReadFor(s))}`,
    fix: fixed(NOT_FOR_BUILDING_FIX)
  },
  'floor/not-checked-sizes-for-building': {
    says: (s) => wordingText(figureWordings.floorNotForBuilding(s.floorName, 'Room sizes', buildingKindsText(ruleReadFor(s)), buildingText(s))),
    found: (s) => `a floor the plan says is ${buildingText(s)}`,
    needed: (s) => `figures read for ${buildingText(s)}; the ones here were read for ${buildingKindsText(ruleReadFor(s))}`,
    fix: fixed(NOT_FOR_BUILDING_FIX)
  },
  'floor/not-checked-escapes-for-building': {
    says: (s) => wordingText(figureWordings.floorNotForBuilding(s.floorName, 'Escape openings', buildingKindsText(ruleReadFor(s)), buildingText(s))),
    found: (s) => `a floor the plan says is ${buildingText(s)}`,
    needed: (s) => `figures read for ${buildingText(s)}; the ones here were read for ${buildingKindsText(ruleReadFor(s))}`,
    fix: fixed(NOT_FOR_BUILDING_FIX)
  },
  // MSG-2: what a check skipped, said where it used to pass in silence.
  'floor/not-checked-above-escape-storeys': {
    says: (s) => wordingText(figureWordings.aboveEscapeStoreys(s.floorName, s.names.length)),
    found: (s) => `bedrooms above the third storey: ${s.names.map(quoted).join(', ')}`,
    needed: fixed('figures for escape from bedrooms above the third storey, which these checks do not carry'),
    fix: fixed('Nothing to change in the plan: look up how escape from these bedrooms is set out where it will be built.')
  },
  // WRT-6 (lab WR-15): what the plan marks assumed, listed for the person to confirm.
  'plan/value-assumed': {
    says: (s) => `${s.word ? `The ${s.word} of ${s.label}` : s.label} was assumed, not given or measured`,
    found: (s) => `marked assumed in the plan's marks${s.said ? `, ${s.said}` : ''}`,
    needed: fixed('the person\'s word on it: this value confirmed, or the right one'),
    fix: fixed('Ask the person. When they confirm it, mark it given or measured; when they give another, change it and mark that given.')
  },
  'plan/mark-no-part': {
    says: (s) => `A mark names ${s.label}, which the plan does not have, so the mark is not read`,
    found: (s) => `a mark on ${s.label}${s.word ? ` (its ${s.word})` : ''}`,
    needed: fixed('a mark on a part the plan has, by its id'),
    fix: fixed('Name the part by the id the plan gives it now, or take the mark out.')
  },
  'plan/not-checked-no-rooms': {
    says: () => wordingText(figureWordings.noRooms()),
    found: fixed('walls, and no rooms'),
    needed: fixed('the rooms drawn on the walls, each with the walls round it and its use'),
    fix: fixed('Add the rooms. Room sizes, doors, routes and escape openings are checked once there are rooms.')
  }
} as const satisfies Record<string, CodeEntry>

export type LineCode = keyof typeof CODES

export function isLineCode(code: string): code is LineCode {
  return Object.hasOwn(CODES, code)
}
