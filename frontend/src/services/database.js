// API service for CRUD operations
const baseURL = import.meta.env.VITE_BACKEND_URL;

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

  // OPTIMIZED: Get complete workflow data in single request (board + lists + cards)
  async getWorkflowComplete(projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/boards/${projectId}/workflow-complete`, { headers });
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

  async createList(boardId, title, position = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Position will be handled by backend if not provided
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

  async getCardsByDepartment(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/department/${departmentId}`, { headers });
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

  async createCard(listId, title, boardId, position = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Position will be handled by backend if not provided
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
    try {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update card');
      }
      return data;
    } catch (error) {
      if (error.message.includes('JSON')) {
        throw new Error('Invalid response from server');
      }
      throw error;
    }
  }

  async updateEstimationTime(cardId, hours, minutes) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}/estimation`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ hours: parseInt(hours) || 0, minutes: parseInt(minutes) || 0 })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update estimation time');
    }
    return await res.json();
  }

  async addLoggedTime(cardId, time) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const { hours, minutes } = time;
    const res = await fetch(`${baseURL}/api/cards/${cardId}/log-time`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ hours: parseInt(hours) || 0, minutes: parseInt(minutes) || 0 })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to log time');
    }
    return await res.json();
  }

  async updateLoggedTime(cardId, entryId, time) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const { hours, minutes } = time;
    const res = await fetch(`${baseURL}/api/cards/${cardId}/log-time/${entryId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ hours: parseInt(hours) || 0, minutes: parseInt(minutes) || 0 })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update time entry');
    }
    return await res.json();
  }

  async deleteLoggedTime(cardId, entryId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}/log-time/${entryId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete time entry');
    }
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

  // New independent time tracking methods for Card
  async addCardTimeEntry(cardId, type, entry) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/cards/${cardId}/time-tracking`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, entry })
    });
    if (!res.ok) throw new Error('Failed to add time entry');
    return await res.json();
  }

  async updateCardTimeEntry(cardId, entryId, type, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/cards/${cardId}/time-tracking/${entryId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ type, updates })
    });
    if (!res.ok) throw new Error('Failed to update time entry');
    return await res.json();
  }

  async deleteCardTimeEntry(cardId, entryId, type) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/cards/${cardId}/time-tracking/${entryId}?type=${type}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Failed to delete time entry');
    return await res.json();
  }

  async moveCard(cardId, destinationListId, newPosition, newStatus) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // First, update the card's position and list
    const moveRes = await fetch(`${baseURL}/api/cards/${cardId}/move`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ destinationListId, newPosition })
    });
    
    if (!moveRes.ok) {
      throw new Error('Failed to move card');
    }

    // Then, update the card's status
    const updateRes = await fetch(`${baseURL}/api/cards/${cardId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: newStatus })
    });

    if (!updateRes.ok) {
      throw new Error('Failed to update card status');
    }

    return await updateRes.json();
  }

  async archiveCard(cardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/cards/${cardId}/archive`, {
      method: 'PUT',
      headers,
    });

    if (!res.ok) {
      throw new Error('Failed to archive card');
    }

    return await res.json();
  }

  async restoreCard(cardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/cards/${cardId}/restore`, {
      method: 'PUT',
      headers,
    });

    if (!res.ok) {
      throw new Error('Failed to restore card');
    }

    return await res.json();
  }

  async getArchivedCards(listId, boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = new URL(`${baseURL}/api/cards/list/${listId}/archived`);
    if (boardId) {
      url.searchParams.append('boardId', boardId);
    }

    const res = await fetch(url.toString(), { headers });

    if (!res.ok) {
      throw new Error('Failed to fetch archived cards');
    }

    return await res.json();
  }

  // Subtask hierarchy operations
  async getSubtasks(taskId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/task/${taskId}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load subtasks (${res.status})`);
    }
    return await res.json();
  }

  async getSubtask(subtaskId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load subtask (${res.status})`);
    }
    return await res.json();
  }

  async createSubtask(taskId, payload) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/task/${taskId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create subtask');
    }
    return await res.json();
  }

  async updateSubtask(subtaskId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update subtask');
    }
    return await res.json();
  }

  async deleteSubtask(subtaskId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete subtask');
    }
    return await res.json();
  }

  // New independent time tracking methods for Subtask
  async addSubtaskTimeEntry(subtaskId, type, entry) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}/time-tracking`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, entry })
    });
    if (!res.ok) throw new Error('Failed to add time entry');
    return await res.json();
  }

  async updateSubtaskTimeEntry(subtaskId, entryId, type, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}/time-tracking/${entryId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ type, updates })
    });
    if (!res.ok) throw new Error('Failed to update time entry');
    return await res.json();
  }

  async deleteSubtaskTimeEntry(subtaskId, entryId, type) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}/time-tracking/${entryId}?type=${type}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Failed to delete time entry');
    return await res.json();
  }

  async reorderSubtasks(taskId, orderedIds) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/task/${taskId}/reorder`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderedIds })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to reorder subtasks');
    }
    return await res.json();
  }

  async getNanoSubtasks(subtaskId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/subtask/${subtaskId}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load subtask-nanos (${res.status})`);
    }
    return await res.json();
  }

  async getNano(subtaskNanoId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/${subtaskNanoId}`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load subtask-nano (${res.status})`);
    }
    return await res.json();
  }

  async createNano(subtaskId, payload) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/subtask/${subtaskId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create subtask-nano');
    }
    return await res.json();
  }

  async updateNano(subtaskNanoId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/${subtaskNanoId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update subtask-nano');
    }
    return await res.json();
  }

  async deleteNano(subtaskNanoId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/${subtaskNanoId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete subtask-nano');
    }
    return await res.json();
  }

  // New independent time tracking methods for Nano
  async addNanoTimeEntry(nanoId, type, entry) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtask-nanos/${nanoId}/time-tracking`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, entry })
    });
    if (!res.ok) throw new Error('Failed to add time entry');
    return await res.json();
  }

  async updateNanoTimeEntry(nanoId, entryId, type, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtask-nanos/${nanoId}/time-tracking/${entryId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ type, updates })
    });
    if (!res.ok) throw new Error('Failed to update time entry');
    return await res.json();
  }

  async deleteNanoTimeEntry(nanoId, entryId, type) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${baseURL}/api/subtask-nanos/${nanoId}/time-tracking/${entryId}?type=${type}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Failed to delete time entry');
    return await res.json();
  }

  async reorderNanos(subtaskId, orderedIds) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/subtask/${subtaskId}/reorder`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderedIds })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to reorder subtask-nanos');
    }
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

  async getDepartmentsWithAssignments() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/with-assignments`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getDepartmentStats(departmentId = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const query = departmentId ? `?departmentId=${departmentId}` : '';
    const res = await fetch(`${baseURL}/api/departments/stats/summary${query}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createDepartment(name, description, managerIds) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, description, managers: managerIds })
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

  async getMembersWithAssignments(deptId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/${deptId}/members-with-assignments`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getProjectsWithMemberAssignments(deptId, memberId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/${deptId}/projects-with-member/${memberId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Get department filter options for header dropdown (optimized, role-aware)
  async getDepartmentFilterOptions() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/filter-options`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Team operations
  async getTeams(departmentId = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const url = departmentId ? `${baseURL}/api/teams?department=${departmentId}` : `${baseURL}/api/teams`;
    const res = await fetch(url, { headers });
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

    // First, get the current user's data to see existing departments
    const userRes = await fetch(`${baseURL}/api/users/${userId}`, { headers });
    if (!userRes.ok) {
      throw new Error('Failed to fetch user data');
    }
    const userData = await userRes.json();
    const currentDepartments = userData.data.department || [];

    // Add the new department if not already assigned (use IDs for comparison)
    const updatedDepartments = currentDepartments.some(dept => dept._id === deptId || dept === deptId)
      ? currentDepartments
      : [...currentDepartments, deptId];

    const res = await fetch(`${baseURL}/api/users/${userId}/assign`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ departments: updatedDepartments })
    });
    return await res.json();
  }

  async unassignUserFromDepartment(userId, deptId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/departments/${deptId}/users/${userId}/unassign`, {
      method: 'PUT',
      headers
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

  async getUsers(departmentId = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    let url = `${baseURL}/api/users`;
    if (departmentId) {
      url += `?department=${departmentId}`;
    }
    const res = await fetch(url, { headers });
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

  async getSubtaskComments(subtaskId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/subtask/${subtaskId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.data;
  }

  async getNanoComments(nanoId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/nano/${nanoId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.data;
  }

  async createComment({ cardId, subtaskId, nanoId, htmlContent }) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Extract plain text from HTML for the text field
    const plainText = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    const payload = {
      htmlContent,
      text: plainText || '', // Send empty string for image-only comments
      card: cardId,
      subtask: subtaskId,
      subtaskNano: nanoId
    };
    const res = await fetch(`${baseURL}/api/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async uploadImage(cardId, formData, type = 'general', setCover = false) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = new URL(`${baseURL}/api/uploads/image`);
    if (type) url.searchParams.append('type', type);
    if (cardId) url.searchParams.append('cardId', cardId);
    if (setCover) url.searchParams.append('setCover', 'true');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Upload failed');
    }

    return await res.json();
  }

  async updateComment(commentId, htmlContent) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ htmlContent })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to update comment' }));
      if (res.status === 403) {
        throw new Error(error.message || 'You are not authorized to edit this comment');
      }
      throw new Error(error.message || 'Failed to update comment');
    }
    return await res.json();
  }

  async deleteComment(commentId) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to delete comment' }));
      if (res.status === 403) {
        throw new Error(error.message || 'You are not authorized to delete this comment');
      }
      throw new Error(error.message || 'Failed to delete comment');
    }
    return await res.json().catch(() => ({ success: true }));
  }

  // Get single comment by ID (for deep linking)
  async getComment(commentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.data;
  }

  // Create threaded reply
  async createReply(parentCommentId, htmlContent) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${parentCommentId}/reply`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ htmlContent })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to create reply' }));
      throw new Error(error.message || 'Failed to create reply');
    }
    return await res.json();
  }

  // Get replies for a comment (paginated)
  async getReplies(parentCommentId, page = 1, limit = 10) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(
      `${baseURL}/api/comments/${parentCommentId}/replies?page=${page}&limit=${limit}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Add reaction to comment
  async addReaction(commentId, emoji) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}/reactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ emoji })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to add reaction' }));
      throw new Error(error.message || 'Failed to add reaction');
    }
    return await res.json();
  }

  // Remove reaction from comment
  async removeReaction(commentId, emoji) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to remove reaction' }));
      throw new Error(error.message || 'Failed to remove reaction');
    }
    return await res.json();
  }

  // Pin comment (admin/manager only)
  async pinComment(commentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}/pin`, {
      method: 'PATCH',
      headers
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to pin comment' }));
      throw new Error(error.message || 'Failed to pin comment');
    }
    return await res.json();
  }

  // Unpin comment (admin/manager only)
  async unpinComment(commentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/comments/${commentId}/unpin`, {
      method: 'PATCH',
      headers
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Failed to unpin comment' }));
      throw new Error(error.message || 'Failed to unpin comment');
    }
    return await res.json();
  }

  // Notification operations
  async getNotifications(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.skip) queryParams.append('skip', params.skip);
    if (params.filter && params.filter !== 'all') queryParams.append('filter', params.filter);
    if (params.type) queryParams.append('type', params.type);
    if (params.priority) queryParams.append('priority', params.priority);
    
    const url = `${baseURL}/api/notifications${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getUnreadCount() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/unread-count`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async markNotificationAsRead(notificationId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
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

  async markAllNotificationsAsRead() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/read-all`, {
      method: 'PUT',
      headers
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async archiveNotification(notificationId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/${notificationId}/archive`, {
      method: 'PUT',
      headers
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async clearAllNotifications() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/clear-all`, {
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
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/${notificationId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return { success: true };
  }

  async getArchivedNotifications(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.skip) queryParams.append('skip', params.skip);
    
    const url = `${baseURL}/api/notifications/archived${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async restoreNotification(notificationId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/notifications/${notificationId}/restore`, {
      method: 'PUT',
      headers
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
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
  async getDepartmentAnalytics(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/analytics/department/${departmentId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getProjectsAnalytics(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/analytics/projects/${departmentId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Category operations
  async getCategoriesByDepartment(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/categories/department/${departmentId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createCategory(name, description, departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/categories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, description, department: departmentId })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create category');
    }
    return await res.json();
  }

  // Card Activity operations
  async getCardActivity(cardId, limit = 100, page = 1) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/cards/${cardId}/activity?limit=${limit}&page=${page}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Subtask Activity operations
  async getSubtaskActivity(subtaskId, limit = 100, page = 1) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtasks/${subtaskId}/activity?limit=${limit}&page=${page}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Nano-Subtask Activity operations
  async getNanoActivity(nanoId, limit = 100, page = 1) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/subtask-nanos/${nanoId}/activity?limit=${limit}&page=${page}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Recurring Task operations
  async createRecurrence(recurrenceData) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence`, {
      method: 'POST',
      headers,
      body: JSON.stringify(recurrenceData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create recurrence');
    }
    return await res.json();
  }

  async getRecurrenceByCard(cardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/card/${cardId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getRecurrenceById(recurrenceId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/${recurrenceId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getAllRecurrences(boardId, includeInactive = false) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/all/${boardId}?includeInactive=${includeInactive}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async updateRecurrence(recurrenceId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/${recurrenceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update recurrence');
    }
    return await res.json();
  }

  async deleteRecurrence(recurrenceId, hardDelete = false) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/${recurrenceId}?hardDelete=${hardDelete}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete recurrence');
    }
    return await res.json();
  }

  async triggerRecurrence(recurrenceId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/recurrence/${recurrenceId}/trigger`, {
      method: 'POST',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to trigger recurrence');
    }
    return await res.json();
  }

  // ============= Reminder API Methods =============

  async createReminder(reminderData) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(reminderData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create reminder');
    }
    return await res.json();
  }

  async getProjectReminders(projectId, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    
    const res = await fetch(`${baseURL}/api/reminders/project/${projectId}?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getProjectReminderStats(projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/project/${projectId}/stats`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getReminder(reminderId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async updateReminder(reminderId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update reminder');
    }
    return await res.json();
  }

  async deleteReminder(reminderId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete reminder');
    }
    return await res.json();
  }

  async completeReminder(reminderId, notes = '') {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notes })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to complete reminder');
    }
    return await res.json();
  }

  async cancelReminder(reminderId, reason = '') {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to cancel reminder');
    }
    return await res.json();
  }

  async sendReminderNow(reminderId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}/send`, {
      method: 'POST',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to send reminder');
    }
    return await res.json();
  }

  async syncReminderClientFromProject(reminderId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}/sync-client`, {
      method: 'POST',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to sync client info');
    }
    return await res.json();
  }

  async updateReminderClient(reminderId, clientData) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/reminders/${reminderId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ client: clientData })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update client info');
    }
    return await res.json();
  }

  async getReminderDashboardStats(filters = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    
    const res = await fetch(`${baseURL}/api/reminders/dashboard/stats?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getCalendarReminders(startDate, endDate, filters = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    
    const res = await fetch(`${baseURL}/api/reminders/calendar?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async getAllReminders(filters = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    
    const res = await fetch(`${baseURL}/api/reminders?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // ========== LABELS API ==========

  async getLabelsByBoard(boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/labels/board/${boardId}`, { 
      headers,
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  async createLabel(name, color, boardId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, color, boardId })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create label');
    }
    return await res.json();
  }

  async updateLabel(labelId, updates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/labels/${labelId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update label');
    }
    return await res.json();
  }

  async deleteLabel(labelId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/labels/${labelId}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to delete label');
    }
    return await res.json();
  }

  async syncLabels(entityType, entityId, labelIds) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/labels/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ entityType, entityId, labelIds })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to sync labels');
    }
    return await res.json();
  }

  // =============================================
  // PROJECT COVER IMAGE OPERATIONS
  // =============================================

  /**
   * Upload or update project cover image
   * @param {string} projectId - Project/Board ID
   * @param {File} file - Image file to upload
   * @returns {Promise<Object>} Cover image data
   */
  async uploadProjectCoverImage(projectId, file) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const formData = new FormData();
    formData.append('coverImage', file);

    const res = await fetch(`${baseURL}/api/boards/${projectId}/cover`, {
      method: 'PUT',
      headers,
      body: formData
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to upload cover image');
    }
    return await res.json();
  }

  /**
   * Remove project cover image
   * @param {string} projectId - Project/Board ID
   * @returns {Promise<Object>} Response with previous cover for undo
   */
  async removeProjectCoverImage(projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/boards/${projectId}/cover`, {
      method: 'DELETE',
      headers
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to remove cover image');
    }
    return await res.json();
  }

  /**
   * Restore cover image from version history
   * @param {string} projectId - Project/Board ID
   * @param {number} versionIndex - Index in coverImageHistory array (0 = most recent)
   * @returns {Promise<Object>} Updated cover image data
   */
  async restoreProjectCoverImage(projectId, versionIndex) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/boards/${projectId}/cover/restore/${versionIndex}`, {
      method: 'POST',
      headers
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to restore cover image');
    }
    return await res.json();
  }

  // =============================================
  // TEAM ANALYTICS OPERATIONS
  // =============================================

  /**
   * Get team logged time analytics with role-based access
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Team logged time data
   */
  async getTeamLoggedTime(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (params.departmentId) queryParams.append('departmentId', params.departmentId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.userId) queryParams.append('userId', params.userId);

    const res = await fetch(`${baseURL}/api/team-analytics/logged-time?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch team logged time');
    }
    return await res.json();
  }

  /**
   * Get smart insights and AI analytics
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Smart insights data
   */
  async getTeamInsights(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (params.departmentId) queryParams.append('departmentId', params.departmentId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const res = await fetch(`${baseURL}/api/team-analytics/insights?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch team insights');
    }
    return await res.json();
  }

  /**
   * Get department-wise team analytics (logged time based)
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Department team analytics data
   */
  async getTeamDepartmentAnalytics(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const res = await fetch(`${baseURL}/api/team-analytics/departments?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch department analytics');
    }
    return await res.json();
  }

  /**
   * Get daily/weekly/monthly trends
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Trends data
   */
  async getTeamTrends(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (params.departmentId) queryParams.append('departmentId', params.departmentId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.granularity) queryParams.append('granularity', params.granularity);

    const res = await fetch(`${baseURL}/api/team-analytics/trends?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch team trends');
    }
    return await res.json();
  }

  /**
   * Get personal logged time summary
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Personal summary data
   */
  async getMyLoggedTimeSummary(params = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const res = await fetch(`${baseURL}/api/team-analytics/my-summary?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch personal summary');
    }
    return await res.json();
  }

  /**
   * Get lightweight task-wise summary for hover preview
   * @param {string} userId - User ID
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Promise<Object>} Hover preview data
   */
  async getDateHoverDetails(userId, date) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/team-analytics/date-hover/${userId}/${date}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch date hover details');
    }
    return await res.json();
  }

  /**
   * Get full hierarchical breakdown for modal view
   * @param {string} userId - User ID
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Promise<Object>} Full detail data with hierarchy
   */
  async getDateDetailedLogs(userId, date) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/team-analytics/date-details/${userId}/${date}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch date details');
    }
    return await res.json();
  }

  // ==========================================
  // Calendar API Methods
  // ==========================================

  /**
   * Get calendar tasks for a date range
   * @param {string} startDate - Start date ISO string
   * @param {string} endDate - End date ISO string
   * @param {string} departmentId - Optional department filter
   * @returns {Promise<Object>} Calendar tasks data
   */
  async getCalendarTasks(startDate, endDate, departmentId = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const queryParams = new URLSearchParams();
    queryParams.append('start', startDate);
    queryParams.append('end', endDate);
    if (departmentId && departmentId !== 'all') {
      queryParams.append('departmentId', departmentId);
    }

    const res = await fetch(`${baseURL}/api/calendar/tasks?${queryParams}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch calendar tasks');
    }
    return await res.json();
  }

  /**
   * Create a task from calendar
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created task
   */
  async createCalendarTask(taskData) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/calendar/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create calendar task');
    }
    return await res.json();
  }

  /**
   * Update task dates from calendar
   * @param {string} taskId - Task ID
   * @param {Object} dates - { startDate, dueDate }
   * @returns {Promise<Object>} Updated task
   */
  async updateTaskDates(taskId, dates) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/calendar/tasks/${taskId}/dates`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(dates)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update task dates');
    }
    return await res.json();
  }

  /**
   * Get projects for a department (for calendar task creation)
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Projects list
   */
  async getCalendarProjects(departmentId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/calendar/projects/${departmentId}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch projects');
    }
    return await res.json();
  }

  /**
   * Get lists/statuses for a project (for calendar task creation)
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Lists/statuses
   */
  async getCalendarLists(projectId) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseURL}/api/calendar/lists/${projectId}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch lists');
    }
    return await res.json();
  }

  // ============ My Shortcuts API Methods ============

  /**
   * Get My Shortcuts dashboard summary (batched data)
   * @returns {Promise<Object>} Dashboard summary with task count, logged time, activities, etc.
   */
  async getMyDashboardSummary() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/my-shortcuts/dashboard`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch dashboard summary');
    }
    return await res.json();
  }

  /**
   * Get user's activities with pagination and filtering
   * @param {Object} filters - { page, limit, type, startDate, endDate, grouped }
   * @returns {Promise<Object>} Activities with pagination
   */
  async getMyActivities(filters = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.grouped) params.append('grouped', filters.grouped);

    const res = await fetch(`${baseURL}/api/my-shortcuts/activities?${params.toString()}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch activities');
    }
    return await res.json();
  }

  /**
   * Get user's tasks grouped by project
   * @returns {Promise<Object>} Tasks grouped by project with navigation context
   */
  async getMyTasksGrouped() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/my-shortcuts/tasks`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch tasks');
    }
    return await res.json();
  }

  /**
   * Get user's announcements with pagination
   * @param {Object} options - { page, limit }
   * @returns {Promise<Object>} Announcements with pagination
   */
  async getMyAnnouncements(options = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const res = await fetch(`${baseURL}/api/my-shortcuts/announcements?${params.toString()}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch announcements');
    }
    return await res.json();
  }

  /**
   * Get user's assigned projects with pagination
   * @param {Object} options - { page, limit }
   * @returns {Promise<Object>} Projects with pagination
   */
  async getMyProjects(options = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const res = await fetch(`${baseURL}/api/my-shortcuts/projects?${params.toString()}`, { headers });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to fetch projects');
    }
    return await res.json();
  }
}

// Create singleton instance
const Database = new DatabaseService();

export default Database;

