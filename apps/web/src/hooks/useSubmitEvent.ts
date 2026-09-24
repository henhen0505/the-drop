import { useMutation } from '@tanstack/react-query';
import type { CreateSubmissionInput, CreateSubmissionResult } from '@the-drop/types';
import { api } from '../services/api';

/** POST /submissions -- community/promoter event submission. */
export function useSubmitEvent() {
  const mutation = useMutation({
    mutationFn: (input: CreateSubmissionInput) =>
      api.post<CreateSubmissionResult>('/submissions', input),
  });

  return {
    submit: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
