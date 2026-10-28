'use client';

import type { BoardDto } from '@nextask/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiClientError, acceptInvitation, getMe } from '../../lib/api';

interface AcceptInvitationProps {
  token: string;
}

type AuthState = 'loading' | 'signed-out' | 'signed-in';

export function AcceptInvitation({ token }: AcceptInvitationProps) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [board, setBoard] = useState<BoardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getMe()
      .then(() => {
        if (active) setAuthState('signed-in');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiClientError && caught.status === 401) {
          setAuthState('signed-out');
          return;
        }
        setError('Không kiểm tra được phiên đăng nhập.');
        setAuthState('signed-out');
      });
    return () => {
      active = false;
    };
  }, []);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      setBoard(await acceptInvitation(token));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không accept được lời mời.');
    } finally {
      setPending(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/invitations/${token}`)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">NexTask</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
          Lời mời tham gia board
        </h1>

        {authState === 'loading' ? (
          <p className="mt-4 text-sm text-stone-500">Đang kiểm tra tài khoản...</p>
        ) : board ? (
          <div className="mt-5">
            <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
              Bạn đã tham gia board <strong>{board.name}</strong>.
            </p>
            <Link
              href={`/boards/${board._id}`}
              className="mt-5 inline-block rounded-xl bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700"
            >
              Mở board
            </Link>
          </div>
        ) : authState === 'signed-out' ? (
          <div className="mt-5">
            <p className="text-sm text-stone-600">
              Bạn cần đăng nhập hoặc tạo tài khoản trước khi nhận lời mời.
            </p>
            <Link
              href={loginHref}
              className="mt-5 inline-block rounded-xl bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700"
            >
              Đăng nhập để tiếp tục
            </Link>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-sm text-stone-600">
              Bấm tham gia để trở thành Member của board này.
            </p>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={pending}
              className="mt-5 rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? 'Đang tham gia...' : 'Tham gia board'}
            </button>
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-stone-500">
          <Link href="/" className="underline-offset-4 hover:underline">
            Về trang board
          </Link>
        </p>
      </section>
    </main>
  );
}
