/**
 * UTF-8-безопасный base64.
 *
 * `btoa` принимает только «латиницу» (кодпоинты 0–255) и падает на «Молоко».
 * Contents API отдаёт содержимое в base64 с переносами строк каждые 60 символов —
 * их надо срезать до `atob`, иначе InvalidCharacterError.
 */

const CHUNK = 0x8000

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // Порциями: String.fromCharCode(...bytes) на большом массиве переполняет стек.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}
