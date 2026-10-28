'use client';

import type { BoardDto, TaskDto } from '@nextask/contracts';
import { useState } from 'react';

interface KanbanBoardProps {
  board: BoardDto;
  tasks: TaskDto[];
  onMoveTask: (taskId: string, columnId: string) => Promise<void>;
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

export function KanbanBoard({ board, tasks, onMoveTask }: KanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);

  function tasksForColumn(columnId: string): TaskDto[] {
    return tasks
      .filter((task) => task.columnId === columnId)
      .sort((a, b) => a.order.localeCompare(b.order));
  }

  function dropTask(columnId: string, taskId: string) {
    if (!taskId) return;
    void onMoveTask(taskId, columnId);
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-200 px-4 py-3">
        <h2 className="font-semibold text-stone-900">Kanban</h2>
        <p className="text-xs text-stone-500">Kéo thẻ giữa các cột để cập nhật trạng thái.</p>
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
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverColumn(column.id);
              }}
              onDragLeave={() => {
                setDragOverColumn((current) => (current === column.id ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
                dropTask(column.id, taskId ?? '');
              }}
              className={`flex w-[210px] shrink-0 flex-col rounded-xl border p-2 transition ${
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
                {columnTasks.map((task) => (
                  <article
                    key={task._id}
                    draggable
                    data-task-id={task._id}
                    onDragStart={(event) => {
                      setDraggingTaskId(task._id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', task._id);
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                      setDragOverColumn(null);
                    }}
                    className={`cursor-grab rounded-lg border border-stone-200 bg-white p-3 shadow-sm active:cursor-grabbing ${
                      draggingTaskId === task._id ? 'opacity-50' : ''
                    }`}
                  >
                    <h4 className="text-sm font-medium leading-snug text-stone-900">
                      {task.title}
                    </h4>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityClasses[task.priority]}`}
                      >
                        {priorityLabels[task.priority]}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                        Từ note
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500">
                      {task.assigneeId
                        ? task.assigneeId === board.ownerId
                          ? 'Demo User'
                          : 'Thành viên'
                        : 'Chưa gán'}
                    </p>
                  </article>
                ))}

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
