import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as userService from './user.service';
import * as artistService from '../artists/artist.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Wraps an async handler so rejected promises reach the error middleware. */
function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const getProfile = asyncHandler(async (req, res) => {
  res.json({ data: await userService.getProfile(req.user!.id) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  res.json({ data: await userService.updateProfile(req.user!.id, req.body) });
});

export const getGenrePreferences = asyncHandler(async (req, res) => {
  res.json({ data: await userService.getGenrePreferences(req.user!.id) });
});

export const setGenrePreferences = asyncHandler(async (req, res) => {
  res.json({ data: await userService.setGenrePreferences(req.user!.id, req.body.genreIds) });
});

export const getNotificationPreferences = asyncHandler(async (req, res) => {
  res.json({ data: await userService.getNotificationPreferences(req.user!.id) });
});

export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  res.json({ data: await userService.updateNotificationPreferences(req.user!.id, req.body) });
});

export const getFollowedArtists = asyncHandler(async (req, res) => {
  const result = await artistService.getFollowedArtists(req.user!.id, {
    limit: req.query.limit ? Number(req.query.limit as string) : undefined,
    cursor: req.query.cursor as string | undefined,
  });
  res.json(result);
});
