import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { X, Calendar, User, Clock } from 'lucide-react';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';

const CalendarView = () => {
  const { currentDepartment } = useContext(TeamContext);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);

  useEffect(() => {
    if (currentDepartment) {
      loadEvents();
    } else {
      setEvents([]);
      setLoading(false);
    }
  }, [currentDepartment]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const response = await Database.getCardsByDepartment(currentDepartment._id);
      const allCards = response.data || [];

      const calendarEvents = allCards
        .filter(card => card.dueDate)
        .map(card => ({
          id: card._id,
          title: card.title,
          start: new Date(card.dueDate),
          backgroundColor: getPriorityColor(card.priority),
          borderColor: getPriorityColor(card.priority),
          extendedProps: {
            assignee: card.assignees && card.assignees.length > 0 ? card.assignees[0].name : 'Unassigned',
            status: card.list?.title || 'N/A',
            description: card.description,
            priority: card.priority
          }
        }));

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#EF4444';
      case 'Medium': return '#F59E0B';
      case 'Low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const handleEventClick = (info) => {
    setSelectedEvent(info.event);
    setShowEventModal(true);
  };

  const closeEventModal = () => {
    setShowEventModal(false);
    setSelectedEvent(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendar View</h1>
          <p className="text-gray-600">
            {currentDepartment ? `Task deadlines and schedules for ${currentDepartment.name}` : 'Select a department to view the calendar'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-lg p-6"
        >
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-xl">Loading calendar...</div>
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              eventClick={handleEventClick}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              height="auto"
              eventDisplay="block"
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              eventClassNames="cursor-pointer hover:opacity-80 transition-opacity"
            />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 bg-white rounded-xl shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Priority Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-sm text-gray-600">High Priority</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-sm text-gray-600">Medium Priority</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm text-gray-600">Low Priority</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 rounded"></div>
              <span className="text-sm text-gray-600">Default</span>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showEventModal && selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={closeEventModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Task Details</h3>
                  <button
                    onClick={closeEventModal}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Title</h4>
                    <p className="text-gray-700">{selectedEvent.title}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <User size={16} className="text-gray-500" />
                        <span className="font-semibold text-gray-900">Assignee</span>
                      </div>
                      <p className="text-gray-700">{selectedEvent.extendedProps.assignee}</p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={16} className="text-gray-500" />
                        <span className="font-semibold text-gray-900">Status</span>
                      </div>
                      <p className="text-gray-700">{selectedEvent.extendedProps.status}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar size={16} className="text-gray-500" />
                      <span className="font-semibold text-gray-900">Due Date</span>
                    </div>
                    <p className="text-gray-700">
                      {new Date(selectedEvent.start).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>

                  {selectedEvent.extendedProps.description && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Description</h4>
                      <p className="text-gray-700 text-sm">{selectedEvent.extendedProps.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarView;