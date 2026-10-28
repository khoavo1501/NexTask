import type { Document } from 'mongodb';

const objectId = { bsonType: 'objectId' } as const;
const nullableObjectId = { bsonType: ['objectId', 'null'] } as const;
const date = { bsonType: 'date' } as const;
const nullableDate = { bsonType: ['date', 'null'] } as const;
const number = { bsonType: 'number' } as const;

const pointSchema = {
  bsonType: 'object',
  required: ['x', 'y'],
  additionalProperties: false,
  properties: { x: number, y: number },
} as const;

const sizeSchema = {
  bsonType: 'object',
  required: ['w', 'h'],
  additionalProperties: false,
  properties: {
    w: { bsonType: 'number', minimum: 0 },
    h: { bsonType: 'number', minimum: 0 },
  },
} as const;

const timestampProperties = {
  createdAt: date,
  updatedAt: date,
} as const;

export const COLLECTION_VALIDATORS: Record<string, Document> = {
  users: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'email',
        'emailNormalized',
        'name',
        'passwordHash',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        email: { bsonType: 'string', minLength: 1 },
        emailNormalized: { bsonType: 'string', minLength: 1 },
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        passwordHash: { bsonType: 'string', minLength: 1 },
        ...timestampProperties,
      },
    },
  },
  boards: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'name',
        'ownerId',
        'members',
        'columns',
        'settings',
        'version',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        ownerId: objectId,
        members: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['userId', 'role', 'joinedAt'],
            additionalProperties: false,
            properties: {
              userId: objectId,
              role: { bsonType: 'string', enum: ['owner', 'member'] },
              joinedAt: date,
            },
          },
        },
        columns: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['id', 'name', 'order', 'isDone'],
            additionalProperties: false,
            properties: {
              id: { bsonType: 'string', minLength: 1 },
              name: { bsonType: 'string', minLength: 1 },
              order: number,
              isDone: { bsonType: 'bool' },
            },
          },
        },
        settings: {
          bsonType: 'object',
          required: ['votingLimit', 'minVotes', 'stalledAfterDays'],
          additionalProperties: false,
          properties: {
            votingLimit: { bsonType: 'number', minimum: 0 },
            minVotes: { bsonType: 'number', minimum: 0 },
            stalledAfterDays: { bsonType: 'number', minimum: 1 },
          },
        },
        version: { bsonType: 'number', minimum: 1 },
        ...timestampProperties,
      },
    },
  },
  items: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'shapeId',
        'type',
        'content',
        'style',
        'props',
        'position',
        'size',
        'rotation',
        'tldrawIndex',
        'parentFrameId',
        'authorId',
        'votes',
        'promotedTaskId',
        'version',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        shapeId: { bsonType: 'string', minLength: 1, maxLength: 200 },
        type: { bsonType: 'string', enum: ['note'] },
        content: { bsonType: 'string', maxLength: 10_000 },
        style: { bsonType: 'object' },
        props: { bsonType: 'object' },
        position: pointSchema,
        size: sizeSchema,
        rotation: number,
        tldrawIndex: { bsonType: 'string', minLength: 1, maxLength: 100 },
        parentFrameId: nullableObjectId,
        authorId: objectId,
        votes: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['userId', 'createdAt'],
            additionalProperties: false,
            properties: {
              userId: objectId,
              createdAt: date,
            },
          },
        },
        promotedTaskId: nullableObjectId,
        version: { bsonType: 'number', minimum: 1 },
        ...timestampProperties,
      },
    },
  },
  tasks: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'columnId',
        'order',
        'title',
        'description',
        'assigneeId',
        'labels',
        'priority',
        'dueDate',
        'lifecycle',
        'sourceItemId',
        'origin',
        'version',
        'createdBy',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        columnId: { bsonType: 'string', minLength: 1 },
        order: { bsonType: 'string', minLength: 1 },
        title: { bsonType: 'string', minLength: 1, maxLength: 200 },
        description: { bsonType: 'string' },
        assigneeId: nullableObjectId,
        labels: { bsonType: 'array', items: { bsonType: 'string' } },
        priority: { bsonType: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: nullableDate,
        lifecycle: { bsonType: 'string', enum: ['active', 'demoted'] },
        sourceItemId: nullableObjectId,
        origin: {
          anyOf: [
            { bsonType: 'null' },
            {
              bsonType: 'object',
              required: [
                'itemId',
                'frameId',
                'position',
                'voteCount',
                'authorId',
                'itemCreatedAt',
              ],
              additionalProperties: false,
              properties: {
                itemId: objectId,
                frameId: nullableObjectId,
                position: pointSchema,
                voteCount: { bsonType: 'number', minimum: 0 },
                authorId: objectId,
                itemCreatedAt: date,
              },
            },
          ],
        },
        version: { bsonType: 'number', minimum: 1 },
        createdBy: objectId,
        ...timestampProperties,
      },
    },
  },
  invitations: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'emailNormalized',
        'tokenHash',
        'role',
        'createdBy',
        'expiresAt',
        'usedAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        emailNormalized: { bsonType: ['string', 'null'] },
        tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
        role: { bsonType: 'string', enum: ['member'] },
        createdBy: objectId,
        expiresAt: date,
        usedAt: nullableDate,
        ...timestampProperties,
      },
    },
  },
};

export const VALIDATED_COLLECTIONS = Object.keys(COLLECTION_VALIDATORS);
