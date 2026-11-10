'use client';

import type { BoardDto, BoardMemberDetailDto, TaskDto, TaskPriority } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, createTask, isVersionConflict, updateTask } from '../../lib/api';

interface TaskEditorDialogProps {
  board: BoardDto;
  members: BoardMemberDetailDto[];
  task: TaskDto | null;
  initialColumnId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConflict: () => void;
}

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn cấp' },
];

function parseLabels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

function dueDateToIso(value: string): string | null {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

export function TaskEditorDialog({
  board,
  members,
  task,
  initialColumnId,
  onClose,
  onSaved,
  onConflict,
}: TaskEditorDialogProps) {
  const [columnId, setColumnId] = useState(
    task?.columnId ?? initialColumnId ?? board.columns[0]?.id ?? '',
  );
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [labelsText, setLabelsText] = useState(task?.labels.join(', ') ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : '');
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
    if (!columnId || title.trim().length === 0) return;

    setPending(true);
    setError(null);
    const common = {
      title: title.trim(),
      description,
      assigneeId: assigneeId || null,
      labels: parseLabels(labelsText),
      priority,
      dueDate: dueDateToIso(dueDate),
    };

    try {
      if (task) {
        await updateTask(board._id, task._id, {
          ...common,
          expectedVersion: task.version,
        });
      } else {
        await createTask(board._id, { ...common, columnId });
      }
      await onSaved();
      onClose();
    } catch (caught) {
      if (isVersionConflict(caught)) {
        onConflict();
        return;
      }
      setError(caught instanceof ApiClientError ? caught.message : 'Không lưu được task.');
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
        aria-labelledby="task-editor-title"
        className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              {task ? 'Sửa task' : 'Tạo task'}
            </p>
            <h2 id="task-editor-title" className="mt-1 text-xl font-semibold text-stone-900">
              {task ? 'Cập nhật công việc' : 'Thêm công việc vào Kanban'}
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
          {task ? (
            <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
              Cột:{' '}
              {board.columns.find((column) => column.id === task.columnId)?.name ?? task.columnId}
            </p>
          ) : (
            <label className="block text-sm font-medium text-stone-800">
              Cột
              <select
                value={columnId}
                onChange={(event) => setColumnId(event.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              >
                {board.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm font-medium text-stone-800">
            Tiêu đề
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              disabled={pending}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <label className="block text-sm font-medium text-stone-800">
            Mô tả
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={5000}
              rows={3}
              disabled={pending}
              className="mt-1 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-800">
              Người gán
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">Chưa gán</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-stone-800">
              Ưu tiên
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                disabled={pending}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-800">
              Labels
              <input
                value={labelsText}
                onChange={(event) => setLabelsText(event.target.value)}
                placeholder="bug, ux"
                disabled={pending}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            </label>

            <label className="block text-sm font-medium text-stone-800">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            </label>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
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
              disabled={pending || title.trim().length === 0}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Đang lưu...' : task ? 'Lưu thay đổi' : 'Tạo task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
