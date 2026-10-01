// The completions demo: an address field over a stub service, built on useExternalQuanto with the
// list in the app's own markup, as the README's recipe shows.
import type { QuantoValue } from 'quanto';
import { useExternalQuanto } from '@quantojs/react';
import { address, type Address } from './address';

export function AddressField({ onChange, id }: { onChange: (value: QuantoValue<Address>) => void; id?: string }) {
  const field = useExternalQuanto(address, { onChange, completions: true });
  const list = field.completions!;
  return (
    <span data-quanto="" data-quanto-pending={field.pending || list.resolving ? '' : undefined} className="completing">
      <input {...field.inputProps} id={id} className="text-field" placeholder="1600 amph" autoComplete="off" />
      {list.open && (
        <ul {...list.listProps} className="completion-list">
          {list.items.map((item) => (
            <li key={item.key} {...list.itemProps(item)} className="completion" data-highlighted={item === list.highlighted ? '' : undefined}>
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <span id={field.ids.issues} role="alert" className="issue-list">
        {field.failed ? 'The address service is unavailable. Try again.' : field.issues[0]?.message}
      </span>
    </span>
  );
}
