import { createContext, useContext } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';

const HandleContext = createContext(null);
export function DepartmentDragHandle() {
  const sortable = useContext(HandleContext);
  return <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners}
    disabled={sortable.disabled} aria-label={`Reorder ${sortable.name} department`}
    title={sortable.disabled ? 'Clear search to reorder departments' : 'Drag to reorder; or press Space and use arrow keys'}
    className="p-1 text-gray-400 hover:text-blue-600 cursor-grab active:cursor-grabbing touch-none disabled:cursor-default disabled:opacity-40">
    <GripVertical size={20} />
  </button>;
}
export default function SortableDepartment({ id, name, disabled, children, className, style }) {
  const sortable = useSortable({ id, disabled });
  const transform = sortable.transform;
  return <HandleContext.Provider value={{ ...sortable, disabled, name }}>
    <div ref={sortable.setNodeRef} className={className} style={{ ...style,
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      transition: sortable.transition, position: 'relative', zIndex: sortable.isDragging ? 20 : undefined,
      opacity: sortable.isDragging ? 0.85 : 1,
    }}>{children}</div>
  </HandleContext.Provider>;
}
