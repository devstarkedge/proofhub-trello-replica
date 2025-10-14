import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import Database from '../services/database';

const TeamContext = createContext();

export const TeamProvider = ({ children }) => {
  const { isAuthenticated, user } = useContext(AuthContext);
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadTeams();
    } else {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const userTeams = await Database.getTeams();
      setTeams(userTeams);
      if (userTeams.length > 0) {
        setCurrentTeam(userTeams[0]); // Default to first team
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTeam = async (name, department) => {
    try {
      const newTeam = await Database.createTeam(name, department);
      setTeams(prev => [...prev, newTeam]);
      setCurrentTeam(newTeam);
      return newTeam;
    } catch (error) {
      console.error('Error creating team:', error);
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
      currentTeam,
      setCurrentTeam,
      loading,
      loadTeams,
      createTeam,
      inviteUser,
      joinTeam
    }}>
      {children}
    </TeamContext.Provider>
  );
};

export default TeamContext;
