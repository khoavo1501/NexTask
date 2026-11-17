import type { StalledIdeasReportDto } from '@nextask/contracts';
import type { Types } from 'mongoose';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel } from '../items/item.model.js';
import { TaskModel } from '../tasks/task.model.js';
import { buildStalledTasksPipeline, buildUnpromotedIdeasPipeline } from './report.pipeline.js';

export interface ReportOptions {
  minVotes: number;
  stalledDays: number;
  limit: number;
}

interface IdeaRow {
  itemId: Types.ObjectId;
  shapeId: string;
  content: string;
  voteCount: number;
  createdAt: Date;
}

interface TaskRow {
  taskId: Types.ObjectId;
  title: string;
  columnId: string;
  createdAt: Date;
  sourceItem?: {
    itemId: Types.ObjectId;
    shapeId: string;
    content: string;
  };
}

export async function getStalledIdeasReport(
  board: BoardDocument,
  options: ReportOptions,
): Promise<StalledIdeasReportDto> {
  const doneColumnIds = board.columns.filter((column) => column.isDone).map((column) => column.id);
  const [ideas, tasks] = await Promise.all([
    ItemModel.aggregate<IdeaRow>(
      buildUnpromotedIdeasPipeline({
        boardId: board._id,
        minVotes: options.minVotes,
        limit: options.limit,
      }),
    ).exec(),
    TaskModel.aggregate<TaskRow>(
      buildStalledTasksPipeline({
        boardId: board._id,
        stalledDays: options.stalledDays,
        limit: options.limit,
        doneColumnIds,
      }),
    ).exec(),
  ]);

  const unpromotedIdeas = ideas.map((idea) => ({
    itemId: idea.itemId.toHexString(),
    shapeId: idea.shapeId,
    content: idea.content,
    voteCount: idea.voteCount,
    createdAt: idea.createdAt.toISOString(),
  }));
  const stalledTasks = tasks.map((task) => ({
    taskId: task.taskId.toHexString(),
    title: task.title,
    columnId: task.columnId,
    createdAt: task.createdAt.toISOString(),
    sourceItem: task.sourceItem?.itemId
      ? {
          itemId: task.sourceItem.itemId.toHexString(),
          shapeId: task.sourceItem.shapeId,
          content: task.sourceItem.content,
        }
      : null,
  }));

  return {
    unpromotedIdeas,
    stalledTasks,
    summary: {
      unpromotedIdeas: unpromotedIdeas.length,
      stalledTasks: stalledTasks.length,
    },
    params: options,
  };
}
