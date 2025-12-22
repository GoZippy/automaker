import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  SelectionMode,
  ConnectionMode,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Feature } from '@/store/app-store';
import {
  TaskNode,
  DependencyEdge,
  GraphControls,
  GraphLegend,
  GraphFilterControls,
} from './components';
import {
  useGraphNodes,
  useGraphLayout,
  useGraphFilter,
  type TaskNodeData,
  type GraphFilterState,
} from './hooks';
import { cn } from '@/lib/utils';

// Define custom node and edge types - using any to avoid React Flow's strict typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = {
  task: TaskNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = {
  dependency: DependencyEdge,
};

interface GraphCanvasProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNodeClick?: (featureId: string) => void;
  onNodeDoubleClick?: (featureId: string) => void;
  backgroundStyle?: React.CSSProperties;
  className?: string;
}

function GraphCanvasInner({
  features,
  runningAutoTasks,
  searchQuery,
  onSearchQueryChange,
  onNodeClick,
  onNodeDoubleClick,
  backgroundStyle,
  className,
}: GraphCanvasProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');

  // Filter state (category and negative toggle are local to graph view)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isNegativeFilter, setIsNegativeFilter] = useState(false);

  // Combined filter state
  const filterState: GraphFilterState = {
    searchQuery,
    selectedCategories,
    isNegativeFilter,
  };

  // Calculate filter results
  const filterResult = useGraphFilter(features, filterState);

  // Transform features to nodes and edges with filter results
  const { nodes: initialNodes, edges: initialEdges } = useGraphNodes({
    features,
    runningAutoTasks,
    filterResult,
  });

  // Apply layout
  const { layoutedNodes, layoutedEdges, runLayout } = useGraphLayout({
    nodes: initialNodes,
    edges: initialEdges,
  });

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes/edges when features change
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // Handle layout direction change
  const handleRunLayout = useCallback(
    (direction: 'LR' | 'TB') => {
      setLayoutDirection(direction);
      runLayout(direction);
    },
    [runLayout]
  );

  // Handle clear all filters
  const handleClearFilters = useCallback(() => {
    onSearchQueryChange('');
    setSelectedCategories([]);
    setIsNegativeFilter(false);
  }, [onSearchQueryChange]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<TaskNodeData>) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<TaskNodeData>) => {
      onNodeDoubleClick?.(node.id);
    },
    [onNodeDoubleClick]
  );

  // MiniMap node color based on status
  const minimapNodeColor = useCallback((node: Node<TaskNodeData>) => {
    const data = node.data as TaskNodeData | undefined;
    const status = data?.status;
    switch (status) {
      case 'completed':
      case 'verified':
        return 'var(--status-success)';
      case 'in_progress':
        return 'var(--status-in-progress)';
      case 'waiting_approval':
        return 'var(--status-waiting)';
      default:
        if (data?.isBlocked) return 'rgb(249, 115, 22)'; // orange-500
        if (data?.error) return 'var(--status-error)';
        return 'var(--muted-foreground)';
    }
  }, []);

  return (
    <div className={cn('w-full h-full', className)} style={backgroundStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        selectionMode={SelectionMode.Partial}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }}
        className="graph-canvas"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
          className="opacity-50"
        />

        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-popover/90 !border-border rounded-lg shadow-lg"
        />

        <GraphControls
          isLocked={isLocked}
          onToggleLock={() => setIsLocked(!isLocked)}
          onRunLayout={handleRunLayout}
          layoutDirection={layoutDirection}
        />

        <GraphFilterControls
          filterState={filterState}
          availableCategories={filterResult.availableCategories}
          hasActiveFilter={filterResult.hasActiveFilter}
          onSearchQueryChange={onSearchQueryChange}
          onCategoriesChange={setSelectedCategories}
          onNegativeFilterChange={setIsNegativeFilter}
          onClearFilters={handleClearFilters}
        />

        <GraphLegend />
      </ReactFlow>
    </div>
  );
}

// Wrap with provider for hooks to work
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
