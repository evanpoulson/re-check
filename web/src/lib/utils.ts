import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** Knows the type scale in index.css, so `text-title` is a size and never replaces a text colour. */
const twMerge = extendTailwindMerge({ extend: { theme: { text: ['note', 'small', 'lead', 'title', 'heading'] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
