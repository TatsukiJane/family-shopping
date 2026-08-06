import type { RepoConfig } from './types'

/**
 * Координаты приватного репозитория с данными. Код и данные лежат в разных
 * репозиториях: Pages из приватного репо недоступен на бесплатном плане,
 * а публиковать список покупок в открытый репозиторий не хочется.
 *
 * Значения приходят на сборке из Actions variables (это не секреты — токена
 * в бандле нет) и переопределяются в настройках на устройстве.
 */
export const defaultRepoConfig: RepoConfig = {
  owner: import.meta.env.VITE_DATA_OWNER ?? '',
  repo: import.meta.env.VITE_DATA_REPO ?? '',
  branch: import.meta.env.VITE_DATA_BRANCH ?? 'main',
  path: import.meta.env.VITE_DATA_PATH ?? 'data/list.json',
}

export function resolveRepoConfig(override?: Partial<RepoConfig> | null): RepoConfig {
  return { ...defaultRepoConfig, ...(override ?? {}) }
}

export function isRepoConfigComplete(config: RepoConfig): boolean {
  return Boolean(config.owner && config.repo && config.branch && config.path)
}

export function repoUrl(config: RepoConfig): string {
  return `https://github.com/${config.owner}/${config.repo}`
}

export function fileUrl(config: RepoConfig): string {
  return `${repoUrl(config)}/blob/${config.branch}/${config.path}`
}

export function historyUrl(config: RepoConfig): string {
  return `${repoUrl(config)}/commits/${config.branch}/${config.path}`
}

/** Дебаунс отправки: не плодим коммит на каждое нажатие (ТЗ §6). */
export const PUSH_DEBOUNCE_MS = 2_000

/**
 * Окно отмены отметки «куплено» (ТЗ §S3). Пуш ждёт его закрытия: иначе
 * коммит уходит через 2 сек и через три секунды отменяется вторым коммитом.
 */
export const UNDO_WINDOW_MS = 5_000

/** Сколько попыток на разрешение конфликта записи (ТЗ §6). */
export const PUSH_MAX_ATTEMPTS = 3

/** Секция «Куплено» показывает покупки за последние сутки (ТЗ §7). */
export const BOUGHT_VISIBLE_MS = 24 * 60 * 60 * 1000
