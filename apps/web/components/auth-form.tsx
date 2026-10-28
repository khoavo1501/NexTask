'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiClientError, login, register } from '../lib/api';

interface AuthFormProps {
  mode: 'login' | 'register';
}

function safeNextPath(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (isRegister) {
        await register({ name, email, password });
      } else {
        await login({ email, password });
      }
      const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
      router.push(next);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Không thực hiện được, thử lại sau.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">NexTask</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
          {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {isRegister
            ? 'Tạo tài khoản để tạo board và mời đồng đội.'
            : 'Đăng nhập để tiếp tục board của bạn.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegister ? (
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Tên</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-stone-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-stone-700">Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={isRegister ? 12 : 1}
              maxLength={128}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            {isRegister ? (
              <span className="mt-1 block text-xs text-stone-400">Tối thiểu 12 ký tự.</span>
            ) : null}
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-stone-900 px-4 py-2.5 font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Đang xử lý...' : isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-5 text-sm text-stone-500">
          {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <button
            type="button"
            onClick={() => router.push(isRegister ? '/login' : '/register')}
            className="font-medium text-amber-700 underline-offset-4 hover:underline"
          >
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </p>
      </section>
    </main>
  );
}
