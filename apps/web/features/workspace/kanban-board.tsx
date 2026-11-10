'use client';

import type { BoardDto, BoardMemberDetailDto, TaskDto, TaskPriority } from '@nextask/contracts';
import { useState } from 'react';

export interface KanbanFilters {
  q: string;
  assigneeId: string;
  priority: '' | TaskPriority;
}

interface KanbanBoardProps {
  board: BoardDto;
  tasks: TaskDto[];
  members: BoardMemberDetailDto[];
  filters: KanbanFilters;
  hasMore: boolean;
  onFiltersChange: (filters: KanbanFilters) => void;
  onMoveTask: (
    taskId: string,
    columnId: string,
    beforeTaskId: string | null,
    expectedVersion: number,
  ) => Promise<void>;
}

const priorityLabels: Record<TaskDto['priority'], string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

const priorityClasses: Record<TaskDto['priority'], string> = {
  low: 'bg-stone-100 text-stone-600',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-rose-100 text-rose-700',
};

const priorityOptions: Array<{ value: '' | TaskPriority; label: string }> = [
  { value: '', label: 'Mọi ưu tiên' },
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn cấp' },
];

export function KanbanBoard({
  board,
  tasks,
  members,
  filters,
  hasMore,
  onFiltersChange,
  onMoveTask,
}: KanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const filtersActive =
    filters.q.trim() !== '' || filters.assigneeId !== '' || filters.priority !== '';
  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);
  const memberNames = new Map(members.map((member) => [member.userId, member.name]));

  function tasksForColumn(columnId: string): TaskDto[] {
    return tasks
      .filter((task) => task.columnId === columnId)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a._id.localeCompare(b._id)));
  }

  function assigneeName(assigneeId: string | null): string {
    if (!assigneeId) return 'Chưa gán';
    return memberNames.get(assigneeId) ?? (assigneeId === board.ownerId ? 'Owner' : 'Thành viên');
  }

  function dropTask(columnId: string, beforeTaskId: string | null, draggedId = draggingTaskId) {
    if (!draggedId || beforeTaskId === draggedId) return;
    const task = tasks.find((entry) => entry._id === draggedId);
    if (!task) return;
    void onMoveTask(draggedId, columnId, beforeTaskId, task.version);
    setDraggingTaskId(null);
    setDragOverColumn(null);
    setDragOverTaskId(null);
  }

  function clearFilters() {
    onFiltersChange({ q: '', assigneeId: '', priority: '' });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900">Kanban</h2>
            <p className="text-xs text-stone-500">Kéo thẻ để đổi cột hoặc vị trí trong cột.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Tìm task"
              placeholder="Tìm task..."
              value={filters.q}
              onChange={(event) => onFiltersChange({ ...filters, q: event.target.value })}
              className="w-40 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            <select
              aria-label="Lọc người gán"
              value={filters.assigneeId}
              onChange={(event) => onFiltersChange({ ...filters, assigneeId: event.target.value })}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Mọi người</option>
              <option value="none">Chưa gán</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc ưu tiên"
              value={filters.priority}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  priority: event.target.value as KanbanFilters['priority'],
                })
              }
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            >
              {priorityOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtersActive}
              className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xóa lọc
            </button>
          </div>
        </div>

        {filtersActive ? (
          <p className="mt-2 text-[11px] text-amber-700">Xóa bộ lọc để kéo thả.</p>
        ) : null}
        {hasMore ? (
          <p className="mt-2 text-[11px] text-stone-500">
            Còn task chưa tải; thu hẹp bộ lọc để xem thêm.
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {sortedColumns.map((column) => {
          const columnTasks = tasksForColumn(column.id);
          const isOver = dragOverColumn === column.id;

          return (
            <section
              key={column.id}
              aria-label={column.name}
              data-column-id={column.id}
              onDragOver={(event) => {
                if (filtersActive) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverColumn(column.id);
              }}
              onDragLeave={() => {
                setDragOverColumn((current) => (current === column.id ? null : current));
              }}
              onDrop={(event) => {
                if (filtersActive) return;
                event.preventDefault();
                const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
                dropTask(column.id, null, taskId ?? '');
              }}
              className={`flex min-w-[145px] flex-1 flex-col rounded-xl border p-2 transition ${
                isOver
                  ? 'border-amber-400 bg-amber-50'
                  : column.isDone
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between px-1 py-1">
                <h3 className="text-sm font-semibold text-stone-700">{column.name}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500">
                  {columnTasks.length}
                </span>
              </div>

              <div className="mt-1 flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">
                {columnTasks.map((task) => {
                  const isDragging = draggingTaskId === task._id;
                  const isDragTarget = dragOverTaskId === task._id;
                  const dueDate = task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString('vi-VN')
                    : null;

                  return (
                    <article
                      key={task._id}
                      draggable={!filtersActive}
                      data-task-id={task._id}
                      onDragStart={(event) => {
                        if (filtersActive) return;
                        setDraggingTaskId(task._id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task._id);
                      }}
                      onDragEnd={() => {
                        setDraggingTaskId(null);
                        setDragOverColumn(null);
                        setDragOverTaskId(null);
                      }}
                      onDragOver={(event) => {
                        if (filtersActive) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverTaskId(task._id);
                        setDragOverColumn(column.id);
                      }}
                      onDragLeave={() => {
                        setDragOverTaskId((current) => (current === task._id ? null : current));
                      }}
                      onDrop={(event) => {
                        if (filtersActive) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
                        dropTask(column.id, task._id, taskId ?? '');
                      }}
                      className={`cursor-grab select-none rounded-lg border bg-white p-3 shadow-sm active:cursor-grabbing ${
                        isDragging ? 'opacity-50' : ''
                      } ${
                        isDragTarget ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200'
                      } ${filtersActive ? 'cursor-default' : ''}`}
                    >
                      <h4 className="text-sm font-medium leading-snug text-stone-900">
                        {task.title}
                      </h4>

                      {task.labels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityClasses[task.priority]}`}
                        >
                          {priorityLabels[task.priority]}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                          Từ note
                        </span>
                        {dueDate ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                            {dueDate}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] text-stone-500">
                        {assigneeName(task.assigneeId)}
                      </p>
                    </article>
                  );
                })}

                {columnTasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-300 px-3 py-6 text-center text-xs text-stone-400">
                    Thả task vào đây
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
