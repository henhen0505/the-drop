import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FollowArtistResult } from '@the-drop/types';
import { api, apiClient } from '../services/api';

/** Follow/unfollow an artist, via POST/DELETE /artists/:id/follow. Both
 * invalidate the artist-profile cache (keyed by slug) so followerCount and
 * isFollowed refresh. */
export function useArtistFollow(artistId: string, slug: string) {
  const queryClient = useQueryClient();

  function invalidateProfile() {
    void queryClient.invalidateQueries({ queryKey: ['artist', slug] });
  }

  const followMutation = useMutation({
    mutationFn: () => api.post<FollowArtistResult>(`/artists/${artistId}/follow`),
    onSuccess: invalidateProfile,
  });

  const unfollowMutation = useMutation({
    // 204 No Content -- call apiClient directly, not the api.* JSON-unwrapping helpers.
    mutationFn: () => apiClient.delete(`/artists/${artistId}/follow`),
    onSuccess: invalidateProfile,
  });

  return {
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isPending: followMutation.isPending || unfollowMutation.isPending,
    isError: followMutation.isError || unfollowMutation.isError,
  };
}
