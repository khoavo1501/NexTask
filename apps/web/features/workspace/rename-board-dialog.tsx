'use client';

import type { BoardDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, renameBoard } from '../../lib/api';

interface RenameBoardDialogProps {
  board: BoardDto;
  onClose: () => void;
  onRenamed: (board: BoardDto) => void;
}

export function RenameBoardDialog({ board, onClose, onRenamed }: RenameBoardDialogProps) {
  const [name, setName] = useState(board.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      const updated = await renameBoard(board._id, name);
      onRenamed(updated);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không đổi tên được board.');
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
        aria-labelledby="rename-board-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <h2 id="rename-board-title" className="text-xl font-semibold text-stone-900">
          Đổi tên board
        </h2>
        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="rename-board" className="text-sm font-medium text-stone-800">
            Tên mới
          </label>
          <input
            id="rename-board"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
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
              disabled={pending || name.trim().length === 0}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {pending ? 'Đang lưu...' : 'Lưu tên mới'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
