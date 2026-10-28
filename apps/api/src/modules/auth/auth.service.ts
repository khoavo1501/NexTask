import type { LoginRequest, RegisterRequest, UserDto } from '@nextask/contracts';
import { AppError } from '../../lib/errors.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { hashPassword, verifyPassword } from './password.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function serializeUser(user: UserDocument): UserDto {
  return {
    _id: user._id.toHexString(),
    email: user.email,
    emailNormalized: user.emailNormalized,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function registerUser(input: RegisterRequest): Promise<UserDocument> {
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const existing = await UserModel.findOne({ emailNormalized }).exec();
  if (existing) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Email đã được sử dụng');
  }

  try {
    return await UserModel.create({
      email,
      emailNormalized,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11_000) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Email đã được sử dụng');
    }
    throw error;
  }
}

export async function loginUser(input: LoginRequest): Promise<UserDocument> {
  const user = await UserModel.findOne({
    emailNormalized: normalizeEmail(input.email),
  }).exec();

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  }

  const matches = await verifyPassword(user.passwordHash, input.password);
  if (!matches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  }

  return user;
}
