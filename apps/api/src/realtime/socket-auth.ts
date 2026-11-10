import type { Socket } from 'socket.io';
import { Types } from 'mongoose';
import { SESSION_COOKIE_NAME } from '../modules/auth/cookies.js';
import { verifySessionToken } from '../modules/auth/jwt.js';
import { UserModel, type UserDocument } from '../modules/users/user.model.js';

export interface BoardSocketData {
  user?: UserDocument;
  boardId?: string;
  lastCursorAt?: number;
}

function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export async function authenticateSocket(
  socket: Socket,
  jwtSecret: string,
): Promise<UserDocument> {
  const token = readSessionCookie(socket.handshake.headers.cookie);
  if (!token) throw new Error('UNAUTHENTICATED');
  const userId = await verifySessionToken(token, jwtSecret);
  if (!Types.ObjectId.isValid(userId)) throw new Error('UNAUTHENTICATED');
  const user = await UserModel.findById(userId).exec();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
