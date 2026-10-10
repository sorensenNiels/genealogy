import {
  useMutation,
  useQueryClient,
  type MutationOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export interface OptimisticMutationConfig<TResult, TVariables, TData> {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  /** The cached query the mutation changes. */
  queryKey: QueryKey;
  /** What the cached data looks like once the mutation has gone through. */
  update: (data: TData, variables: TVariables) => TData;
}

/**
 * Mutation options for an optimistic update: the cached `queryKey` is changed
 * by `update` the moment the mutation starts (in-flight refetches cancelled
 * first, so one can't overwrite it), put back exactly as it was if the server
 * refuses, and refetched once it's settled either way, so the cache ends up
 * matching the server. Framework-free so it can be tested against a plain
 * `QueryClient`; components use `useOptimisticMutation`.
 */
export function optimisticMutationOptions<TResult, TVariables, TData>(
  queryClient: QueryClient,
  { mutationFn, queryKey, update }: OptimisticMutationConfig<TResult, TVariables, TData>,
): MutationOptions<TResult, Error, TVariables, { previous: TData | undefined }> {
  return {
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);
      if (previous !== undefined)
        queryClient.setQueryData<TData>(queryKey, update(previous, variables));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  };
}

/**
 * `useMutation` with an optimistic update (see `optimisticMutationOptions`) —
 * for small edits that almost always succeed (a toggle, a mark-as-read, a
 * role), where waiting for the round trip only makes the UI feel slow.
 * Types come from the arguments: the variables from `mutationFn`, the cached
 * data from `update`'s first parameter — annotate it.
 */
export function useOptimisticMutation<TResult, TVariables, TData>(
  config: OptimisticMutationConfig<TResult, TVariables, TData>,
) {
  const queryClient = useQueryClient();
  return useMutation(optimisticMutationOptions(queryClient, config));
}
