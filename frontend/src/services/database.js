// API service for CRUD operations
const baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

class DatabaseService {
  // Board CRUD operations
  async getBoards() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getBoardsByDepartment(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/department/${departmentId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createBoard(name, description, team, department, members, background) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        description,
        team,
        department,
        members,
        background: background || '#6366f1'
      })
    });
    return await res.json();
  }

  async updateBoard(boardId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/${boardId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteBoard(boardId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/boards/${boardId}`, { 
      method: 'DELETE',
      headers
    });
  }

  // Project-specific methods (Projects are boards)
  async createProject(projectData) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Check if projectData is FormData (for file uploads)
    const isFormData = projectData instanceof FormData;
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseURL}/api/boards`, {
      method: 'POST',
      headers,
      body: isFormData ? projectData : JSON.stringify(projectData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create project');
    }
    return await res.json();
  }

  async updateProject(projectId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/${projectId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update project');
    }
    return await res.json();
  }

  async deleteProject(projectId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/${projectId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete project');
    }
    return { success: true };
  }

  async getProject(projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/${projectId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getWorkflowData(departmentId, projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/workflow/${departmentId}/${projectId}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || `HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // List CRUD operations
  async getLists(boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/lists/board/${boardId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createList(boardId, title) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const lists = await this.getLists(boardId);
    const position = lists.length;
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ board: boardId, title, position })
    });
    return await res.json();
  }

  async updateList(listId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/lists/${listId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteList(listId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/lists/${listId}`, { method: 'DELETE', headers });
  }

  // Card CRUD operations
  async getCards(listId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/list/${listId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getCardsByBoard(boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/board/${boardId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getCard(cardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}`, { headers });
    return await res.json();
  }

  async createCard(listId, title, boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const cards = await this.getCards(listId);
    const position = cards.length;
    const res = await fetch(`${baseURL}/api/cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ list: listId, title, position, board: boardId })
    });
    return await res.json();
  }

  async updateCard(cardId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteCard(cardId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/cards/${cardId}`, { method: 'DELETE', headers });
  }

  async moveCard(cardId, destinationListId, newPosition) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}/move`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ destinationListId, newPosition })
    });
    return await res.json();
  }

  async moveList(listId, newPosition) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/lists/${listId}/position`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ newPosition })
    });
    return await res.json();
  }

  // User operations
  async getUser(userId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/${userId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getProfile() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/profile`, { headers });
    return await res.json();
  }

  // Department operations
  async getDepartments() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createDepartment(name, description, managerId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, description, manager: managerId })
    });
    return await res.json();
  }

  async updateDepartment(id, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteDepartment(id) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/departments/${id}`, {
      method: 'DELETE',
      headers
    });
  }

  async addMemberToDepartment(deptId, userId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/${deptId}/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });
    return await res.json();
  }

  async removeMemberFromDepartment(deptId, userId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/departments/${deptId}/members/${userId}`, {
      method: 'DELETE',
      headers
    });
  }

  // Team operations
  async getTeams() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/teams`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createTeam(name, department, description) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/teams`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, department, description })
    });
    return await res.json();
  }

  async updateTeam(id, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/teams/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    return await res.json();
  }

  async deleteTeam(id) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/teams/${id}`, {
      method: 'DELETE',
      headers
    });
  }

  async addMemberToTeam(teamId, userId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/teams/${teamId}/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });
    return await res.json();
  }

  async inviteUser(teamId, email) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${baseURL}/api/teams/join/${token}`, {
      method: 'POST',
      headers
    });
    return await res.json();
  }

  // User assignment operations
  async assignUserToDepartment(userId, deptId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/${userId}/assign`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ department: deptId })
    });
    return await res.json();
  }

  async assignUserToTeam(userId, teamId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/${userId}/assign`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ team: teamId })
    });
    return await res.json();
  }

  async getUsers() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async verifyUser(userId, role, department) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/${userId}/verify`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ role, department })
    });
    return await res.json();
  }

  async declineUser(userId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/users/${userId}/decline`, {
      method: 'DELETE',
      headers
    });
    return await res.json();
  }

  // Comment operations
  async getComments(cardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/card/${cardId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.data;
  }

  async createComment(cardId, text) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ card: cardId, text })
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async updateComment(commentId, text) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ text })
    });
    return await res.json();
  }

  async deleteComment(commentId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/comments/${commentId}`, { method: 'DELETE', headers });
  }

  // Notification operations
  async getNotifications() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async deleteNotification(notificationId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch(`${baseURL}/api/notifications/${notificationId}`, {
      method: 'DELETE',
      headers
    });
  }

  // Search operations
  async search(query) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/search?q=${encodeURIComponent(query)}`, { headers });
    return await res.json();
  }

  // Analytics operations
  async getAnalytics(teamId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/analytics/team/${teamId}`, { headers });
    return await res.json();
  }
}

// Create singleton instance
const Database = new DatabaseService();

export default Database;
