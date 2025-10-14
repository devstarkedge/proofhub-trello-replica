// API service for CRUD operations
const baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

class DatabaseService {
  // Board CRUD operations
  async getBoards() {
    const res = await fetch(`${baseURL}/api/boards`);
    return await res.json();
  }

  async createBoard(name) {
    const res = await fetch(`${baseURL}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return await res.json();
  }

  async updateBoard(boardId, updates) {
    const res = await fetch(`${baseURL}/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteBoard(boardId) {
    await fetch(`${baseURL}/api/boards/${boardId}`, { method: 'DELETE' });
  }

  // List CRUD operations
  async getLists(boardId) {
    const res = await fetch(`${baseURL}/api/lists/board/${boardId}`);
    return await res.json();
  }

  async createList(boardId, title) {
    const lists = await this.getLists(boardId);
    const position = lists.length;
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, title, position })
    });
    return await res.json();
  }

  async updateList(listId, updates) {
    const res = await fetch(`${baseURL}/api/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteList(listId) {
    await fetch(`${baseURL}/api/lists/${listId}`, { method: 'DELETE' });
  }

  // Card CRUD operations
  async getCards(listId) {
    const res = await fetch(`${baseURL}/api/cards/list/${listId}`);
    return await res.json();
  }

  async getCard(cardId) {
    const res = await fetch(`${baseURL}/api/cards/${cardId}`);
    return await res.json();
  }

  async createCard(listId, title) {
    const cards = await this.getCards(listId);
    const position = cards.length;
    const res = await fetch(`${baseURL}/api/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, title, position })
    });
    return await res.json();
  }

  async updateCard(cardId, updates) {
    const res = await fetch(`${baseURL}/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteCard(cardId) {
    await fetch(`${baseURL}/api/cards/${cardId}`, { method: 'DELETE' });
  }

  async moveCard(cardId, newListId, newPosition) {
    const res = await fetch(`${baseURL}/api/cards/${cardId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newListId, newPosition })
    });
    return await res.json();
  }

  async moveList(listId, newPosition) {
    const res = await fetch(`${baseURL}/api/lists/${listId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPosition })
    });
    return await res.json();
  }

  // User operations
  async getProfile() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/users/profile`, { headers });
    return await res.json();
  }

  // Team operations
  async getTeams() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/teams`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createTeam(name, department) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/teams`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, department })
    });
    return await res.json();
  }

  async inviteUser(teamId, email) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/teams/${teamId}/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email })
    });
    return await res.json();
  }

  async joinTeam(token) {
    const authToken = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['x-auth-token'] = authToken;
    }
    const res = await fetch(`${baseURL}/api/teams/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token })
    });
    return await res.json();
  }

  // Comment operations
  async getComments(cardId) {
    const res = await fetch(`${baseURL}/api/comments/card/${cardId}`);
    return await res.json();
  }

  async createComment(cardId, text) {
    const res = await fetch(`${baseURL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, text })
    });
    return await res.json();
  }

  async updateComment(commentId, text) {
    const res = await fetch(`${baseURL}/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return await res.json();
  }

  async deleteComment(commentId) {
    await fetch(`${baseURL}/api/comments/${commentId}`, { method: 'DELETE' });
  }

  // Notification operations
  async getNotifications() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/notifications`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async markNotificationAsRead(notificationId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['x-auth-token'] = token;
    }
    const res = await fetch(`${baseURL}/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers
    });
    return await res.json();
  }

  async deleteNotification(notificationId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['x-auth-token'] = token;
    }
    await fetch(`${baseURL}/api/notifications/${notificationId}`, {
      method: 'DELETE',
      headers
    });
  }

  // Search operations
  async search(query) {
    const res = await fetch(`${baseURL}/api/search?q=${encodeURIComponent(query)}`);
    return await res.json();
  }

  // Analytics operations
  async getAnalytics(teamId) {
    const res = await fetch(`${baseURL}/api/analytics/team/${teamId}`);
    return await res.json();
  }
}

// Create singleton instance
const Database = new DatabaseService();

export default Database;
