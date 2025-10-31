import React, { useState, useEffect, useContext, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Filter, Search, Users, Calendar, Loader2 } from 'lucide-react';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import { lazy } from 'react';
const CardDetailModal = lazy(() => import('../components/CardDetailModal'));
import TeamContext from '../context/TeamContext';
import socketService from '../services/socket';
import AuthContext from '../context/AuthContext';

const WorkFlow = () => {
  const { deptId, projectId } = useParams();
  const navigate = useNavigate();
  const { currentTeam, loading: teamLoading } = useContext(TeamContext);
  const { user } = useContext(AuthContext);
  const [board, setBoard] = useState(null);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (deptId && projectId && !teamLoading) {
      loadData();
    }
  }, [deptId, projectId, teamLoading]);

  useEffect(() => {
    if (user && board) {
      socketService.connect(user.id);
      socketService.joinBoard(board._id);

      const handleCardUpdate = (event) => {
        const { cardId, updates } = event.detail;
        setCardsByList(prev => {
          const newCardsByList = { ...prev };
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? { ...card, ...updates } : card
            );
          });
          return newCardsByList;
        });
      };

      const handleCommentAdded = (event) => {
        const { cardId, comment } = event.detail;
        setCardsByList(prev => {
          const newCardsByList = { ...prev };
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? { ...card, comments: [...(card.comments || []), comment._id] } : card
            );
          });
          return newCardsByList;
        });
      };

      const handleCardMoved = (event) => {
        const { cardId, sourceListId, destinationListId, newPosition } = event.detail;
        setCardsByList(prev => {
          const newCardsByList = { ...prev };

          // Find the card being moved
          let movedCard = null;
          Object.keys(newCardsByList).forEach(listId => {
            const cardIndex = newCardsByList[listId].findIndex(card => card._id === cardId);
            if (cardIndex !== -1) {
              movedCard = newCardsByList[listId][cardIndex];
              // Remove from source list
              newCardsByList[listId] = newCardsByList[listId].filter(card => card._id !== cardId);
            }
          });

          if (movedCard) {
            // Update card's listId
            movedCard = { ...movedCard, list: destinationListId, position: newPosition };

            // Add to destination list at the correct position
            if (!newCardsByList[destinationListId]) {
              newCardsByList[destinationListId] = [];
            }
            newCardsByList[destinationListId].splice(newPosition, 0, movedCard);

            // Update positions in destination list
            newCardsByList[destinationListId] = newCardsByList[destinationListId].map((card, index) => ({
              ...card,
              position: index
            }));
          }

          return newCardsByList;
        });
      };

      window.addEventListener('socket-card-updated', handleCardUpdate);
      window.addEventListener('socket-comment-added', handleCommentAdded);
      window.addEventListener('socket-card-moved', handleCardMoved);

      return () => {
        window.removeEventListener('socket-card-updated', handleCardUpdate);
        window.removeEventListener('socket-comment-added', handleCommentAdded);
        window.removeEventListener('socket-card-moved', handleCardMoved);
        socketService.leaveBoard(board._id);
      };
    }
  }, [user, board]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await Database.getProject(projectId);
      
      if (!response.success) {
        throw new Error(response.message || 'Failed to load project');
      }
      
      const projectBoard = response.data;
      
      if (projectBoard.department._id !== deptId && projectBoard.department !== deptId) {
        setError('This project does not belong to the specified department.');
        setLoading(false);
        return;
      }
      
      setBoard(projectBoard);

      const listsResponse = await Database.getLists(projectBoard._id);
      const boardLists = listsResponse.data || listsResponse;
      setLists(boardLists);

      const cardsMap = {};
      for (const list of boardLists) {
        const cardsResponse = await Database.getCards(list._id);
        cardsMap[list._id] = cardsResponse.data || cardsResponse;
      }
      setCardsByList(cardsMap);
    } catch (error) {
      console.error('Error loading project data:', error);
      setError(error.message || 'Failed to load project. You may not have permission to access this project.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddCard = async (listId, title) => {
    await Database.createCard(listId, title, board._id);
    loadData();
  };

  const handleDeleteCard = async (cardId) => {
    if (window.confirm('Are you sure you want to delete this card?')) {
      await Database.deleteCard(cardId);
      loadData();
    }
  };

  const handleUpdateCard = async (cardId, updates) => {
    await Database.updateCard(cardId, updates);
    loadData();
    if (selectedCard && selectedCard._id === cardId) {
      const updatedCard = await Database.getCard(cardId);
      setSelectedCard(updatedCard);
    }
  };

  const handleMoveCard = async (cardId, newListId, newPosition) => {
    await Database.moveCard(cardId, newListId, newPosition);
    loadData();
  };

  const handleAddList = async (title) => {
    await Database.createList(board._id, title);
    loadData();
  };

  const handleDeleteList = async (listId) => {
    if (window.confirm('Are you sure you want to delete this list and all its cards?')) {
      await Database.deleteList(listId);
      loadData();
    }
  };

  const handleUpdateListColor = async (listId, color) => {
    await Database.updateList(listId, { color });
    loadData();
  };

  const handleMoveList = async (listId, newPosition) => {
    await Database.moveList(listId, newPosition);
    loadData();
  };
  
  if (loading || teamLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-white text-xl font-medium">Loading project workflow...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white text-center max-w-md mx-4"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p className="text-xl mb-6 text-white/80">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
            >
              Return to Home
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white text-center max-w-md mx-4"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold mb-4">Project Not Found</h2>
            <p className="text-xl mb-6 text-white/80">The requested project could not be found.</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
            >
              Return to Home
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  const hasNoLists = lists.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      {/* Custom Header for Workflow */}
      <header className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
              >
                <ArrowLeft size={24} />
              </motion.button>
              <div>
                <h1 className="text-2xl font-bold text-white">{board.name}</h1>
                <p className="text-white/70 text-sm mt-1">{board.description || 'Project Board'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden md:block">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-lg"
                />
              </div>

              {/* Filters */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors backdrop-blur-lg border border-white/20"
              >
                <Filter size={18} />
                Filters
              </motion.button>

              {/* Team Members */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg backdrop-blur-lg border border-white/20">
                <Users size={18} className="text-white" />
                <span className="text-white font-medium">{board.members?.length || 0}</span>
              </div>

              {/* Add List Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const title = prompt('Enter list name:');
                  if (title) handleAddList(title);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-purple-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
              >
                <Plus size={18} />
                Add List
              </motion.button>
            </div>
          </div>

          {/* Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 flex gap-3"
              >
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="All">All Status</option>
                  <option value="To-Do">To-Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="All">All Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {hasNoLists ? (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 120px)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center text-white max-w-md mx-4"
          >
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20">
              <Plus size={64} className="mx-auto mb-4 text-white/50" />
              <h2 className="text-3xl font-bold mb-4">No lists yet!</h2>
              <p className="text-xl mb-8 text-white/70">Create your first list to get started with this project.</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const title = prompt('Enter list name:');
                  if (title) handleAddList(title);
                }}
                className="px-8 py-4 bg-white text-purple-900 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg inline-flex items-center gap-2"
              >
                <Plus size={24} />
                Create First List
              </motion.button>
            </div>
          </motion.div>
        </div>
      ) : (
        <Board
          lists={lists}
          cardsByList={cardsByList}
          onAddCard={handleAddCard}
          onDeleteCard={handleDeleteCard}
          onCardClick={setSelectedCard}
          onAddList={handleAddList}
          onDeleteList={handleDeleteList}
          onUpdateListColor={handleUpdateListColor}
          onMoveCard={handleMoveCard}
          onMoveList={handleMoveList}
        />
      )}

      {selectedCard && (
        <Suspense fallback={<div>Loading...</div>}>
          <CardDetailModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            onUpdate={(updates) => handleUpdateCard(selectedCard._id, updates)}
            onDelete={() => handleDeleteCard(selectedCard._id)}
            onMoveCard={handleMoveCard}
          />
        </Suspense>
      )}
    </div>
  );
};

export default WorkFlow;