import { useQuery } from '@tanstack/react-query';
import type { ProjectConfig } from '@veritas-kanban/shared';
import { useManagedList } from './useManagedList';
import { apiFetch } from '@/lib/api/helpers';

/**
 * Hook to fetch projects (active only)
 */
export function useProjects() {
  return useQuery<ProjectConfig[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectConfig[]>('/api/projects'),
  });
}

/**
 * Hook to manage projects (CRUD operations)
 */
export function useProjectsManager() {
  return useManagedList<ProjectConfig>({
    endpoint: '/projects',
    queryKey: ['projects'],
  });
}

/**
 * Get the label for a project
 */
export function getProjectLabel(projects: ProjectConfig[], projectId: string): string {
  const project = projects.find((p) => p.id === projectId);
  return project?.label || projectId;
}

/**
 * Get the color class for a project badge
 */
export function getProjectColor(projects: ProjectConfig[], projectId: string): string {
  const project = projects.find((p) => p.id === projectId);
  return project?.color || 'bg-muted';
}

/**
 * Available background colors for project badges
 */
export const AVAILABLE_PROJECT_COLORS = [
  { value: 'bg-primal-gold/20', label: 'Gold' },
  { value: 'bg-green-500/20', label: 'Green' },
  { value: 'bg-primal-red/20', label: 'Red' },
  { value: 'bg-amber-500/20', label: 'Amber' },
  { value: 'bg-primal-gray-mid/20', label: 'Gray' },
  { value: 'bg-primal-gray-light/20', label: 'Silver' },
  { value: 'bg-primal-muted/20', label: 'Muted' },
  { value: 'bg-emerald-500/20', label: 'Emerald' },
  { value: 'bg-primal-rule/30', label: 'Dark' },
  { value: 'bg-yellow-500/20', label: 'Yellow' },
];
