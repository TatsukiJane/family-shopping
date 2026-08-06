import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeBase64, encodeBase64 } from './b64'
import * as db from './db'
import { serializeDoc } from './merge'
import { addItem, setBought } from './ops'
import { SyncEngine } from './sync'
import { emptyDoc, type ListDoc, type RepoConfig, type SyncStatus } from './types'

const REPO: RepoConfig = {
  owner: 'octocat',
  repo: 'family-list-data',
  branch: 'main',
  path: 'data/list.json',
}

const NOW = Date.parse('2026-08-06T10:00:00.000Z')

/**
 * Contents API в миниатюре: хранит одно содержимое и один sha, отвергает
 * запись поверх устаревшего sha — ровно тот конфликт, который разбирает push.
 */
function fakeGithub() {
  const state = {
    content: null as string | null,
    sha: 0,
    gets: 0,
    puts: 0,
    conflicts: 0,
    /** Позволяет «подложить» чужую запись между GET и PUT. */
    beforePut: null as (() => void | Promise<void>) | null,
    offline: false,
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const write = (doc: ListDoc) => {
    state.content = serializeDoc(doc)
    state.sha += 1
  }

  const read = (): ListDoc | null =>
    state.content === null ? null : (JSON.parse(state.content) as ListDoc)

  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (state.offline) throw new TypeError('Failed to fetch')

    const method = init?.method ?? 'GET'

    if (method === 'GET') {
      state.gets += 1
      if (state.content === null) return json(404, { message: 'Not Found' })
      return json(200, {
        content: encodeBase64(state.content),
        encoding: 'base64',
        sha: String(state.sha),
      })
    }

    await state.beforePut?.()

    const body = JSON.parse(String(init?.body)) as { content: string; sha?: string }
    const current = state.content === null ? undefined : String(state.sha)

    if (body.sha !== current) {
      state.conflicts += 1
      return json(409, { message: 'does not match' })
    }

    state.puts += 1
    state.content = decodeBase64(body.content)
    state.sha += 1
    return json(200, { content: { sha: String(state.sha) } })
  }

  return { state, fetchImpl, read, write }
}

function makeEngine() {
  const statuses: SyncStatus[] = []
  let doc: ListDoc = emptyDoc()

  const engine = new SyncEngine({
    getAuth: async () => ({ token: 'github_pat_test', config: REPO }),
    onDoc: (next) => {
      doc = next
    },
    onStatus: (status) => statuses.push(status),
  })

  return { engine, statuses, current: () => doc }
}

async function seedLocal(doc: ListDoc): Promise<void> {
  await db.snapshot.set(doc)
}

let github: ReturnType<typeof fakeGithub>

beforeEach(async () => {
  // Соединение надо закрыть до удаления: иначе deleteDatabase блокируется.
  await db.closeDb()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('family-shopping')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })

  github = fakeGithub()
  vi.stubGlobal('fetch', vi.fn(github.fetchImpl))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.closeDb()
})

describe('push', () => {
  it('создаёт файл, когда его ещё нет, и очищает очередь', async () => {
    const { engine, statuses } = makeEngine()
    const { doc, op } = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)

    await seedLocal(doc)
    await db.queue.push(op)
    await engine.push()

    expect(github.read()?.items[0].title).toBe('Кофе')
    expect(await db.queue.count()).toBe(0)
    expect(statuses.at(-1)).toBe('synced')
    engine.stop()
  })

  it('ничего не коммитит, если удалённая версия уже содержит локальную', async () => {
    const { engine } = makeEngine()
    const { doc, op } = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)

    github.write(doc)
    await seedLocal(doc)
    await db.queue.push(op)
    await engine.push()

    expect(github.state.puts).toBe(0)
    expect(await db.queue.count()).toBe(0)
    engine.stop()
  })

  it('разрешает конфликт: чужая запись между GET и PUT не теряется', async () => {
    const { engine } = makeEngine()

    const base = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    github.write(base.doc)

    // Наше изменение поверх той же базы.
    const mine = addItem(base.doc, 'Хлеб', 'aibek', NOW + 1000)
    await seedLocal(mine.doc)
    await db.queue.push(mine.op)

    // Второе устройство успевает записать своё, пока мы держим старый sha.
    github.state.beforePut = () => {
      const remote = github.read()!
      github.write(addItem(remote, 'Творог', 'aigul', NOW + 2000).doc)
      github.state.beforePut = null
    }

    await engine.push()

    const titles = github.read()!.items.map((item) => item.title).sort()
    expect(titles).toEqual(['Кофе', 'Творог', 'Хлеб'])
    expect(github.state.conflicts).toBe(1)
    expect(await db.queue.count()).toBe(0)
    engine.stop()
  })

  it('сдаётся после трёх попыток и сообщает об ошибке', async () => {
    const { engine, statuses } = makeEngine()

    const base = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    github.write(base.doc)

    const mine = addItem(base.doc, 'Хлеб', 'aibek', NOW + 1000)
    await seedLocal(mine.doc)
    await db.queue.push(mine.op)

    // Кто-то пишет перед каждым нашим PUT — конфликт не кончается.
    let counter = 0
    github.state.beforePut = () => {
      counter += 1
      github.write(addItem(github.read()!, `Позиция ${counter}`, 'aigul', NOW + counter).doc)
    }

    await engine.push()

    expect(github.state.conflicts).toBe(3)
    expect(statuses.at(-1)).toBe('error')
    // Изменение не потеряно: очередь ждёт следующей попытки.
    expect(await db.queue.count()).toBe(1)
    engine.stop()
  })

  it('двое отметили разные позиции — обе отметки доезжают', async () => {
    const { engine } = makeEngine()

    let base = addItem(emptyDoc(), 'Кофе', 'aibek', NOW).doc
    base = addItem(base, 'Хлеб', 'aibek', NOW + 100).doc
    github.write(base)

    const coffee = base.items[0]
    const bread = base.items[1]

    const mine = setBought(base, coffee.id, 'aibek', true, NOW + 1000)!
    await seedLocal(mine.doc)
    await db.queue.push(mine.op)

    github.state.beforePut = () => {
      const remote = github.read()!
      github.write(setBought(remote, bread.id, 'aigul', true, NOW + 1100)!.doc)
      github.state.beforePut = null
    }

    await engine.push()

    const byId = new Map(github.read()!.items.map((item) => [item.id, item]))
    expect(byId.get(coffee.id)?.boughtBy).toBe('aibek')
    expect(byId.get(bread.id)?.boughtBy).toBe('aigul')
    engine.stop()
  })
})

