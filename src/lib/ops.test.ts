import { describe, expect, it } from 'vitest'
import {
  addItem,
  deleteItem,
  liveItems,
  memberIdFromName,
  nextStamp,
  renameItem,
  setBought,
  upsertMember,
} from './ops'
import { emptyDoc } from './types'

const NOW = Date.parse('2026-08-06T10:00:00.000Z')

describe('nextStamp', () => {
  it('обычный случай — текущее время', () => {
    expect(nextStamp(null, NOW)).toBe(new Date(NOW).toISOString())
  })

  it('часы устройства отстают — метка всё равно строго новее предыдущей', () => {
    const previous = new Date(NOW + 60_000).toISOString()

    // Иначе правка с отстающего телефона молча проиграет при мерже.
    expect(Date.parse(nextStamp(previous, NOW))).toBeGreaterThan(Date.parse(previous))
  })
})

describe('операции', () => {
  it('добавление создаёт нужную позицию с автором', () => {
    const { doc, op } = addItem(emptyDoc(), '  Кофе  ', 'aibek', NOW)

    expect(doc.items).toHaveLength(1)
    expect(doc.items[0].title).toBe('Кофе')
    expect(doc.items[0].status).toBe('needed')
    expect(doc.items[0].createdBy).toBe('aibek')
    expect(op.kind).toBe('add')
  })

  it('отметка «куплено» проставляет покупателя и время', () => {
    const added = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    const result = setBought(added.doc, added.doc.items[0].id, 'aigul', true, NOW + 1000)

    expect(result?.doc.items[0].status).toBe('bought')
    expect(result?.doc.items[0].boughtBy).toBe('aigul')
    expect(result?.doc.items[0].boughtAt).not.toBeNull()
  })

  it('отмена отметки очищает покупателя', () => {
    const added = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    const bought = setBought(added.doc, added.doc.items[0].id, 'aigul', true, NOW + 1000)!
    const undone = setBought(bought.doc, bought.doc.items[0].id, 'aigul', false, NOW + 2000)

    expect(undone?.doc.items[0].status).toBe('needed')
    expect(undone?.doc.items[0].boughtBy).toBeNull()
    expect(undone?.doc.items[0].boughtAt).toBeNull()
  })

  it('удаление ставит надгробие, а не вырезает из массива', () => {
    const added = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    const result = deleteItem(added.doc, added.doc.items[0].id, NOW + 1000)!

    expect(result.doc.items).toHaveLength(1)
    expect(result.doc.items[0].deletedAt).not.toBeNull()
    expect(liveItems(result.doc)).toHaveLength(0)
  })

  it('операция над несуществующей позицией ничего не ломает', () => {
    expect(setBought(emptyDoc(), 'нет-такой', 'aibek', true, NOW)).toBeNull()
    expect(deleteItem(emptyDoc(), 'нет-такой', NOW)).toBeNull()
    expect(renameItem(emptyDoc(), 'нет-такой', 'Что-то', NOW)).toBeNull()
  })

  it('повторное добавление участника обновляет запись, а не плодит дубль', () => {
    const first = upsertMember(emptyDoc(), { id: 'aibek', name: 'Айбек', color: 'blue' }, NOW)
    const second = upsertMember(
      first.doc,
      { id: 'aibek', name: 'Папа', color: 'blue' },
      NOW + 1000,
    )

    expect(second.doc.members).toHaveLength(1)
    expect(second.doc.members[0].name).toBe('Папа')
  })
})

describe('memberIdFromName', () => {
  it('транслитерирует кириллицу — файл читается глазами', () => {
    expect(memberIdFromName('Айбек')).toBe('aibek')
    expect(memberIdFromName('Айгуль')).toBe('aigul')
  })

  it('разводит тёзок суффиксом', () => {
    expect(memberIdFromName('Айбек', ['aibek'])).toBe('aibek-2')
    expect(memberIdFromName('Айбек', ['aibek', 'aibek-2'])).toBe('aibek-3')
  })

  it('не оставляет пустой id', () => {
    expect(memberIdFromName('!!!')).toBe('member')
  })
})
