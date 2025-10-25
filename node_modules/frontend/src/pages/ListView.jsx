import React, { useState, useEffect, useContext } from 'react';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';
import Card from '../components/Card';

const ListView = () => {
  const { currentTeam } = useContext(TeamContext);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, todo, inprogress, review, done

  useEffect(() => {
    if (currentTeam) {
      loadCards();
    }
  }, [currentTeam, filter]);

  const loadCards = async () => {
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

      // Filter by status if needed
      if (filter !== 'all') {
        const statusMap = {
          todo: 'To-Do',
          inprogress: 'In Progress',
          review: 'Review',
          done: 'Done'
        };
        allCards = allCards.filter(card => card.listName === statusMap[filter]);
      }

      setCards(allCards);
    } catch (error) {
      console.error('Error loading cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'text-red-600';
      case 'Medium': return 'text-yellow-600';
      case 'Low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading tasks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">List View - {currentTeam?.name}</h1>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="all">All Tasks</option>
            <option value="todo">To-Do</option>
            <option value="inprogress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cards.map(card => (
                <tr key={card._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => {}}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{card.title}</div>
                    <div className="text-sm text-gray-500">{card.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {card.assignee?.name || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getPriorityColor(card.priority)}`}>
                      {card.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {card.listName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'No due date'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No tasks found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListView;
