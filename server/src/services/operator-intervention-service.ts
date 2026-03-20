import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type {
  OperatorInterventionKind,
  OperatorInterventionReceipt,
  OperatorInterventionResolutionScope,
  OperatorInterventionVerificationStatus,
} from '@veritas-kanban/shared';
import {
  OPERATOR_INTERVENTION_KINDS,
  OPERATOR_INTERVENTION_RESOLUTION_SCOPES,
  OPERATOR_INTERVENTION_VERIFICATION_STATUSES,
} from '@veritas-kanban/shared';
import { fileExists } from '../storage/fs-helpers.js';
import { getDataDir } from '../utils/paths.js';
import { withFileLock } from './file-lock.js';

export interface CreateOperatorInterventionReceiptInput extends Omit<
  OperatorInterventionReceipt,
  'intervention_id' | 'created_at'
> {
  intervention_id?: string;
  created_at?: string;
}

export interface ListOperatorInterventionReceiptsOptions {
  agent_id?: string;
  kind?: OperatorInterventionKind;
  verification_status?: OperatorInterventionVerificationStatus;
  resolution_scope?: OperatorInterventionResolutionScope;
  limit?: number;
  offset?: number;
}

export interface OperatorInterventionReceiptRollup {
  total_receipts: number;
  by_kind: Record<OperatorInterventionKind, number>;
  by_verification_status: Record<OperatorInterventionVerificationStatus, number>;
  by_resolution_scope: Record<OperatorInterventionResolutionScope, number>;
  latest_created_at: string | null;
  latest_verified_at: string | null;
}

interface OperatorInterventionReceiptStore {
  version: 1;
  updated_at: string;
  receipts: OperatorInterventionReceipt[];
}

export interface OperatorInterventionServiceOptions {
  storageFile?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function compareReceipts(a: OperatorInterventionReceipt, b: OperatorInterventionReceipt): number {
  const verifiedDelta = Date.parse(b.verified_at) - Date.parse(a.verified_at);
  if (verifiedDelta !== 0) return verifiedDelta;

  const createdDelta = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (createdDelta !== 0) return createdDelta;

  return a.intervention_id.localeCompare(b.intervention_id);
}

function latestIso(current: string | null, candidate: string): string {
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function uniqueStrings(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).filter((value) => value.trim().length > 0)));
}

function normalizeReceipt(
  input: CreateOperatorInterventionReceiptInput,
  fallbackTimestamp: string
): OperatorInterventionReceipt {
  return {
    intervention_id: input.intervention_id?.trim() || `oir_${randomUUID()}`,
    agent_id: input.agent_id.trim(),
    kind: input.kind,
    summary: input.summary.trim(),
    why_it_mattered: input.why_it_mattered.trim(),
    created_at: input.created_at ?? fallbackTimestamp,
    verified_at: input.verified_at,
    verification_status: input.verification_status,
    resolution_scope: input.resolution_scope,
    evidence_paths: uniqueStrings(input.evidence_paths),
    affected_tasks: uniqueStrings(input.affected_tasks),
    affected_surfaces: uniqueStrings(input.affected_surfaces),
    verified_outcomes: uniqueStrings(input.verified_outcomes),
    policy_refs: uniqueStrings(input.policy_refs),
    before_state_summary: input.before_state_summary ?? null,
    after_state_summary: input.after_state_summary ?? null,
    downstream_cards_created: uniqueStrings(input.downstream_cards_created),
    downstream_cards_normalized: uniqueStrings(input.downstream_cards_normalized),
    risk_reduced: input.risk_reduced ?? null,
    founder_noise_reduction: input.founder_noise_reduction ?? null,
    trust_quality_gain: input.trust_quality_gain ?? null,
    operator_note: input.operator_note ?? null,
  };
}

function assertReceipt(input: OperatorInterventionReceipt): void {
  if (!input.agent_id) throw new Error('agent_id is required');
  if (!input.summary) throw new Error('summary is required');
  if (!input.why_it_mattered) throw new Error('why_it_mattered is required');
  if (!input.created_at || Number.isNaN(Date.parse(input.created_at))) {
    throw new Error('created_at must be a valid ISO timestamp');
  }
  if (!input.verified_at || Number.isNaN(Date.parse(input.verified_at))) {
    throw new Error('verified_at must be a valid ISO timestamp');
  }
  if (input.evidence_paths.length === 0) {
    throw new Error('evidence_paths must contain at least one durable path');
  }
  if (input.verified_outcomes.length === 0) {
    throw new Error('verified_outcomes must contain at least one verified outcome');
  }
}

