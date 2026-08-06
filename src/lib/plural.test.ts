import { describe, expect, it } from 'vitest'
import { changes } from './plural'

describe('changes', () => {
  it('склоняет по числу', () => {
    expect(changes(1)).toBe('1 изменение')
    expect(changes(2)).toBe('2 изменения')
    expect(changes(5)).toBe('5 изменений')
  })

  it('обрабатывает подростковые числа', () => {
    expect(changes(11)).toBe('11 изменений')
    expect(changes(12)).toBe('12 изменений')
    expect(changes(14)).toBe('14 изменений')
  })

  it('обрабатывает составные числа', () => {
    expect(changes(21)).toBe('21 изменение')
    expect(changes(22)).toBe('22 изменения')
    expect(changes(25)).toBe('25 изменений')
    expect(changes(111)).toBe('111 изменений')
  })
})
