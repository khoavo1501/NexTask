import type { PresenceParticipant } from '@nextask/contracts';
import type { UserDocument } from '../modules/users/user.model.js';

const COLORS = ['#e11d48', '#0284c7', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const presence = new Map<string, Map<string, PresenceParticipant>>();

function boardMap(boardId: string): Map<string, PresenceParticipant> {
  let map = presence.get(boardId);
  if (!map) {
    map = new Map();
    presence.set(boardId, map);
  }
  return map;
}

export function addParticipant(
  boardId: string,
  socketId: string,
  user: UserDocument,
): PresenceParticipant {
  const color =
    COLORS[Number.parseInt(user._id.toHexString().slice(-2), 16) % COLORS.length] ?? COLORS[0]!;
  const participant: PresenceParticipant = {
    socketId,
    userId: user._id.toHexString(),
    name: user.name,
    color,
    cursor: null,
  };
  boardMap(boardId).set(socketId, participant);
  return participant;
}

export function removeParticipant(boardId: string, socketId: string): void {
  const map = presence.get(boardId);
  if (!map) return;
  map.delete(socketId);
  if (map.size === 0) presence.delete(boardId);
}

export function listParticipants(boardId: string): PresenceParticipant[] {
  return [...(presence.get(boardId)?.values() ?? [])];
}

export function updateCursor(
  boardId: string,
  socketId: string,
  cursor: { x: number; y: number },
): PresenceParticipant | null {
  const participant = presence.get(boardId)?.get(socketId);
  if (!participant) return null;
  participant.cursor = cursor;
  return participant;
}
