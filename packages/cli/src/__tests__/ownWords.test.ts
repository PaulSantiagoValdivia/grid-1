/**
 * MSG-11: Grid's own sentences come from the message files (`packages/floorplan/src/messages`),
 * one per language, and nowhere else. This test reads every user-facing source file of the four
 * packages and counts the string literals that look like an English sentence: three or more
 * words in a row. A file not listed below must have none; a listed file must have exactly the
 * count it is listed with, so a new sentence fails the test and a moved one asks for its count
 * to come down. The list is what is left to move, by kind (`WHY`), and `reviews/MSG-11.md` lists
 * it for the owner.
 *
 * Move a sentence by giving it a key in `en.ts` and every other language's file and saying it
 * with `say` (`docs/languages.md`).
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../..')
const PACKAGES = ['floorplan', 'rules', 'viewer', 'cli']

/** Why a file still holds English sentences. */
const WHY = {
  tools: "The tool server's tools: their descriptions and argument schemas are for the agent and stay in English by design (the agent retells the coded results in the person's language). grid_check, grid_describe, grid_view and grid_sheet answer in the language asked for; the other tools' answers are not moved yet.",
  agent: 'Written for the agent, not the person: the protocol, the argument checks, the retelling rules and the lookup prompt. English by design.',
  command: "The command line's help, usage and refusals of a mistyped command. Not moved yet.",
  developer: "For people who build or install Grid: the tolerance table's own descriptions (docs/tolerances.md), the sheet's coverage table, install and programming errors. English by design.",
  notWords: 'Not words: CSS class names and a font.',
  provenance: "A figure's provenance as recorded: its document, edition, clause and what it measures, as data.",
  agentForm: "grid describe --for agent: a fixed format for agents, of tokens and ids. Its label is in the person's language.",
  notYet: 'Shown to the person, not moved yet: rooms text and its errors, the edit receipts, the measuring and quantity reports, the notes, export file texts, schema refusals and the other commands.',
} as const

