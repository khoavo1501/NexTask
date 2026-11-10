'use client';

import type { BoardDto, ItemDto, PresenceParticipant, TaskDto } from '@nextask/contracts';
import dynamic from 'next/dynamic';

export interface WhiteboardProps {
  board: BoardDto;
  initialItems: ItemDto[];
  items: ItemDto[];
  tasks: TaskDto[];
  presence?: PresenceParticipant[];
  onCursorMove?: (point: { x: number; y: number }) => void;
  onItemsChange: (items: ItemDto[]) => void;
  onPromoteRequest: (item: ItemDto) => void;
}

const WhiteboardCanvas = dynamic<WhiteboardProps>(
  () => import('./whiteboard-canvas').then((module) => module.WhiteboardCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-stone-50 text-sm text-stone-500">
        Đang tải whiteboard...
      </div>
    ),
  },
);

export function Whiteboard(props: WhiteboardProps) {
  return <WhiteboardCanvas {...props} />;
}
