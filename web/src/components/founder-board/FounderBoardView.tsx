import { useState, useRef, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { useFounderBoard } from '@/hooks/useFounderBoard';
import TheNumber from './TheNumber';
import StatusLine from './StatusLine';
import ScrollIndicator from './ScrollIndicator';
import StickyHeader from './StickyHeader';
import AttentionCard from './AttentionCard';
import VentureSection from './VentureSection';
import DomainSection from './DomainSection';
import WorkflowInspectionSheet from './inspection/WorkflowInspectionSheet';
import ControlPlaneCard from '@/components/founder-surface/ControlPlaneCard';
import NewlyCompleteList from '@/components/founder-surface/NewlyCompleteList';
import type { FounderSurfaceAttentionCategory } from '@veritas-kanban/shared';

export default function FounderBoardView() {
  const { data, rawReviewSurface, isLoading, isError, isFetching, refetch } = useFounderBoard();
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [numberVisible, setNumberVisible] = useState(true);
  const numberRef = useRef<HTMLDivElement>(null);

  // Inspection sheet state
  const [inspectedWorkflowId, setInspectedWorkflowId] = useState<string | null>(null);
  const [inspectedCategory, setInspectedCategory] = useState<
    Exclude<FounderSurfaceAttentionCategory, 'newly_complete'> | undefined
  >();

  const handleInspect = useCallback(
    (workflowId: string, category?: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>) => {
      setInspectedWorkflowId(workflowId);
      setInspectedCategory(category);
    },
    []
  );

  // IntersectionObserver for sticky header
  useEffect(() => {
    const el = numberRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setNumberVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-collapse if expanded card disappears from list on refetch
  useEffect(() => {
    if (expandedCardId && data) {
      const stillExists = data.attentionItems.some((item) => item.attention_id === expandedCardId);
      if (!stillExists) setExpandedCardId(null);
    }
  }, [data, expandedCardId]);

  const toggleCard = useCallback((attentionId: string) => {
    setExpandedCardId((current) => (current === attentionId ? null : attentionId));
  }, []);

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="space-y-4 text-center animate-pulse">
            <div className="mx-auto h-40 w-72 rounded bg-primal-rule-light/20" />
            <div className="mx-auto h-4 w-48 rounded bg-primal-rule-light/20" />
            <div className="mx-auto h-3 w-32 rounded bg-primal-rule-light/20" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 text-primal-muted mx-auto mb-3" />
          <p className="text-primal-gray-mid text-sm">Unable to load founder board</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-xs text-primal-gold hover:text-primal-gold/70"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasInterruptions = data.mode === 'attention_required' && data.attentionItems.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Sticky header — appears when number scrolls out */}
      <StickyHeader
        percentage={data.percentage}
        healthOverall={data.healthOverall}
        visible={!numberVisible}
      />

      {/* ═══ The Number — owns the viewport ═══ */}
      <div
        ref={numberRef}
        className="min-h-[80vh] flex flex-col items-center justify-center relative px-4"
      >
        {/* Refresh in corner */}
        <div className="absolute top-4 right-6 flex items-center gap-2">
          <span className="text-[10px] text-primal-muted">
            {new Date(data.updatedAt).toLocaleTimeString()}
          </span>
          <button
            onClick={() => refetch()}
            className="p-1 rounded hover:bg-primal-rule-light/30 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-primal-gray-mid ${isFetching ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* The Number */}
        <TheNumber data={data} />

        {/* Status line + scroll indicator anchored near bottom */}
        <div className="absolute bottom-8 inset-x-0 space-y-3 px-4">
          <StatusLine data={data} />

          {hasInterruptions ? (
            <ScrollIndicator count={data.interruptionCount} />
          ) : (
            <p className="text-sm md:text-[1.3125rem] text-primal-muted text-center">
              Everything running clean.
            </p>
          )}
        </div>
      </div>

      {/* ═══ Below the fold — fused data sections ═══ */}
      <div className="max-w-3xl mx-auto px-4 pb-16 space-y-8">
        {/* Attention cards */}
        {hasInterruptions && (
          <div className="space-y-4">
            {data.attentionItems.map((item) => (
              <AttentionCard
                key={item.attention_id}
                item={item}
                expanded={expandedCardId === item.attention_id}
                onToggle={() => toggleCard(item.attention_id)}
                onInspect={(wfId) => handleInspect(wfId, item.category)}
              />
            ))}
          </div>
        )}

        {/* System health — trust the instrument first */}
        {rawReviewSurface && (
          <ControlPlaneCard
            compatibility={rawReviewSurface.compatibility}
            controlPlane={rawReviewSurface.control_plane}
            operatorLeverage={rawReviewSurface.operator_leverage}
          />
        )}

        {/* Ventures — stacked state bars */}
        <VentureSection coverage={data.ventureCoverage} />

        {/* Domains — certification by business function */}
        <DomainSection />

        {/* Newly complete */}
        <NewlyCompleteList items={data.newlyCompleteItems} />
      </div>

      {/* Workflow inspection sheet */}
      <WorkflowInspectionSheet
        workflowId={inspectedWorkflowId}
        category={inspectedCategory}
        onClose={() => setInspectedWorkflowId(null)}
      />
    </div>
  );
}
