import { io, type Socket } from 'socket.io-client';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function createBoardSocket(): Socket {
  return io(new URL(apiBase).origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
