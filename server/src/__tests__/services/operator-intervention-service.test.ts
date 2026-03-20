import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OperatorInterventionService,
  type CreateOperatorInterventionReceiptInput,
} from '../../services/operator-intervention-service.js';

function makeReceipt(
  overrides: Partial<CreateOperatorInterventionReceiptInput> = {}
): CreateOperatorInterventionReceiptInput {
  return {
    agent_id: overrides.agent_id ?? 'SETH-LEAD',
    kind: overrides.kind ?? 'truth_repair',
    summary: overrides.summary ?? 'Normalized stale truth between board and founder surface.',
    why_it_mattered:
      overrides.why_it_mattered ??
      'Removed false founder interruption and restored truthful routing.',
    created_at: overrides.created_at ?? '2026-03-19T15:00:00.000Z',
    verified_at: overrides.verified_at ?? '2026-03-19T15:05:00.000Z',
    verification_status: overrides.verification_status ?? 'verified',
    resolution_scope: overrides.resolution_scope ?? 'cross_surface',
    evidence_paths: overrides.evidence_paths ?? ['/vault/projects/mission_control/receipt-note.md'],
    affected_tasks: overrides.affected_tasks ?? ['task_20260319_LMNMQJ'],
    affected_surfaces: overrides.affected_surfaces ?? ['veritas-board', 'founder-surface'],
    verified_outcomes: overrides.verified_outcomes ?? ['False red removed from founder queue'],
    policy_refs: overrides.policy_refs ?? ['OPERATOR_INTERVENTION_RECEIPT_POLICY_v1'],
    before_state_summary:
      overrides.before_state_summary ?? 'Founder queue showed operator debt as founder work.',
    after_state_summary:
      overrides.after_state_summary ?? 'Founder queue only shows founder-routable interrupts.',
    downstream_cards_created: overrides.downstream_cards_created ?? [],
    downstream_cards_normalized: overrides.downstream_cards_normalized ?? ['task_20260319_LMNMQJ'],
    risk_reduced: overrides.risk_reduced ?? 'moderate',
    founder_noise_reduction: overrides.founder_noise_reduction ?? 2,
    trust_quality_gain: overrides.trust_quality_gain ?? 3,
    operator_note: overrides.operator_note ?? 'Thin pass receipt fixture.',
    intervention_id: overrides.intervention_id,
  };
}

describe('OperatorInterventionService', () => {
  let tempDir: string;
  let storageFile: string;
  let service: OperatorInterventionService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'operator-intervention-service-'));
    storageFile = path.join(tempDir, '.veritas-kanban', 'operator-intervention-receipts.json');
    service = new OperatorInterventionService({ storageFile });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists receipts and reloads them with deterministic newest-first listing', async () => {
    const older = await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_older',
        summary: 'Older receipt',
        created_at: '2026-03-19T14:00:00.000Z',
        verified_at: '2026-03-19T14:05:00.000Z',
      })
    );
    const newer = await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_newer',
        kind: 'routing_cleanup',
        summary: 'Newer receipt',
        created_at: '2026-03-19T16:00:00.000Z',
        verified_at: '2026-03-19T16:10:00.000Z',
      })
    );

    const reloadedService = new OperatorInterventionService({ storageFile });
    const receipts = await reloadedService.listReceipts();
    const fetched = await reloadedService.getReceipt(older.intervention_id);

    expect(receipts.map((receipt) => receipt.intervention_id)).toEqual([
      newer.intervention_id,
      older.intervention_id,
    ]);
    expect(fetched).toMatchObject({
      intervention_id: older.intervention_id,
      summary: 'Older receipt',
    });

    const rawStore = JSON.parse(await fs.readFile(storageFile, 'utf-8')) as {
      version: number;
      receipts: Array<{ intervention_id: string }>;
    };
    expect(rawStore.version).toBe(1);
    expect(rawStore.receipts.map((receipt) => receipt.intervention_id)).toEqual([
      newer.intervention_id,
      older.intervention_id,
    ]);
  });

  it('computes deterministic rollups by kind, verification status, and resolution scope', async () => {
    await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_truth_verified',
        kind: 'truth_repair',
        verification_status: 'verified',
        resolution_scope: 'cross_surface',
      })
    );
    await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_routing_partial',
        kind: 'routing_cleanup',
        verification_status: 'partially_verified',
        resolution_scope: 'multi_task',
        created_at: '2026-03-19T15:30:00.000Z',
        verified_at: '2026-03-19T15:45:00.000Z',
      })
    );
    await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_policy_rejected',
        kind: 'policy_enforcement',
        verification_status: 'rejected',
        resolution_scope: 'single_task',
        created_at: '2026-03-19T16:00:00.000Z',
        verified_at: '2026-03-19T16:15:00.000Z',
      })
    );

    const summary = await service.summarizeReceipts();

    expect(summary.total_receipts).toBe(3);
    expect(summary.by_kind).toMatchObject({
      truth_repair: 1,
      routing_cleanup: 1,
      policy_enforcement: 1,
    });
    expect(summary.by_verification_status).toEqual({
      verified: 1,
      partially_verified: 1,
      rejected: 1,
    });
    expect(summary.by_resolution_scope).toEqual({
      single_task: 1,
      multi_task: 1,
      cross_surface: 1,
      systemic: 0,
    });
    expect(summary.latest_created_at).toBe('2026-03-19T16:00:00.000Z');
    expect(summary.latest_verified_at).toBe('2026-03-19T16:15:00.000Z');
  });

  it('supports filtered listing and rejects duplicate intervention ids', async () => {
    await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_filter_truth',
        agent_id: 'SETH-LEAD',
        kind: 'truth_repair',
      })
    );
    await service.createReceipt(
      makeReceipt({
        intervention_id: 'oir_filter_maya',
        agent_id: 'MAYA',
        kind: 'dispatch_quality',
        resolution_scope: 'single_task',
      })
    );

    const mayaReceipts = await service.listReceipts({ agent_id: 'MAYA' });
    expect(mayaReceipts.map((receipt) => receipt.intervention_id)).toEqual(['oir_filter_maya']);

    await expect(
      service.createReceipt(
        makeReceipt({
          intervention_id: 'oir_filter_truth',
          summary: 'Duplicate receipt id should fail',
        })
      )
    ).rejects.toThrow('Operator intervention receipt already exists: oir_filter_truth');
  });
});
