// Accessories that pair a quanto text field with the OS's own date and time pickers. Typing stays the
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

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M5 1h6l2 2 2 2v6l-2 2-2 2H5l-2-2-2-2V5l2-2zm0 2L3 5v6l2 2h6l2-2V5l-2-2zm2 1h2v4h3v2H7z" />
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

/** A time field's accessory: quanto's `HH:MM:SS` against the native input's `HH:MM`. */
export function TimePicker({ value, onChange }: AccessoryProps<string>) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="picker">
      <button type="button" aria-label="Choose a time" onClick={() => open(ref.current)}>
        <ClockIcon />
      </button>
      <input
        ref={ref}
        type="time"
        tabIndex={-1}
        aria-hidden="true"
        value={value?.slice(0, 5) ?? ''}
        onChange={(e) => e.target.value && onChange(`${e.target.value.slice(0, 5)}:00`)}
      />
    </span>
  );
}
