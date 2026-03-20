export const WORKFLOW_FAMILIES = [
  'classification',
  'content_production',
  'compliance_review',
  'retention_execution',
  'handoff_routing',
  'completion_reconciliation',
  'research',
  'implementation',
  'operations',
  'governance',
  'quality_assurance',
  'incident_response',
  'automation_control',
] as const;

export type WorkflowFamily = (typeof WORKFLOW_FAMILIES)[number];

export const WORKFLOW_RISK_CLASSES = ['low', 'moderate', 'high', 'critical'] as const;
export type WorkflowRiskClass = (typeof WORKFLOW_RISK_CLASSES)[number];

export const WORKFLOW_DATA_CLASSES = ['A', 'B', 'C'] as const;
export type WorkflowDataClass = (typeof WORKFLOW_DATA_CLASSES)[number];

export const WORKFLOW_STATES = [
  'human_native',
  'assisted',
  'governed_copilot',
  'certifying',
  'certified_autonomous',
  'under_review',
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_CERTIFICATION_STATUSES = [
  'not_ready',
  'candidate',
  'ready_for_review',
  'certified',
  'decertified',
] as const;
export type WorkflowCertificationStatus = (typeof WORKFLOW_CERTIFICATION_STATUSES)[number];

export const WORKFLOW_READINESS_LABELS = [
  'blocked',
  'emerging',
  'advancing',
  'near_ready',
  'certified',
  'degrading',
] as const;
export type WorkflowReadinessLabel = (typeof WORKFLOW_READINESS_LABELS)[number];

export const HUMAN_REVIEW_BURDENS = ['none', 'low', 'moderate', 'high'] as const;
export type HumanReviewBurden = (typeof HUMAN_REVIEW_BURDENS)[number];

export const WORKFLOW_EFFICIENCY_DIAGNOSES = [
  'agent_bound',
  'platform_bound',
  'mixed',
  'unknown',
] as const;
export type WorkflowEfficiencyDiagnosis = (typeof WORKFLOW_EFFICIENCY_DIAGNOSES)[number];

export const WORKFLOW_POLICY_RESULTS = ['pass', 'fail', 'unknown'] as const;
export type WorkflowPolicyResult = (typeof WORKFLOW_POLICY_RESULTS)[number];

export const FOUNDER_ATTENTION_KINDS = [
  'blocked_workflow',
  'overdue_workflow',
  'degrading_workflow',
  'policy_failure',
  'decision_required',
  'certification_review',
  'newly_complete',
] as const;
export type FounderAttentionKind = (typeof FOUNDER_ATTENTION_KINDS)[number];

export const FOUNDER_ATTENTION_SEVERITIES = [
  'info',
  'attention',
  'action_required',
  'critical',
] as const;
export type FounderAttentionSeverity = (typeof FOUNDER_ATTENTION_SEVERITIES)[number];

export const FOUNDER_ATTENTION_CONSTRAINT_KINDS = [
  'none',
  'internal_gate',
  'external_dependency',
  'founder_decision',
  'truth_drift',
] as const;
export type FounderAttentionConstraintKind = (typeof FOUNDER_ATTENTION_CONSTRAINT_KINDS)[number];

export const FOUNDER_ATTENTION_TARGETS = ['none', 'owner', 'operator', 'founder'] as const;
export type FounderAttentionTarget = (typeof FOUNDER_ATTENTION_TARGETS)[number];
export type FounderAttentionResolutionOwner = Exclude<FounderAttentionTarget, 'none'>;

export const COMPLETION_TRUTH_STATES = ['verified', 'at_risk', 'pending'] as const;
export type CompletionTruthState = (typeof COMPLETION_TRUTH_STATES)[number];

export const COMPLETION_TRUTH_SURFACES = ['artifact', 'board', 'channel', 'evidence'] as const;
export type CompletionTruthSurface = (typeof COMPLETION_TRUTH_SURFACES)[number];

export interface CompletionTruthSurfaceStatus {
  state: CompletionTruthState;
  summary: string;
  sources: string[];
}

export interface CompletionTruthOverlay {
  state: CompletionTruthState;
  summary: string;
  checked_at: string;
  blockers: string[];
  missing_surfaces: CompletionTruthSurface[];
  artifact: CompletionTruthSurfaceStatus;
  board: CompletionTruthSurfaceStatus;
  channel: CompletionTruthSurfaceStatus;
  evidence: CompletionTruthSurfaceStatus;
  latest_signal_id?: string | null;
  latest_signal_classification?: string | null;
}

export interface Workflow {
  workflow_id: string;
  name: string;
  venture_id: string;
  workflow_family: WorkflowFamily;
  description: string;
  owner_agent: string;
  critical_path: boolean;
  risk_class: WorkflowRiskClass;
  data_class: WorkflowDataClass;
  state: WorkflowState;
  status_reason: string;
  success_criteria: string[];
  created_at: string;
  updated_at: string;
  current_task_id?: string | null;
  current_thread_id?: string | null;
  overlay_id?: string | null;
  allowed_escalation_modes?: string[];
  human_review_required?: boolean;
  human_review_reason?: string | null;
  notes?: string | null;
  completion_truth?: CompletionTruthOverlay | null;
}

export interface WorkflowEvidenceBundle {
  workflow_id: string;
  window_start: string;
  window_end: string;
  run_count: number;
  successful_run_count: number;
  failed_run_count: number;
  policy_pass_count: number;
  policy_fail_count: number;
  halt_pass_count: number;
  halt_fail_count: number;
  hidden_cleanup_incidents: number;
  evidence_complete: boolean;
  updated_at: string;
  avg_duration_ms?: number | null;
  avg_cost?: number | null;
  p95_duration_ms?: number | null;
  p95_cost?: number | null;
  quality_score?: number | null;
  quality_method?: string | null;
  artifact_count?: number | null;
  human_review_events?: number | null;
  avg_tool_call_count?: number | null;
  p95_tool_call_count?: number | null;
  avg_read_call_count?: number | null;
  avg_search_call_count?: number | null;
  repeated_read_ratio?: number | null;
  avg_cold_start_discovery_ms?: number | null;
  avg_time_to_first_meaningful_action_ms?: number | null;
  context_bundle_hit_rate?: number | null;
  workspace_index_hit_rate?: number | null;
  batch_read_utilization?: number | null;
  efficiency_diagnosis?: WorkflowEfficiencyDiagnosis | null;
  linked_artifacts?: string[];
  linked_task_ids?: string[];
  linked_event_ids?: string[];
}

export interface WorkflowCertification {
  workflow_id: string;
  certification_status: WorkflowCertificationStatus;
  certification_reason: string;
  review_required: boolean;
  last_evaluated_at: string;
  certified_at?: string | null;
  decertified_at?: string | null;
  certified_by?: string | null;
  decertified_reason?: string | null;
  next_review_at?: string | null;
  certification_version?: string | null;
}

export interface WorkflowReadiness {
  workflow_id: string;
  readiness_label: WorkflowReadinessLabel;
  readiness_summary: string;
  temporary_blockers: string[];
  structural_limits: string[];
  top_failure_signatures: string[];
  human_review_burden: HumanReviewBurden;
  updated_at: string;
  recommended_next_action?: string | null;
  promotion_confidence?: number | null;
  degradation_confidence?: number | null;
  state_explanation?: string | null;
  blockers_explanation?: string | null;
  degradation_explanation?: string | null;
}

export interface WorkflowRunSummary {
  run_id: string;
  workflow_id: string;
  task_id: string;
  agent_id: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  policy_result: WorkflowPolicyResult;
  halt_result: WorkflowPolicyResult;
  requires_human_intervention: boolean;
  failure_signature: string | null;
  duration_ms?: number | null;
  cost?: number | null;
  model?: string | null;
  quality_score?: number | null;
  tool_call_count?: number | null;
  read_call_count?: number | null;
  search_call_count?: number | null;
  repeated_read_count?: number | null;
  context_bundle_hits?: number | null;
  context_bundle_misses?: number | null;
  workspace_index_hits?: number | null;
  workspace_index_misses?: number | null;
  batch_read_call_count?: number | null;
  time_to_first_meaningful_action_ms?: number | null;
  efficiency_diagnosis?: WorkflowEfficiencyDiagnosis | null;
  artifact_ids?: string[];
  event_ids?: string[];
}

export interface VentureCoverage {
  venture_id: string;
  workflow_count: number;
  critical_path_workflow_count: number;
  certified_autonomous_count: number;
  governed_copilot_count: number;
  certifying_count: number;
  human_native_count: number;
  assisted_count: number;
  under_review_count: number;
  certified_autonomy_rate: number;
  critical_path_certified_rate: number;
  updated_at: string;
  human_review_burden_score?: number | null;
  top_blockers?: string[];
  top_degrading_workflows?: string[];
  recent_promotions?: string[];
  recent_decertifications?: string[];
}

export const OPERATOR_INTERVENTION_KINDS = [
  'truth_repair',
  'governance_update',
  'routing_cleanup',
  'dispatch_quality',
  'normalization',
  'onboarding_enablement',
  'policy_enforcement',
  'other',
] as const;
export type OperatorInterventionKind = (typeof OPERATOR_INTERVENTION_KINDS)[number];

export const OPERATOR_INTERVENTION_VERIFICATION_STATUSES = [
  'verified',
  'partially_verified',
  'rejected',
] as const;
export type OperatorInterventionVerificationStatus =
  (typeof OPERATOR_INTERVENTION_VERIFICATION_STATUSES)[number];

export const OPERATOR_INTERVENTION_RESOLUTION_SCOPES = [
  'single_task',
  'multi_task',
  'cross_surface',
  'systemic',
] as const;
export type OperatorInterventionResolutionScope =
  (typeof OPERATOR_INTERVENTION_RESOLUTION_SCOPES)[number];

export const OPERATOR_INTERVENTION_RISK_LEVELS = ['low', 'moderate', 'high', 'critical'] as const;
export type OperatorInterventionRiskLevel = (typeof OPERATOR_INTERVENTION_RISK_LEVELS)[number];

export const ATLAS_OPERATOR_LEVERAGE_CLASSES = [
  'truth_quality',
  'routing_quality',
  'policy_quality',
  'coordination_leverage',
] as const;
export type AtlasOperatorLeverageClass = (typeof ATLAS_OPERATOR_LEVERAGE_CLASSES)[number];

export const AGENT_CERTIFICATION_TIERS = [
  'not_certified',
  'certified_executor',
  'certified_operator',
  'under_review',
] as const;
export type AgentCertificationTier = (typeof AGENT_CERTIFICATION_TIERS)[number];

export interface AgentCertificationSummary {
  agent_id: string;
  certification_tier: AgentCertificationTier;
  workflow_execution_score: number;
  operator_leverage_score: number;
  reliability_score: number;
  status_reason: string;
  last_evaluated_at: string;
  hard_gates?: string[];
  supporting_workflow_ids?: string[];
  supporting_receipt_ids?: string[];
  under_review_reason?: string | null;
  next_review_at?: string | null;
}

export interface OperatorInterventionReceipt {
  intervention_id: string;
  agent_id: string;
  kind: OperatorInterventionKind;
  summary: string;
  why_it_mattered: string;
  created_at: string;
  verified_at: string;
  verification_status: OperatorInterventionVerificationStatus;
  resolution_scope: OperatorInterventionResolutionScope;
  evidence_paths: string[];
  affected_tasks: string[];
  affected_surfaces: string[];
  verified_outcomes: string[];
  policy_refs?: string[];
  before_state_summary?: string | null;
  after_state_summary?: string | null;
  downstream_cards_created?: string[];
  downstream_cards_normalized?: string[];
  risk_reduced?: OperatorInterventionRiskLevel | null;
  founder_noise_reduction?: number | null;
  trust_quality_gain?: number | null;
  operator_note?: string | null;
}

export interface FounderAttentionItem {
  attention_id: string;
  kind: FounderAttentionKind;
  venture_id: string;
  workflow_id: string;
  severity: FounderAttentionSeverity;
  constraint_kind: FounderAttentionConstraintKind;
  attention_target: FounderAttentionTarget;
  requires_founder_action: boolean;
  resolution_owner: FounderAttentionResolutionOwner;
  summary: string;
  waiting_since: string;
  recommended_action: string;
  updated_at: string;
  task_id?: string | null;
  signal_event_id?: string | null;
  assigned_to?: string | null;
}

export interface FounderSurfaceSnapshot {
  workflows: Workflow[];
  evidence_bundles: WorkflowEvidenceBundle[];
  certifications: WorkflowCertification[];
  readiness: WorkflowReadiness[];
  run_summaries: WorkflowRunSummary[];
  venture_coverage: VentureCoverage[];
  attention_items: FounderAttentionItem[];
  agent_certifications: AgentCertificationSummary[];
  updated_at: string;
}

export const FOUNDER_SURFACE_ACTION_VERBS = ['Review', 'Inspect', 'Acknowledge'] as const;
export type FounderSurfaceActionVerb = (typeof FOUNDER_SURFACE_ACTION_VERBS)[number];

export const FOUNDER_SURFACE_ATTENTION_CATEGORIES = [
  'blocked',
  'overdue',
  'awaiting_decision',
  'newly_complete',
] as const;
export type FounderSurfaceAttentionCategory = (typeof FOUNDER_SURFACE_ATTENTION_CATEGORIES)[number];

export interface FounderSurfacePrimaryNumber {
  label: 'Certified Autonomy Rate';
  rate: number;
  percentage: number;
  certified_workflow_count: number;
  workflow_count: number;
  updated_at: string;
}

export interface FounderSurfaceAttentionSummary {
  blocked_count: number;
  overdue_count: number;
  awaiting_decision_count: number;
  newly_complete_count: number;
  requires_attention_count: number;
}

export interface FounderSurfaceSummaryStrip {
  active_initiative_count: number;
  active_agent_count: number;
  at_risk_count: number;
}

export interface FounderSurfaceVentureRate {
  venture_id: string;
  certified_autonomy_rate: number;
  percentage: number;
  certified_workflow_count: number;
  workflow_count: number;
  critical_path_certified_rate: number;
  active_initiative_count: number;
  blocked_count: number;
  overdue_count: number;
  awaiting_decision_count: number;
  newly_complete_count: number;
  updated_at: string;
}

export interface FounderSurfaceOverviewState {
  mode: 'quiet' | 'attention_required';
  summary: string;
  earned_interruption: boolean;
  interruption_count: number;
}

export interface FounderSurfaceOverviewAttentionItem {
  attention_id: string;
  kind: FounderAttentionKind;
  category: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>;
  severity: FounderAttentionSeverity;
  constraint_kind: FounderAttentionConstraintKind;
  attention_target: FounderAttentionTarget;
  requires_founder_action: boolean;
  resolution_owner: FounderAttentionResolutionOwner;
  venture_id: string;
  workflow_id: string;
  what: string;
  why: string;
  action: FounderSurfaceActionVerb;
  recommended_action: string;
  waiting_since: string;
  updated_at: string;
}

export interface FounderSurfaceNewlyCompleteItem {
  attention_id: string;
  category: 'newly_complete';
  venture_id: string;
  workflow_id: string;
  owner_agent: string;
  what: string;
  why: string;
  action: 'Acknowledge';
  recommended_action: string;
  completed_at: string;
  updated_at: string;
}

export interface FounderSurfaceWorkflowTrustSummary {
  workflow: Workflow;
  completion_truth: CompletionTruthOverlay;
  evidence_bundle: WorkflowEvidenceBundle;
  certification: WorkflowCertification;
  readiness: WorkflowReadiness;
  latest_run: WorkflowRunSummary | null;
  attention_item?: FounderAttentionItem | null;
}

export interface FounderSurfaceExecutiveOverview {
  primary_number: FounderSurfacePrimaryNumber;
  summary_strip: FounderSurfaceSummaryStrip;
  attention_summary: FounderSurfaceAttentionSummary;
  venture_rates: FounderSurfaceVentureRate[];
  surface_state: FounderSurfaceOverviewState;
  attention_items: FounderSurfaceOverviewAttentionItem[];
  newly_complete_items: FounderSurfaceNewlyCompleteItem[];
  trust_gains: FounderSurfaceWorkflowTrustSummary[];
  trust_degradations: FounderSurfaceWorkflowTrustSummary[];
  human_review_burden: Record<HumanReviewBurden, number>;
  updated_at: string;
}

export interface FounderSurfaceVentureCoverageEntry {
  coverage: VentureCoverage;
  state_distribution: Record<WorkflowState, number>;
  critical_path: {
    workflow_count: number;
    certified_rate: number;
  };
  top_blockers: string[];
  top_degrading_workflows: FounderSurfaceWorkflowTrustSummary[];
  recent_promotions: FounderSurfaceWorkflowTrustSummary[];
  recent_decertifications: FounderSurfaceWorkflowTrustSummary[];
}

export interface FounderSurfaceVentureCoverageView {
  ventures: FounderSurfaceVentureCoverageEntry[];
  updated_at: string;
}

export interface FounderSurfaceCertificationPipeline {
  certifying: FounderSurfaceWorkflowTrustSummary[];
  ready_for_review: FounderSurfaceWorkflowTrustSummary[];
  recently_certified: FounderSurfaceWorkflowTrustSummary[];
  under_review: FounderSurfaceWorkflowTrustSummary[];
  recently_decertified: FounderSurfaceWorkflowTrustSummary[];
  updated_at: string;
}

export interface FounderSurfaceAgentCertificationView {
  summaries: AgentCertificationSummary[];
  updated_at: string;
}

export interface FounderSurfaceWorkflowDetail {
  workflow: Workflow;
  completion_truth: CompletionTruthOverlay;
  evidence_bundle: WorkflowEvidenceBundle;
  certification: WorkflowCertification;
  readiness: WorkflowReadiness;
  recent_runs: WorkflowRunSummary[];
  founder_attention: FounderAttentionItem[];
  efficiency_diagnosis?: WorkflowEfficiencyDiagnosis | null;
  updated_at: string;
}
