import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MemberDot } from '@/components/MemberDot'
import { defaultRepoConfig, isRepoConfigComplete, repoUrl } from '@/lib/config'
import { checkAccess, getFile, GithubError } from '@/lib/github'
import { useApp } from '@/store/useApp'
import { emptyDoc, type ListDoc, type Member, type RepoConfig } from '@/lib/types'

type Step = 'token' | 'member'

/**
 * Первый запуск (ТЗ §S1). Список участников заводится self-service: если файла
 * ещё нет — устройство создаёт его, если есть — человек выбирает себя или
 * добавляется новым. Ручной коммит стартового JSON не нужен.
 */
export function SetupScreen() {
  const completeSetup = useApp((state) => state.completeSetup)

  const [step, setStep] = useState<Step>('token')
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState<RepoConfig>(defaultRepoConfig)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [doc, setDoc] = useState<ListDoc>(emptyDoc())
  const [name, setName] = useState('')

  const canCheck = token.trim().length > 0 && isRepoConfigComplete(repo)

  const check = async () => {
    setChecking(true)
    setError(null)
    try {
      await checkAccess(token.trim(), repo)
      const remote = await getFile(token.trim(), repo)
      setDoc(remote?.doc ?? emptyDoc())
      setStep('member')
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setChecking(false)
    }
  }

  const finish = (input: { memberId?: string; name?: string }) =>
    completeSetup({ token: token.trim(), repo, ...input })

  if (step === 'member') {
    const existing = doc.members.filter((member) => !member.deletedAt)

    return (
      <Screen>
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Кто вы?</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {existing.length > 0
                ? 'Выберите себя или добавьте нового участника'
                : 'Списка ещё нет. Он появится вместе с вашей записью'}
            </p>
          </div>

          {existing.length > 0 && (
            <>
              <ul className="space-y-2">
                {existing.map((member) => (
                  <li key={member.id}>
                    <MemberButton
                      member={member}
                      onClick={() => void finish({ memberId: member.id })}
                    />
                  </li>
                ))}
              </ul>
              <Separator />
            </>
          )}

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim()) return
              void finish({ name: name.trim() })
            }}
          >
            <Label htmlFor="name">Новый участник</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Имя"
                className="h-12 text-base"
              />
              <Button type="submit" className="h-12" disabled={!name.trim()}>
                Добавить
              </Button>
            </div>
          </form>

          <button
            type="button"
            className="text-muted-foreground text-sm underline"
            onClick={() => setStep('token')}
          >
            Назад
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Подключение</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Токен хранится на этом устройстве и уходит только в GitHub. Список видит
            каждый, у кого есть токен, — не храните в нём ничего важнее продуктов
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canCheck && !checking) void check()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="token">Токен GitHub</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_..."
              autoComplete="off"
              className="h-12 text-base"
            />
            <p className="text-muted-foreground text-xs">
              Fine-grained PAT с правом Contents: Read and write на репозиторий с данными
            </p>
          </div>

          <RepoFields repo={repo} onChange={setRepo} />

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" className="h-12 w-full" disabled={!canCheck || checking}>
            {checking && <Loader2 className="size-4 animate-spin" />}
            Проверить доступ
          </Button>
        </form>

        {isRepoConfigComplete(repo) && (
          <a
            href={repoUrl(repo)}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
          >
            Открыть репозиторий <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </Screen>
  )
}

export function RepoFields({
  repo,
  onChange,
}: {
  repo: RepoConfig
  onChange: (repo: RepoConfig) => void
}) {
  const field = (key: keyof RepoConfig, label: string, placeholder: string) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={repo[key]}
        onChange={(event) => onChange({ ...repo, [key]: event.target.value })}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        className="h-12 text-base"
      />
    </div>
  )

  return (
    <div className="grid grid-cols-2 gap-3">
      {field('owner', 'Владелец', 'octocat')}
      {field('repo', 'Репозиторий', 'family-list-data')}
      {field('branch', 'Ветка', 'main')}
      {field('path', 'Путь к файлу', 'data/list.json')}
    </div>
  )
}

function MemberButton({ member, onClick }: { member: Member; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-secondary active:bg-accent flex h-12 w-full items-center gap-3 rounded-xl px-4 text-left transition-colors"
    >
      <MemberDot color={member.color} />
      <span className="text-base">{member.name}</span>
    </button>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe pb-safe flex h-full flex-col items-center justify-center px-6 py-10">
      {children}
    </div>
  )
}

/** Ошибка называет причину и следующий шаг — «что-то пошло не так» тут бесполезно. */
function describe(cause: unknown): string {
  if (cause instanceof GithubError) {
    if (cause.status === 401) return 'Токен недействителен или отозван'
    if (cause.status === 403) return 'У токена нет прав на запись в репозиторий'
    if (cause.status === 404) return 'Репозиторий не найден. Проверьте владельца и название'
    return `GitHub: ${cause.message}`
  }
  if (cause instanceof TypeError) return 'Нет подключения к интернету'
  return 'Не получилось проверить доступ. Попробуйте снова'
}
