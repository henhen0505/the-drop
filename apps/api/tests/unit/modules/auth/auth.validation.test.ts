import { describe, expect, it } from 'vitest';
import {
  registerSchema,
  loginSchema,
  googleSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../../../src/modules/auth/auth.validation';

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.body.safeParse({
      email: 'not-an-email',
      password: 'password123',
      displayName: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'short',
      displayName: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty displayName', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects displayName longer than 100 characters', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing field', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('strips extra fields', () => {
    const result = registerSchema.body.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test',
      role: 'ADMIN',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('role');
    }
  });
});

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.body.safeParse({
      email: 'test@example.com',
      password: 'anything',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.body.safeParse({
      email: 'not-an-email',
      password: 'anything',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.body.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = loginSchema.body.safeParse({
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('googleSchema', () => {
  it('accepts a non-empty idToken', () => {
    const result = googleSchema.body.safeParse({ idToken: 'some-token' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty idToken', () => {
    const result = googleSchema.body.safeParse({ idToken: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing idToken', () => {
    const result = googleSchema.body.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    const result = forgotPasswordSchema.body.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = forgotPasswordSchema.body.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing email', () => {
    const result = forgotPasswordSchema.body.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a valid token and password', () => {
    const result = resetPasswordSchema.body.safeParse({
      token: 'some-token',
      newPassword: 'newpassword123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty token', () => {
    const result = resetPasswordSchema.body.safeParse({
      token: '',
      newPassword: 'newpassword123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = resetPasswordSchema.body.safeParse({
      token: 'some-token',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
  });
});
