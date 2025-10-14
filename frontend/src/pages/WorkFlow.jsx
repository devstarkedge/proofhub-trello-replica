import React, { useState, useEffect, useContext } from 'react';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import CardDetailModal from '../components/CardDetailModal';
import TeamContext from '../context/TeamContext';
import socketService from '../services/socket';
import AuthContext from '../context/AuthContext';

const WorkFlow = () => {
  const { currentTeam, loading: teamLoading } = useContext(TeamContext);
  const { user } = useContext(AuthContext);
  const [board, setBoard] = useState(null);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  // Load data from database
  useEffect(() => {
    if (currentTeam && !teamLoading) {
      loadData();
    }
  }, [currentTeam, teamLoading]);

  // Socket connection and real-time updates
  useEffect(() => {
    if (user && board) {
      socketService.connect(user._id);
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
      const boards = await Database.getBoards();
      const currentBoard = boards[0] || await Database.createBoard(`${currentTeam.name} Board`);
      setBoard(currentBoard);

      const boardLists = await Database.getLists(currentBoard._id);
      setLists(boardLists);

      const cardsMap = {};
      for (const list of boardLists) {
        cardsMap[list._id] = await Database.getCards(list._id);
      }
      setCardsByList(cardsMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Card CRUD operations
  const handleAddCard = async (listId, title) => {
    await Database.createCard(listId, title);
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
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="text-white text-xl text-center">
          <p className="mb-4">You are not part of any team yet.</p>
          <p>Please create or join a team to start managing tasks.</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="text-white text-xl">Error loading board. Please ensure the backend server is running.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400">
      <Header boardName={board.name} />

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