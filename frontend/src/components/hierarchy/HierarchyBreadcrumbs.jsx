import React from 'react';
import { ChevronRight } from 'lucide-react';

const HierarchyBreadcrumbs = ({ items = [], onNavigate }) => {
  if (!items.length) return null;

  return (
    <div className="flex items-center flex-wrap gap-1 text-sm font-medium">
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        const label = crumb.label || 'Untitled';
        return (
          <React.Fragment key={`${crumb.type}-${crumb.id}-${index}`}>
            <button
              type="button"
              onClick={() => !isLast && onNavigate(index)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${
                isLast
                  ? 'bg-white/20 text-white cursor-default'
                  : 'bg-white/10 text-white/80 hover:bg-white/20 transition-colors'
              }`}
              disabled={isLast}
            >
              <span className="capitalize">{label}</span>
              {!isLast && <ChevronRight size={14} className="opacity-60" />}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default HierarchyBreadcrumbs;

