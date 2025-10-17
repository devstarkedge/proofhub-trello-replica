import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import CardDetailModal from '../components/CardDetailModal';
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

  // Load data from database
  useEffect(() => {
    if (deptId && projectId && !teamLoading) {
      loadData();
    }
  }, [deptId, projectId, teamLoading]);

  // Socket connection and real-time updates
  useEffect(() => {
    if (user && board) {
      socketService.connect(user.id);
      socketService.joinBoard(board._id);

      // Listen for real-time card updates
      const handleCardUpdate = (event) => {
        const { cardId, updates } = event.detail;
        // Update the card in state without full reload
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

      // Listen for real-time comment additions
      const handleCommentAdded = (event) => {
        const { cardId, comment } = event.detail;
        // Add comment to the card in state
        setCardsByList(prev => {
          const newCardsByList = { ...prev };
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? { ...card, comments: [...card.comments, comment._id] } : card
            );
          });
          return newCardsByList;
        });
      };

      window.addEventListener('socket-card-updated', handleCardUpdate);
      window.addEventListener('socket-comment-added', handleCommentAdded);

      return () => {
        window.removeEventListener('socket-card-updated', handleCardUpdate);
        window.removeEventListener('socket-comment-added', handleCommentAdded);
        socketService.leaveBoard(board._id);
      };
    }
  }, [user, board]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch the specific project/board by ID
      const response = await Database.getProject(projectId);
      
      if (!response.success) {
        throw new Error(response.message || 'Failed to load project');
      }
      
      const projectBoard = response.data;
      
      // Verify the project belongs to the specified department
      if (projectBoard.department._id !== deptId && projectBoard.department !== deptId) {
        setError('This project does not belong to the specified department.');
        setLoading(false);
        return;
      }
      
      setBoard(projectBoard);

      // Fetch lists for this board
      const listsResponse = await Database.getLists(projectBoard._id);
      const boardLists = listsResponse.data || listsResponse;
      setLists(boardLists);

      // Fetch cards for each list
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
  
  // Card CRUD operations
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
    // Update selected card if it's currently open
    if (selectedCard && selectedCard._id === cardId) {
      const updatedCard = await Database.getCard(cardId);
      setSelectedCard(updatedCard);
    }
  };

  const handleMoveCard = async (cardId, newListId, newPosition) => {
    await Database.moveCard(cardId, newListId, newPosition);
    loadData();
  };

  // List CRUD operations
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
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="text-white text-xl">Loading project workflow...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-xl mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white text-purple-800 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Project Not Found</h2>
          <p className="text-xl mb-6">The requested project could not be found.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white text-purple-800 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Show empty state if no lists exist
  const hasNoLists = lists.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400">
      <Header boardName={board.name} />

      {hasNoLists ? (
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)' }}>
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-4">No tasks yet!</h2>
            <p className="text-xl mb-8">Create your first list to get started with this project.</p>
            <button
              onClick={() => {
                const title = prompt('Enter list name:');
                if (title) handleAddList(title);
              }}
              className="px-8 py-4 bg-white text-purple-800 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg"
            >
              Create First List
            </button>
          </div>
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
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={(updates) => handleUpdateCard(selectedCard._id, updates)}
          onDelete={() => handleDeleteCard(selectedCard._id)}
        />
      )}
    </div>
  );
};

export default WorkFlow;
