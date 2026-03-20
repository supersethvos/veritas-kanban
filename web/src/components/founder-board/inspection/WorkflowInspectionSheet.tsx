import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useFounderSurfaceWorkflowDetail } from '@/hooks/useFounderSurface';
import InspectionHeader from './InspectionHeader';
import EvidenceSummary from './EvidenceSummary';
import BoundaryPosture from './BoundaryPosture';
import DriftBlockerTruth from './DriftBlockerTruth';
import LegalNextActions from './LegalNextActions';
import RecentRunsTimeline from './RecentRunsTimeline';
import AgentRoleFooter from './AgentRoleFooter';
import ActionFooter from '../ActionFooter';
import type { FounderSurfaceAttentionCategory } from '@veritas-kanban/shared';

interface Props {
  workflowId: string | null;
  category?: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>;
  onClose: () => void;
}

export default function WorkflowInspectionSheet({ workflowId, category, onClose }: Props) {
  const open = workflowId != null;
  const { data, isLoading, isError } = useFounderSurfaceWorkflowDetail(open ? workflowId : null);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-xl w-full bg-primal-bg border-primal-rule-light/30 overflow-y-auto"
      >
        {isLoading && (
          <div className="space-y-4 pt-8">
            <div className="h-6 w-48 rounded bg-primal-rule-light/20 animate-pulse" />
            <div className="h-20 rounded-xl bg-primal-rule-light/20 animate-pulse" />
            <div className="h-16 rounded-xl bg-primal-rule-light/20 animate-pulse" />
            <div className="h-16 rounded-xl bg-primal-rule-light/20 animate-pulse" />
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center pt-16">
            <p className="text-sm text-primal-gray-mid">Unable to load workflow detail.</p>
          </div>
        )}

        {data && (
          <>
            <SheetHeader>
              <SheetTitle className="text-primal-gray-light">{data.workflow.name}</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* 1. System claim + badges */}
              <InspectionHeader
                workflow={data.workflow}
                certification={data.certification}
                readiness={data.readiness}
                completionTruth={data.completion_truth}
              />

              {/* 2. Evidence at founder resolution */}
              <EvidenceSummary
                evidence={data.evidence_bundle}
                completionTruth={data.completion_truth}
              />

              {/* 3. Boundary & posture */}
              <BoundaryPosture workflow={data.workflow} certification={data.certification} />

              {/* 4. Drift & blockers (conditional) */}
              <DriftBlockerTruth workflow={data.workflow} readiness={data.readiness} />

              {/* 5. Legal next actions */}
              <LegalNextActions
                readiness={data.readiness}
                attentionItems={data.founder_attention}
              />

              {/* 6. Action controls */}
              {category && (
                <ActionFooter
                  category={category}
                  targetAgent={data.workflow.owner_agent}
                  taskId={data.workflow.current_task_id ?? data.founder_attention[0]?.task_id}
                  workflowName={data.workflow.name}
                />
              )}

              {/* 7. Recent runs */}
              <RecentRunsTimeline runs={data.recent_runs} />

              {/* 8. Agent role (below the fold) */}
              <AgentRoleFooter
                workflow={data.workflow}
                readiness={data.readiness}
                efficiencyDiagnosis={data.efficiency_diagnosis}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
