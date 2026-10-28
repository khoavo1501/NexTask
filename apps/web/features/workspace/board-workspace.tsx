'use client';

import type { BoardDto, ItemDto, TaskDto } from '@nextask/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthHeader } from '../../components/auth-header';
import { ApiClientError, getBoard, getItems, getTasks, moveTask, promoteItem } from '../../lib/api';
import { PromoteDialog } from '../whiteboard/promote-dialog';
import { Whiteboard } from '../whiteboard/whiteboard';
import { InviteDialog } from './invite-dialog';
import { KanbanBoard } from './kanban-board';
import { RenameBoardDialog } from './rename-board-dialog';

interface BoardWorkspaceProps {
  boardId: string;
}

interface WorkspaceData {
  board: BoardDto;
  items: ItemDto[];
  tasks: TaskDto[];
}

export function BoardWorkspace({ boardId }: BoardWorkspaceProps) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<ItemDto | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, items, tasks] = await Promise.all([
        getBoard(boardId),
        getItems(boardId),
        getTasks(boardId),
      ]);
      setData({ board, items, tasks });
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      setError(
        caught instanceof ApiClientError ? caught.message : 'Không tải được board, thử lại sau.',
      );
    } finally {
      setLoading(false);
    }
  }, [boardId, router]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (data?.board.name) {
      document.title = `${data.board.name} · NexTask`;
    }
  }, [data?.board.name]);

  const handleItemsChange = useCallback((items: ItemDto[]) => {
    setData((current) => (current ? { ...current, items } : current));
  }, []);

  const handlePromote = useCallback(
    async (input: { columnId: string; assignToMe: boolean }) => {
      if (!promoteTarget) return;

      const result = await promoteItem(boardId, promoteTarget._id, {
        columnId: input.columnId,
        assignToMe: input.assignToMe,
        expectedItemVersion: promoteTarget.version,
      });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => (item._id === result.item._id ? result.item : item)),
          tasks: [...current.tasks.filter((task) => task._id !== result.task._id), result.task],
        };
      });
      setPromoteTarget(null);
      setNotice('Đã promote ghi chú thành task');
    },
    [boardId, promoteTarget],
  );

  const handleRenamed = useCallback((board: BoardDto) => {
    setData((current) => (current ? { ...current, board } : current));
  }, []);

  const handleMoveTask = useCallback(
    async (taskId: string, columnId: string, expectedVersion: number) => {
      setNotice(null);
      try {
        const moved = await moveTask(boardId, taskId, { columnId, expectedVersion });
        setData((current) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.map((task) => (task._id === moved._id ? moved : task)),
          };
        });
      } catch (caught) {
        setNotice(caught instanceof ApiClientError ? caught.message : 'Không di chuyển được task.');
      }
    },
    [boardId],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-stone-500">Đang tải board...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-stone-900">Không mở được board</h1>
          <p className="mt-2 text-sm text-rose-700">{error ?? 'Board không tồn tại'}</p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white"
            >
              Thử lại
            </button>
            <Link
              href="/"
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
            >
              Về danh sách board
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-stone-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-600 transition hover:border-stone-400"
          >
            Quay lại
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-stone-900">{data.board.name}</h1>
            <p className="text-xs text-stone-500">
              {data.items.length} ghi chú · {data.tasks.length} task
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            {data.board.viewerRole === 'owner' ? 'Owner' : 'Member'}
          </span>
          {data.board.viewerRole === 'owner' ? (
            <>
              <button
                type="button"
                onClick={() => setShowRename(true)}
                className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:border-stone-500"
              >
                Đổi tên
              </button>
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Mời
              </button>
            </>
          ) : null}
          <AuthHeader compact />
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900"
        >
          {notice}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 p-4">
        <section className="relative h-[62vh] min-h-[520px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <Whiteboard
            board={data.board}
            initialItems={data.items}
            items={data.items}
            tasks={data.tasks}
            onItemsChange={handleItemsChange}
            onPromoteRequest={setPromoteTarget}
          />
        </section>

        <aside className="h-[440px] w-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <KanbanBoard board={data.board} tasks={data.tasks} onMoveTask={handleMoveTask} />
        </aside>
      </div>

      {promoteTarget ? (
        <PromoteDialog
          item={promoteTarget}
          columns={data.board.columns}
          onClose={() => setPromoteTarget(null)}
          onConfirm={handlePromote}
        />
      ) : null}

      {showInvite ? <InviteDialog boardId={boardId} onClose={() => setShowInvite(false)} /> : null}

      {showRename ? (
        <RenameBoardDialog
          board={data.board}
          onClose={() => setShowRename(false)}
          onRenamed={handleRenamed}
        />
      ) : null}
    </main>
  );
}
