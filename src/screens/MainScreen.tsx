import { useMemo, useState } from 'react'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { AddItemInput } from '@/components/AddItemInput'
import { BoughtSection } from '@/components/BoughtSection'
import { ItemRow } from '@/components/ItemRow'
import { MemberDot } from '@/components/MemberDot'
import { SyncIndicator } from '@/components/SyncIndicator'
import { ItemActions } from '@/screens/ItemActions'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { Button } from '@/components/ui/button'
import { BOUGHT_VISIBLE_MS, UNDO_WINDOW_MS } from '@/lib/config'
import { liveItems } from '@/lib/ops'
import { useApp, useMe } from '@/store/useApp'
import type { Item, SyncStatus } from '@/lib/types'

/** Состояния, из которых помогают только настройки, а не повторная попытка. */
const FIXABLE_IN_SETTINGS = new Set<SyncStatus>(['unauthorized', 'missing', 'error'])

export function MainScreen() {
  const doc = useApp((state) => state.doc)
  const setBought = useApp((state) => state.setBought)
  const syncNow = useApp((state) => state.syncNow)
  const syncStatus = useApp((state) => state.syncStatus)
  const me = useMe()

  const [acting, setActing] = useState<Item | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const memberById = useMemo(
    () => new Map(doc.members.map((member) => [member.id, member])),
    [doc.members],
  )

  const { needed, bought } = useMemo(() => {
    const alive = liveItems(doc)
    const since = Date.now() - BOUGHT_VISIBLE_MS

    return {
      needed: alive
        .filter((item) => item.status === 'needed')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      bought: alive
        .filter(
          (item) =>
            item.status === 'bought' && item.boughtAt !== null && Date.parse(item.boughtAt) > since,
        )
        .sort((a, b) => (b.boughtAt ?? '').localeCompare(a.boughtAt ?? '')),
    }
  }, [doc])

  const toggle = (item: Item) => {
    const next = item.status !== 'bought'
    void setBought(item.id, next)

    if (next) {
      // Отправка ждёт закрытия этого же окна — отмена не породит второй коммит.
      toast(`Куплено: ${item.title}`, {
        duration: UNDO_WINDOW_MS,
        action: {
          label: 'Отменить',
          onClick: () => void setBought(item.id, false),
        },
      })
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col">
      <header className="bg-background pt-safe sticky top-0 z-10 border-b px-4 pb-3">
        <div className="flex items-center justify-between pt-3">
          <div className="flex items-center gap-2">
            {me && <MemberDot color={me.color} title={me.name} />}
            <span className="text-sm font-medium">{me?.name ?? 'Список'}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Повторная синхронизация с теми же токеном и координатами упадёт
                так же — ведём туда, где их можно поправить, и где виден ответ
                GitHub. Остальные состояния лечатся повтором. */}
            <SyncIndicator
              onClick={() =>
                FIXABLE_IN_SETTINGS.has(syncStatus) ? setSettingsOpen(true) : void syncNow()
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки"
            >
              <Settings className="size-5" />
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <AddItemInput />
        </div>
      </header>

      <main className="pb-safe flex-1 overflow-y-auto px-1 pb-8">
        {needed.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm">
            Список пуст. Добавьте, что закончилось
          </p>
        ) : (
          <ul className="pt-2">
            {needed.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                author={memberById.get(item.createdBy)}
                onToggle={() => toggle(item)}
                onLongPress={() => setActing(item)}
              />
            ))}
          </ul>
        )}

        <BoughtSection
          items={bought}
          memberById={memberById}
          onToggle={(itemId) => {
            const item = bought.find((candidate) => candidate.id === itemId)
            if (item) toggle(item)
          }}
          onLongPress={setActing}
        />
      </main>

      <ItemActions item={acting} onClose={() => setActing(null)} />
      <SettingsScreen open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
