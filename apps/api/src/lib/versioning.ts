import {
  COLUMN_NOT_EMPTY_CODE,
  ORDER_CONFLICT_CODE,
  VERSION_CONFLICT_CODE,
  type ColumnNotEmptyDetails,
  type OrderConflictDetails,
  type VersionConflictDetails,
} from '@nextask/contracts';
import { AppError } from './errors.js';

export function versionConflict(currentVersion: number, shapeId?: string): AppError {
  const details: VersionConflictDetails = { currentVersion };
  if (shapeId !== undefined) {
    details.shapeId = shapeId;
  }

  return new AppError(409, VERSION_CONFLICT_CODE, 'Dữ liệu đã thay đổi, vui lòng tải lại', details);
}

export function orderConflict(columnId: string): AppError {
  const details: OrderConflictDetails = { columnId };
  return new AppError(409, ORDER_CONFLICT_CODE, 'Vị trí vừa thay đổi, vui lòng tải lại', details);
}

export function columnNotEmpty(columnId: string, taskCount: number): AppError {
  const details: ColumnNotEmptyDetails = { columnId, taskCount };
  return new AppError(409, COLUMN_NOT_EMPTY_CODE, 'Cột còn task, không thể xóa', details);
}
