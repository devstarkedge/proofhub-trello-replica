import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import useModalHierarchyStore from "../../store/modalHierarchyStore";

const BreadcrumbNavigation = () => {
  const currentProject = useModalHierarchyStore(
    (state) => state.currentProject
  );
  const stack = useModalHierarchyStore((state) => state.stack);
  const navigateBreadcrumbLevel = useModalHierarchyStore(
    (state) => state.navigateBreadcrumbLevel
  );
  const items = useMemo(() => {
    const crumbs = [];
    if (currentProject) {
      crumbs.push({
        label: currentProject.name || "Project",
        level: "project",
        type: "project",
      });
    }
    stack.forEach((entry, index) => {
      crumbs.push({
        label:
          entry.label ||
          entry.initialData?.title ||
          entry.initialData?.name ||
          "Untitled",
        level: index,
        type: entry.type,
      });
    });
    return crumbs;
  }, [currentProject, stack]);

  if (!items.length) return null;

  return (
    <nav
      aria-label="Modal hierarchy"
      className="flex items-center flex-wrap gap-1 text-sm font-medium"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const sharedClasses =
          "inline-flex items-center gap-1 px-2 py-1 rounded-full transition-colors max-w-[180px]";
        return (
          <React.Fragment key={`${item.type}-${item.level}-${idx}`}>
            {isLast ? (
              <span
                className={`${sharedClasses} bg-gray-100 text-gray-900 cursor-default`}
                aria-current="page"
                title={item.label}
              >
                <span className="truncate">{item.label}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigateBreadcrumbLevel(item.level)}
                className={`${sharedClasses} text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
                title={`Go to ${item.label}`}
              >
                <span className="truncate">{item.label}</span>
              </button>
            )}
            {!isLast && <ChevronRight size={14} className="text-gray-400" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default BreadcrumbNavigation;

