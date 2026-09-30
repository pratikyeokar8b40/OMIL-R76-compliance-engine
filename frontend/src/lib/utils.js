import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge conditional class names, letting later Tailwind utilities win.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Render a decimal string without trailing zeros ("15.000000" -> "15").
export function trimDecimal(value) {
  if (value === null || value === undefined || value === '') return value;
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}
