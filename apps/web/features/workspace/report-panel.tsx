'use client';

import type { StalledIdeasReportDto } from '@nextask/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getStalledIdeasReport } from '../../lib/api';

interface ReportPanelProps {
  boardId: string;
  refreshKey: number;
}

export function ReportPanel({ boardId, refreshKey }: ReportPanelProps) {
  const [report, setReport] = useState<StalledIdeasReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getStalledIdeasReport(boardId));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không tải được báo cáo.');
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
          <h2 className="font-semibold text-stone-900">Báo cáo</h2>
          <p className="text-xs text-stone-500">Ý tưởng chưa hành động và task bị kẹt.</p>
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
        {loading ? <p className="p-3 text-sm text-stone-500">Đang tải báo cáo...</p> : null}
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
        {report && !loading && !error ? (
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Ý tưởng nhiều vote chưa promote ({report.summary.unpromotedIdeas})
              </h3>
              {report.unpromotedIdeas.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Chưa có ý tưởng đủ điều kiện.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.unpromotedIdeas.map((idea) => (
                    <li key={idea.itemId} className="rounded-xl border border-stone-200 p-3">
                      <p className="text-sm text-stone-800">{idea.content || 'Ghi chú trống'}</p>
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {idea.voteCount} phiếu
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Task bị kẹt ({report.summary.stalledTasks})
              </h3>
              {report.stalledTasks.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Không có task bị kẹt.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.stalledTasks.map((task) => (
                    <li key={task.taskId} className="rounded-xl border border-stone-200 p-3">
                      <p className="text-sm text-stone-800">{task.title}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        Cột {task.columnId} · {new Date(task.createdAt).toLocaleDateString('vi-VN')}
                      </p>
                      {task.sourceItem ? (
                        <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                          {task.sourceItem.content}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
