import { decodeBase64, encodeBase64 } from './b64'
import { serializeDoc } from './merge'
import type { ListDoc, RepoConfig } from './types'

const API = 'https://api.github.com'

export class GithubError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GithubError'
    this.status = status
  }

  /** Токен отозван, протух или потерял доступ к репозиторию. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 404
  }

  /** Файл изменился между чтением и записью — надо перечитать и смержить. */
  get isConflict(): boolean {
    return this.status === 409 || this.status === 422
  }
}

export interface RemoteFile {
  doc: ListDoc
  sha: string
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function contentsUrl(config: RepoConfig): string {
  const path = config.path.split('/').map(encodeURIComponent).join('/')
  return `${API}/repos/${config.owner}/${config.repo}/contents/${path}`
}

async function fail(response: Response): Promise<never> {
  let detail = response.statusText
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) detail = body.message
  } catch {
    // Тело может быть пустым — статуса достаточно.
  }
  throw new GithubError(response.status, detail)
}

/** Проверка токена: есть ли доступ к репозиторию на запись. */
export async function checkAccess(token: string, config: RepoConfig): Promise<void> {
  const response = await fetch(`${API}/repos/${config.owner}/${config.repo}`, {
    headers: headers(token),
    cache: 'no-store',
  })

  if (!response.ok) await fail(response)

  const repo = (await response.json()) as { permissions?: { push?: boolean } }
  if (!repo.permissions?.push) {
    throw new GithubError(403, 'У токена нет прав на запись в этот репозиторий')
  }
}

/**
 * Читает файл со списком. `null` — файла ещё нет, это штатный сигнал
 * «список не создан», а не ошибка.
 *
 * cache: 'no-store' обязателен: иначе браузер отдаст протухший sha из HTTP-кэша
 * и каждая запись будет ловить конфликт.
 */
export async function getFile(
  token: string,
  config: RepoConfig,
): Promise<RemoteFile | null> {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`
  const response = await fetch(url, { headers: headers(token), cache: 'no-store' })

  if (response.status === 404) return null
  if (!response.ok) await fail(response)

  const body = (await response.json()) as {
    content?: string
    encoding?: string
    sha: string
  }

  // Contents API не отдаёт содержимое файлов больше 1 МБ — тогда за телом
  // приходится идти вторым запросом в raw-представлении.
  const raw =
    body.encoding === 'base64' && body.content
      ? decodeBase64(body.content)
      : await getRaw(token, config)

  return { doc: JSON.parse(raw) as ListDoc, sha: body.sha }
}

async function getRaw(token: string, config: RepoConfig): Promise<string> {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`
  const response = await fetch(url, {
    headers: { ...headers(token), Accept: 'application/vnd.github.raw' },
    cache: 'no-store',
  })

  if (!response.ok) await fail(response)
  return response.text()
}

/**
 * Записывает файл. `sha` — версия, поверх которой пишем; `undefined` при
 * создании. Несовпадение sha даёт конфликт, его разбирает sync.ts.
 */
export async function putFile(
  token: string,
  config: RepoConfig,
  doc: ListDoc,
  sha: string | undefined,
  message: string,
): Promise<string> {
  const response = await fetch(contentsUrl(config), {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64(serializeDoc(doc)),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  })

  if (!response.ok) await fail(response)

  const body = (await response.json()) as { content: { sha: string } }
  return body.content.sha
}
