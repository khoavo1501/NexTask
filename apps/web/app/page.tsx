import { fetchHealth } from '../lib/health';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const result = await fetchHealth();
  const health = result.ok ? result.response.data : null;
  const requestId = result.ok ? result.response.meta.requestId : null;
  const isOk = health?.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">NexTask</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
        Nền tảng đã sẵn sàng
      </h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Giai đoạn 0 kiểm tra Docker Compose, MongoDB replica set và kết nối API.
      </p>

      <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Trạng thái hệ thống</h2>
            <p className="mt-1 text-sm text-stone-500">Dữ liệu lấy trực tiếp từ API mỗi request.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {isOk ? 'Hoạt động' : 'Cần kiểm tra'}
          </span>
        </div>

        {result.ok ? (
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Replica set</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.replicaSet ?? 'không có'}
              </dd>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Primary</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.primary ? 'true' : 'false'}
              </dd>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Độ trễ Mongo</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.latencyMs ?? '-'} ms
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-6 rounded-xl bg-rose-50 p-4 text-rose-800">{result.message}</p>
        )}

        {requestId ? (
          <p className="mt-6 font-mono text-xs text-stone-400">requestId: {requestId}</p>
        ) : null}
      </section>
    </main>
  );
}
