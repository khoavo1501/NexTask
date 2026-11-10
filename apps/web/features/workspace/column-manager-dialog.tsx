'use client';

import type { BoardDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, isColumnNotEmpty, isVersionConflict, updateColumns } from '../../lib/api';

interface ColumnManagerDialogProps {
  board: BoardDto;
  onClose: () => void;
  onSaved: (board: BoardDto) => void;
  onConflict: () => void;
}

interface ColumnRow {
  key: string;
  id?: string;
  name: string;
  isDone: boolean;
}

function rowKey(): string {
  return crypto.randomUUID();
}

function rowsFromBoard(board: BoardDto): ColumnRow[] {
  return [...board.columns]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({
      key: rowKey(),
      id: column.id,
      name: column.name,
      isDone: column.isDone,
    }));
}

export function ColumnManagerDialog({
  board,
  onClose,
  onSaved,
  onConflict,
}: ColumnManagerDialogProps) {
  const [rows, setRows] = useState<ColumnRow[]>(() => rowsFromBoard(board));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  function updateRow(key: string, patch: Partial<ColumnRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const currentRow = next[index];
      const targetRow = next[target];
      if (!currentRow || !targetRow) return current;
      next[index] = targetRow;
      next[target] = currentRow;
      return next;
    });
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function setDone(key: string) {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        isDone: row.key === key,
      })),
    );
  }

  function addRow() {
    setRows((current) => [...current, { key: rowKey(), name: '', isDone: current.length === 0 }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const columns = rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      isDone: row.isDone,
    }));

    if (columns.length === 0) {
      setError('Board phải có ít nhất một cột.');
      return;
    }
    if (columns.some((column) => column.name.length === 0)) {
      setError('Tên cột không được để trống.');
      return;
    }
    if (columns.filter((column) => column.isDone).length !== 1) {
      setError('Phải có đúng một cột Done.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const updated = await updateColumns(board._id, {
        columns,
        expectedVersion: board.version,
      });
      onSaved(updated);
      onClose();
    } catch (caught) {
      if (isVersionConflict(caught)) {
        onConflict();
        return;
      }
      if (isColumnNotEmpty(caught)) {
        setError(caught.message);
        return;
      }
      setError(caught instanceof ApiClientError ? caught.message : 'Không lưu được danh sách cột.');
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
        aria-labelledby="column-manager-title"
        className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Owner
            </p>
            <h2 id="column-manager-title" className="mt-1 text-xl font-semibold text-stone-900">
              Quản lý cột
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

        <form onSubmit={handleSubmit} className="mt-5">
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2"
              >
                <span className="w-5 text-center text-xs text-stone-400">{index + 1}</span>
                <input
                  value={row.name}
                  onChange={(event) => updateRow(row.key, { name: event.target.value })}
                  maxLength={60}
                  disabled={pending}
                  aria-label={`Tên cột ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <input
                    type="radio"
                    name="done-column"
                    checked={row.isDone}
                    onChange={() => setDone(row.key)}
                    disabled={pending}
                    className="size-3.5 text-amber-600 focus:ring-amber-500"
                  />
                  Done
                </label>
                <button
                  type="button"
                  onClick={() => moveRow(index, -1)}
                  disabled={pending || index === 0}
                  aria-label="Đưa cột lên"
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(index, 1)}
                  disabled={pending || index === rows.length - 1}
                  aria-label="Đưa cột xuống"
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={pending}
                  className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={pending || rows.length >= 12}
            className="mt-3 rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-500 disabled:opacity-40"
          >
            + Thêm cột
          </button>

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
              disabled={pending}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {pending ? 'Đang lưu...' : 'Lưu cột'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
