import { describe, expect, it } from 'vitest'
import { mergeDocs, sameDoc, serializeDoc, TOMBSTONE_TTL_MS } from './merge'
import type { Item, ListDoc, Member } from './types'

const T0 = Date.parse('2026-08-06T10:00:00.000Z')

function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString()
}

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    title: id,
    note: '',
    status: 'needed',
    createdBy: 'aibek',
    createdAt: iso(0),
    updatedAt: iso(0),
    boughtBy: null,
    boughtAt: null,
    deletedAt: null,
    ...patch,
  }
}

function member(id: string, patch: Partial<Member> = {}): Member {
  return {
    id,
    name: id,
    color: 'blue',
    updatedAt: iso(0),
    deletedAt: null,
    ...patch,
  }
}

function doc(items: Item[], members: Member[] = []): ListDoc {
  return { version: 1, members, items }
}

describe('mergeDocs', () => {
  it('берёт позицию, которой нет в локальной копии', () => {
    const merged = mergeDocs(doc([item('milk')]), doc([]), T0)

    expect(merged.items.map((entry) => entry.id)).toEqual(['milk'])
  })

  it('берёт позицию, которой нет в удалённой копии', () => {
    const merged = mergeDocs(doc([]), doc([item('bread')]), T0)

    expect(merged.items.map((entry) => entry.id)).toEqual(['bread'])
  })

  it('при конфликте побеждает свежая метка — локальная', () => {
    const remote = doc([item('milk', { title: 'Молоко', updatedAt: iso(1000) })])
    const local = doc([item('milk', { title: 'Молоко 2.5%', updatedAt: iso(2000) })])

    expect(mergeDocs(remote, local, T0).items[0].title).toBe('Молоко 2.5%')
  })

  it('при конфликте побеждает свежая метка — удалённая', () => {
    const remote = doc([item('milk', { title: 'Молоко 3.2%', updatedAt: iso(3000) })])
    const local = doc([item('milk', { title: 'Молоко', updatedAt: iso(2000) })])

    expect(mergeDocs(remote, local, T0).items[0].title).toBe('Молоко 3.2%')
  })

  it('двое отметили разные позиции — обе отметки сохраняются', () => {
    const base = [item('milk'), item('bread')]
    const remote = doc([
      { ...base[0], status: 'bought', boughtBy: 'aigul', boughtAt: iso(500), updatedAt: iso(500) },
      base[1],
    ])
    const local = doc([
      base[0],
      { ...base[1], status: 'bought', boughtBy: 'aibek', boughtAt: iso(600), updatedAt: iso(600) },
    ])

    const merged = mergeDocs(remote, local, T0)
    const byId = new Map(merged.items.map((entry) => [entry.id, entry]))

    expect(byId.get('milk')?.boughtBy).toBe('aigul')
    expect(byId.get('bread')?.boughtBy).toBe('aibek')
  })

  it('deletedAt — обычное поле: свежее удаление побеждает старую правку', () => {
    const remote = doc([item('milk', { title: 'Молоко!', updatedAt: iso(1000) })])
    const local = doc([item('milk', { deletedAt: iso(2000), updatedAt: iso(2000) })])

    expect(mergeDocs(remote, local, T0).items[0].deletedAt).toBe(iso(2000))
  })

  it('свежая правка воскрешает позицию поверх старого удаления', () => {
    const remote = doc([item('milk', { deletedAt: iso(1000), updatedAt: iso(1000) })])
    const local = doc([item('milk', { title: 'Молоко', updatedAt: iso(2000) })])

    expect(mergeDocs(remote, local, T0).items[0].deletedAt).toBeNull()
  })

  it('надгробие младше 30 дней остаётся: иначе устаревшая копия воскресит позицию', () => {
    const tombstone = item('milk', { deletedAt: iso(0), updatedAt: iso(0) })
    const now = T0 + TOMBSTONE_TTL_MS - 1000

    expect(mergeDocs(doc([tombstone]), doc([]), now).items).toHaveLength(1)
  })

  it('надгробие старше 30 дней вычищается физически', () => {
    const tombstone = item('milk', { deletedAt: iso(0), updatedAt: iso(0) })
    const now = T0 + TOMBSTONE_TTL_MS + 1000

    expect(mergeDocs(doc([tombstone]), doc([]), now).items).toHaveLength(0)
  })

  it('участники мержатся по updatedAt — двое добавились одновременно', () => {
    const remote = doc([], [member('aibek')])
    const local = doc([], [member('aigul')])

    expect(mergeDocs(remote, local, T0).members.map((entry) => entry.id).sort()).toEqual([
      'aibek',
      'aigul',
    ])
  })

  it('переименование участника с одного устройства не откатывается вторым', () => {
    const remote = doc([], [member('aibek', { name: 'Айбек', updatedAt: iso(1000) })])
    const local = doc([], [member('aibek', { name: 'Папа', updatedAt: iso(2000) })])

    expect(mergeDocs(remote, local, T0).members[0].name).toBe('Папа')
  })

  it('мерж идемпотентен: повторное слияние не меняет результат', () => {
    const remote = doc([item('milk', { updatedAt: iso(1000) })])
    const local = doc([item('bread', { updatedAt: iso(2000) })])

    const once = mergeDocs(remote, local, T0)
    const twice = mergeDocs(once, local, T0)

    expect(sameDoc(once, twice)).toBe(true)
  })
})

describe('sameDoc', () => {
  it('не зависит от порядка элементов', () => {
    const a = doc([item('milk'), item('bread')])
    const b = doc([item('bread'), item('milk')])

    expect(sameDoc(a, b)).toBe(true)
  })

  it('видит разницу в поле', () => {
    const a = doc([item('milk', { status: 'needed' })])
    const b = doc([item('milk', { status: 'bought' })])

    expect(sameDoc(a, b)).toBe(false)
  })

  it('видит лишнюю позицию', () => {
    expect(sameDoc(doc([item('milk')]), doc([item('milk'), item('bread')]))).toBe(false)
  })
})

describe('serializeDoc', () => {
  it('кириллица не экранируется — файл читается глазами в истории коммитов', () => {
    const text = serializeDoc(doc([item('01J', { title: 'Молоко 2.5%' })]))

    expect(text).toContain('"Молоко 2.5%"')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('порядок стабилен независимо от порядка в памяти', () => {
    const a = doc([item('x', { createdAt: iso(100) }), item('y', { createdAt: iso(0) })])
    const b = doc([item('y', { createdAt: iso(0) }), item('x', { createdAt: iso(100) })])

    expect(serializeDoc(a)).toBe(serializeDoc(b))
  })
})
