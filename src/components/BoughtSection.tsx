import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ItemRow } from '@/components/ItemRow'
import { cn } from '@/lib/utils'
import type { Item, Member } from '@/lib/types'

/**
 * «Куплено» за последнюю неделю. Всё старше скрыто, но не удалено: список
 * нужен для того, что покупают сейчас, а история живёт в коммитах (ТЗ §7, §9).
 */
export function BoughtSection({
  items,
  memberById,
  onToggle,
  onLongPress,
}: {
  items: Item[]
  memberById: Map<string, Member>
  onToggle: (itemId: string) => void
  onLongPress: (item: Item) => void
}) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="text-muted-foreground flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium">
        <ChevronRight
          className={cn('size-4 transition-transform', open && 'rotate-90')}
        />
        Куплено · {items.length}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              author={memberById.get(item.createdBy)}
              buyer={item.boughtBy ? memberById.get(item.boughtBy) : undefined}
              onToggle={() => onToggle(item.id)}
              onLongPress={() => onLongPress(item)}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
