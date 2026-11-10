import type { BoardDto, ItemDto, TaskDto } from '@nextask/contracts';
import type { BoardDocument } from '../modules/boards/board.model.js';
import type { ItemDocument } from '../modules/items/item.model.js';
import type { TaskDocument } from '../modules/tasks/task.model.js';

export function serializeBoard(board: BoardDocument, viewerRole: 'owner' | 'member'): BoardDto {
  return {
    _id: board._id.toHexString(),
    name: board.name,
    ownerId: board.ownerId.toHexString(),
    members: board.members.map((member) => ({
      userId: member.userId.toHexString(),
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    viewerRole,
    columns: board.columns.map((column) => ({
      id: column.id,
      name: column.name,
      order: column.order,
      isDone: column.isDone,
    })),
    settings: {
      votingLimit: board.settings.votingLimit,
      minVotes: board.settings.minVotes,
      stalledAfterDays: board.settings.stalledAfterDays,
    },
    version: board.version,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

export function serializeItem(item: ItemDocument): ItemDto {
  return {
    _id: item._id.toHexString(),
    boardId: item.boardId.toHexString(),
    shapeId: item.shapeId,
    type: item.type,
    content: item.content,
    style: item.style,
    props: item.props,
    position: { x: item.position.x, y: item.position.y },
    size: { w: item.size.w, h: item.size.h },
    rotation: item.rotation,
    tldrawIndex: item.tldrawIndex,
    parentFrameId: item.parentFrameId?.toHexString() ?? null,
    authorId: item.authorId.toHexString(),
    votes: item.votes.map((vote) => ({
      userId: vote.userId.toHexString(),
      createdAt: vote.createdAt.toISOString(),
    })),
    promotedTaskId: item.promotedTaskId?.toHexString() ?? null,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializeTask(task: TaskDocument): TaskDto {
  return {
    _id: task._id.toHexString(),
    boardId: task.boardId.toHexString(),
    columnId: task.columnId,
    order: task.order,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId?.toHexString() ?? null,
    labels: task.labels,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    lifecycle: 'active',
    sourceItemId: task.sourceItemId?.toHexString() ?? null,
    origin: task.origin
      ? {
          itemId: task.origin.itemId.toHexString(),
          frameId: task.origin.frameId?.toHexString() ?? null,
          position: { x: task.origin.position.x, y: task.origin.position.y },
          voteCount: task.origin.voteCount,
          authorId: task.origin.authorId.toHexString(),
          itemCreatedAt: task.origin.itemCreatedAt.toISOString(),
        }
      : null,
    version: task.version,
    createdBy: task.createdBy.toHexString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
