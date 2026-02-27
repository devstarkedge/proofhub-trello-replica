import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, Trash2, Plus, Clock, RefreshCw } from "lucide-react";

const themeProgress = {
  blue: 'from-blue-400 to-cyan-400',
  purple: 'from-purple-400 to-pink-400',
  pink: 'from-pink-400 to-rose-400'
};


const SubtaskItem = React.memo(({ item, index, onToggleComplete, onOpenItem, onDeleteItem }) => {
  const safeKey = String(item._id || item.id || `subtask-${index}`).trim() || `subtask-${index}`;
  const actualCompleted = item.status === 'done' || item.completed;
  
  // Local optimistic state
  const [optimisticCompleted, setOptimisticCompleted] = React.useState(actualCompleted);
  const [isOptimistic, setIsOptimistic] = React.useState(false);

  // Sync local state with actual props when external updates happen
  React.useEffect(() => {
    if (!isOptimistic) {
      setOptimisticCompleted(actualCompleted);
    }
  }, [actualCompleted, isOptimistic]);

  const handleToggle = async () => {
    // 1. Immediately update local UI state
    const newStatus = !optimisticCompleted;
    setOptimisticCompleted(newStatus);
    setIsOptimistic(true);
    
    // 2. Call parent and await result
    try {
      await onToggleComplete(item);
    } catch (error) {
      // 3. Rollback purely local state if parent handler explicitly throws
      setOptimisticCompleted(!newStatus);
    } finally {
      // 4. Conclude optimistic grace period
      setIsOptimistic(false);
    }
  };

  const renderStatus = (status) => {
    const statusMap = {
      done: 'text-green-600 bg-green-50',
      'in-progress': 'text-blue-600 bg-blue-50',
      blocked: 'text-red-600 bg-red-50',
      todo: 'text-gray-600 bg-gray-100'
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusMap[status] || statusMap.todo}`}>
        {status || 'todo'}
      </span>
    );
  };

  return (
    <motion.div
      key={safeKey}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg transition-colors group border border-gray-100 shadow-sm ${isOptimistic ? 'opacity-80' : 'hover:bg-white'}`}
    >
      <input
        type="checkbox"
        checked={optimisticCompleted || false}
        onChange={handleToggle}
        disabled={isOptimistic}
        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
      />
      <div
        className="flex-1 cursor-pointer flex items-center justify-between gap-3"
        onClick={() => onOpenItem && onOpenItem(item)}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${optimisticCompleted ? "line-through text-gray-400" : "text-gray-800"}`}>
            {item.title || item.text}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {renderStatus(optimisticCompleted ? 'done' : (item.status === 'done' ? 'todo' : item.status))}
            {/* Recurring Task indicator */}
            {(item.isRecurring || item.tags?.includes('Recurring Task')) && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                <RefreshCw size={10} />
                Recurring
              </span>
            )}
            {item.dueDate && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {new Date(item.dueDate).toLocaleDateString()}
              </span>
            )}
            {item.nanoCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                {item.nanoCount} nanos
              </span>
            )}
          </div>
        </div>

        {/* Small Cover Thumbnail */}
        {item.coverImage?.url && (
          <div className="h-9 w-14 flex-shrink-0 rounded overflow-hidden border border-gray-200 bg-gray-100">
            <img 
              src={item.coverImage.url} 
              alt="cover" 
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
      <button
        onClick={() => onDeleteItem(item)}
        className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded transition-all"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom deeper comparison assuming item's identity matters
  return (
    prevProps.item === nextProps.item &&
    prevProps.item.status === nextProps.item.status &&
    prevProps.item.completed === nextProps.item.completed &&
    prevProps.item.title === nextProps.item.title
  );
});

const SubtasksSection = ({
  title = "Subtasks",
  items = [],
  loading = false,
  newItemTitle,
  onNewItemTitleChange,
  onCreateItem,
  onToggleComplete,
  onDeleteItem,
  onOpenItem,
  emptyLabel = "No items yet",
  theme = 'blue'
}) => {
  const calculateProgress = () => {
    if (items.length === 0) return 0;
    const completed = items.filter((s) => s.status === 'done' || s.completed).length;
    return Math.round((completed / items.length) * 100);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <CheckSquare size={20} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800 text-lg">
            {title}
          </h4>
          <span className="text-sm text-gray-500">
            ({items.filter((s) => s.status === 'done' || s.completed).length}/
            {items.length})
          </span>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${calculateProgress()}%` }}
                className={`h-full bg-gradient-to-r ${themeProgress[theme] || themeProgress.blue}`}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {calculateProgress()}%
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newItemTitle || ''}
          onChange={(e) => onNewItemTitleChange(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") onCreateItem();
          }}
          placeholder={`Add a ${title.toLowerCase().slice(0, -1)}...`}
          className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCreateItem}
          className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          <Plus size={18} />
        </motion.button>
      </div>

      <div className="ml-1 space-y-2">
        <AnimatePresence>
          {items.map((item, index) => (
            <SubtaskItem 
              key={item._id || item.id || `subtask-${index}`}
              item={item}
              index={index}
              onToggleComplete={onToggleComplete}
              onOpenItem={onOpenItem}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </AnimatePresence>

        {loading && (
          <div className="p-4 bg-white rounded-lg border border-gray-200 text-gray-500 text-sm">
            Loading...
          </div>
        )}

        {!items.length && !loading && (
          <div className="p-4 bg-white rounded-lg border border-dashed border-gray-200 text-gray-500 text-sm">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubtasksSection;
