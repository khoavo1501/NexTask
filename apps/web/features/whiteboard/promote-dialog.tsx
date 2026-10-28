'use client';

import type { BoardDto, ItemDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface PromoteDialogProps {
  item: ItemDto;
  columns: BoardDto['columns'];
  onClose: () => void;
  onConfirm: (input: { columnId: string; assignToMe: boolean }) => Promise<void>;
}

export function PromoteDialog({ item, columns, onClose, onConfirm }: PromoteDialogProps) {
  const defaultColumn = columns.find((column) => column.id === 'todo')?.id ?? columns[0]?.id ?? '';
  const [columnId, setColumnId] = useState(defaultColumn);
  const [assignToMe, setAssignToMe] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!columnId) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm({ columnId, assignToMe });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không promote được ghi chú.');
    } finally {
      setPending(false);
    }
  }

  const title = item.content.trim() || 'Ghi chú không tiêu đề';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Promote
            </p>
            <h2 id="promote-title" className="mt-1 text-xl font-semibold text-stone-900">
              Biến ghi chú thành task
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40"
            aria-label="Đóng"
          >
            Đóng
          </button>
        </div>

        <blockquote className="mt-4 line-clamp-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-stone-700">
          {title}
        </blockquote>

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="promote-column" className="text-sm font-medium text-stone-800">
            Cột đích
          </label>
          <select
            id="promote-column"
            value={columnId}
            onChange={(event) => setColumnId(event.target.value)}
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>

          <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={assignToMe}
              onChange={(event) => setAssignToMe(event.target.checked)}
              disabled={pending}
              className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
            />
            Giao cho Demo User
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
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
              disabled={pending || !columnId}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Đang promote...' : 'Promote thành task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
