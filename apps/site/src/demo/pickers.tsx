// An accessory that pairs a quanto text field with the OS's own date picker. Typing stays the
// default; the button is a shortcut. The native input sits invisibly under the button, so the picker
// opens anchored to it, and browsers without showPicker() still get a focusable fallback.
import { useRef } from 'react';
import type { AccessoryProps } from '@quantojs/react';

function open(input: HTMLInputElement | null): void {
  if (!input) return;
  try {
    input.showPicker();
  } catch {
    input.focus();
    input.click();
  }
}

const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M4 1h2v2h4V1h2v2h2l1 1v10l-1 1H2l-1-1V4l1-1h2zM3 7v6h10V7zm1 1h2v2H4zm3 0h2v2H7zm3 0h2v2h-2z" />
  </svg>
);

/** A date field's accessory: the value is an ISO date, which is exactly what `<input type="date">` uses. */
export function DatePicker({ value, onChange }: AccessoryProps<string>) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="picker">
      <button type="button" aria-label="Choose a date" onClick={() => open(ref.current)}>
        <CalendarIcon />
      </button>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </span>
  );
}

