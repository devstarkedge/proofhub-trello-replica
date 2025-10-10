// Database simulation using in-memory storage
class DatabaseService {
  constructor() {
    this.boards = [];
    this.lists = [];
    this.cards = [];
    this.initialized = false;
  }

  // Initialize with sample data
  init() {
    if (this.initialized) return;
    
    this.boards = [{
      id: '1',
      name: 'My Trello board',
      createdAt: new Date().toISOString()
    }];
    
    this.lists = [
      { id: '1', boardId: '1', title: 'Trello Starter Guide', position: 0, color: null },
      { id: '2', boardId: '1', title: 'Today', position: 1, color: 'yellow' },
      { id: '3', boardId: '1', title: 'This Week', position: 2, color: 'cyan' },
      { id: '4', boardId: '1', title: 'Later', position: 3, color: null }
    ];
    
    this.cards = [
      { 
        id: '1', 
        listId: '1', 
        title: 'New to Trello? Start here', 
        description: '', 
        position: 0,
        labels: [],
        members: [],
        dueDate: null,
        checklist: [],
        createdAt: new Date().toISOString()
      },
      { 
        id: '2', 
        listId: '2', 
        title: 'hello', 
        description: '', 
        position: 0,
        labels: [],
        members: [],
        dueDate: null,
        checklist: [],
        createdAt: new Date().toISOString()
      }
    ];
    
    this.initialized = true;
  }

  // Board CRUD operations
  getBoards() {
    return [...this.boards];
  }

  createBoard(name) {
    const newBoard = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString()
    };
    this.boards.push(newBoard);
    return newBoard;
  }

  updateBoard(boardId, updates) {
    const index = this.boards.findIndex(b => b.id === boardId);
    if (index !== -1) {
      this.boards[index] = { ...this.boards[index], ...updates };
      return this.boards[index];
    }
    return null;
  }

  deleteBoard(boardId) {
    this.boards = this.boards.filter(b => b.id !== boardId);
    this.lists = this.lists.filter(l => l.boardId !== boardId);
    const listIds = this.lists.filter(l => l.boardId === boardId).map(l => l.id);
    this.cards = this.cards.filter(c => !listIds.includes(c.listId));
  }

  // List CRUD operations
  getLists(boardId) {
    return this.lists
      .filter(list => list.boardId === boardId)
      .sort((a, b) => a.position - b.position);
  }

  createList(boardId, title) {
    const newList = {
      id: Date.now().toString(),
      boardId,
      title,
      position: this.lists.filter(l => l.boardId === boardId).length,
      color: null
    };
    this.lists.push(newList);
    return newList;
  }

  updateList(listId, updates) {
    const index = this.lists.findIndex(l => l.id === listId);
    if (index !== -1) {
      this.lists[index] = { ...this.lists[index], ...updates };
      return this.lists[index];
    }
    return null;
  }

  deleteList(listId) {
    this.lists = this.lists.filter(l => l.id !== listId);
    this.cards = this.cards.filter(c => c.listId !== listId);
  }

  // Card CRUD operations
  getCards(listId) {
    return this.cards
      .filter(card => card.listId === listId)
      .sort((a, b) => a.position - b.position);
  }

  getAllCards() {
    return [...this.cards];
  }

  createCard(listId, title) {
    const newCard = {
      id: Date.now().toString(),
      listId,
      title,
      description: '',
      position: this.cards.filter(c => c.listId === listId).length,
      labels: [],
      members: [],
      dueDate: null,
      checklist: [],
      createdAt: new Date().toISOString()
    };
    this.cards.push(newCard);
    return newCard;
  }

  updateCard(cardId, updates) {
    const index = this.cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
      this.cards[index] = { ...this.cards[index], ...updates };
      return this.cards[index];
    }
    return null;
  }

  deleteCard(cardId) {
    this.cards = this.cards.filter(c => c.id !== cardId);
  }

  moveCard(cardId, newListId, newPosition) {
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      const oldListId = card.listId;
      
      // Update positions in old list
      this.cards
        .filter(c => c.listId === oldListId && c.position > card.position)
        .forEach(c => c.position--);
      
      // Update positions in new list
      this.cards
        .filter(c => c.listId === newListId && c.position >= newPosition)
        .forEach(c => c.position++);
      
      // Move the card
      card.listId = newListId;
      card.position = newPosition;
    }
  }
}

// Create singleton instance
const Database = new DatabaseService();
Database.init();

export default Database;