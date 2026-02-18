import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook for managing project selection state.
 * Selection is scoped to a single department at a time.
 */
const useProjectSelection = () => {
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [selectionDepartmentId, setSelectionDepartmentId] = useState(null);

  const isSelectionMode = selectedProjectIds.size > 0;

  const toggleProject = useCallback((projectId, departmentId) => {
    setSelectedProjectIds(prev => {
      const next = new Set(prev);

      // If selecting in a different department, clear previous selection
      if (selectionDepartmentId && selectionDepartmentId !== departmentId) {
        next.clear();
        setSelectionDepartmentId(departmentId);
        next.add(projectId);
        return next;
      }

      if (next.has(projectId)) {
        next.delete(projectId);
        // If nothing selected, clear department lock
        if (next.size === 0) {
          setSelectionDepartmentId(null);
        }
      } else {
        next.add(projectId);
        if (!selectionDepartmentId) {
          setSelectionDepartmentId(departmentId);
        }
      }

      return next;
    });
  }, [selectionDepartmentId]);

  const selectAll = useCallback((projectIds, departmentId) => {
    // If all are already selected, deselect all (toggle behavior)
    setSelectedProjectIds(prev => {
      const allSelected = projectIds.every(id => prev.has(id));
      if (allSelected) {
        setSelectionDepartmentId(null);
        return new Set();
      }
      setSelectionDepartmentId(departmentId);
      return new Set(projectIds);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedProjectIds(new Set());
    setSelectionDepartmentId(null);
  }, []);

  const isSelected = useCallback((projectId) => {
    return selectedProjectIds.has(projectId);
  }, [selectedProjectIds]);

  const selectedCount = selectedProjectIds.size;

  // Convert Set to Array for API calls and passing to components
  const selectedProjectIdsArray = useMemo(
    () => Array.from(selectedProjectIds),
    [selectedProjectIds]
  );

  return {
    selectedProjectIds: selectedProjectIdsArray,
    selectedProjectIdsSet: selectedProjectIds,
    selectionDepartmentId,
    isSelectionMode,
    selectedCount,
    toggleProject,
    selectAll,
    clearSelection,
    isSelected
  };
};

export default useProjectSelection;
