'use client';

import type { TaskDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface DemoteTaskDialogProps {
  task: TaskDto;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DemoteTaskDialog({ task, onClose, onConfirm }: DemoteTaskDialogProps) {
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
      setError(caught instanceof ApiClientError ? caught.message : 'Không demote được task.');
    } finally {
      setPending(false);
    }
  }

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
        aria-labelledby="demote-task-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
              Demote
            </p>
            <h2 id="demote-task-title" className="mt-1 text-xl font-semibold text-stone-900">
              Đưa task về whiteboard
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
          {task.title}
        </blockquote>
        <p className="mt-3 text-sm text-stone-600">
          Task sẽ rời Kanban nhưng note gốc vẫn còn trên whiteboard. Lịch sử task được giữ lại.
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
              {pending ? 'Đang demote...' : 'Demote task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
