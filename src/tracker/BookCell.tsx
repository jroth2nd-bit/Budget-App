import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

type Props = {
  label: string;
  value: string;
  emptyLabel?: string;
  multiline?: boolean;
  maxLength?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  onSave: (value: string) => boolean;
};

export default function BookCell({ label, value, emptyLabel = '—', multiline, maxLength, options, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const valueId = useId();

  const open = () => {
    setDraft(value);
    cancelled.current = false;
    setEditing(true);
  };
  const finish = (next: string) => {
    if (cancelled.current || next === value || onSave(next)) { setEditing(false); return true; }
    return false;
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (event.key === 'Escape') {
      cancelled.current = true;
      event.currentTarget.blur();
      requestAnimationFrame(() => button.current?.focus());
    } else if (event.key === 'Enter' && !multiline && !options) {
      event.preventDefault();
      event.currentTarget.blur();
      requestAnimationFrame(() => button.current?.focus());
    }
  };
  if (!editing) return <button ref={button} type="button" className={`bookCellValue${value ? '' : ' bookCellEmpty'}`} aria-label={`Edit ${label}`} aria-describedby={valueId} onClick={open}><span id={valueId}>{value || emptyLabel}</span></button>;
  if (options) return <select autoFocus aria-label={label} value={draft} onKeyDown={keyDown} onBlur={() => finish(draft)} onChange={event => {
    const next = event.target.value;
    setDraft(next);
    if (finish(next)) requestAnimationFrame(() => button.current?.focus());
  }}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  const props = { autoFocus: true, 'aria-label': label, value: draft, maxLength, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => finish(draft), onKeyDown: keyDown };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}
