import { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Feature } from '@/store/app-store';

export interface DependencyEdgeData {
  sourceStatus: Feature['status'];
  targetStatus: Feature['status'];
  isHighlighted?: boolean;
  isDimmed?: boolean;
}

const getEdgeColor = (sourceStatus?: Feature['status'], targetStatus?: Feature['status']) => {
  // If source is completed/verified, the dependency is satisfied
  if (sourceStatus === 'completed' || sourceStatus === 'verified') {
    return 'var(--status-success)';
  }
  // If target is in progress, show active color
  if (targetStatus === 'in_progress') {
    return 'var(--status-in-progress)';
  }
  // If target is blocked (in backlog with incomplete deps)
  if (targetStatus === 'backlog') {
    return 'var(--border)';
  }
  // Default
  return 'var(--border)';
};

export const DependencyEdge = memo(function DependencyEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    animated,
  } = props;

  const edgeData = data as DependencyEdgeData | undefined;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const isHighlighted = edgeData?.isHighlighted ?? false;
  const isDimmed = edgeData?.isDimmed ?? false;

  const edgeColor = isHighlighted
    ? 'var(--brand-500)'
    : edgeData
      ? getEdgeColor(edgeData.sourceStatus, edgeData.targetStatus)
      : 'var(--border)';

  const isCompleted =
    edgeData?.sourceStatus === 'completed' || edgeData?.sourceStatus === 'verified';
  const isInProgress = edgeData?.targetStatus === 'in_progress';

  return (
    <>
      {/* Background edge for better visibility */}
      <BaseEdge
        id={`${id}-bg`}
        path={edgePath}
        style={{
          strokeWidth: isHighlighted ? 6 : 4,
          stroke: 'var(--background)',
          opacity: isDimmed ? 0.3 : 1,
        }}
      />

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          'transition-all duration-300',
          animated && 'animated-edge',
          isInProgress && 'edge-flowing',
          isHighlighted && 'graph-edge-highlighted',
          isDimmed && 'graph-edge-dimmed'
        )}
        style={{
          strokeWidth: isHighlighted ? 4 : selected ? 3 : isDimmed ? 1 : 2,
          stroke: edgeColor,
          strokeDasharray: isCompleted ? 'none' : '5 5',
          filter: isHighlighted
            ? 'drop-shadow(0 0 6px var(--brand-500))'
            : selected
              ? 'drop-shadow(0 0 3px var(--brand-500))'
              : 'none',
          opacity: isDimmed ? 0.2 : 1,
        }}
      />

      {/* Animated particles for in-progress edges */}
      {animated && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="edge-particle"
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isInProgress
                  ? 'bg-[var(--status-in-progress)] animate-ping'
                  : 'bg-brand-500 animate-pulse'
              )}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
