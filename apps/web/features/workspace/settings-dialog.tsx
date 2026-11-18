'use client';

import type { BoardDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, updateBoardSettings } from '../../lib/api';

interface SettingsDialogProps {
  board: BoardDto;
  onClose: () => void;
  onSaved: (board: BoardDto) => void;
  onConflict: () => void;
}

export function SettingsDialog({ board, onClose, onSaved, onConflict }: SettingsDialogProps) {
  const [votingLimit, setVotingLimit] = useState(board.settings.votingLimit);
  const [minVotes, setMinVotes] = useState(board.settings.minVotes);
  const [stalledAfterDays, setStalledAfterDays] = useState(board.settings.stalledAfterDays);
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
      const updated = await updateBoardSettings(board._id, {
        votingLimit,
        minVotes,
        stalledAfterDays,
        expectedVersion: board.version,
      });
      onSaved(updated);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'VERSION_CONFLICT') {
        onConflict();
        return;
      }
      setError(caught instanceof ApiClientError ? caught.message : 'Không lưu được cài đặt.');
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
        aria-labelledby="settings-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Cài đặt
            </p>
            <h2 id="settings-title" className="mt-1 text-xl font-semibold text-stone-900">
              Quy tắc board
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-stone-800">
            Giới hạn phiếu / người
            <input
              type="number"
              min={0}
              max={100}
              value={votingLimit}
              onChange={(event) => setVotingLimit(Number(event.target.value))}
              disabled={pending}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <label className="block text-sm font-medium text-stone-800">
            Số phiếu tối thiểu cho ý tưởng
            <input
              type="number"
              min={0}
              max={100}
              value={minVotes}
              onChange={(event) => setMinVotes(Number(event.target.value))}
              disabled={pending}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <label className="block text-sm font-medium text-stone-800">
            Số ngày coi là kẹt
            <input
              type="number"
              min={1}
              max={365}
              value={stalledAfterDays}
              onChange={(event) => setStalledAfterDays(Number(event.target.value))}
              disabled={pending}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
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
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
