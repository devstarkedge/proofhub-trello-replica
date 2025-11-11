import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import Database from '../services/database';
import socketService from '../services/socket';

const DepartmentContext = createContext();

export const TeamProvider = ({ children }) => {
  const { isAuthenticated, user } = useContext(AuthContext);
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [currentDepartment, setCurrentDepartment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadDepartments();
      loadTeams();
    } else {
      setTeams([]);
      setDepartments([]);
      setCurrentTeam(null);
      setCurrentDepartment(null);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user && currentDepartment) {
      loadTeams();
    }
  }, [currentDepartment]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    const handleUserAssigned = (event) => {
      const { userId, departmentId } = event.detail;
      console.log('User assigned to department:', userId, departmentId);
      // Update local state immediately
      setDepartments(prev => prev.map(dept =>
        dept._id === departmentId
          ? { ...dept, members: [...(dept.members || []), userId] }
          : dept
      ));
      // Also update currentDepartment if it's the one being modified
      if (currentDepartment && currentDepartment._id === departmentId) {
        setCurrentDepartment(prev => ({
          ...prev,
          members: [...(prev.members || []), userId]
        }));
      }
    };

    const handleUserUnassigned = (event) => {
      const { userId, departmentId } = event.detail;
      console.log('User unassigned from department:', userId, departmentId);
      // Update local state immediately
      setDepartments(prev => prev.map(dept =>
        dept._id === departmentId
          ? { ...dept, members: (dept.members || []).filter(id => id !== userId) }
          : dept
      ));
      // Also update currentDepartment if it's the one being modified
      if (currentDepartment && currentDepartment._id === departmentId) {
        setCurrentDepartment(prev => ({
          ...prev,
          members: (prev.members || []).filter(id => id !== userId)
        }));
      }
    };

    // Add event listeners
    window.addEventListener('socket-user-assigned', handleUserAssigned);
    window.addEventListener('socket-user-unassigned', handleUserUnassigned);

    // Cleanup
    return () => {
      window.removeEventListener('socket-user-assigned', handleUserAssigned);
      window.removeEventListener('socket-user-unassigned', handleUserUnassigned);
    };
  }, [currentDepartment]);

  const loadDepartments = async () => {
    try {
      const userDepartments = await Database.getDepartments();
      const depts = userDepartments.data || [];
      // Add "All Departments" option at the top
      const allDepartmentsOption = { _id: 'all', name: 'All Departments' };
      setDepartments([allDepartmentsOption, ...depts]);
      if (depts.length > 0) {
        // Only set currentDepartment if not already set or if current one no longer exists
        if (!currentDepartment || (!userDepartments.data.find(d => d._id === currentDepartment._id) && currentDepartment._id !== 'all')) {
          setCurrentDepartment(allDepartmentsOption);
        }
      } else {
        setCurrentDepartment(allDepartmentsOption);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const loadTeams = async () => {
    try {
      setLoading(true);
      // Only load teams if a specific department is selected (not "all")
      if (currentDepartment && currentDepartment._id !== 'all') {
        const userTeams = await Database.getTeams(currentDepartment._id);
        setTeams(userTeams.data || []);
        if (userTeams.data && userTeams.data.length > 0) {
          setCurrentTeam(userTeams.data[0]); // Default to first team
        } else {
          setCurrentTeam(null); // No teams in this department
        }
      } else {
        setTeams([]);
        setCurrentTeam(null);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const createDepartment = async (name, description, managerId) => {
    try {
      const newDept = await Database.createDepartment(name, description, managerId);
      setDepartments(prev => [...prev, newDept.data]);
      setCurrentDepartment(newDept.data);
      return newDept.data;
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  };

  const updateDepartment = async (id, updates) => {
    try {
      const updatedDept = await Database.updateDepartment(id, updates);
      setDepartments(prev => prev.map(dept => dept._id === id ? updatedDept.data : dept));
      if (currentDepartment && currentDepartment._id === id) {
        setCurrentDepartment(updatedDept.data);
      }
      return updatedDept.data;
    } catch (error) {
      console.error('Error updating department:', error);
      throw error;
    }
  };

  const deleteDepartment = async (id) => {
    try {
      await Database.deleteDepartment(id);
      setDepartments(prev => prev.filter(dept => dept._id !== id));
      if (currentDepartment && currentDepartment._id === id) {
        setCurrentDepartment(departments.find(dept => dept._id !== id) || null);
      }
    } catch (error) {
      console.error('Error deleting department:', error);
      throw error;
    }
  };

  const createTeam = async (name, department, description) => {
    try {
      const newTeam = await Database.createTeam(name, department, description);
      setTeams(prev => [...prev, newTeam.data]);
      setCurrentTeam(newTeam.data);
      return newTeam.data;
    } catch (error) {
      console.error('Error creating team:', error);
      throw error;
    }
  };

  const updateTeam = async (id, updates) => {
    try {
      const updatedTeam = await Database.updateTeam(id, updates);
      setTeams(prev => prev.map(team => team._id === id ? updatedTeam.data : team));
      if (currentTeam && currentTeam._id === id) {
        setCurrentTeam(updatedTeam.data);
      }
      return updatedTeam.data;
    } catch (error) {
      console.error('Error updating team:', error);
      throw error;
    }
  };

  const deleteTeam = async (id) => {
    try {
      await Database.deleteTeam(id);
      setTeams(prev => prev.filter(team => team._id !== id));
      if (currentTeam && currentTeam._id === id) {
        setCurrentTeam(teams.find(team => team._id !== id) || null);
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      throw error;
    }
  };

  const assignUserToDepartment = async (userId, deptId) => {
    try {
      await Database.assignUserToDepartment(userId, deptId);
      // Update local state immediately instead of reloading
      setDepartments(prev => prev.map(dept =>
        dept._id === deptId
          ? { ...dept, members: [...(dept.members || []), userId] }
          : dept
      ));
      // Also update currentDepartment if it's the one being modified
      if (currentDepartment && currentDepartment._id === deptId) {
        setCurrentDepartment(prev => ({
          ...prev,
          members: [...(prev.members || []), userId]
        }));
      }
    } catch (error) {
      console.error('Error assigning user to department:', error);
      throw error;
    }
  };

  const unassignUserFromDepartment = async (userId, deptId) => {
    try {
      await Database.unassignUserFromDepartment(userId, deptId);
      // Update local state immediately instead of reloading
      setDepartments(prev => prev.map(dept =>
        dept._id === deptId
          ? { ...dept, members: (dept.members || []).filter(id => id !== userId) }
          : dept
      ));
      // Also update currentDepartment if it's the one being modified
      if (currentDepartment && currentDepartment._id === deptId) {
        setCurrentDepartment(prev => ({
          ...prev,
          members: (prev.members || []).filter(id => id !== userId)
        }));
      }
    } catch (error) {
      console.error('Error unassigning user from department:', error);
      throw error;
    }
  };

  const assignUserToTeam = async (userId, teamId) => {
    try {
      await Database.assignUserToTeam(userId, teamId);
      await loadTeams(); // Reload to get updated members
    } catch (error) {
      console.error('Error assigning user to team:', error);
      throw error;
    }
  };

  const inviteUser = async (email) => {
    if (!currentTeam) throw new Error('No current team selected');
    try {
      await Database.inviteUser(currentTeam._id, email);
    } catch (error) {
      console.error('Error inviting user:', error);
      throw error;
    }
  };

  const joinTeam = async (token) => {
    try {
      await Database.joinTeam(token);
      await loadTeams(); // Reload teams after joining
    } catch (error) {
      console.error('Error joining team:', error);
      throw error;
    }
  };

  return (
    <DepartmentContext.Provider value={{
      teams,
      departments,
      currentTeam,
      currentDepartment,
      setCurrentTeam,
      setCurrentDepartment,
      loading,
      loadTeams,
      loadDepartments,
      createDepartment,
      updateDepartment,
      deleteDepartment,
      createTeam,
      updateTeam,
      deleteTeam,
      assignUserToDepartment,
      unassignUserFromDepartment,
      assignUserToTeam,
      inviteUser,
      joinTeam
    }}>
      {children}
    </DepartmentContext.Provider>
  );
};

export default DepartmentContext;