describe('оффлайн', () => {
  it('пять изменений оффлайн доезжают одним коммитом и не задваиваются', async () => {
    const { engine, statuses } = makeEngine()
    github.state.offline = true

    let doc = emptyDoc()
    for (const title of ['Кофе', 'Хлеб', 'Творог', 'Молоко', 'Яйца']) {
      const result = addItem(doc, title, 'aibek', NOW + doc.items.length)
      doc = result.doc
      await engine.enqueue(doc, result.op, 60_000)
    }

    await engine.push()
    expect(statuses.at(-1)).toBe('offline')
    expect(await db.queue.count()).toBe(5)

    github.state.offline = false
    await engine.push()

    expect(github.read()!.items).toHaveLength(5)
    expect(github.state.puts).toBe(1)
    expect(await db.queue.count()).toBe(0)
    expect(statuses.at(-1)).toBe('synced')
    engine.stop()
  })

  it('повторная отправка того же снапшота не плодит дубли', async () => {
    const { engine } = makeEngine()
    const { doc, op } = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)

    await seedLocal(doc)
    await db.queue.push(op)
    await engine.push()
    await db.queue.push(op)
    await engine.push()

    expect(github.read()!.items).toHaveLength(1)
    engine.stop()
  })
})

describe('pull', () => {
  it('сливает удалённые изменения с локальными, ничего не теряя', async () => {
    const { engine, current } = makeEngine()

    const remote = addItem(emptyDoc(), 'Кофе', 'aigul', NOW)
    github.write(remote.doc)

    const local = addItem(emptyDoc(), 'Хлеб', 'aibek', NOW + 1000)
    await seedLocal(local.doc)
    await db.queue.push(local.op)

    await engine.pull()

    expect(current().items.map((item) => item.title).sort()).toEqual(['Кофе', 'Хлеб'])
    engine.stop()
  })

  it('отсутствие файла — не ошибка, а «список ещё не создан»', async () => {
    const { engine, statuses } = makeEngine()

    await engine.pull()

    expect(statuses).not.toContain('error')
    engine.stop()
  })

  it('протухший токен разводится с ошибкой сети', async () => {
    const { engine, statuses } = makeEngine()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })),
    )

    await engine.pull()

    expect(statuses.at(-1)).toBe('unauthorized')
    engine.stop()
  })
})

describe('очередь', () => {
  it('изменения во время отправки не теряются', async () => {
    const { engine } = makeEngine()

    const first = addItem(emptyDoc(), 'Кофе', 'aibek', NOW)
    await seedLocal(first.doc)
    await db.queue.push(first.op)

    // Пользователь добавляет позицию, пока идёт запрос.
    github.state.beforePut = async () => {
      const second = addItem(first.doc, 'Хлеб', 'aibek', NOW + 1000)
      await db.snapshot.set(second.doc)
      await db.queue.push(second.op)
      github.state.beforePut = null
    }

    await engine.push()

    // Первая операция снята, вторая ждёт следующего пуша.
    expect(await db.queue.count()).toBe(1)
    engine.stop()
  })
})
