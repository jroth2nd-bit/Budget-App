import { useEffect, useRef, type ReactNode } from 'react';

export default function FormDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog ref={dialogRef} className="formDialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className="formDialogHeader">
        <h2>{title}</h2>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {children}
    </dialog>
  );
}
