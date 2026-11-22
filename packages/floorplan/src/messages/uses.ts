/**
 * MSG-11: the one fixed list of room uses (`ROOM_USES`), with its label in each language.
 *
 * A use is one of the list, whatever the language: a room written with the use "dormitorio" is a
 * `bedroom`, and is checked as one. A label is the use's own name in a language, not a word Grid
 * guesses a use from (`USE_WORDS`), so even the uses no guessed word is read as (bedroom, living,
 * dining) are read from their labels. A room's name is never a use and never translated: it is
 * the person's own word for the room, and stays as written.
 *
 * The Spanish labels are a draft translation, not reviewed, as the rest of `es.ts` is.
 */
import type { RoomUse } from '../types/floorplan'
import type { Language } from './languages'

export const USE_LABELS: Readonly<Record<Language, Readonly<Record<RoomUse, string>>>> = {
  en: {
    bedroom: 'bedroom',
    living: 'living',
    dining: 'dining',
    kitchen: 'kitchen',
    bathroom: 'bathroom',
    toilet: 'toilet',
    utility: 'utility',
    study: 'study',
    office: 'office',
    meeting: 'meeting',
    reception: 'reception',
    retail: 'retail',
    classroom: 'classroom',
    treatment: 'treatment',
    waiting: 'waiting',
    sport: 'sport',
    changing: 'changing',
    staff: 'staff',
    worship: 'worship',
    assembly: 'assembly',
    corridor: 'corridor',
    stair: 'stair',
    lift: 'lift',
    storage: 'storage',
    plant: 'plant',
    parking: 'parking',
    other: 'other'
  },
  es: {
    bedroom: 'dormitorio',
    living: 'salón',
    dining: 'comedor',
    kitchen: 'cocina',
    bathroom: 'baño',
    toilet: 'aseo',
    utility: 'lavadero',
    study: 'estudio',
    office: 'oficina',
    meeting: 'sala de reuniones',
    reception: 'recepción',
    retail: 'tienda',
    classroom: 'aula',
    treatment: 'consulta',
    waiting: 'sala de espera',
    sport: 'sala de deporte',
    changing: 'vestuario',
    staff: 'sala de personal',
    worship: 'sala de culto',
    assembly: 'salón de actos',
    corridor: 'pasillo',
    stair: 'escalera',
    lift: 'ascensor',
    storage: 'almacén',
    plant: 'instalaciones',
    parking: 'aparcamiento',
    other: 'otro'
  }
}

/** A use's label in a language: `dormitorio` for `bedroom` in Spanish. */
export function labelOfUse(language: Language, use: RoomUse): string {
  return USE_LABELS[language][use]
}

/** A label as it is matched: lower case, accents taken off, letters and digits only. */
export function foldLabel(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const BY_LABEL: ReadonlyMap<string, RoomUse> = new Map(
  Object.values(USE_LABELS).flatMap((labels) => Object.entries(labels).map(([use, label]) => [foldLabel(label), use as RoomUse] as const))
)

/** The use a label names in any language Grid writes, whatever its capitals and accents: `Dormitorio` is `bedroom`. Null for any other word. */
export function roomUseOfLabel(word: string): RoomUse | null {
  return BY_LABEL.get(foldLabel(word)) ?? null
}
