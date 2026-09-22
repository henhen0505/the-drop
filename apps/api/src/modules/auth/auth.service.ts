import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { and, eq, isNull } from 'drizzle-orm';
import type { UserRole } from '@the-drop/types';
import { config } from '../../config/index';
import { db } from '../../db/client';
import { users } from '../../db/schema/users';
import { refreshTokens, passwordResetTokens } from '../../db/schema/auth';
import { logger } from '../../utils/logger';
import {
  ConflictError,
  NotImplementedError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors';

const SALT_ROUNDS = 12;

// Pre-computed bcrypt hash of a random string. Compared against on every
// "user not found" login attempt so the response timing is identical to a
// real password check, preventing account enumeration via timing.
const DUMMY_HASH = '$2b$12$LJ3m4ys3Gz4kuoBLhLDmZuGPOHZFQFhSx/Z5XsN9ZBcEJC3q1kTi2';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

type UserRow = typeof users.$inferSelect;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    // JWT_ACCESS_EXPIRY is validated as a string at config load; it's on the
    // operator to keep it in `ms`-compatible format (e.g. '15m').
    expiresIn: config.jwt.accessExpiry as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.secret);
  if (typeof decoded === 'string') {
    throw new UnauthorizedError('Invalid access token');
  }

  const { sub, email, role } = decoded;
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    throw new UnauthorizedError('Invalid access token payload');
  }

  return { sub, email, role: role as UserRole };
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createRefreshToken(
  userId: string,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshDays * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  return { rawToken, expiresAt };
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

async function issueAuthResult(user: UserRow): Promise<AuthResult> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const { rawToken } = await createRefreshToken(user.id);
  const csrfToken = generateCsrfToken();

  return {
    user: toAuthUser(user),
    accessToken,
    refreshToken: rawToken,
    csrfToken,
  };
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export async function registerUser(data: RegisterInput): Promise<AuthResult> {
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      passwordHash,
      displayName: data.displayName,
    })
    .returning();

  if (!user) {
    throw new Error('Failed to create user');
  }

  return issueAuthResult(user);
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function loginUser(data: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(data.email);

  if (!user) {
    // Run a bcrypt compare against a dummy hash so this branch takes the
    // same time as a real password mismatch (timing-safe against account
    // enumeration).
    await bcrypt.compare(data.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.passwordHash) {
    await bcrypt.compare(data.password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return issueAuthResult(user);
}

export async function rotateRefreshToken(rawOldToken: string): Promise<AuthResult> {
  const tokenHash = hashToken(rawOldToken);

  const [tokenRow] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (tokenRow.revokedAt) {
    // Reuse of an already-rotated/revoked token: treat as compromise and
    // kill every session for this user.
    logger.warn({ userId: tokenRow.userId }, 'Refresh token reuse detected');
    await revokeAllUserTokens(tokenRow.userId);
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  await revokeRefreshToken(tokenHash);

  const [user] = await db.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  if (!user) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  return issueAuthResult(user);
}

export interface GoogleAuthResult extends AuthResult {
  isNewUser: boolean;
}

export async function loginOrRegisterWithGoogle(idToken: string): Promise<GoogleAuthResult> {
  const clientId = config.google.clientId;
  if (!clientId) {
    throw new NotImplementedError('Google sign-in is not configured on this server');
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new UnauthorizedError('Invalid Google ID token');
  }

  const googleId = payload.sub;
  const email = payload.email;
  const displayName = payload.name ?? email;
  const avatarUrl = payload.picture ?? null;

  const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

  if (byGoogleId) {
    return { ...(await issueAuthResult(byGoogleId)), isNewUser: false };
  }

  const byEmail = await findUserByEmail(email);

  if (byEmail) {
    // Existing account (password and/or a stale Google link) matched by
    // email: link this Google ID without touching anything else.
    if (!byEmail.googleId) {
      const [linked] = await db
        .update(users)
        .set({ googleId, emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id))
        .returning();

      if (!linked) {
        throw new Error('Failed to link Google account');
      }

      return { ...(await issueAuthResult(linked)), isNewUser: false };
    }

    return { ...(await issueAuthResult(byEmail)), isNewUser: false };
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: null,
      displayName,
      avatarUrl,
      googleId,
      emailVerified: true,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create user');
  }

  return { ...(await issueAuthResult(created)), isNewUser: true };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) {
    randomBytes(32).toString('hex');
    hashToken('dummy');
    return;
  }

  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  if (config.env !== 'production') {
    logger.info(
      { resetUrl: `http://localhost:3000/reset-password?token=${rawToken}` },
      'Password reset requested',
    );
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);

  const [tokenRow] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() < Date.now()) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, tokenRow.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenRow.id));

  await revokeAllUserTokens(tokenRow.userId);
}
