import { ListTodo, Play, Ban, CheckCircle2, Search } from 'lucide-react';
import type { CockpitBoardSnapshot } from '@/hooks/useCockpit';

interface Props {
  snapshot: CockpitBoardSnapshot;
}

function StatCard({
  label,
  count,
  Icon,
  color,
}: {
  label: string;
  count: number;
  Icon: typeof ListTodo;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-primal-rule-light bg-primal-card/50 px-3 py-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <div className="text-lg font-semibold text-primal-gray-light leading-none">{count}</div>
        <div className="text-[10px] text-primal-gray-mid mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function BoardSnapshot({ snapshot }: Props) {
  return (
    <div className="flex gap-3 flex-wrap">
      <StatCard label="To Do" count={snapshot.todo} Icon={ListTodo} color="text-primal-gray-mid" />
      <StatCard
        label="In Progress"
        count={snapshot.inProgress}
        Icon={Play}
        color="text-primal-gold"
      />
      <StatCard label="Blocked" count={snapshot.blocked} Icon={Ban} color="text-amber-400" />
      <StatCard label="Review" count={snapshot.review} Icon={Search} color="text-primal-gold" />
      <StatCard label="Done" count={snapshot.done} Icon={CheckCircle2} color="text-emerald-400" />
    </div>
  );
}
