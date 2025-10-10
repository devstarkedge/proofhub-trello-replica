import React, { useState, useEffect } from 'react';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import CardDetailModal from '../components/CardDetailModal';

const WorkFlow = () => {
  const [board] = useState(Database.getBoards()[0]);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  
  // Load data from database
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = () => {
    const boardLists = Database.getLists(board.id);
    setLists(boardLists);
    
    const cardsMap = {};
    boardLists.forEach(list => {
      cardsMap[list.id] = Database.getCards(list.id);
    });
    setCardsByList(cardsMap);
  };
  
  // Card CRUD operations
  const handleAddCard = (listId, title) => {
    Database.createCard(listId, title);
    loadData();
  };
  
  const handleDeleteCard = (cardId) => {
    if (window.confirm('Are you sure you want to delete this card?')) {
      Database.deleteCard(cardId);
      loadData();
    }
  };
  
  const handleUpdateCard = (cardId, updates) => {
    Database.updateCard(cardId, updates);
    loadData();
    // Update selected card if it's currently open
    if (selectedCard && selectedCard.id === cardId) {
      const updatedCard = Database.getAllCards().find(c => c.id === cardId);
      setSelectedCard(updatedCard);
    }
  };
  
  const handleMoveCard = (cardId, newListId) => {
    const cards = Database.getCards(newListId);
    const newPosition = cards.length;
    Database.moveCard(cardId, newListId, newPosition);
    loadData();
  };
  
  // List CRUD operations
  const handleAddList = (title) => {
    Database.createList(board.id, title);
    loadData();
  };
  
  const handleDeleteList = (listId) => {
    if (window.confirm('Are you sure you want to delete this list and all its cards?')) {
      Database.deleteList(listId);
      loadData();
    }
  };
  
  const handleUpdateListColor = (listId, color) => {
    Database.updateList(listId, { color });
    loadData();
  };
  
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
      />
      
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
          onDelete={handleDeleteCard}
        />
      )}
    </div>
  );
};

export default WorkFlow;