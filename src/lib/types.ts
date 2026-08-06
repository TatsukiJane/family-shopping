/** Модель данных. Один файл data/list.json в приватном репозитории. */

export const SCHEMA_VERSION = 1

/** Цвета участников — по ним рисуется точка автора в строке списка. */
export const MEMBER_COLORS = [
  'blue',
  'green',
  'amber',
  'rose',
  'violet',
  'teal',
] as const

export type MemberColor = (typeof MEMBER_COLORS)[number]

/**
 * Участник нужен, чтобы подписывать действия: «добавил Айбек», «купила Айгуль».
 * Никакой аутентификации нет и не нужно — доступ к списку даёт токен, а он
 * лежит на устройстве владельца.
 */
export interface Member {
  id: string
  name: string
  color: MemberColor
  /**
   * Отклонение от схемы ТЗ §5: без метки времени нельзя смержить участников,
   * когда двое добавили себя одновременно с разных устройств.
   */
  updatedAt: string
  /** Надгробие: участника удалили из списка. */
  deletedAt: string | null
}

export type ItemStatus = 'needed' | 'bought'

export interface Item {
  id: string
  title: string
  note: string
  status: ItemStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  boughtBy: string | null
  boughtAt: string | null
  deletedAt: string | null
}

export interface ListDoc {
  version: number
  members: Member[]
  items: Item[]
}

/**
 * Запись в очереди неотправленных изменений. Очередь не переигрывается при
 * мерже — LWW делает мерж идемпотентным, снапшота достаточно. Очередь нужна,
 * чтобы честно показать «N изменений ждут» и пережить перезагрузку вкладки.
 */
export interface PendingOp {
  id: string
  kind: 'add' | 'buy' | 'unbuy' | 'delete' | 'rename' | 'member'
  /** id позиции или участника, которого касается операция. */
  targetId: string
  at: string
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'
  | 'unauthorized'

/** Координаты файла с данными. Задаются на сборке, переопределяются в настройках. */
export interface RepoConfig {
  owner: string
  repo: string
  branch: string
  path: string
}

/** Профиль текущего устройства: кто им пользуется. */
export interface Profile {
  memberId: string
}

export function emptyDoc(): ListDoc {
  return { version: SCHEMA_VERSION, members: [], items: [] }
}
