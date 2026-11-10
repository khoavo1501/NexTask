'use client';

import type { ActivityDto, BoardMemberDetailDto, TaskDto } from '@nextask/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getActivities } from '../../lib/api';

interface ActivityPanelProps {
  boardId: string;
  members: BoardMemberDetailDto[];
  tasks: TaskDto[];
  refreshKey: number;
  onUndo: (activity: ActivityDto) => void;
}

const actionLabels: Record<ActivityDto['action'], string> = {
  'item.promoted': 'Đã promote',
  'item.demoted': 'Đã demote',
  'item.promote_undone': 'Đã hoàn tác promote',
};

export function ActivityPanel({ boardId, members, tasks, refreshKey, onUndo }: ActivityPanelProps) {
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const memberNames = new Map(members.map((member) => [member.userId, member.name]));
  const activeTaskIds = new Set(tasks.map((task) => task._id));
  const undoneActivityIds = new Set(
    activities
      .filter((activity) => activity.action === 'item.promote_undone')
      .map((activity) => activity.snapshot.originalActivityId)
      .filter((value): value is string => typeof value === 'string'),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setActivities(await getActivities(boardId));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không tải được hoạt động.');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-stone-900">Hoạt động</h2>
          <p className="text-xs text-stone-500">Promote và demote gần đây.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-500"
        >
          Làm mới
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? <p className="p-3 text-sm text-stone-500">Đang tải hoạt động...</p> : null}
        {error ? (
          <div className="m-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {!loading && !error && activities.length === 0 ? (
          <p className="p-3 text-sm text-stone-500">Chưa có hoạt động</p>
        ) : null}
        {!loading && !error ? (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li
                key={activity._id}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-stone-800">
                    {actionLabels[activity.action]} ·{' '}
                    {memberNames.get(activity.actorId) ?? 'Không rõ'}
                  </p>
                  <time className="text-[10px] text-stone-400" dateTime={activity.createdAt}>
                    {new Intl.DateTimeFormat('vi-VN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(activity.createdAt))}
                  </time>
                </div>
                <p className="mt-1 text-sm text-stone-700">
                  {typeof activity.snapshot.taskTitle === 'string'
                    ? activity.snapshot.taskTitle
                    : 'Task'}
                </p>
                {activity.action === 'item.promoted' &&
                activity.refs.taskId &&
                activeTaskIds.has(activity.refs.taskId) &&
                !undoneActivityIds.has(activity._id) &&
                activity.undoableUntil &&
                new Date(activity.undoableUntil).getTime() > Date.now() ? (
                  <button
                    type="button"
                    onClick={() => onUndo(activity)}
                    className="mt-2 text-[11px] font-medium text-rose-700 hover:underline"
                  >
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
