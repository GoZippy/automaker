import { useMemo } from 'react';
import { Feature } from '@/store/app-store';

export interface GraphFilterState {
  searchQuery: string;
  selectedCategories: string[];
  isNegativeFilter: boolean;
}

export interface GraphFilterResult {
  matchedNodeIds: Set<string>;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  availableCategories: string[];
  hasActiveFilter: boolean;
}

/**
 * Traverses up the dependency tree to find all ancestors of a node
 */
function getAncestors(
  featureId: string,
  featureMap: Map<string, Feature>,
  visited: Set<string>
): void {
  if (visited.has(featureId)) return;
  visited.add(featureId);

  const feature = featureMap.get(featureId);
  if (!feature?.dependencies) return;

  for (const depId of feature.dependencies) {
    if (featureMap.has(depId)) {
      getAncestors(depId, featureMap, visited);
    }
  }
}

/**
 * Traverses down to find all descendants (features that depend on this one)
 */
function getDescendants(featureId: string, features: Feature[], visited: Set<string>): void {
  if (visited.has(featureId)) return;
  visited.add(featureId);

  for (const feature of features) {
    if (feature.dependencies?.includes(featureId)) {
      getDescendants(feature.id, features, visited);
    }
  }
}

/**
 * Gets all edges in the highlighted path
 */
function getHighlightedEdges(highlightedNodeIds: Set<string>, features: Feature[]): Set<string> {
  const edges = new Set<string>();

  for (const feature of features) {
    if (!highlightedNodeIds.has(feature.id)) continue;
    if (!feature.dependencies) continue;

    for (const depId of feature.dependencies) {
      if (highlightedNodeIds.has(depId)) {
        edges.add(`${depId}->${feature.id}`);
      }
    }
  }

  return edges;
}

/**
 * Hook to calculate graph filter results based on search query, categories, and filter mode
 */
export function useGraphFilter(
  features: Feature[],
  filterState: GraphFilterState
): GraphFilterResult {
  const { searchQuery, selectedCategories, isNegativeFilter } = filterState;

  return useMemo(() => {
    // Extract all unique categories
    const availableCategories = Array.from(
      new Set(features.map((f) => f.category).filter(Boolean))
    ).sort();

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const hasSearchQuery = normalizedQuery.length > 0;
    const hasCategoryFilter = selectedCategories.length > 0;
    const hasActiveFilter = hasSearchQuery || hasCategoryFilter || isNegativeFilter;

    // If no filters active, return empty sets (show all nodes normally)
    if (!hasActiveFilter) {
      return {
        matchedNodeIds: new Set<string>(),
        highlightedNodeIds: new Set<string>(),
        highlightedEdgeIds: new Set<string>(),
        availableCategories,
        hasActiveFilter: false,
      };
    }

    // Find directly matched nodes
    const matchedNodeIds = new Set<string>();
    const featureMap = new Map(features.map((f) => [f.id, f]));

    for (const feature of features) {
      let matchesSearch = true;
      let matchesCategory = true;

      // Check search query match (title or description)
      if (hasSearchQuery) {
        const titleMatch = feature.title?.toLowerCase().includes(normalizedQuery);
        const descMatch = feature.description?.toLowerCase().includes(normalizedQuery);
        matchesSearch = titleMatch || descMatch;
      }

      // Check category match
      if (hasCategoryFilter) {
        matchesCategory = selectedCategories.includes(feature.category);
      }

      // Both conditions must be true for a match
      if (matchesSearch && matchesCategory) {
        matchedNodeIds.add(feature.id);
      }
    }

    // Apply negative filter if enabled (invert the matched set)
    let effectiveMatchedIds: Set<string>;
    if (isNegativeFilter) {
      effectiveMatchedIds = new Set(
        features.filter((f) => !matchedNodeIds.has(f.id)).map((f) => f.id)
      );
    } else {
      effectiveMatchedIds = matchedNodeIds;
    }

    // Calculate full path (ancestors + descendants) for highlighted nodes
    const highlightedNodeIds = new Set<string>();

    for (const id of effectiveMatchedIds) {
      // Add the matched node itself
      highlightedNodeIds.add(id);

      // Add all ancestors (dependencies)
      getAncestors(id, featureMap, highlightedNodeIds);

      // Add all descendants (dependents)
      getDescendants(id, features, highlightedNodeIds);
    }

    // Get edges in the highlighted path
    const highlightedEdgeIds = getHighlightedEdges(highlightedNodeIds, features);

    return {
      matchedNodeIds: effectiveMatchedIds,
      highlightedNodeIds,
      highlightedEdgeIds,
      availableCategories,
      hasActiveFilter: true,
    };
  }, [features, searchQuery, selectedCategories, isNegativeFilter]);
}
