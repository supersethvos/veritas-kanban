import type {
  Workflow,
  WorkflowReadiness,
  WorkflowEfficiencyDiagnosis,
} from '@veritas-kanban/shared';

interface Props {
  workflow: Workflow;
  readiness: WorkflowReadiness;
  efficiencyDiagnosis?: WorkflowEfficiencyDiagnosis | null;
}

export default function AgentRoleFooter({ workflow, readiness, efficiencyDiagnosis }: Props) {
  return (
    <div className="space-y-2 pt-3 border-t border-primal-rule-light/20">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-primal-muted">
          Operated by <span className="text-primal-gray-mid">{workflow.owner_agent}</span>
        </p>
        <p className="text-[10px] text-primal-muted">
          Review burden:{' '}
          <span className="text-primal-gray-mid">{readiness.human_review_burden}</span>
        </p>
      </div>

      {efficiencyDiagnosis && (
        <p className="text-[10px] text-primal-muted leading-relaxed">
          Efficiency: {efficiencyDiagnosis}
        </p>
      )}
    </div>
  );
}
