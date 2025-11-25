import React, { useState, useEffect, useContext, Suspense, memo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Filter, Search, Users, Calendar, Loader2, Pencil, Shield, User, Crown } from 'lucide-react';
import Database from '../services/database';
import Header from '../components/Header';
import Board from '../components/Board';
import { lazy } from 'react';
const EditProjectModal = lazy(() => import('../components/EditProjectModal'));
import DepartmentContext from '../context/DepartmentContext';
import socketService from '../services/socket';
import AuthContext from '../context/AuthContext';
import useWorkflowStore from '../store/workflowStore';
import useModalHierarchyStore from '../store/modalHierarchyStore';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu';
import HierarchyModalStack from '../components/hierarchy/HierarchyModalStack';

const WorkFlow = memo(() => {
  const { deptId, projectId } = useParams();
  const navigate = useNavigate();
  const { currentTeam, loading: teamLoading } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);

  // Use workflow store
  const {
    board,
    lists,
    cardsByList,
    loading,
    error,
    initializeWorkflow,
    updateBoard,
    addCard,
    deleteCard,
    updateCard,
    moveCard,
    addList,
    deleteList,
    updateListColor,
    updateListTitle,
    moveList,
    getCard
  } = useWorkflowStore();

  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [fullProjectData, setFullProjectData] = useState(null);
  const modalStack = useModalHierarchyStore((state) => state.stack);
  const openHierarchyModal = useModalHierarchyStore((state) => state.openModalByType);
  const closeHierarchy = useModalHierarchyStore((state) => state.closeAll);
  const closeHierarchyToDepth = useModalHierarchyStore((state) => state.closeToDepth);
  const updateHierarchyLabel = useModalHierarchyStore((state) => state.updateItemLabel);
  const setHierarchyProject = useModalHierarchyStore((state) => state.setProject);

  useEffect(() => {
    if (deptId && projectId && !teamLoading) {
      loadData();
    }
  }, [deptId, projectId, teamLoading, initializeWorkflow]);

  useEffect(() => {
    if (user && board) {
      socketService.connect(user.id);
      socketService.joinBoard(board._id);

      return () => {
        socketService.leaveBoard(board._id);
      };
    }
  }, [user, board]);

useEffect(() => {
  if (board) {
    setHierarchyProject(board);
  }
}, [board, setHierarchyProject]);

  const loadData = async () => {
    try {
      // Check department access first
      const response = await Database.getProject(projectId);

      if (!response.success) {
        throw new Error(response.message || 'Failed to load project');
      }

      const projectBoard = response.data;

      if (projectBoard.department._id !== deptId && projectBoard.department !== deptId) {
        throw new Error('This project does not belong to the specified department.');
      }

      // Initialize workflow store with project data
      await initializeWorkflow(projectId);
    } catch (error) {
      console.error('Error loading project data:', error);
      throw error; // Let the store handle error state
    }
  };
  
  const handleAddCard = async (listId, title) => {
    try {
      await addCard(listId, title, board._id);
    } catch (error) {
      console.error('Error adding card:', error);
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (window.confirm('Are you sure you want to delete this card?')) {
      try {
        await deleteCard(cardId);
        closeAllModals();
      } catch (error) {
        console.error('Error deleting card:', error);
      }
    }
  };

  const handleUpdateCard = async (cardId, updates) => {
    try {
      await updateCard(cardId, updates);
    } catch (error) {
      console.error('Error updating card:', error);
    }
  };

  const handleMoveCard = async (cardId, newListId, newPosition) => {
    try {
      // Get the target list to determine new status
      const targetList = lists.find(list => list._id === newListId);
      if (!targetList) {
        console.error('Target list not found');
        return;
      }

      await moveCard(cardId, newListId, newPosition, targetList.title);

    } catch (error) {
      console.error('Error moving card:', error);
    }
  };

  const handleAddList = async (title) => {
    try {
      await addList(board._id, title);
    } catch (error) {
      console.error('Error adding list:', error);
    }
  };

  const handleDeleteList = async (listId) => {
    if (window.confirm('Are you sure you want to delete this list and all its cards?')) {
      try {
        await deleteList(listId);
      } catch (error) {
        console.error('Error deleting list:', error);
      }
    }
  };

  const handleUpdateListColor = async (listId, color) => {
    try {
      await updateListColor(listId, color);
    } catch (error) {
      console.error('Error updating list color:', error);
    }
  };

  const handleMoveList = async (listId, newPosition) => {
    try {
      await moveList(listId, newPosition);
    } catch (error) {
      console.error('Error moving list:', error);
    }
  };

  const handleOpenEditModal = async () => {
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      try {
        // Fetch full project data to ensure team members are loaded
        const response = await Database.getProject(projectId);
        if (response.success) {
          setFullProjectData(response.data);
          setSelectedProject(response.data);
          setEditModalOpen(true);
        }
      } catch (error) {
        console.error('Error fetching full project data:', error);
      }
    }
  };

  const handleProjectUpdated = (updatedProject) => {
    updateBoard({
      name: updatedProject.name,
      description: updatedProject.description
    });
  };

  const handleOpenCardModal = (card) => {
    if (!card) return;
    openHierarchyModal({
      type: 'task',
      entity: card,
      project: board
    });
  };

  const closeAllModals = () => closeHierarchy();

  const closeModalToDepth = (depth) => {
    closeHierarchyToDepth(depth);
  };

  const handleOpenChildEntity = (child, parentDepth) => {
    if (!child?.entityId || !child?.type) return;
    const entity =
      child.initialData ||
      {
        _id: child.entityId,
        id: child.entityId,
        title: child.label || 'Untitled',
        name: child.label || 'Untitled'
      };
    openHierarchyModal({
      type: child.type,
      entity,
      parentDepth
    });
  };

  const handleStackLabelUpdate = useCallback((item, label) => {
    if (!item?.entityId) return;
    updateHierarchyLabel(item.entityId, item.type, label);
  }, [updateHierarchyLabel]);
  
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
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-white">{board.name}</h1>
                  {(user?.role === 'admin' || user?.role === 'manager') && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={handleOpenEditModal}
                      className="p-1 hover:bg-white/20 rounded text-white/70 hover:text-white"
                    >
                      <Pencil size={16} />
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-white/70 text-sm">{board.description || 'Project Board'}</p>
                </div>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-lg border border-white/20 transition-colors"
                  >
                    <Users size={18} className="text-white" />
                    <span className="text-white font-medium">{board.members?.length || 0}</span>
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 bg-white/95 backdrop-blur-lg border border-white/20">
                  {board.members && board.members.length > 0 ? (
                    board.members.map((member) => {
                      const getRoleIcon = (role) => {
                        switch (role) {
                          case 'admin':
                            return <Crown size={14} className="text-yellow-500" />;
                          case 'manager':
                            return <Shield size={14} className="text-blue-500" />;
                          default:
                            return <User size={14} className="text-gray-500" />;
                        }
                      };

                      const getRoleLabel = (role) => {
                        switch (role) {
                          case 'admin':
                            return 'Admin';
                          case 'manager':
                            return 'Manager';
                          default:
                            return 'Member';
                        }
                      };

                      return (
                        <DropdownMenuItem key={member._id} className="flex items-center gap-3 px-3 py-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                            {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="flex flex-col flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{member.name || 'Unknown'}</span>
                              {getRoleIcon(member.role)}
                            </div>
                            <span className="text-xs text-gray-500">{member.email || ''}</span>
                            <span className="text-xs text-blue-600 font-medium">{getRoleLabel(member.role)}</span>
                          </div>
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <DropdownMenuItem disabled className="text-center text-gray-500">
                      No members assigned
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

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
          onCardClick={handleOpenCardModal}
          onAddList={handleAddList}
          onDeleteList={handleDeleteList}
          onUpdateListColor={handleUpdateListColor}
          onUpdateListTitle={updateListTitle}
          onMoveCard={handleMoveCard}
          onMoveList={handleMoveList}
        />
      )}

      <HierarchyModalStack
        stack={modalStack}
        onCloseAll={closeAllModals}
        onCloseToDepth={closeModalToDepth}
        onOpenChild={handleOpenChildEntity}
        onUpdateTask={handleUpdateCard}
        onDeleteTask={handleDeleteCard}
        onMoveTask={handleMoveCard}
        onLabelUpdate={handleStackLabelUpdate}
      />

      {editModalOpen && (
        <Suspense fallback={<div>Loading...</div>}>
          <EditProjectModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            project={selectedProject}
            onProjectUpdated={handleProjectUpdated}
          />
        </Suspense>
      )}
    </div>
  );
});

export default WorkFlow;
