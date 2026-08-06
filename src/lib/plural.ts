/**
 * Русское склонение по числу. Нужно и в интерфейсе, и в сообщениях коммитов —
 * «Список: 3 изменений» в истории читается как опечатка.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return many

  const mod10 = count % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

export function changes(count: number): string {
  return `${count} ${plural(count, 'изменение', 'изменения', 'изменений')}`
}
