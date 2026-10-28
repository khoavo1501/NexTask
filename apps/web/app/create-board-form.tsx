'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiClientError, createBoard } from '../lib/api';

export function CreateBoardForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const board = await createBoard({ name });
      router.push(`/boards/${board._id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Không tạo được board, thử lại sau.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <label htmlFor="board-name" className="text-sm font-semibold text-stone-800">
        Tạo board mới
      </label>
      <p className="mt-1 text-sm text-stone-500">Board dùng template Retro với 5 cột mặc định.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          id="board-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Ví dụ: Retro Sprint 1"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="rounded-xl bg-stone-900 px-4 py-2 font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Đang tạo...' : 'Tạo board'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
