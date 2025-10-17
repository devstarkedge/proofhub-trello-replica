import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ProjectCard from '../components/ProjectCard';
import AddProjectModal from '../components/AddProjectModal';

const baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const HomePage = () => {
  const { user } = useContext(AuthContext);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await Database.getDepartments();
      setDepartments(response.data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
      setError('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = (departmentId) => {
    setSelectedDepartment(departmentId);
    setModalOpen(true);
  };

  const handleProjectAdded = (newProject) => {
    setDepartments(prev => prev.map(dept => {
      if (dept._id === selectedDepartment) {
        return {
          ...dept,
          projects: [...(dept.projects || []), newProject]
        };
      }
      return dept;
    }));
  };

  const canAddProject = user?.role === 'admin' || user?.role === 'manager';

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">{error}</div>
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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Home</h1>
            <p className="text-gray-600 mt-1">Welcome back, {user?.name}!</p>
          </div>

          {departments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No departments found.</p>
              <p className="text-gray-400 mt-2">Contact your administrator to create departments.</p>
            </div>
          ) : (
            <div className="space-y-8 overflow-y-auto max-h-[calc(100vh-200px)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              {departments.map((department) => (
                <motion.div
                  key={department._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {department.name}
                    </h2>
                    {canAddProject && (
                      <button
                        onClick={() => handleAddProject(department._id)}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Project</span>
                      </button>
                    )}
                  </div>
                  {department.description && (
                    <p className="text-gray-600 mb-4">{department.description}</p>
                  )}

                  {department.projects && department.projects.length > 0 ? (
                    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 pb-2">
                      <div className="flex space-x-4 min-w-max">
                        {department.projects.map((project) => (
                          <motion.div
                            key={project._id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                            className="flex-shrink-0 w-80"
                          >
                            <ProjectCard
                              title={project.name}
                              subtitle={project.description || 'Project description'}
                              color={`bg-[${project.background || '#6366f1'}]`}
                              image={project.attachments && project.attachments.length > 0 ? `${baseURL}/uploads/${project.attachments[0].filename}` : undefined}
                              deptId={department._id}
                              projectId={project._id}
                            />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No projects in this department yet.
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>

      <AddProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        departmentId={selectedDepartment}
        onProjectAdded={handleProjectAdded}
      />
    </div>
  );
};

export default HomePage;
