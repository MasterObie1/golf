"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const variantStyles = {
    danger: "bg-board-red hover:bg-board-red/90 focus:ring-board-red/50",
    warning: "bg-wood hover:bg-wood/90 focus:ring-wood/50",
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      className="fixed inset-0 z-50 rounded-lg shadow-xl p-0 backdrop:bg-black/50 max-w-md w-full bg-scorecard-paper"
    >
      <div className="p-6">
        <h2 className="text-lg font-display font-semibold text-scorecard-pencil uppercase tracking-wider mb-2">{title}</h2>
        <p className="text-text-secondary mb-6 font-sans">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-display font-medium text-text-secondary bg-surface-white border border-border rounded-lg hover:bg-surface focus:outline-none focus:ring-2 focus:ring-scorecard-line uppercase tracking-wider"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-display font-medium text-white rounded-lg focus:outline-none focus:ring-2 uppercase tracking-wider ${variantStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
