import { create } from 'zustand'
import { isRepoConfigComplete, resolveRepoConfig, UNDO_WINDOW_MS } from '@/lib/config'
import * as db from '@/lib/db'
import {
  addItem as addItemOp,
  deleteItem as deleteItemOp,
  liveMembers,
  memberIdFromName,
  pickColor,
  renameItem as renameItemOp,
  setBought as setBoughtOp,
  upsertMember,
} from '@/lib/ops'
import { SyncEngine } from '@/lib/sync'
import {
  emptyDoc,
  MEMBER_COLORS,
  type ListDoc,
  type Member,
  type MemberColor,
  type RepoConfig,
  type SyncStatus,
} from '@/lib/types'

/** Экран, который сейчас показываем. */
export type Phase = 'loading' | 'setup' | 'ready'

interface AppState {
  phase: Phase
  doc: ListDoc
  memberId: string | null
  token: string | null
  repo: RepoConfig
  syncStatus: SyncStatus
  pending: number

  init: () => Promise<void>
  completeSetup: (input: SetupInput) => Promise<void>

  addItem: (title: string) => Promise<void>
  setBought: (itemId: string, bought: boolean) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  renameItem: (itemId: string, title: string) => Promise<void>

  switchMember: (memberId: string) => Promise<void>
  changeToken: (token: string) => Promise<void>
  changeRepo: (repo: RepoConfig) => Promise<void>
  syncNow: () => Promise<void>
  resetDevice: () => Promise<void>
}

export interface SetupInput {
  token: string
  repo: RepoConfig
  /** Существующий участник — или имя нового. */
  memberId?: string
  name?: string
}

export const engine = new SyncEngine({
  getAuth: async () => {
    const token = await db.token.get()
    const repo = resolveRepoConfig(await db.repoOverride.get())
    if (!token || !isRepoConfigComplete(repo)) return null
    return { token, config: repo }
  },
  onDoc: (doc) => useApp.setState({ doc }),
  onStatus: (syncStatus, pending) => useApp.setState({ syncStatus, pending }),
})

export const useApp = create<AppState>((set, get) => ({
  phase: 'loading',
  doc: emptyDoc(),
  memberId: null,
  token: null,
  repo: resolveRepoConfig(),
  syncStatus: 'idle',
  pending: 0,

  async init() {
    const [token, profile, override, snapshot, pending] = await Promise.all([
      db.token.get(),
      db.profile.get(),
      db.repoOverride.get(),
      db.snapshot.get(),
      db.queue.count(),
    ])

    const repo = resolveRepoConfig(override)
    const configured = Boolean(token) && isRepoConfigComplete(repo) && Boolean(profile)

    set({
      phase: configured ? 'ready' : 'setup',
      doc: snapshot ?? emptyDoc(),
      memberId: profile?.memberId ?? null,
      token: token ?? null,
      repo,
      pending,
    })

    engine.start()
    if (configured) void engine.pull()
  },

  async completeSetup({ token, repo, memberId, name }) {
    await db.token.set(token)
    await db.repoOverride.set(repo)

    // Файл мог появиться, пока заполняли форму, — читаем свежую версию.
    const pulled = await engine.pull()
    let doc = pulled ?? (await db.snapshot.get()) ?? emptyDoc()

    // Выбрали себя из списка — записывать в файл нечего, просто запоминаем.
    if (memberId) {
      await db.profile.set({ memberId })
      set({ doc, memberId, token, repo, phase: 'ready' })
      return
    }

    const id = memberIdFromName(name ?? 'Я', doc.members.map((member) => member.id))
    const color: MemberColor = pickColor(
      doc.members.map((member) => member.color),
      MEMBER_COLORS,
    )

    const result = upsertMember(doc, { id, name: name ?? id, color })
    doc = result.doc

    await db.profile.set({ memberId: id })
    set({ doc, memberId: id, token, repo, phase: 'ready' })
    await engine.enqueue(doc, result.op, 0)
  },

  async addItem(title) {
    const { doc, memberId } = get()
    if (!memberId || !title.trim()) return

    const { doc: next, op } = addItemOp(doc, title, memberId)
    set({ doc: next })
    await engine.enqueue(next, op)
  },

  async setBought(itemId, bought) {
    const { doc, memberId } = get()
    if (!memberId) return

    const result = setBoughtOp(doc, itemId, memberId, bought)
    if (!result) return

    set({ doc: result.doc })
    // Ждём закрытия окна отмены: иначе коммит уедет через 2 сек и через три
    // секунды будет отменён вторым коммитом.
    await engine.enqueue(result.doc, result.op, bought ? UNDO_WINDOW_MS : 0)
  },

  async removeItem(itemId) {
    const { doc } = get()
    const result = deleteItemOp(doc, itemId)
    if (!result) return

    set({ doc: result.doc })
    await engine.enqueue(result.doc, result.op)
  },

  async renameItem(itemId, title) {
    const { doc } = get()
    if (!title.trim()) return

    const result = renameItemOp(doc, itemId, title)
    if (!result) return

    set({ doc: result.doc })
    await engine.enqueue(result.doc, result.op)
  },

  async switchMember(memberId) {
    await db.profile.set({ memberId })
    set({ memberId })
  },

  async changeToken(token) {
    await db.token.set(token)
    set({ token })
    await engine.pull()
    engine.schedulePush(0)
  },

  async changeRepo(repo) {
    await db.repoOverride.set(repo)
    set({ repo })
    await engine.pull()
  },

  async syncNow() {
    await engine.pull()
    engine.schedulePush(0)
  },

  async resetDevice() {
    await db.wipeDevice()
    set({
      phase: 'setup',
      doc: emptyDoc(),
      memberId: null,
      token: null,
      repo: resolveRepoConfig(),
      syncStatus: 'idle',
      pending: 0,
    })
  },
}))

function currentMember(state: Pick<AppState, 'doc' | 'memberId'>): Member | undefined {
  return state.doc.members.find((member) => member.id === state.memberId)
}

/** Текущий участник — им подписываются действия. */
export function useMe(): Member | undefined {
  return useApp((state) => currentMember(state))
}

/**
 * Селектор возвращает новый массив на каждый вызов, поэтому подписываемся
 * на doc и фильтруем снаружи — иначе useSyncExternalStore зациклится.
 */
export function useMembers(): Member[] {
  const doc = useApp((state) => state.doc)
  return liveMembers(doc)
}
