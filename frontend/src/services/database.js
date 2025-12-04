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
    const payload = {
      htmlContent,
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

  async getDashboardData() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseURL}/api/analytics/dashboard`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  }

  // Removed caching mechanism for real-time dashboard data
  async getDashboardDataFresh() {
    return await this.getDashboardData();
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
}

// Create singleton instance
const Database = new DatabaseService();

export default Database;
