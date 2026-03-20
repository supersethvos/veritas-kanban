/**
 * Shared dispatch hook for founder-level actions.
 *
 * Encapsulates useMutation + dispatchSignal + toast + cache invalidation
 * so ActionFooter, NewlyCompleteList, DecisionQueue, and DispatchCard
 * don't each repeat the same boilerplate.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/useToast';
import {
  dispatchSignal,
  ACTION_LABELS,
  type DispatchPayload,
  type DispatchAction,
  type DispatchResult,
} from '@/lib/dispatch-signal';
import type { FounderSurfaceExecutiveOverview } from '@veritas-kanban/shared';

interface DispatchOptions {
  /** Label shown in toast title (e.g. workflow name, task title) */
  label?: string;
  /** Called after successful dispatch */
  onDispatched?: (action: DispatchAction) => void;
}

const OVERVIEW_KEY = ['founder-surface', 'overview'] as const;

export function useFounderDispatch(options?: DispatchOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: dispatchSignal,
    onMutate: async (variables: DispatchPayload) => {
      // Optimistic update for acknowledge: remove the item from the list immediately
      if (variables.action !== 'acknowledge') return { previous: undefined };

      await queryClient.cancelQueries({ queryKey: OVERVIEW_KEY });
      const previous = queryClient.getQueryData<FounderSurfaceExecutiveOverview>(OVERVIEW_KEY);

      if (previous?.newly_complete_items) {
        queryClient.setQueryData<FounderSurfaceExecutiveOverview>(OVERVIEW_KEY, {
          ...previous,
          newly_complete_items: previous.newly_complete_items.filter(
            (item) => item.workflow_id !== variables.workflowId
          ),
        });
      }

      return { previous };
    },
    onSuccess: (data: DispatchResult, variables: DispatchPayload) => {
      const actionLabel = ACTION_LABELS[variables.action] ?? variables.action;
      const taskOk = data?.taskUpdated !== false;
      const bridgeOk = data?.bridgeAccepted === true;

      toast({
        title: options?.label ? `${actionLabel}: ${options.label}` : actionLabel,
        description: taskOk
          ? bridgeOk
            ? `Directive sent to ${variables.targetAgent} — task updated, agent notified`
            : `Task updated — agent bridge offline, directive queued`
          : `Dispatch sent but task update failed: ${data?.taskError || 'unknown'}`,
        variant: taskOk ? 'default' : 'destructive',
        duration: 5000,
      });

      // Targeted cache invalidation based on action type
      queryClient.invalidateQueries({ queryKey: ['founder-surface'] });
      if (['approve', 'reject', 'escalate', 'reassign'].includes(variables.action)) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
      if (['escalate', 'reassign'].includes(variables.action)) {
        queryClient.invalidateQueries({ queryKey: ['cockpit'] });
      }

      options?.onDispatched?.(variables.action);
    },
    onError: (
      error: Error,
      _variables: DispatchPayload,
      context?: { previous?: FounderSurfaceExecutiveOverview }
    ) => {
      // Rollback optimistic update on error
      if (context?.previous) {
        queryClient.setQueryData<FounderSurfaceExecutiveOverview>(OVERVIEW_KEY, context.previous);
      }

      toast({
        title: 'Dispatch failed',
        description: error?.message ?? 'unknown error',
        variant: 'destructive',
      });
    },
  });

  return {
    dispatch: mutation.mutate,
    dispatchAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
