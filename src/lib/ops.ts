import { ulid } from 'ulid'
import type { Item, ListDoc, Member, MemberColor, PendingOp } from './types'

/**
 * Метка времени для локального изменения.
 *
 * Часы на телефонах расходятся. Если взять просто Date.now() на «отстающем»
 * устройстве, правка окажется старше того, что она заменяет, и молча проиграет
 * при мерже. Поэтому новая метка всегда строго больше предыдущей.
 */
export function nextStamp(previous?: string | null, now: number = Date.now()): string {
  const floor = previous ? Date.parse(previous) + 1 : 0
  return new Date(Math.max(now, floor)).toISOString()
}

function withEntry<T extends { id: string }>(entries: T[], next: T): T[] {
  const index = entries.findIndex((entry) => entry.id === next.id)
  if (index === -1) return [...entries, next]
  return entries.map((entry, i) => (i === index ? next : entry))
}

function pending(kind: PendingOp['kind'], targetId: string, at: string): PendingOp {
  return { id: ulid(), kind, targetId, at }
}

export interface OpResult {
  doc: ListDoc
  op: PendingOp
}

export function addItem(
  doc: ListDoc,
  title: string,
  memberId: string,
  now: number = Date.now(),
): OpResult {
  const at = nextStamp(null, now)
  const item: Item = {
    // ULID генерируется оффлайн на устройстве — счётчик тут невозможен (ТЗ §5).
    id: ulid(now),
    title: title.trim(),
    note: '',
    status: 'needed',
    createdBy: memberId,
    createdAt: at,
    updatedAt: at,
    boughtBy: null,
    boughtAt: null,
    deletedAt: null,
  }
  return {
    doc: { ...doc, items: [...doc.items, item] },
    op: pending('add', item.id, at),
  }
}

function updateItem(
  doc: ListDoc,
  itemId: string,
  patch: (item: Item, at: string) => Item,
  now: number,
): { doc: ListDoc; item: Item; at: string } | null {
  const item = doc.items.find((candidate) => candidate.id === itemId)
  if (!item) return null

  const at = nextStamp(item.updatedAt, now)
  const next = patch(item, at)
  return { doc: { ...doc, items: withEntry(doc.items, next) }, item: next, at }
}

export function setBought(
  doc: ListDoc,
  itemId: string,
  memberId: string,
  bought: boolean,
  now: number = Date.now(),
): OpResult | null {
  const result = updateItem(
    doc,
    itemId,
    (item, at) => ({
      ...item,
      status: bought ? 'bought' : 'needed',
      boughtBy: bought ? memberId : null,
      boughtAt: bought ? at : null,
      updatedAt: at,
    }),
    now,
  )
  if (!result) return null

  return { doc: result.doc, op: pending(bought ? 'buy' : 'unbuy', itemId, result.at) }
}

export function deleteItem(
  doc: ListDoc,
  itemId: string,
  now: number = Date.now(),
): OpResult | null {
  // Не удаление из массива, а надгробие: иначе устройство с устаревшей копией
  // воскресит позицию при следующей синхронизации (ТЗ §5).
  const result = updateItem(
    doc,
    itemId,
    (item, at) => ({ ...item, deletedAt: at, updatedAt: at }),
    now,
  )
  if (!result) return null

  return { doc: result.doc, op: pending('delete', itemId, result.at) }
}

export function renameItem(
  doc: ListDoc,
  itemId: string,
  title: string,
  now: number = Date.now(),
): OpResult | null {
  const result = updateItem(
    doc,
    itemId,
    (item, at) => ({ ...item, title: title.trim(), updatedAt: at }),
    now,
  )
  if (!result) return null

  return { doc: result.doc, op: pending('rename', itemId, result.at) }
}

export function upsertMember(
  doc: ListDoc,
  member: Omit<Member, 'updatedAt' | 'deletedAt'> & { deletedAt?: string | null },
  now: number = Date.now(),
): OpResult {
  // Правка участника с одного устройства не должна откатываться вторым:
  // метка времени строго новее предыдущей, дальше решает мерж.
  const existing = doc.members.find((candidate) => candidate.id === member.id)
  const at = nextStamp(existing?.updatedAt, now)
  const next: Member = {
    ...member,
    deletedAt: member.deletedAt ?? existing?.deletedAt ?? null,
    updatedAt: at,
  }

  return {
    doc: { ...doc, members: withEntry(doc.members, next) },
    op: pending('member', member.id, at),
  }
}

/** id участника — транслитерация имени, чтобы файл читался глазами. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function memberIdFromName(name: string, taken: string[] = []): string {
  const base =
    [...name.toLowerCase()]
      .map((char) => TRANSLIT[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'member'

  if (!taken.includes(base)) return base

  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}

export function pickColor(taken: MemberColor[], palette: readonly MemberColor[]): MemberColor {
  return palette.find((color) => !taken.includes(color)) ?? palette[taken.length % palette.length]
}

/** Живые (не удалённые) записи — то, что показывается на экране. */
export function liveItems(doc: ListDoc): Item[] {
  return doc.items.filter((item) => !item.deletedAt)
}

export function liveMembers(doc: ListDoc): Member[] {
  return doc.members.filter((member) => !member.deletedAt)
}
