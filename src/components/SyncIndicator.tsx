import { AlertTriangle, Check, CloudOff, KeyRound, RefreshCw } from 'lucide-react'
import { useApp } from '@/store/useApp'
import { changes, plural } from '@/lib/plural'
import { cn } from '@/lib/utils'

/**
 * Честное состояние синхронизации. Пользователь в подвале супермаркета должен
 * видеть, что отметки не потерялись, а ждут сети (ТЗ §S4).
 */
export function SyncIndicator({ onClick }: { onClick?: () => void }) {
  const status = useApp((state) => state.syncStatus)
  const pending = useApp((state) => state.pending)

  const view = {
    idle: {
      icon: RefreshCw,
      // Одно состояние — одно название: «готово» и «синхронизировано» здесь
      // означали бы одно и то же.
      text: pending > 0 ? waiting(pending) : 'Синхронизировано',
      tone: 'text-muted-foreground',
      spin: false,
    },
    syncing: {
      icon: RefreshCw,
      text: 'Сохраняем',
      tone: 'text-muted-foreground',
      spin: true,
    },
    synced: {
      icon: Check,
      text: 'Синхронизировано',
      tone: 'text-muted-foreground',
      spin: false,
    },
    offline: {
      icon: CloudOff,
      text: pending > 0 ? `Нет сети, ${waiting(pending)}` : 'Нет сети',
      tone: 'text-amber-600 dark:text-amber-500',
      spin: false,
    },
    error: {
      icon: AlertTriangle,
      text: 'Не получилось сохранить',
      tone: 'text-destructive',
      spin: false,
    },
    unauthorized: {
      icon: KeyRound,
      text: 'Токен недействителен',
      tone: 'text-destructive',
      spin: false,
    },
  }[status]

  const Icon = view.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-1.5 text-xs', view.tone)}
    >
      <Icon className={cn('size-3.5', view.spin && 'animate-spin')} />
      <span>{view.text}</span>
    </button>
  )
}

/** Согласуем и существительное, и глагол: «1 изменение ждёт», «2 изменения ждут». */
function waiting(count: number): string {
  return `${changes(count)} ${plural(count, 'ждёт', 'ждут', 'ждут')}`
}
