import { PUSH_DEBOUNCE_MS, PUSH_MAX_ATTEMPTS } from './config'
import * as db from './db'
import { getFile, GithubError, putFile } from './github'
import { mergeDocs, sameDoc } from './merge'
import { changes } from './plural'
import { emptyDoc, type ListDoc, type PendingOp, type RepoConfig, type SyncStatus } from './types'

export interface SyncDeps {
  /** `null`, если устройство ещё не настроено. */
  getAuth: () => Promise<{ token: string; config: RepoConfig } | null>
  /** Список поменялся после мержа с удалённой версией. */
  onDoc: (doc: ListDoc) => void
  onStatus: (status: SyncStatus, pending: number) => void
}

/**
 * Сеть отвалилась: fetch кидает TypeError, а не HTTP-ошибку.
 * Отличаем это от ошибки API, чтобы не пугать пользователя в подвале
 * супермаркета сообщением об ошибке (ТЗ §S4).
 */
function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return error instanceof TypeError
}

/** Сообщение коммита: историю читают глазами, «Update list.json» бесполезен. */
export function commitMessage(ops: PendingOp[], doc: ListDoc): string {
  if (ops.length === 0) return 'Список: синхронизация'

  if (ops.length === 1) {
    const [op] = ops
    const title = doc.items.find((item) => item.id === op.targetId)?.title
    const member = doc.members.find((m) => m.id === op.targetId)?.name

    switch (op.kind) {
      case 'add':
        return `Добавлено: ${title ?? op.targetId}`
      case 'buy':
        return `Куплено: ${title ?? op.targetId}`
      case 'unbuy':
        return `Возвращено в список: ${title ?? op.targetId}`
      case 'delete':
        return `Удалено: ${title ?? op.targetId}`
      case 'rename':
        return `Переименовано: ${title ?? op.targetId}`
      case 'member':
        return `Участник: ${member ?? op.targetId}`
    }
  }

  return `Список: ${changes(ops.length)}`
}

export class SyncEngine {
  private status: SyncStatus = 'idle'
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pushing = false
  private pushAgain = false
  private detach: (() => void) | null = null
  private readonly deps: SyncDeps

  constructor(deps: SyncDeps) {
    this.deps = deps
  }

  /** Подписка на возврат фокуса и появление сети. Поллинга по таймеру нет (ТЗ §6). */
  start(): void {
    if (this.detach) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.pull()
    }
    const onOnline = () => {
      void this.pull().then(() => this.schedulePush(0))
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    this.detach = () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }

  stop(): void {
    this.detach?.()
    this.detach = null
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = null
  }

  /** Применённое локально изменение: сохранить, поставить в очередь, запланировать пуш. */
  async enqueue(doc: ListDoc, op: PendingOp, delayMs = PUSH_DEBOUNCE_MS): Promise<void> {
    await db.snapshot.set(doc)
    await db.queue.push(op)
    await this.emitStatus('idle')
    this.schedulePush(delayMs)
  }

  schedulePush(delayMs = PUSH_DEBOUNCE_MS): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      void this.push()
    }, delayMs)
  }

  /** Забрать удалённую версию и смержить с локальной. */
  async pull(): Promise<ListDoc | null> {
    const auth = await this.deps.getAuth()
    if (!auth) return null

    await this.emitStatus('syncing')

    try {
      const remote = await getFile(auth.token, auth.config)
      const local = (await db.snapshot.get()) ?? emptyDoc()

      if (!remote) {
        // Файла нет — синхронизировать нечего, но локальные изменения
        // (например, создание списка) остаются в очереди и уедут пушем.
        await this.settle()
        return local
      }

      const merged = mergeDocs(remote.doc, local)
      await db.snapshot.set(merged)
      await db.remoteSha.set(remote.sha)
      this.deps.onDoc(merged)

      if ((await db.queue.count()) > 0) this.schedulePush(0)
      await this.settle()
      return merged
    } catch (error) {
      await this.handleError(error)
      return null
    }
  }

  /**
   * Отправка. Мерж идемпотентен, поэтому очередь не переигрывается: достаточно
   * слить локальный снапшот с удалённой версией и записать результат.
   */
  async push(): Promise<void> {
    if (this.pushing) {
      // Пока шёл запрос, появились новые изменения — повторим сразу после.
      this.pushAgain = true
      return
    }

    const auth = await this.deps.getAuth()
    if (!auth) return

    const ops = await db.queue.all()
    if (ops.length === 0) {
      await this.settle()
      return
    }

    this.pushing = true
    try {
      await this.attemptPush(auth.token, auth.config, ops)
    } finally {
      this.pushing = false
      if (this.pushAgain) {
        this.pushAgain = false
        this.schedulePush(0)
      }
    }
  }

  private async attemptPush(
    token: string,
    config: RepoConfig,
    ops: PendingOp[],
  ): Promise<void> {
    const ids = ops.map((op) => op.id)
    await this.emitStatus('syncing')

    for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt++) {
      try {
        const local = (await db.snapshot.get()) ?? emptyDoc()
        const remote = await getFile(token, config)
        const merged = mergeDocs(remote?.doc ?? emptyDoc(), local)

        await db.snapshot.set(merged)
        this.deps.onDoc(merged)

        // Удалённая версия уже содержит всё наше — коммитить нечего.
        if (remote && sameDoc(merged, remote.doc)) {
          await db.remoteSha.set(remote.sha)
          await db.queue.remove(ids)
          await this.settle()
          return
        }

        const sha = await putFile(
          token,
          config,
          merged,
          remote?.sha,
          commitMessage(ops, merged),
        )

        await db.remoteSha.set(sha)
        // Снимаем только то, что было в очереди на старте: натыканное во
        // время запроса ждёт следующего пуша.
        await db.queue.remove(ids)
        await this.settle()
        return
      } catch (error) {
        // Файл изменился между чтением и записью — перечитать и повторить.
        if (error instanceof GithubError && error.isConflict && attempt < PUSH_MAX_ATTEMPTS) {
          continue
        }
        await this.handleError(error)
        return
      }
    }

    await this.emitStatus('error')
  }

  private async handleError(error: unknown): Promise<void> {
    if (isOffline(error)) {
      await this.emitStatus('offline')
      return
    }
    if (error instanceof GithubError && error.isUnauthorized) {
      await this.emitStatus('unauthorized')
      return
    }
    await this.emitStatus('error')
  }

  /** Очередь пуста — «синхронизировано», иначе ждём следующего пуша. */
  private async settle(): Promise<void> {
    const pending = await db.queue.count()
    await this.emitStatus(pending === 0 ? 'synced' : 'idle', pending)
  }

  private async emitStatus(status: SyncStatus, pending?: number): Promise<void> {
    this.status = status
    this.deps.onStatus(status, pending ?? (await db.queue.count()))
  }

  get currentStatus(): SyncStatus {
    return this.status
  }
}
