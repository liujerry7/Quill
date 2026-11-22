import { useState } from 'react'

/** A per-viewer UI preference (a panel open or shut) remembered in localStorage. */
export function useStoredState<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial
    } catch {
      return initial
    }
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Only a convenience; without storage it resets next launch.
    }
  }
  return [value, set]
}
