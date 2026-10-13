import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const OverdueTasksList = memo(({ overdueTasksList }) => {
  if (!overdueTasksList || overdueTasksList.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-8 bg-white rounded-xl shadow-lg p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        Overdue Tasks ({overdueTasksList.length})
      </h3>
      <div className="space-y-3">
        {overdueTasksList.slice(0, 5).map((task) => (
          <div key={task.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
            <div>
              <p className="font-medium text-gray-900">{task.title}</p>
              <p className="text-sm text-gray-600">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${
              task.priority === 'critical' ? 'bg-red-100 text-red-800' :
              task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
              task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {task.priority}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
})

export default OverdueTasksList;
