'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, createInvitation } from '../../lib/api';

interface InviteDialogProps {
  boardId: string;
  onClose: () => void;
}

export function InviteDialog({ boardId, onClose }: InviteDialogProps) {
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setCopyStatus(null);

    try {
      const invitation = await createInvitation(boardId, email.trim() ? email.trim() : undefined);
      setInviteLink(`${window.location.origin}${invitation.path}`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không tạo được link mời.');
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyStatus('Đã copy link');
    } catch {
      setCopyStatus('Không copy tự động được, hãy chọn link để copy.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Invitation
            </p>
            <h2 id="invite-title" className="mt-1 text-xl font-semibold text-stone-900">
              Mời thành viên
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40"
          >
            Đóng
          </button>
        </div>

        {inviteLink ? (
          <div className="mt-5">
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Link chỉ hiển thị một lần. Hãy copy và gửi cho người cần mời.
            </p>
            <input
              readOnly
              value={inviteLink}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-3 w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
            >
              Copy link
            </button>
            {copyStatus ? <p className="mt-2 text-xs text-stone-500">{copyStatus}</p> : null}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5">
            <label htmlFor="invite-email" className="text-sm font-medium text-stone-800">
              Email người nhận (tùy chọn)
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="dongdoi@example.com"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            <p className="mt-2 text-xs text-stone-500">
              Nếu nhập email, chỉ tài khoản dùng email đó mới accept được. NexTask chưa gửi email tự
              động.
            </p>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-40"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {pending ? 'Đang tạo...' : 'Tạo link mời'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
