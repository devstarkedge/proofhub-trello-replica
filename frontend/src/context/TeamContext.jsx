import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import Database from '../services/database';

const TeamContext = createContext();

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

  const loadDepartments = async () => {
    try {
      const userDepartments = await Database.getDepartments();
      setDepartments(userDepartments.data || []);
      if (userDepartments.data && userDepartments.data.length > 0) {
        // Only set currentDepartment if not already set or if current one no longer exists
        if (!currentDepartment || !userDepartments.data.find(d => d._id === currentDepartment._id)) {
          setCurrentDepartment(userDepartments.data[0]);
        }
      } else {
        setCurrentDepartment(null);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const loadTeams = async () => {
    try {
      setLoading(true);
      const userTeams = await Database.getTeams(currentDepartment?._id);
      setTeams(userTeams.data || []);
      if (userTeams.data && userTeams.data.length > 0) {
        setCurrentTeam(userTeams.data[0]); // Default to first team
      } else {
        setCurrentTeam(null); // No teams in this department
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
      await loadDepartments(); // Reload to get updated members
    } catch (error) {
      console.error('Error assigning user to department:', error);
      throw error;
    }
  };

  const unassignUserFromDepartment = async (userId) => {
    try {
      await Database.unassignUserFromDepartment(userId);
      await loadDepartments(); // Reload to get updated members
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
    <TeamContext.Provider value={{
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
    </TeamContext.Provider>
  );
};

export default TeamContext;
