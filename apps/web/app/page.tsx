import Link from 'next/link';
import { CreateBoardForm } from './create-board-form';
import { fetchBoardsServer } from '../lib/server-api';

export const dynamic = 'force-dynamic';

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function HomePage() {
  let boards = null;
  let error: string | null = null;

  try {
    boards = await fetchBoardsServer();
  } catch {
    error = 'Không tải được danh sách board từ API';
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">NexTask</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">
            Board của bạn
          </h1>
          <p className="mt-2 max-w-2xl text-stone-600">
            Brainstorm trên whiteboard, promote thành task và theo dõi trên Kanban.
          </p>
        </div>
        <Link
          href="/health"
          className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 transition hover:border-stone-500"
        >
          Trạng thái hệ thống
        </Link>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="board-list-title">
          <div className="flex items-center justify-between">
            <h2 id="board-list-title" className="text-lg font-semibold text-stone-900">
              Các board gần đây
            </h2>
            {boards ? <span className="text-sm text-stone-500">{boards.length} board</span> : null}
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
              {error}
            </p>
          ) : boards && boards.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {boards.map((board) => (
                <li key={board._id}>
                  <Link
                    href={`/boards/${board._id}`}
                    className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-stone-900">{board.name}</h3>
                        <p className="mt-1 text-sm text-stone-500">
                          {board.columns.length} cột · cập nhật {formatUpdatedAt(board.updatedAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                        Retro
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : boards ? (
            <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
              <p className="font-medium text-stone-700">Chưa có board nào</p>
              <p className="mt-1 text-sm text-stone-500">
                Tạo board đầu tiên để bắt đầu brainstorm.
              </p>
            </div>
          ) : null}
        </section>

        <aside>
          <CreateBoardForm />
        </aside>
      </div>
    </main>
  );
}
