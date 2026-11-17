import { describe, expect, it } from 'vitest';
import {
  ALREADY_VOTED_CODE,
  NOT_VOTED_CODE,
  VOTE_LIMIT_REACHED_CODE,
  reportQuerySchema,
  voteResultsQuerySchema,
} from '@nextask/contracts';

describe('phase 6 contracts', () => {
  it('results query default limit 50, tối đa 100', () => {
    expect(voteResultsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(voteResultsQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(() => voteResultsQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => voteResultsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('report query coerce và optional defaults từ board', () => {
    expect(reportQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(reportQuerySchema.parse({ minVotes: '2', stalledDays: '7', limit: '10' })).toEqual({
      minVotes: 2,
      stalledDays: 7,
      limit: 10,
    });
    expect(() => reportQuerySchema.parse({ minVotes: '-1' })).toThrow();
    expect(() => reportQuerySchema.parse({ stalledDays: '0' })).toThrow();
  });

  it('export error codes vote', () => {
    expect(ALREADY_VOTED_CODE).toBe('ALREADY_VOTED');
    expect(NOT_VOTED_CODE).toBe('NOT_VOTED');
    expect(VOTE_LIMIT_REACHED_CODE).toBe('VOTE_LIMIT_REACHED');
  });
});
