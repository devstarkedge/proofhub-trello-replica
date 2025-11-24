import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, Trash2, Plus } from "lucide-react";

const SubtasksSection = ({
  subtasks,
  newSubtask,
  onNewSubtaskChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onKeyPress,
}) => {
  const calculateProgress = () => {
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter((s) => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <CheckSquare size={20} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800 text-lg">
            Subtasks
          </h4>
          <span className="text-sm text-gray-500">
            ({subtasks.filter((s) => s.completed).length}/
            {subtasks.length})
          </span>
        </div>
        {subtasks.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${calculateProgress()}%` }}
                className="h-full bg-gradient-to-r from-green-400 to-green-600"
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {calculateProgress()}%
            </span>
          </div>
        )}
      </div>

      <div className="ml-8 space-y-2">
        <AnimatePresence>
          {subtasks.map((subtask, index) => {
            const safeKey = String(subtask.id || `subtask-${index}`).trim() || `subtask-${index}`;
            return (
              <motion.div
                key={safeKey}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
              >
                <input
                  type="checkbox"
                  checked={subtask.completed}
                  onChange={() => onToggleSubtask(subtask.id)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span
                  className={`flex-1 text-sm ${
                    subtask.completed
                      ? "line-through text-gray-500"
                      : "text-gray-700"
                  }`}
                >
                  {subtask.text}
                </span>
                <button
                  onClick={() => onDeleteSubtask(subtask.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => onNewSubtaskChange(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder="Add a subtask..."
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddSubtask}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Plus size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default SubtasksSection;