/** Each file that still holds English sentences, with how many and why. */
const ALLOWED: Readonly<Record<string, readonly [number, keyof typeof WHY]>> = {
  'packages/cli/src/apps/cadApps.ts': [1, 'developer'],
  'packages/cli/src/brief/answer.ts': [2, 'notYet'],
  'packages/cli/src/brief/brief.ts': [40, 'agent'],
  'packages/cli/src/brief/lines.ts': [20, 'notYet'],
  'packages/cli/src/command/check.ts': [10, 'command'],
  'packages/cli/src/command/describe.ts': [6, 'command'],
  'packages/cli/src/command/diff.ts': [13, 'command'],
  'packages/cli/src/command/draw.ts': [44, 'command'],
  'packages/cli/src/command/drawShow.ts': [4, 'command'],
  'packages/cli/src/command/edit.ts': [9, 'command'],
  'packages/cli/src/command/export.ts': [17, 'command'],
  'packages/cli/src/command/init.ts': [15, 'command'],
  'packages/cli/src/command/language.ts': [2, 'command'],
  'packages/cli/src/command/main.ts': [52, 'command'],
  'packages/cli/src/command/options.ts': [9, 'command'],
  'packages/cli/src/command/plan.ts': [24, 'command'],
  'packages/cli/src/command/planText.ts': [18, 'command'],
  'packages/cli/src/command/section.ts': [6, 'command'],
  'packages/cli/src/command/sheet.ts': [3, 'command'],
  'packages/cli/src/command/tidy.ts': [11, 'command'],
  'packages/cli/src/command/write.ts': [26, 'command'],
  'packages/cli/src/describe/card.ts': [12, 'agentForm'],
  'packages/cli/src/describe/facts.ts': [2, 'notYet'],
  'packages/cli/src/distribution/listing.ts': [82, 'developer'],
  'packages/cli/src/distribution/zip.ts': [1, 'developer'],
  'packages/cli/src/draw/cameraAsk.ts': [12, 'agent'],
  'packages/cli/src/draw/canvas.ts': [1, 'developer'],
  'packages/cli/src/draw/drawPlan.ts': [2, 'developer'],
  'packages/cli/src/draw/drawStill.ts': [2, 'developer'],
  'packages/cli/src/draw/stamp.ts': [1, 'notWords'],
  'packages/cli/src/edit/addRoom.ts': [19, 'notYet'],
  'packages/cli/src/edit/edits.ts': [49, 'notYet'],
  'packages/cli/src/edit/merge.ts': [23, 'notYet'],
  'packages/cli/src/edit/rename.ts': [9, 'notYet'],
  'packages/cli/src/edit/seat.ts': [5, 'notYet'],
  'packages/cli/src/edit/split.ts': [20, 'notYet'],
  'packages/cli/src/edit/square.ts': [11, 'notYet'],
  'packages/cli/src/edit/stretch.ts': [10, 'notYet'],
  'packages/cli/src/export/dxfProfile.ts': [5, 'command'],
  'packages/cli/src/export/projectExports.ts': [2, 'command'],
  'packages/cli/src/firm/standards.ts': [18, 'command'],
  'packages/cli/src/fs/projectFiles.ts': [49, 'command'],
  'packages/cli/src/fs/textEncoding.ts': [5, 'command'],
  'packages/cli/src/mcp/briefTool.ts': [36, 'tools'],
  'packages/cli/src/mcp/diffTools.ts': [20, 'tools'],
  'packages/cli/src/mcp/editTools.ts': [69, 'tools'],
  'packages/cli/src/mcp/protocol.ts': [16, 'agent'],
  'packages/cli/src/mcp/readTools.ts': [285, 'tools'],
  'packages/cli/src/mcp/reportTool.ts': [30, 'tools'],
  'packages/cli/src/mcp/retelling.ts': [3, 'agent'],
  'packages/cli/src/mcp/sectionAnswer.ts': [5, 'tools'],
  'packages/cli/src/mcp/seenTool.ts': [16, 'tools'],
  'packages/cli/src/mcp/toolkit.ts': [27, 'agent'],
  'packages/cli/src/mcp/viewTool.ts': [15, 'tools'],
  'packages/cli/src/mcp/writeTools.ts': [99, 'tools'],
  'packages/cli/src/occupancy/occupancy.ts': [16, 'notYet'],
  'packages/cli/src/quantities/access.ts': [49, 'notYet'],
  'packages/cli/src/quantities/areas.ts': [6, 'notYet'],
  'packages/cli/src/quantities/compare.ts': [19, 'notYet'],
  'packages/cli/src/quantities/estimate.ts': [27, 'notYet'],
  'packages/cli/src/quantities/facing.ts': [25, 'notYet'],
  'packages/cli/src/quantities/fixtures.ts': [2, 'notYet'],
  'packages/cli/src/quantities/measure.ts': [3, 'notYet'],
  'packages/cli/src/quantities/query.ts': [26, 'tools'],
  'packages/cli/src/quantities/rates.ts': [36, 'notYet'],
  'packages/cli/src/quantities/schedule.ts': [7, 'notYet'],
  'packages/cli/src/quantities/site.ts': [19, 'notYet'],
  'packages/cli/src/quantities/state.ts': [3, 'notYet'],
  'packages/cli/src/quantities/sun.ts': [13, 'notYet'],
  'packages/cli/src/quantities/takeoff.ts': [10, 'notYet'],
  'packages/cli/src/quantities/use.ts': [28, 'notYet'],
  'packages/cli/src/report/draft.ts': [16, 'notYet'],
  'packages/cli/src/seen/marks.ts': [21, 'notYet'],
  'packages/cli/src/sheet/coverage.ts': [21, 'developer'],
  'packages/cli/src/sheet/fonts.ts': [1, 'developer'],
  'packages/cli/src/sheet/sheetFile.ts': [7, 'command'],
  'packages/cli/src/versions/diff.ts': [8, 'notYet'],
  'packages/cli/src/versions/git.ts': [19, 'notYet'],
  'packages/cli/src/versions/markers.ts': [18, 'notYet'],
  'packages/floorplan/src/geometry/areas.ts': [32, 'notYet'],
  'packages/floorplan/src/geometry/camera.ts': [1, 'agent'],
  'packages/floorplan/src/geometry/diff/building.ts': [25, 'notYet'],
  'packages/floorplan/src/geometry/diff/churn.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/diff/rooms.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/diff/scope.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/diff/summary.ts': [4, 'notYet'],
  'packages/floorplan/src/geometry/diff/turn.ts': [7, 'notYet'],
  'packages/floorplan/src/geometry/diff/validity.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/envelope.ts': [4, 'notYet'],
  'packages/floorplan/src/geometry/export/dxfProfile.ts': [8, 'command'],
  'packages/floorplan/src/geometry/export/ifc.ts': [31, 'notYet'],
  'packages/floorplan/src/geometry/export/leftOut.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/export/obj.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/outline.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/rounding.ts': [1, 'developer'],
  'packages/floorplan/src/geometry/rules/doors.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/shell.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/tolerances.ts': [201, 'developer'],
  'packages/floorplan/src/geometry/use.ts': [9, 'notYet'],
  'packages/floorplan/src/geometry/vec2.ts': [2, 'developer'],
  'packages/floorplan/src/geometry/wall.ts': [1, 'developer'],
  'packages/floorplan/src/geometry/wallFaults.ts': [3, 'notYet'],
  'packages/floorplan/src/notes/notes.ts': [17, 'notYet'],
  'packages/floorplan/src/rooms/answer.ts': [6, 'notYet'],
  'packages/floorplan/src/rooms/compile.ts': [115, 'notYet'],
  'packages/floorplan/src/rooms/read.ts': [21, 'notYet'],
  'packages/floorplan/src/rooms/words.ts': [4, 'notYet'],
  'packages/floorplan/src/types/floorplan.ts': [50, 'notYet'],
  'packages/floorplan/src/types/places.ts': [7, 'notYet'],
  'packages/floorplan/src/types/planText.ts': [5, 'notYet'],
  'packages/floorplan/src/types/sheet.ts': [16, 'notYet'],
  'packages/floorplan/src/types/units.ts': [7, 'notYet'],
  'packages/rules/src/checks/figures.ts': [7, 'provenance'],
  'packages/rules/src/checks/place.ts': [1, 'command'],
  'packages/rules/src/lookup/prompt.ts': [18, 'agent'],
  'packages/rules/src/notes/notes.ts': [6, 'notYet'],
  'packages/rules/src/result/plurals.ts': [6, 'developer'],
  'packages/rules/src/sheet/rulesSheet.ts': [9, 'notYet'],
  'packages/rules/src/store/store.ts': [1, 'developer'],
  'packages/viewer/src/canvas2d/Canvas2D.tsx': [1, 'notWords'],
  'packages/viewer/src/picture/facade.ts': [2, 'developer'],
  'packages/viewer/src/picture/planSvg.ts': [3, 'developer'],
  'packages/viewer/src/picture/section.ts': [1, 'developer'],
  'packages/viewer/src/still/index.ts': [2, 'developer'],
}

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'test-support' || name === 'node_modules' || name === 'messages') continue
      out.push(...sources(path))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
