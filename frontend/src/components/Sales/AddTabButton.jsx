import React, { useMemo } from 'react';
import { Plus, Bookmark } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const AddTabButton = ({ onClick }) => {
  const { filters, columnFilters } = useSalesStore();

  // Count active filters
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.name) count++;
    if (filters.platform) count++;
    if (filters.technology) count++;
    if (filters.status) count++;
    if (filters.location) count++;
    if (filters.minRating != null) count++;
    if (filters.minHireRate != null) count++;
    if (filters.budget) count++;
    if (filters.profile) count++;
    if (filters.replyFromClient) count++;
    if (filters.followUps) count++;
    if (filters.bidType) count++;
    if (filters.bidDomain) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (columnFilters) count += Object.keys(columnFilters).filter((k) => columnFilters[k]).length;
    return count;
  }, [filters, columnFilters]);

  if (activeCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
        bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-400/25
        hover:from-blue-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/30
        transition-all duration-200 active:scale-95"
      title="Save current filters as a new tab"
    >
      <Bookmark className="w-3.5 h-3.5" />
      Save Tab
      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white/20">
        {activeCount}
      </span>
    </button>
  );
};

export default AddTabButton;
