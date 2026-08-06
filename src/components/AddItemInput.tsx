import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/useApp'

/**
 * Сценарий S2: открыл — записал — закрыл, не больше трёх секунд.
 * Поэтому автофокус и Enter без потери фокуса: подряд добавить пять позиций
 * должно быть так же дёшево, как одну.
 */
export function AddItemInput() {
  const addItem = useApp((state) => state.addItem)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const value = title.trim()
    if (!value) return

    setTitle('')
    void addItem(value)
    inputRef.current?.focus()
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Что закончилось?"
        autoFocus
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        // 16px — ниже этого iOS зумит страницу при фокусе на поле.
        className="h-12 text-base"
        aria-label="Новая позиция"
      />
      <Button type="submit" size="icon" className="size-12 shrink-0" disabled={!title.trim()}>
        <Plus className="size-5" />
        <span className="sr-only">Добавить</span>
      </Button>
    </form>
  )
}
