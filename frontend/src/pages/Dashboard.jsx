import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import WorkFlow from './WorkFlow';

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { currentTeam, currentDepartment, departments, loadDepartments } = useContext(TeamContext);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    if (departments.length > 0) {
      loadProjects();
    }
  }, [departments, selectedDepartment]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const allProjects = [];

      // Load boards for each department
      for (const dept of departments) {
        try {
          const response = await Database.getBoardsByDepartment(dept._id);
          const boards = response.data || [];

          for (const board of boards) {
            try {
              // Get cards to calculate progress and status
              const cardsResponse = await Database.getCardsByBoard(board._id);
              const cards = cardsResponse.data || [];

              const totalCards = cards.length;
              const completedCards = cards.filter(card => card.status === 'done').length;
              const progress = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

              let status = 'Planning';
              if (progress === 100) {
                status = 'Completed';
              } else if (progress > 0) {
                status = 'In Progress';
              }

              // Get latest due date from cards
              const dueDates = cards.map(card => card.dueDate).filter(date => date).sort((a, b) => new Date(b) - new Date(a));
              const dueDate = dueDates.length > 0 ? new Date(dueDates[0]).toISOString().split('T')[0] : null;

              allProjects.push({
                id: board._id,
                name: board.name,
                description: board.description || 'Project description',
                department: dept.name,
                team: board.team?.name || currentTeam?.name || 'General',
                progress: progress,
                dueDate: dueDate,
                status: status,
                departmentId: dept._id
              });
            } catch (cardError) {
              console.error(`Error loading cards for board ${board.name}:`, cardError);
              // Fallback with default values
              allProjects.push({
                id: board._id,
                name: board.name,
                description: board.description || 'Project description',
                department: dept.name,
                team: board.team?.name || currentTeam?.name || 'General',
                progress: 0,
                dueDate: null,
                status: 'Planning',
                departmentId: dept._id
              });
            }
          }
        } catch (error) {
          console.error(`Error loading boards for department ${dept.name}:`, error);
        }
      }

      setProjects(allProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = selectedDepartment
    ? projects.filter(p => p.departmentId === selectedDepartment)
    : projects;

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Planning': return 'bg-yellow-100 text-yellow-800';
      case 'Review': return 'bg-purple-100 text-purple-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="text-xl">Loading dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">Welcome back, {user?.name}!</p>
            </div>
            <div className="flex items-center space-x-4">
              {currentTeam && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Current Team</p>
                  <p className="font-medium">{currentTeam.name}</p>
                </div>
              )}
              <Link
                to="/WorkFlow"
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                View Workflow
              </Link>
            </div>
          </div>

          {/* Department Filter */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Department</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full max-w-xs p-2 border rounded"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept._id} value={dept._id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Projects</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredProjects.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Completed</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredProjects.filter(p => p.status === 'Completed').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">In Progress</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredProjects.filter(p => p.status === 'In Progress').length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Team Members</p>
                  <p className="text-2xl font-bold text-gray-900">{currentTeam?.members?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Projects Grid */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Projects</h2>
              <div className="flex space-x-2">
                <button className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">All</button>
                <button className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">Active</button>
                <button className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">Completed</button>
              </div>
            </div>
            {filteredProjects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No projects found. Create your first project in the workflow.</p>
                <Link
                  to="/workflow"
                  className="inline-block mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Go to Workflow
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(project => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
