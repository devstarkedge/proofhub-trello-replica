import React, { useState, useEffect, useContext } from 'react';
import DepartmentContext from '../context/DepartmentContext';
import Database from '../services/database';


const GanttView = () => {
  const { currentTeam } = useContext(DepartmentContext);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTeam) {
      loadTasks();
    }
  }, [currentTeam]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      let allCards = [];
      // Get all boards for the team, then all lists, then all cards
      const boards = await Database.getBoards();
      for (const board of boards) {
        const lists = await Database.getLists(board._id);
        for (const list of lists) {
          const listCards = await Database.getCards(list._id);
          allCards = allCards.concat(listCards.map(card => ({ ...card, listName: list.title })));
        }
      }

      // Filter cards with due dates for Gantt
      const ganttTasks = allCards.filter(card => card.dueDate).map(card => ({
        id: card._id,
        name: card.title,
        start: new Date(card.createdAt),
        end: new Date(card.dueDate),
        progress: card.status === 'Done' ? 100 : card.status === 'In Progress' ? 50 : 0,
        dependencies: [], // Could be enhanced with subtasks
        assignee: card.assignee?.name || 'Unassigned',
        priority: card.priority
      }));

      setTasks(ganttTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading Gantt chart...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-100">
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Gantt Chart - {currentTeam?.name}</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center text-gray-500 mb-4">
            Gantt Chart Implementation (Placeholder)
          </div>
          <p className="text-sm text-gray-600 mb-4">
            This is a placeholder for the Gantt chart view. Full implementation would require a Gantt chart library like react-gantt-timeline or similar.
          </p>

          <div className="space-y-4">
            {tasks.map(task => (
              <div key={task.id} className="border rounded p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">{task.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${
                    task.priority === 'High' ? 'bg-red-100 text-red-800' :
                    task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {task.priority}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Assignee: {task.assignee}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Duration: {task.start.toLocaleDateString()} - {task.end.toLocaleDateString()}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${task.progress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{task.progress}% complete</div>
              </div>
            ))}
          </div>

          {tasks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No tasks with due dates found for Gantt chart
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GanttView;
