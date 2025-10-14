import React, { useState, useContext } from 'react';
import TeamContext from '../context/TeamContext';
import Header from '../components/Header';

const TeamManagement = () => {
  const { teams, currentTeam, setCurrentTeam, createTeam, inviteUser, joinTeam } = useContext(TeamContext);
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      await createTeam(newTeamName, 'General'); // Default department
      setNewTeamName('');
      setShowCreateForm(false);
    } catch (error) {
      alert('Failed to create team');
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await inviteUser(inviteEmail);
      setInviteEmail('');
      alert('Invitation sent!');
    } catch (error) {
      alert('Failed to send invitation');
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    if (!joinToken.trim()) return;
    try {
      await joinTeam(joinToken);
      setJoinToken('');
      alert('Joined team successfully!');
    } catch (error) {
      alert('Failed to join team');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Team Management</h1>

        {/* Current Team Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Team</h2>
          <select
            value={currentTeam?._id || ''}
            onChange={(e) => setCurrentTeam(teams.find(t => t._id === e.target.value))}
            className="w-full p-2 border rounded"
          >
            {teams.map(team => (
              <option key={team._id} value={team._id}>{team.name}</option>
            ))}
          </select>
        </div>

        {/* Create Team */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {showCreateForm ? 'Cancel' : 'Create New Team'}
          </button>
          {showCreateForm && (
            <form onSubmit={handleCreateTeam} className="mt-4">
              <input
                type="text"
                placeholder="Team Name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="w-full p-2 border rounded mb-2"
                required
              />
              <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                Create Team
              </button>
            </form>
          )}
        </div>

        {/* Invite User */}
        {currentTeam && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Invite Member to {currentTeam.name}</h2>
            <form onSubmit={handleInviteUser}>
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full p-2 border rounded mb-2"
                required
              />
              <button type="submit" className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600">
                Send Invitation
              </button>
            </form>
          </div>
        )}

        {/* Join Team */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Join Team</h2>
          <form onSubmit={handleJoinTeam}>
            <input
              type="text"
              placeholder="Invitation Token"
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
              className="w-full p-2 border rounded mb-2"
              required
            />
            <button type="submit" className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600">
              Join Team
            </button>
          </form>
        </div>

        {/* Teams List */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Your Teams</h2>
          <div className="space-y-2">
            {teams.map(team => (
              <div key={team._id} className="flex justify-between items-center p-3 border rounded">
                <span>{team.name}</span>
                <span className="text-sm text-gray-500">{team.members?.length || 0} members</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamManagement;
