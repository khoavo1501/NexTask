'use client';

import type { UserDto } from '@nextask/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiClientError, getMe, logout } from '../lib/api';

interface AuthHeaderProps {
  compact?: boolean;
}

export function AuthHeader({ compact = false }: AuthHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    getMe()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.status === 401 && active) {
          router.replace('/login');
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    setPending(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setPending(false);
    }
  }

  if (!user) {
    return <span className="text-xs text-stone-400">Đang tải tài khoản...</span>;
  }

  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <span className={`${compact ? 'text-xs' : 'text-sm'} text-stone-600`}>{user.name}</span>
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={pending}
        className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-600 transition hover:border-stone-500 disabled:opacity-40"
      >
        {pending ? 'Đang thoát...' : 'Đăng xuất'}
      </button>
      {!compact ? (
        <Link
          href="/health"
          className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 transition hover:border-stone-500"
        >
          Trạng thái hệ thống
        </Link>
      ) : null}
    </div>
  );
}
