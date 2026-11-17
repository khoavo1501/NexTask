import type { PipelineStage, Types } from 'mongoose';

export interface UnpromotedIdeasPipelineInput {
  boardId: Types.ObjectId;
  minVotes: number;
  limit: number;
}

export function buildUnpromotedIdeasPipeline(input: UnpromotedIdeasPipelineInput): PipelineStage[] {
  return [
    {
      $match: {
        boardId: input.boardId,
        type: 'note',
        promotedTaskId: null,
      },
    },
    { $addFields: { voteCount: { $size: '$votes' } } },
    { $match: { voteCount: { $gte: input.minVotes } } },
    {
      $lookup: {
        from: 'tasks',
        let: { itemId: '$_id', boardId: '$boardId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$sourceItemId', '$$itemId'] },
                  { $eq: ['$boardId', '$$boardId'] },
                  { $eq: ['$lifecycle', 'active'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'activeTasks',
      },
    },
    { $match: { activeTasks: { $size: 0 } } },
    { $sort: { voteCount: -1, createdAt: 1, _id: 1 } },
    { $limit: input.limit },
    {
      $project: {
        itemId: '$_id',
        shapeId: 1,
        content: 1,
        voteCount: 1,
        createdAt: 1,
        _id: 0,
      },
    },
  ];
}

export interface StalledTasksPipelineInput {
  boardId: Types.ObjectId;
  stalledDays: number;
  limit: number;
  doneColumnIds: string[];
}

export function buildStalledTasksPipeline(input: StalledTasksPipelineInput): PipelineStage[] {
  const cutoff = new Date(Date.now() - input.stalledDays * 24 * 60 * 60 * 1000);
  return [
    {
      $match: {
        boardId: input.boardId,
        lifecycle: 'active',
        sourceItemId: { $ne: null },
        columnId: { $nin: input.doneColumnIds },
        createdAt: { $lte: cutoff },
      },
    },
    {
      $lookup: {
        from: 'items',
        localField: 'sourceItemId',
        foreignField: '_id',
        as: 'sourceItem',
      },
    },
    { $unwind: { path: '$sourceItem', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $limit: input.limit },
    {
      $project: {
        taskId: '$_id',
        title: 1,
        columnId: 1,
        createdAt: 1,
        sourceItem: {
          itemId: '$sourceItem._id',
          shapeId: '$sourceItem.shapeId',
          content: '$sourceItem.content',
        },
        _id: 0,
      },
    },
  ];
}
