import { describe, expect, it } from 'vitest';
import type { OperatorInterventionReceipt } from '@veritas-kanban/shared';
import {
  deriveEfficiencyDiagnosis,
  judgeWorkflowForFounderSurface,
  summarizeAgentCertificationsForAtlas,
  summarizeOperatorInterventionsForAtlas,
} from '../../services/atlas-judgment-service.js';
import {
  ATLAS_FIXTURE_AS_OF,
  makeEvidenceBundle,
  makeRunSummary,
  makeTask,
  makeWorkflow,
} from '../fixtures/atlas-judgment.fixtures.js';

describe('judgeWorkflowForFounderSurface', () => {
  it('covers all contract autonomy states with explicit fixtures', () => {
    const cases = [
      {
        expected: 'human_native',
        input: {
          workflow: makeWorkflow({ workflow_id: 'wf-human', name: 'Human-native workflow' }),
          evidenceBundle: makeEvidenceBundle({ workflow_id: 'wf-human' }),
          runSummaries: [],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
      {
        expected: 'assisted',
        input: {
          workflow: makeWorkflow({ workflow_id: 'wf-assisted', name: 'Assisted workflow' }),
          task: makeTask({
            id: 'task-assisted',
            agent: 'MAYA',
            automation: { sessionKey: 'sess-123' },
          }),
          evidenceBundle: makeEvidenceBundle({ workflow_id: 'wf-assisted' }),
          runSummaries: [],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
      {
        expected: 'governed_copilot',
        input: {
          workflow: makeWorkflow({ workflow_id: 'wf-governed', name: 'Governed workflow' }),
          task: makeTask({ id: 'task-governed' }),
          evidenceBundle: makeEvidenceBundle({
            workflow_id: 'wf-governed',
            run_count: 1,
            successful_run_count: 1,
            policy_pass_count: 1,
            halt_pass_count: 1,
            evidence_complete: false,
          }),
          runSummaries: [makeRunSummary({ workflow_id: 'wf-governed', task_id: 'task-governed' })],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
      {
        expected: 'certifying',
        input: {
          workflow: makeWorkflow({ workflow_id: 'wf-certifying', name: 'Certifying workflow' }),
          task: makeTask({
            id: 'task-certifying',
            verificationSteps: [{ id: 'v1', description: 'Verification passed', checked: true }],
            deliverables: [
              {
                id: 'd1',
                title: 'Evidence bundle',
                type: 'document',
                status: 'accepted',
                created: '2026-03-17T04:00:00.000Z',
              },
            ],
          }),
          evidenceBundle: makeEvidenceBundle({
            workflow_id: 'wf-certifying',
            run_count: 3,
            successful_run_count: 3,
            policy_pass_count: 3,
            halt_pass_count: 3,
            evidence_complete: true,
            artifact_count: 1,
          }),
          runSummaries: [
            makeRunSummary({
              workflow_id: 'wf-certifying',
              task_id: 'task-certifying',
              run_id: 'run-cert-1',
            }),
            makeRunSummary({
              workflow_id: 'wf-certifying',
              task_id: 'task-certifying',
              run_id: 'run-cert-2',
            }),
            makeRunSummary({
              workflow_id: 'wf-certifying',
              task_id: 'task-certifying',
              run_id: 'run-cert-3',
            }),
          ],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
      {
        expected: 'certified_autonomous',
        input: {
          workflow: makeWorkflow({ workflow_id: 'wf-certified', name: 'Certified workflow' }),
          task: makeTask({
            id: 'task-certified',
            verificationSteps: [{ id: 'v1', description: 'Verification passed', checked: true }],
            deliverables: [
              {
                id: 'd1',
                title: 'Accepted artifact',
                type: 'document',
                status: 'accepted',
                created: '2026-03-17T04:10:00.000Z',
              },
            ],
          }),
          evidenceBundle: makeEvidenceBundle({
            workflow_id: 'wf-certified',
            run_count: 4,
            successful_run_count: 4,
            policy_pass_count: 4,
            halt_pass_count: 4,
            evidence_complete: true,
            artifact_count: 1,
          }),
          runSummaries: [
            makeRunSummary({
              workflow_id: 'wf-certified',
              task_id: 'task-certified',
              run_id: 'run-certified-1',
            }),
            makeRunSummary({
              workflow_id: 'wf-certified',
              task_id: 'task-certified',
              run_id: 'run-certified-2',
            }),
            makeRunSummary({
              workflow_id: 'wf-certified',
              task_id: 'task-certified',
              run_id: 'run-certified-3',
            }),
            makeRunSummary({
              workflow_id: 'wf-certified',
              task_id: 'task-certified',
              run_id: 'run-certified-4',
            }),
          ],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
      {
        expected: 'under_review',
        input: {
          workflow: makeWorkflow({
            workflow_id: 'wf-review',
            name: 'Regression workflow',
            status_reason: 'Previously certified workflow',
            notes: 'Certification was granted last week.',
          }),
          task: makeTask({
            id: 'task-review',
            comments: [
              {
                id: 'c1',
                author: 'SETH',
                text: 'Certification drift is visible.',
                timestamp: ATLAS_FIXTURE_AS_OF,
              },
            ],
          }),
          evidenceBundle: makeEvidenceBundle({
            workflow_id: 'wf-review',
            run_count: 4,
            successful_run_count: 2,
            failed_run_count: 2,
            policy_pass_count: 2,
            policy_fail_count: 1,
            halt_pass_count: 3,
            halt_fail_count: 1,
            hidden_cleanup_incidents: 1,
            evidence_complete: true,
            human_review_events: 3,
          }),
          runSummaries: [
            makeRunSummary({
              workflow_id: 'wf-review',
              task_id: 'task-review',
              run_id: 'run-review-1',
              success: true,
            }),
            makeRunSummary({
              workflow_id: 'wf-review',
              task_id: 'task-review',
              run_id: 'run-review-2',
              success: true,
            }),
            makeRunSummary({
              workflow_id: 'wf-review',
              task_id: 'task-review',
              run_id: 'run-review-3',
              success: false,
              policy_result: 'fail',
              halt_result: 'fail',
              requires_human_intervention: true,
              failure_signature: 'policy regression',
            }),
            makeRunSummary({
              workflow_id: 'wf-review',
              task_id: 'task-review',
              run_id: 'run-review-4',
              success: false,
              policy_result: 'fail',
              halt_result: 'pass',
              requires_human_intervention: true,
              failure_signature: 'policy regression',
            }),
          ],
          asOf: ATLAS_FIXTURE_AS_OF,
        },
      },
    ] as const;

    for (const testCase of cases) {
      const judgment = judgeWorkflowForFounderSurface(testCase.input);
      expect(judgment.workflow.state).toBe(testCase.expected);
    }
  });

  it('keeps insufficient evidence out of certification even when a workflow is governed', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({
        workflow_id: 'wf-insufficient',
        name: 'Insufficient evidence workflow',
      }),
      task: makeTask({ id: 'task-insufficient' }),
      evidenceBundle: makeEvidenceBundle({
        workflow_id: 'wf-insufficient',
        run_count: 1,
        successful_run_count: 1,
        policy_pass_count: 1,
        halt_pass_count: 1,
        evidence_complete: false,
      }),
      runSummaries: [
        makeRunSummary({ workflow_id: 'wf-insufficient', task_id: 'task-insufficient' }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.workflow.state).toBe('governed_copilot');
    expect(judgment.certification.certification_status).toBe('candidate');
    expect(judgment.readiness.readiness_label).not.toBe('near_ready');
    expect(judgment.readiness.temporary_blockers).toContain(
      'Add verification or artifact evidence so trust can be judged from more than one source.'
    );
  });

  it('separates structural limits from temporary blockers', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({
        workflow_id: 'wf-structural',
        name: 'Human signoff workflow',
        data_class: 'A',
        human_review_required: true,
        human_review_reason: 'Legal signoff is required before release.',
      }),
      task: makeTask({
        id: 'task-structural',
        type: 'research',
        description: 'Human judgment and legal approval are both required here.',
      }),
      evidenceBundle: makeEvidenceBundle({
        workflow_id: 'wf-structural',
        run_count: 2,
        successful_run_count: 2,
        policy_pass_count: 2,
        halt_pass_count: 2,
        evidence_complete: true,
      }),
      runSummaries: [
        makeRunSummary({
          workflow_id: 'wf-structural',
          task_id: 'task-structural',
          run_id: 'run-structural-1',
        }),
        makeRunSummary({
          workflow_id: 'wf-structural',
          task_id: 'task-structural',
          run_id: 'run-structural-2',
        }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.readiness.structural_limits.length).toBeGreaterThan(0);
    expect(judgment.readiness.structural_limits.join(' ')).toContain('Legal signoff');
    expect(judgment.readiness.blockers_explanation).toContain('durable autonomy boundary');
    expect(judgment.certification.certification_status).toBe('candidate');
    expect(judgment.readiness.temporary_blockers).not.toContain(
      'Schedule human certification review.'
    );
  });

  it('marks temporary blockers as blocked but still promotable', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({ workflow_id: 'wf-blocked', name: 'Blocked workflow' }),
      task: makeTask({
        id: 'task-blocked',
        status: 'blocked',
        blockedReason: { category: 'dependency', note: 'Upstream API is unstable' },
      }),
      evidenceBundle: makeEvidenceBundle({
        workflow_id: 'wf-blocked',
        run_count: 1,
        successful_run_count: 0,
        failed_run_count: 1,
        policy_fail_count: 0,
        halt_fail_count: 0,
        evidence_complete: false,
      }),
      runSummaries: [
        makeRunSummary({
          workflow_id: 'wf-blocked',
          task_id: 'task-blocked',
          success: false,
          failure_signature: 'Upstream API is unstable',
        }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.readiness.readiness_label).toBe('blocked');
    expect(judgment.readiness.structural_limits).toEqual([]);
    expect(judgment.readiness.temporary_blockers.join(' ')).toContain('Upstream API is unstable');
    expect(judgment.explanation.blockers).toContain('Temporary blockers:');
    expect(judgment.explanation.next_action).toContain('dependency: Upstream API is unstable');
  });

  it('encodes explicit degradation triggers and moves regressing workflows under review', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({
        workflow_id: 'wf-regression',
        name: 'Regression workflow',
        status_reason: 'Previously certified autonomous workflow',
      }),
      task: makeTask({
        id: 'task-regression',
        comments: [
          {
            id: 'c1',
            author: 'ATLAS',
            text: 'Certification regression observed.',
            timestamp: ATLAS_FIXTURE_AS_OF,
          },
        ],
      }),
      evidenceBundle: makeEvidenceBundle({
        workflow_id: 'wf-regression',
        run_count: 4,
        successful_run_count: 2,
        failed_run_count: 2,
        policy_pass_count: 2,
        policy_fail_count: 1,
        halt_pass_count: 3,
        halt_fail_count: 1,
        hidden_cleanup_incidents: 1,
        evidence_complete: true,
        human_review_events: 3,
      }),
      runSummaries: [
        makeRunSummary({
          workflow_id: 'wf-regression',
          task_id: 'task-regression',
          run_id: 'reg-1',
          success: true,
        }),
        makeRunSummary({
          workflow_id: 'wf-regression',
          task_id: 'task-regression',
          run_id: 'reg-2',
          success: true,
        }),
        makeRunSummary({
          workflow_id: 'wf-regression',
          task_id: 'task-regression',
          run_id: 'reg-3',
          success: false,
          policy_result: 'fail',
          halt_result: 'fail',
          requires_human_intervention: true,
          failure_signature: 'policy regression',
        }),
        makeRunSummary({
          workflow_id: 'wf-regression',
          task_id: 'task-regression',
          run_id: 'reg-4',
          success: false,
          policy_result: 'fail',
          halt_result: 'pass',
          requires_human_intervention: true,
          failure_signature: 'policy regression',
        }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.degradation.active).toBe(true);
    expect(judgment.degradation.requires_review).toBe(true);
    expect(judgment.degradation.triggers.map((trigger) => trigger.code)).toEqual(
      expect.arrayContaining([
        'repeated_failed_runs',
        'policy_failures',
        'halt_failures',
        'hidden_cleanup',
        'recurring_failure_signature',
      ])
    );
    expect(judgment.certification.certification_status).toBe('decertified');
    expect(judgment.readiness.readiness_label).toBe('degrading');
    expect(judgment.workflow.state).toBe('under_review');
  });

  it('generates plain-language explanations for state, blockers, and degradation', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({
        workflow_id: 'wf-explain',
        name: 'Explainable workflow',
        status_reason: 'Previously certified autonomous workflow',
      }),
      task: makeTask({
        id: 'task-explain',
        status: 'blocked',
        blockedReason: { category: 'policy', note: 'Boundary gate is failing' },
        comments: [
          {
            id: 'c1',
            author: 'SETH',
            text: 'Certification regression observed.',
            timestamp: ATLAS_FIXTURE_AS_OF,
          },
        ],
      }),
      evidenceBundle: makeEvidenceBundle({
        workflow_id: 'wf-explain',
        run_count: 4,
        successful_run_count: 2,
        failed_run_count: 2,
        policy_pass_count: 2,
        policy_fail_count: 1,
        halt_pass_count: 3,
        halt_fail_count: 1,
        hidden_cleanup_incidents: 1,
        evidence_complete: true,
        human_review_events: 3,
      }),
      runSummaries: [
        makeRunSummary({
          workflow_id: 'wf-explain',
          task_id: 'task-explain',
          run_id: 'exp-1',
          success: true,
        }),
        makeRunSummary({
          workflow_id: 'wf-explain',
          task_id: 'task-explain',
          run_id: 'exp-2',
          success: true,
        }),
        makeRunSummary({
          workflow_id: 'wf-explain',
          task_id: 'task-explain',
          run_id: 'exp-3',
          success: false,
          policy_result: 'fail',
          halt_result: 'fail',
          requires_human_intervention: true,
          failure_signature: 'boundary regression',
        }),
        makeRunSummary({
          workflow_id: 'wf-explain',
          task_id: 'task-explain',
          run_id: 'exp-4',
          success: false,
          policy_result: 'fail',
          halt_result: 'pass',
          requires_human_intervention: true,
          failure_signature: 'boundary regression',
        }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.explanation.current_state).toContain('under review');
    expect(judgment.explanation.blockers).toContain('Temporary blockers:');
    expect(judgment.explanation.degradation).toContain('Degradation triggers:');
    expect(judgment.explanation.evidence).toContain('successful run');
    expect(judgment.readiness.state_explanation).toContain('under review');
    expect(judgment.readiness.blockers_explanation).toContain('Temporary blockers:');
    expect(judgment.readiness.degradation_explanation).toContain('Degradation triggers:');
  });
});

describe('deriveEfficiencyDiagnosis', () => {
  it('returns agent_bound when repeated rediscovery happens despite strong context bundle availability', () => {
    const bundle = {
      ...makeEvidenceBundle({
        workflow_id: 'wf-eff-agent',
        run_count: 3,
        successful_run_count: 3,
      }),
      repeated_read_ratio: 0.61,
      context_bundle_hit_rate: 0.82,
      avg_read_call_count: 12,
    };

    expect(
      deriveEfficiencyDiagnosis(bundle, [
        makeRunSummary({
          workflow_id: 'wf-eff-agent',
          task_id: 'task-eff-agent',
          run_id: 'eff-agent-1',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-agent',
          task_id: 'task-eff-agent',
          run_id: 'eff-agent-2',
        }),
      ])
    ).toBe('agent_bound');
  });

  it('returns platform_bound when repeated rediscovery happens without usable context bundle support', () => {
    const bundle = {
      ...makeEvidenceBundle({
        workflow_id: 'wf-eff-platform',
        run_count: 3,
        successful_run_count: 2,
      }),
      repeated_read_ratio: 0.55,
      context_bundle_hit_rate: 0.05,
      avg_cold_start_discovery_ms: 18000,
    };

    expect(
      deriveEfficiencyDiagnosis(bundle, [
        makeRunSummary({
          workflow_id: 'wf-eff-platform',
          task_id: 'task-eff-platform',
          run_id: 'eff-platform-1',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-platform',
          task_id: 'task-eff-platform',
          run_id: 'eff-platform-2',
        }),
      ])
    ).toBe('platform_bound');
  });

  it('returns mixed when repeated rediscovery happens with only partial context bundle support', () => {
    const bundle = {
      ...makeEvidenceBundle({
        workflow_id: 'wf-eff-mixed',
        run_count: 4,
        successful_run_count: 3,
      }),
      repeated_read_ratio: 0.58,
      context_bundle_hit_rate: 0.3,
      avg_tool_call_count: 18,
    };

    expect(
      deriveEfficiencyDiagnosis(bundle, [
        makeRunSummary({
          workflow_id: 'wf-eff-mixed',
          task_id: 'task-eff-mixed',
          run_id: 'eff-mixed-1',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-mixed',
          task_id: 'task-eff-mixed',
          run_id: 'eff-mixed-2',
        }),
      ])
    ).toBe('mixed');
  });

  it('returns unknown when the evidence window lacks enough runs or efficiency signal', () => {
    const insufficientRunsBundle = {
      ...makeEvidenceBundle({
        workflow_id: 'wf-eff-unknown-runs',
        run_count: 1,
        successful_run_count: 1,
      }),
      repeated_read_ratio: 0.72,
      context_bundle_hit_rate: 0.7,
    };

    const noSignalBundle = makeEvidenceBundle({
      workflow_id: 'wf-eff-unknown-signal',
      run_count: 3,
      successful_run_count: 3,
    });

    expect(
      deriveEfficiencyDiagnosis(insufficientRunsBundle, [
        makeRunSummary({
          workflow_id: 'wf-eff-unknown-runs',
          task_id: 'task-eff-unknown-runs',
          run_id: 'eff-unknown-1',
        }),
      ])
    ).toBe('unknown');
    expect(
      deriveEfficiencyDiagnosis(noSignalBundle, [
        makeRunSummary({
          workflow_id: 'wf-eff-unknown-signal',
          task_id: 'task-eff-unknown-signal',
          run_id: 'eff-unknown-2',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-unknown-signal',
          task_id: 'task-eff-unknown-signal',
          run_id: 'eff-unknown-3',
        }),
      ])
    ).toBe('unknown');
  });

  it('appends an efficiency note to readiness_summary when diagnosis is known', () => {
    const judgment = judgeWorkflowForFounderSurface({
      workflow: makeWorkflow({ workflow_id: 'wf-eff-note', name: 'Efficiency note workflow' }),
      task: makeTask({ id: 'task-eff-note' }),
      evidenceBundle: {
        ...makeEvidenceBundle({
          workflow_id: 'wf-eff-note',
          run_count: 3,
          successful_run_count: 2,
          policy_pass_count: 2,
          halt_pass_count: 2,
          evidence_complete: true,
        }),
        repeated_read_ratio: 0.57,
        context_bundle_hit_rate: 0.62,
      },
      runSummaries: [
        makeRunSummary({
          workflow_id: 'wf-eff-note',
          task_id: 'task-eff-note',
          run_id: 'eff-note-1',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-note',
          task_id: 'task-eff-note',
          run_id: 'eff-note-2',
        }),
        makeRunSummary({
          workflow_id: 'wf-eff-note',
          task_id: 'task-eff-note',
          run_id: 'eff-note-3',
        }),
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    expect(judgment.efficiency_diagnosis).toBe('agent_bound');
    expect(judgment.readiness.readiness_summary).toContain(
      'Execution drag appears agent-bound — consider tighter workflow instructions.'
    );
  });
});

describe('summarizeAgentCertificationsForAtlas', () => {
  it('keeps workflow trust, operator leverage, and reliability separate when deriving agent certification', () => {
    const summaries = summarizeAgentCertificationsForAtlas({
      workflows: [
        makeWorkflow({
          workflow_id: 'wf-maya',
          owner_agent: 'MAYA',
          state: 'certifying',
          completion_truth: {
            state: 'verified',
            summary: 'Completion is verified.',
            checked_at: ATLAS_FIXTURE_AS_OF,
            blockers: [],
            missing_surfaces: [],
            artifact: { state: 'verified', summary: 'Artifact verified.', sources: ['artifact'] },
            board: { state: 'verified', summary: 'Board verified.', sources: ['board'] },
            channel: { state: 'verified', summary: 'Channel verified.', sources: ['channel'] },
            evidence: { state: 'verified', summary: 'Evidence verified.', sources: ['evidence'] },
          },
        }),
        makeWorkflow({
          workflow_id: 'wf-atlas',
          owner_agent: 'ATLAS',
          state: 'under_review',
          completion_truth: {
            state: 'at_risk',
            summary: 'Completion truth is drifting.',
            checked_at: ATLAS_FIXTURE_AS_OF,
            blockers: ['Channel truth missing'],
            missing_surfaces: ['channel'],
            artifact: { state: 'verified', summary: 'Artifact verified.', sources: ['artifact'] },
            board: { state: 'verified', summary: 'Board verified.', sources: ['board'] },
            channel: { state: 'at_risk', summary: 'Channel missing.', sources: ['channel'] },
            evidence: { state: 'verified', summary: 'Evidence verified.', sources: ['evidence'] },
          },
        }),
      ],
      evidenceBundles: [
        makeEvidenceBundle({
          workflow_id: 'wf-maya',
          run_count: 3,
          successful_run_count: 3,
          policy_pass_count: 3,
          halt_pass_count: 3,
          evidence_complete: true,
        }),
        makeEvidenceBundle({
          workflow_id: 'wf-atlas',
          run_count: 3,
          successful_run_count: 1,
          failed_run_count: 2,
          policy_pass_count: 1,
          policy_fail_count: 1,
          halt_pass_count: 2,
          halt_fail_count: 1,
          hidden_cleanup_incidents: 1,
          evidence_complete: true,
        }),
      ],
      certifications: [
        {
          workflow_id: 'wf-maya',
          certification_status: 'ready_for_review',
          certification_reason: 'Strong workflow evidence.',
          review_required: true,
          last_evaluated_at: ATLAS_FIXTURE_AS_OF,
        },
        {
          workflow_id: 'wf-atlas',
          certification_status: 'decertified',
          certification_reason: 'Trust regressed.',
          review_required: true,
          last_evaluated_at: ATLAS_FIXTURE_AS_OF,
          decertified_at: ATLAS_FIXTURE_AS_OF,
          decertified_reason: 'Policy failure and truth drift.',
        },
      ],
      operatorInterventions: [
        {
          intervention_id: 'oir_maya',
          agent_id: 'MAYA',
          kind: 'dispatch_quality',
          summary: 'Tightened dispatch quality.',
          why_it_mattered: 'Reduced wrapper-card drift.',
          created_at: '2026-03-19T15:00:00.000Z',
          verified_at: '2026-03-19T15:05:00.000Z',
          verification_status: 'verified',
          resolution_scope: 'cross_surface',
          evidence_paths: ['/vault/projects/mission_control/dispatch-quality.md'],
          affected_tasks: ['task_dispatch_quality'],
          affected_surfaces: ['dispatch-gate', 'board'],
          verified_outcomes: ['Dispatches now carry explicit artifact targets'],
        },
      ],
      asOf: ATLAS_FIXTURE_AS_OF,
    });

    const maya = summaries.find((summary) => summary.agent_id === 'MAYA');
    const atlas = summaries.find((summary) => summary.agent_id === 'ATLAS');

    expect(maya).toMatchObject({
      certification_tier: 'certified_operator',
      supporting_workflow_ids: ['wf-maya'],
      supporting_receipt_ids: ['oir_maya'],
    });
    expect(maya?.workflow_execution_score ?? 0).toBeGreaterThanOrEqual(75);
    expect(maya?.operator_leverage_score ?? 0).toBeGreaterThanOrEqual(60);
    expect(maya?.reliability_score ?? 0).toBeGreaterThanOrEqual(75);

    expect(atlas).toMatchObject({
      certification_tier: 'under_review',
      under_review_reason: 'Completion truth drift remains unresolved on owned workflows.',
    });
    expect(atlas?.hard_gates).toEqual(
      expect.arrayContaining([
        'Completion truth drift remains unresolved on owned workflows.',
        'Owned workflow trust is currently under review.',
        'Policy or boundary failures remain unresolved on owned workflows.',
      ])
    );
  });
});

describe('summarizeOperatorInterventionsForAtlas', () => {
  it('produces a minimal ATLAS-facing rollup without letting rejected receipts earn leverage credit', () => {
    const receipts: OperatorInterventionReceipt[] = [
      {
        intervention_id: 'oir_truth',
        agent_id: 'SETH-LEAD',
        kind: 'truth_repair',
        summary: 'Truth repair receipt',
        why_it_mattered: 'Removed a false founder interrupt.',
        created_at: '2026-03-19T15:00:00.000Z',
        verified_at: '2026-03-19T15:05:00.000Z',
        verification_status: 'verified',
        resolution_scope: 'cross_surface',
        evidence_paths: ['/vault/projects/mission_control/truth-repair.md'],
        affected_tasks: ['task_truth'],
        affected_surfaces: ['founder-surface'],
        verified_outcomes: ['Founder queue no longer shows operator debt'],
      },
      {
        intervention_id: 'oir_policy',
        agent_id: 'SETH-LEAD',
        kind: 'policy_enforcement',
        summary: 'Policy enforcement receipt',
        why_it_mattered: 'Tightened the routing contract.',
        created_at: '2026-03-19T16:00:00.000Z',
        verified_at: '2026-03-19T16:10:00.000Z',
        verification_status: 'partially_verified',
        resolution_scope: 'systemic',
        evidence_paths: ['/vault/projects/mission_control/policy-enforcement.md'],
        affected_tasks: ['task_policy'],
        affected_surfaces: ['dispatch-gate'],
        verified_outcomes: ['Policy drift is now blocked upstream'],
      },
      {
        intervention_id: 'oir_rejected',
        agent_id: 'SETH-LEAD',
        kind: 'routing_cleanup',
        summary: 'Rejected routing receipt',
        why_it_mattered: 'Candidate routing cleanup was not verified.',
        created_at: '2026-03-19T17:00:00.000Z',
        verified_at: '2026-03-19T17:15:00.000Z',
        verification_status: 'rejected',
        resolution_scope: 'single_task',
        evidence_paths: ['/vault/projects/mission_control/rejected-routing.md'],
        affected_tasks: ['task_route'],
        affected_surfaces: ['board'],
        verified_outcomes: ['Rejected after local review'],
      },
    ];

    const summary = summarizeOperatorInterventionsForAtlas(receipts);

    expect(summary.total_receipts).toBe(3);
    expect(summary.credited_receipt_count).toBe(2);
    expect(summary.by_kind).toMatchObject({
      truth_repair: 1,
      policy_enforcement: 1,
      routing_cleanup: 1,
    });
    expect(summary.by_verification_status).toEqual({
      verified: 1,
      partially_verified: 1,
      rejected: 1,
    });
    expect(summary.by_resolution_scope).toEqual({
      single_task: 1,
      multi_task: 0,
      cross_surface: 1,
      systemic: 1,
    });
    expect(summary.by_leverage_class).toEqual({
      truth_quality: 1,
      routing_quality: 0,
      policy_quality: 1,
      coordination_leverage: 0,
    });
    expect(summary.latest_created_at).toBe('2026-03-19T17:00:00.000Z');
    expect(summary.latest_verified_at).toBe('2026-03-19T17:15:00.000Z');
  });
});
