import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MemberDot } from '@/components/MemberDot'
import { RepoFields } from '@/screens/SetupScreen'
import { useApp, useMe, useMembers } from '@/store/useApp'
import type { RepoConfig } from '@/lib/types'

type Panel = 'root' | 'member' | 'token' | 'repo'

export function SettingsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel>('root')

  const close = () => {
    setPanel('root')
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="bottom" className="pb-safe max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">Настройки</SheetTitle>
          <SheetDescription className="text-left">
            Токен и профиль хранятся только на этом устройстве
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {panel === 'root' && <Root onOpen={setPanel} onClose={close} />}
          {panel === 'member' && <SwitchMember onDone={() => setPanel('root')} />}
          {panel === 'token' && <ChangeToken onDone={() => setPanel('root')} />}
          {panel === 'repo' && <ChangeRepo onDone={() => setPanel('root')} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Root({ onOpen, onClose }: { onOpen: (panel: Panel) => void; onClose: () => void }) {
  const repo = useApp((state) => state.repo)
  const syncNow = useApp((state) => state.syncNow)
  const resetDevice = useApp((state) => state.resetDevice)
  const syncError = useApp((state) => state.syncError)
  const me = useMe()

  return (
    <div className="space-y-2">
      {/* Ответ GitHub как есть. Индикатор называет род ошибки, а починить её
          можно только зная, что именно не сошлось. */}
      {syncError && (
        <div className="border-destructive/40 bg-destructive/5 space-y-1 rounded-xl border px-4 py-3">
          <p className="text-destructive text-sm font-medium">Последняя ошибка</p>
          <p className="text-muted-foreground text-sm break-words">{syncError}</p>
        </div>
      )}

      <Row onClick={() => onOpen('member')}>
        <span className="flex items-center gap-2">
          {me && <MemberDot color={me.color} />}
          Участник
        </span>
        <span className="text-muted-foreground">{me?.name}</span>
      </Row>

      <Row onClick={() => onOpen('token')}>Заменить токен</Row>
      <Row onClick={() => onOpen('repo')}>
        <span>Репозиторий данных</span>
        <span className="text-muted-foreground truncate text-sm">
          {repo.owner}/{repo.repo}
        </span>
      </Row>

      <Separator className="my-3" />

      <Button
        variant="secondary"
        className="h-12 w-full justify-start"
        onClick={() => {
          void syncNow()
          toast('Синхронизируем')
        }}
      >
        <RefreshCw className="size-4" />
        Синхронизировать
      </Button>

      <Separator className="my-3" />

      <Button
        variant="ghost"
        className="text-destructive h-12 w-full justify-start"
        onClick={() => {
          void resetDevice()
          onClose()
        }}
      >
        Сбросить устройство
      </Button>
      <p className="text-muted-foreground text-xs">
        Удалит токен, профиль и локальную копию. Список в репозитории останется
      </p>
    </div>
  )
}

function SwitchMember({ onDone }: { onDone: () => void }) {
  const switchMember = useApp((state) => state.switchMember)
  const members = useMembers()

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <Row
          key={member.id}
          onClick={() => {
            void switchMember(member.id)
            onDone()
          }}
        >
          <span className="flex items-center gap-2">
            <MemberDot color={member.color} />
            {member.name}
          </span>
        </Row>
      ))}
      <BackButton onClick={onDone} />
    </div>
  )
}

function ChangeToken({ onDone }: { onDone: () => void }) {
  const changeToken = useApp((state) => state.changeToken)
  const [value, setValue] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!value.trim()) return
        void changeToken(value.trim())
        toast('Токен заменён')
        onDone()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="new-token">Новый токен</Label>
        <Input
          id="new-token"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="github_pat_..."
          autoComplete="off"
          className="h-12 text-base"
        />
      </div>
      <Button type="submit" className="h-12 w-full" disabled={!value.trim()}>
        Сохранить
      </Button>
      <BackButton onClick={onDone} />
    </form>
  )
}

function ChangeRepo({ onDone }: { onDone: () => void }) {
  const current = useApp((state) => state.repo)
  const changeRepo = useApp((state) => state.changeRepo)
  const [repo, setRepo] = useState<RepoConfig>(current)

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void changeRepo(repo)
        toast('Репозиторий обновлён')
        onDone()
      }}
    >
      <RepoFields repo={repo} onChange={setRepo} />
      <Button type="submit" className="h-12 w-full">
        Сохранить
      </Button>
      <BackButton onClick={onDone} />
    </form>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-secondary active:bg-accent flex h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left transition-colors"
    >
      {children}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground mt-2 text-sm underline"
    >
      Назад
    </button>
  )
}