export class OperatorInterventionService {
  private readonly storageFile: string;

  constructor(options: OperatorInterventionServiceOptions = {}) {
    this.storageFile =
      options.storageFile ?? path.join(getDataDir(), 'operator-intervention-receipts.json');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(path.dirname(this.storageFile), { recursive: true });
  }

  private createEmptyStore(updatedAt = nowIso()): OperatorInterventionReceiptStore {
    return {
      version: 1,
      updated_at: updatedAt,
      receipts: [],
    };
  }

  private async loadStore(): Promise<OperatorInterventionReceiptStore> {
    await this.ensureDir();

    if (!(await fileExists(this.storageFile))) {
      return this.createEmptyStore();
    }

    const raw = await readFile(this.storageFile, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<OperatorInterventionReceiptStore>;

    if (!Array.isArray(parsed.receipts)) {
      throw new Error(
        'Operator intervention receipt store is malformed: receipts must be an array'
      );
    }

    return {
      version: 1,
      updated_at: parsed.updated_at ?? nowIso(),
      receipts: [...parsed.receipts].sort(compareReceipts),
    };
  }

  private async saveStore(store: OperatorInterventionReceiptStore): Promise<void> {
    await this.ensureDir();
    const normalized: OperatorInterventionReceiptStore = {
      version: 1,
      updated_at: store.updated_at,
      receipts: [...store.receipts].sort(compareReceipts),
    };
    await writeFile(this.storageFile, JSON.stringify(normalized, null, 2), 'utf-8');
  }

  async createReceipt(
    input: CreateOperatorInterventionReceiptInput
  ): Promise<OperatorInterventionReceipt> {
    const timestamp = nowIso();
    const receipt = normalizeReceipt(input, timestamp);
    assertReceipt(receipt);

    return withFileLock(this.storageFile, async () => {
      const store = await this.loadStore();
      if (store.receipts.some((existing) => existing.intervention_id === receipt.intervention_id)) {
        throw new Error(`Operator intervention receipt already exists: ${receipt.intervention_id}`);
      }

      store.receipts.push(receipt);
      store.updated_at = timestamp;
      await this.saveStore(store);
      return receipt;
    });
  }

  async getReceipt(interventionId: string): Promise<OperatorInterventionReceipt | null> {
    const store = await this.loadStore();
    return store.receipts.find((receipt) => receipt.intervention_id === interventionId) ?? null;
  }

  async listReceipts(
    options: ListOperatorInterventionReceiptsOptions = {}
  ): Promise<OperatorInterventionReceipt[]> {
    const store = await this.loadStore();
    const filtered = store.receipts.filter((receipt) => {
      if (options.agent_id && receipt.agent_id !== options.agent_id) return false;
      if (options.kind && receipt.kind !== options.kind) return false;
      if (
        options.verification_status &&
        receipt.verification_status !== options.verification_status
      ) {
        return false;
      }
      if (options.resolution_scope && receipt.resolution_scope !== options.resolution_scope) {
        return false;
      }
      return true;
    });

    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit == null ? filtered.length : Math.max(0, options.limit);
    return filtered.slice(offset, offset + limit);
  }

  async summarizeReceipts(
    options: Omit<ListOperatorInterventionReceiptsOptions, 'limit' | 'offset'> = {}
  ): Promise<OperatorInterventionReceiptRollup> {
    const receipts = await this.listReceipts(options);
    const byKind = createCountRecord(OPERATOR_INTERVENTION_KINDS);
    const byVerificationStatus = createCountRecord(OPERATOR_INTERVENTION_VERIFICATION_STATUSES);
    const byResolutionScope = createCountRecord(OPERATOR_INTERVENTION_RESOLUTION_SCOPES);

    let latestCreatedAt: string | null = null;
    let latestVerifiedAt: string | null = null;

    for (const receipt of receipts) {
      byKind[receipt.kind] += 1;
      byVerificationStatus[receipt.verification_status] += 1;
      byResolutionScope[receipt.resolution_scope] += 1;
      latestCreatedAt = latestIso(latestCreatedAt, receipt.created_at);
      latestVerifiedAt = latestIso(latestVerifiedAt, receipt.verified_at);
    }

    return {
      total_receipts: receipts.length,
      by_kind: byKind,
      by_verification_status: byVerificationStatus,
      by_resolution_scope: byResolutionScope,
      latest_created_at: latestCreatedAt,
      latest_verified_at: latestVerifiedAt,
    };
  }
}

export const operatorInterventionService = new OperatorInterventionService();
