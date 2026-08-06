import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ListDoc, PendingOp, Profile, RepoConfig } from './types'

/**
 * Локальное хранилище устройства: токен, профиль, снапшот списка и очередь
 * неотправленных изменений.
 *
 * Почему не Service Worker cache: SW-кэш — это кэш HTTP-ответов. Нужен
 * управляемый стор с очередью операций, а не кэш ответов API (ТЗ §8).
 */

const DB_NAME = 'family-shopping'
const DB_VERSION = 1

interface Schema extends DBSchema {
  kv: {
    key: string
    value: unknown
  }
  queue: {
    key: string
    value: PendingOp
  }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('kv')
      database.createObjectStore('queue', { keyPath: 'id' })
    },
  })
  return dbPromise
}

/**
 * Закрывает соединение и сбрасывает кэш. Нужно в тестах: пока соединение
 * открыто, deleteDatabase блокируется и висит до таймаута.
 */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const database = await dbPromise
  dbPromise = null
  database.close()
}

async function get<T>(key: string): Promise<T | undefined> {
  return (await db()).get('kv', key) as Promise<T | undefined>
}

async function set(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key)
}

async function remove(key: string): Promise<void> {
  await (await db()).delete('kv', key)
}

/** Fine-grained PAT. Лежит только на этом устройстве и никуда не уезжает. */
export const token = {
  get: () => get<string>('token'),
  set: (value: string) => set('token', value),
  clear: () => remove('token'),
}

/** Кто пользуется устройством — этим подписываются действия. */
export const profile = {
  get: () => get<Profile>('profile'),
  set: (value: Profile) => set('profile', value),
  clear: () => remove('profile'),
}

/** Переопределение координат репозитория с данными из экрана настроек. */
export const repoOverride = {
  get: () => get<Partial<RepoConfig>>('repoOverride'),
  set: (value: Partial<RepoConfig>) => set('repoOverride', value),
  clear: () => remove('repoOverride'),
}

/** Локальная копия списка — источник правды для интерфейса. */
export const snapshot = {
  get: () => get<ListDoc>('doc'),
  set: (value: ListDoc) => set('doc', value),
  clear: () => remove('doc'),
}

/** sha версии, поверх которой пишем. */
export const remoteSha = {
  get: () => get<string>('sha'),
  set: (value: string) => set('sha', value),
  clear: () => remove('sha'),
}

export const queue = {
  async all(): Promise<PendingOp[]> {
    return (await db()).getAll('queue')
  },

  async push(op: PendingOp): Promise<void> {
    await (await db()).put('queue', op)
  },

  async count(): Promise<number> {
    return (await db()).count('queue')
  },

  /**
   * Снимает только те операции, что были в очереди на момент старта отправки.
   * Всё, что пользователь успел натыкать во время запроса, остаётся ждать
   * следующего пуша.
   */
  async remove(ids: string[]): Promise<void> {
    const tx = (await db()).transaction('queue', 'readwrite')
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  },

  async clear(): Promise<void> {
    await (await db()).clear('queue')
  },
}

/** Полный сброс устройства: смена токена, выход, отладка. */
export async function wipeDevice(): Promise<void> {
  const database = await db()
  await database.clear('kv')
  await database.clear('queue')
}
