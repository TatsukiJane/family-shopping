import { useRef } from 'react'
import { Check } from 'lucide-react'
import { MemberDot } from '@/components/MemberDot'
import { cn } from '@/lib/utils'
import type { Item, Member } from '@/lib/types'

const LONG_PRESS_MS = 500
/** Палец на телефоне никогда не стоит идеально ровно. */
const MOVE_TOLERANCE_PX = 10

/**
 * Строка списка. Тап по всей строке — «куплено»: у полки в магазине надо
 * попадать одной рукой, не целясь в чекбокс. Долгий тап — меню действий.
 */
export function ItemRow({
  item,
  author,
  buyer,
  onToggle,
  onLongPress,
}: {
  item: Item
  author?: Member
  buyer?: Member
  onToggle: () => void
  onLongPress: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  const bought = item.status === 'bought'
  const marker = bought ? buyer : author

  return (
    <li>
      <button
        type="button"
        onPointerDown={(event) => {
          fired.current = false
          start.current = { x: event.clientX, y: event.clientY }
          timer.current = setTimeout(() => {
            fired.current = true
            cancel()
            onLongPress()
          }, LONG_PRESS_MS)
        }}
        onPointerMove={(event) => {
          if (!start.current) return
          const moved =
            Math.abs(event.clientX - start.current.x) > MOVE_TOLERANCE_PX ||
            Math.abs(event.clientY - start.current.y) > MOVE_TOLERANCE_PX
          if (moved) cancel()
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          // Долгий тап уже отработал — обычный клик по нему не считаем.
          if (fired.current) return
          onToggle()
        }}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
          'active:bg-accent',
        )}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            bought ? 'bg-foreground border-foreground' : 'border-muted-foreground/40',
          )}
        >
          {bought && <Check className="text-background size-4" />}
        </span>

        <span
          className={cn(
            'flex-1 text-base leading-snug break-words',
            bought && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </span>

        {marker && <MemberDot color={marker.color} title={marker.name} />}
      </button>
    </li>
  )
}
