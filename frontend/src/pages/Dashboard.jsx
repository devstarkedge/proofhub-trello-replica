import React, { useState, useEffect, useContext } from 'react';
import TeamContext from '../context/TeamContext';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import Database from '../services/database';

const Dashboard = () => {
  const { currentTeam } = useContext(TeamContext);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        // Later: const depts = await Database.getDepartments();
        // For each dept, const projects = await Database.getBoardsByDepartment(dept._id);
        // Map to structure below
        const sampleDepartments = [
          {
            id: 'dept1',
            name: 'Sales Dept',
            projects: [
              {
                id: 'proj1',
                title: 'Blue Print',
                color: 'bg-blue-500',
                image: 'https://via.placeholder.com/250x150/3B82F6/FFFFFF?text=Blue+Print',
                projectId: 'proj1'
              },
              {
                id: 'proj2',
                title: 'Easy Blue Print',
                color: 'bg-blue-600',
                image: 'https://via.placeholder.com/250x150/1D4ED8/FFFFFF?text=Easy+Blue+Print',
                projectId: 'proj2'
              }
            ]
          },
          {
            id: 'dept2',
            name: 'HR Dept',
            projects: [
              {
                id: 'proj3',
                title: 'Green Project',
                color: 'bg-green-500',
                image: 'https://via.placeholder.com/250x150/10B981/FFFFFF?text=Green+Project',
                projectId: 'proj3'
              },
              {
                id: 'proj4',
                title: 'Sunset Project',
                color: 'bg-orange-500',
                image: 'https://via.placeholder.com/250x150/F59E0B/FFFFFF?text=Sunset+Project',
                projectId: 'proj4'
              }
            ]
          }
        ];
        setDepartments(sampleDepartments);
      } catch (error) {
        console.error('Error loading departments:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
  }, []);

  const handleAddProject = (deptId) => {
    // Placeholder: Open modal or navigate to create project form
    console.log(`Add project to department ${deptId}`);
    // Later: Integrate with Database.createBoard(name, { department: deptId })
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="text-xl">Loading HomePage...</div>
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
          <h1 className="text-3xl font-bold mb-8">Home - {currentTeam?.name || 'Your Projects'}</h1>
          <div className="space-y-8">
            {departments.map((dept) => (
              <section key={dept.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">{dept.name}</h2>
                  <button
                    onClick={() => handleAddProject(dept.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    + Add Project
                  </button>
                </div>
                <div className="flex overflow-x-auto space-x-4 pb-2">
                  {dept.projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      title={project.title}
                      subtitle="" // No subtitle for horizontal
                      color={project.color}
                      image={project.image}
                      deptId={dept.id}
                      projectId={project.projectId}
                      className="flex-shrink-0 w-60 h-40" // Smaller for horizontal
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
