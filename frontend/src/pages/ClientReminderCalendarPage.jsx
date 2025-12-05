import React, { useContext, memo } from 'react';
import { motion } from 'framer-motion';
import { Bell, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { ModernCalendarGrid } from '../components/calendar';
import AuthContext from '../context/AuthContext';
import DepartmentContext from '../context/DepartmentContext';
import ReminderModal from '../components/ReminderModal';

/**
 * ClientReminderCalendarPage - Dedicated full-page client reminder calendar
 * Enterprise-level calendar for managing follow-up reminders
 * Accessible via /reminder-calendar route for Admin and Manager roles
 */
const ClientReminderCalendarPage = memo(() => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { currentDepartment, departments } = useContext(DepartmentContext);
  
  // Check if user can access this page
  const canAccess = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager';

  // Modal state for reminder editing
  const [showReminderModal, setShowReminderModal] = React.useState(false);
  const [selectedReminder, setSelectedReminder] = React.useState(null);
  const [selectedProject, setSelectedProject] = React.useState(null);

  // Handle reminder selection from calendar
  const handleSelectReminder = (reminder) => {
    setSelectedReminder(reminder);
    setSelectedProject({
      id: reminder.project?._id,
      _id: reminder.project?._id,
      name: reminder.project?.name
    });
    setShowReminderModal(true);
  };

  // Access denied view
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to access this page.</p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/')}
              className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              Go to Home
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-center gap-4 mb-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-white/80 rounded-xl transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </motion.button>
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30">
                <Bell className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Client Reminder Calendar
                </h1>
                <p className="text-gray-500 mt-1">
                  Manage follow-up reminders for completed projects
                </p>
              </div>
            </div>
          </motion.div>

          {/* Modern Calendar Grid */}
          <ModernCalendarGrid
            departmentId={currentDepartment?._id !== 'all' ? currentDepartment?._id : null}
            departments={departments.filter(d => d._id !== 'all')}
            onSelectReminder={handleSelectReminder}
          />
        </main>
      </div>

      {/* Reminder Modal */}
      {showReminderModal && selectedProject && (
        <ReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedReminder(null);
            setSelectedProject(null);
          }}
          projectId={selectedProject._id}
          projectName={selectedProject.name}
          clientInfo={{
            clientName: selectedReminder?.client?.name || '',
            clientEmail: selectedReminder?.client?.email || '',
            clientWhatsappNumber: selectedReminder?.client?.phone || ''
          }}
          existingReminder={selectedReminder}
          onReminderCreated={() => {
            setShowReminderModal(false);
            // Calendar will auto-refresh
          }}
        />
      )}
    </div>
  );
});

ClientReminderCalendarPage.displayName = 'ClientReminderCalendarPage';

export default ClientReminderCalendarPage;
