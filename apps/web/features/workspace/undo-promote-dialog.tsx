'use client';

import type { ActivityDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface UndoPromoteDialogProps {
  activity: ActivityDto;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function UndoPromoteDialog({ activity, onClose, onConfirm }: UndoPromoteDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không undo được promote.');
    } finally {
      setPending(false);
    }
  }

  const title =
    typeof activity.snapshot.taskTitle === 'string' ? activity.snapshot.taskTitle : 'Task';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="undo-promote-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
              Undo promote
            </p>
            <h2 id="undo-promote-title" className="mt-1 text-xl font-semibold text-stone-900">
              Hoàn tác promote
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40"
          >
            Đóng
          </button>
        </div>

        <blockquote className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-stone-700">
          {title}
        </blockquote>
        <p className="mt-3 text-sm text-stone-600">
          Task sẽ bị demote và note trở lại trạng thái chưa promote.
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Đang undo...' : 'Undo promote'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
