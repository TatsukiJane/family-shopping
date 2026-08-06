import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
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
import { useApp } from '@/store/useApp'
import type { Item } from '@/lib/types'

/** Меню по долгому тапу: переименовать или удалить. */
export function ItemActions({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const renameItem = useApp((state) => state.renameItem)
  const removeItem = useApp((state) => state.removeItem)

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (item) {
      setTitle(item.title)
      setEditing(false)
    }
  }, [item])

  const remove = () => {
    if (!item) return
    void removeItem(item.id)
    toast(`Удалено: ${item.title}`)
    onClose()
  }

  const rename = () => {
    if (!item || !title.trim()) return
    void renameItem(item.id, title)
    onClose()
  }

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="pb-safe">
        <SheetHeader>
          <SheetTitle className="text-left">{item?.title}</SheetTitle>
          <SheetDescription className="text-left">
            Удалённое можно вернуть через историю изменений
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4 pb-4">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                rename()
              }}
            >
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
                className="h-12 text-base"
                aria-label="Название"
              />
              <Button type="submit" className="h-12" disabled={!title.trim()}>
                Готово
              </Button>
            </form>
          ) : (
            <Button
              variant="secondary"
              className="h-12 justify-start"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
              Переименовать
            </Button>
          )}

          <Button variant="ghost" className="text-destructive h-12 justify-start" onClick={remove}>
            <Trash2 className="size-4" />
            Удалить
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
