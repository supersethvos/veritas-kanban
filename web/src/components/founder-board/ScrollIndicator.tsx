interface Props {
  count: number;
}

export default function ScrollIndicator({ count }: Props) {
  if (count <= 0) return null;

  return (
    <p className="text-xs md:text-lg text-primal-muted text-center animate-pulse">
      ↓ {count} {count === 1 ? 'item needs' : 'items need'} you
    </p>
  );
}
