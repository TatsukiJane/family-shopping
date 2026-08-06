import { SCHEMA_VERSION, type Item, type ListDoc, type Member } from './types'

/** Через столько после удаления надгробие можно физически выкинуть (ТЗ §5). */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface Timestamped {
  id: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Item-level Last Write Wins по updatedAt.
 *
 * Конфликтующая операция в семейном списке ровно одна — «двое одновременно
 * отметили одну позицию купленной», и результат в обоих случаях одинаковый.
 * Платить за CRDT нечем (ТЗ §6).
 */
function mergeCollections<T extends Timestamped>(remote: T[], local: T[]): T[] {
  const byId = new Map<string, T>()

  for (const entry of remote) byId.set(entry.id, entry)

  for (const entry of local) {
    const existing = byId.get(entry.id)
    // Нет в удалённой версии — берём. Есть в обеих — берём свежую по updatedAt.
    // deletedAt тут не особенный: это обычное поле с меткой времени.
    if (!existing || entry.updatedAt > existing.updatedAt) {
      byId.set(entry.id, entry)
    }
  }

  return [...byId.values()]
}

/**
 * Физическая чистка надгробий старше TTL.
 *
 * Раньше срока удалять нельзя: устройство с устаревшей копией воскресит
 * позицию при следующей синхронизации.
 */
function collectGarbage<T extends Timestamped>(entries: T[], now: number): T[] {
  return entries.filter((entry) => {
    if (!entry.deletedAt) return true
    return now - Date.parse(entry.deletedAt) < TOMBSTONE_TTL_MS
  })
}

export function mergeDocs(
  remote: ListDoc,
  local: ListDoc,
  now: number = Date.now(),
): ListDoc {
  return {
    version: Math.max(remote.version ?? SCHEMA_VERSION, local.version ?? SCHEMA_VERSION),
    members: collectGarbage(mergeCollections(remote.members, local.members), now),
    items: collectGarbage(mergeCollections(remote.items, local.items), now),
  }
}

function sameEntry(a: Timestamped, b: Timestamped): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function sameCollection<T extends Timestamped>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((entry) => [entry.id, entry]))
  return a.every((entry) => {
    const other = byId.get(entry.id)
    return other !== undefined && sameEntry(entry, other)
  })
}

/**
 * Порядок элементов в массивах несущественен — сравниваем по id.
 * Нужно, чтобы не коммитить файл, в котором ничего не поменялось.
 */
export function sameDoc(a: ListDoc, b: ListDoc): boolean {
  return (
    a.version === b.version &&
    sameCollection(a.members, b.members) &&
    sameCollection(a.items, b.items)
  )
}

/** Стабильный порядок в файле: он читается глазами в истории коммитов. */
export function serializeDoc(doc: ListDoc): string {
  const byCreation = (a: Item, b: Item) => a.createdAt.localeCompare(b.createdAt)
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'ru')

  return `${JSON.stringify(
    {
      version: doc.version,
      members: [...doc.members].sort(byName),
      items: [...doc.items].sort(byCreation),
    },
    null,
    2,
  )}\n`
}
