import { cn } from '@/lib/utils'
import type { MemberColor } from '@/lib/types'

/**
 * Цвет автора. Классы перечислены целиком: Tailwind сканирует исходники
 * статически и не увидит строку, собранную из шаблона.
 */
const DOT: Record<MemberColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
}

export function MemberDot({
  color,
  title,
  className,
}: {
  color: MemberColor
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[color], className)}
    />
  )
}