/** Three or more words in a row, the first maybe capitalised: an English sentence or a piece of one. */
const SENTENCE = /(?:^|[^A-Za-z0-9_./-])[A-Za-z][a-z']*(?: [a-z][a-z']*){2,}/

/** How many literals in a file's code look like an English sentence. Comments are left out. */
function englishSentences(text: string): number {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  let count = 0
  for (const match of code.matchAll(LITERAL)) {
    const literal = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' X ')
    if (SENTENCE.test(literal)) count++
  }
  return count
}

describe("Grid's own sentences come from the message files (MSG-11)", () => {
  const files = PACKAGES.flatMap((name) => sources(join(ROOT, 'packages', name, 'src')))
  const counts = new Map(files.map((file) => [relative(ROOT, file).split('\\').join('/'), englishSentences(readFileSync(file, 'utf8'))] as const))

  it('reads the sources', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(counts.has('packages/rules/src/result/catalogue.ts')).toBe(true)
  })

  it('finds an English sentence where one is written, and not in a key or a placeholder', () => {
    expect(englishSentences("const a = 'This plan has a door'")).toBe(1)
    expect(englishSentences('const a = `${room} has no door`')).toBe(1)
    expect(englishSentences("say('es', 'line.plan/not-json.says', { place: 'walls[2].thickness' })")).toBe(0)
    expect(englishSentences('// a comment that says a lot of words')).toBe(0)
  })

  it('holds no English sentence outside the message files but those listed, each by its exact count', () => {
    const wrong: string[] = []
    for (const [file, count] of counts) {
      const allowed = ALLOWED[file]?.[0] ?? 0
      if (count > allowed) wrong.push(`${file}: ${count} English sentences, ${allowed} allowed. Move the new ones into the message files (docs/languages.md).`)
      if (count < allowed) wrong.push(`${file}: ${count} English sentences, listed with ${allowed}. Lower its count here: it moved some.`)
    }
    for (const file of Object.keys(ALLOWED)) if (!counts.has(file)) wrong.push(`${file} is listed but is not a source file any more: take it off the list.`)
    expect(wrong).toEqual([])
  })

  it('says why each listed file still holds English, and how much of it is left to move', () => {
    const left = Object.values(ALLOWED).reduce((n, [count, why]) => (why === 'notYet' || why === 'command' ? n + count : n), 0)
    for (const [file, [count, why]] of Object.entries(ALLOWED)) {
      expect(WHY[why].length, file).toBeGreaterThan(0)
      expect(count, file).toBeGreaterThan(0)
    }
    // The ratchet: what is shown to the person and not moved yet only comes down. It was 913 when
    // MSG-11 landed; main's MSG-5, COD-3, CNT-8, CNT-9, BRF-1, BRF-5, LVL-6, WRT-8 and VEW-3 brought
    // 190 more of the kinds MSG-11 left for later, LVL-8 8, HND-1 14, BRF-3 and WRT-4 63, LVL-9
    // and CNT-17 65, and COD-8 18 more (reviews/MSG-11.md, "After merging main").
    expect(left).toBeLessThanOrEqual(1271)
  })

  it('keeps the moved parts at none: the result record, the checks, the report, the drawings and the sheet', () => {
    for (const file of [
      'packages/rules/src/result/catalogue.ts',
      'packages/rules/src/result/inspect.ts',
      'packages/rules/src/checks/messages.ts',
      'packages/rules/src/checks/figureWords.ts',
      'packages/rules/src/checks/coverage.ts',
      'packages/floorplan/src/geometry/validate.ts',
      'packages/floorplan/src/geometry/rules/messages.ts',
      'packages/floorplan/src/types/readParts.ts',
      'packages/viewer/src/picture/scene.ts',
      'packages/cli/src/sheet/pages.ts',
      // After merging main at e486ccba: LVL-9's section, its list of what it took and the plan's marks.
      'packages/floorplan/src/geometry/section.ts',
      'packages/viewer/src/picture/drawingMarks.ts',
      'packages/cli/src/draw/drawSection.ts',
      // After merging main at 4fe29edc: COD-8's firm standards, their lines and where each was measured.
      'packages/rules/src/result/firm.ts',
      'packages/cli/src/firm/measure.ts'
    ]) {
      expect(counts.get(file), file).toBe(0)
    }
  })
})
