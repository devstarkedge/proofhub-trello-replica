import React, { useState, useEffect, useContext } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';

const CalendarView = () => {
  const { currentTeam } = useContext(TeamContext);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTeam) {
      loadEvents();
    }
  }, [currentTeam]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      let allCards = [];
      // Get all boards for the team, then all lists, then all cards with due dates
      const boards = await Database.getBoards();
      for (const board of boards) {
        const lists = await Database.getLists(board._id);
        for (const list of lists) {
          const listCards = await Database.getCards(list._id);
          allCards = allCards.concat(listCards.filter(card => card.dueDate));
        }
      }

      const calendarEvents = allCards.map(card => ({
        id: card._id,
        title: `${card.title} (${card.priority})`,
        start: new Date(card.dueDate),
        backgroundColor: getPriorityColor(card.priority),
        borderColor: getPriorityColor(card.priority),
        extendedProps: {
          assignee: card.assignee?.name || 'Unassigned',
          status: card.listName,
          description: card.description
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
    // Open card detail modal or navigate to card
    console.log('Event clicked:', info.event.extendedProps);
    alert(`Task: ${info.event.title}\nAssignee: ${info.event.extendedProps.assignee}\nStatus: ${info.event.extendedProps.status}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading calendar...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Calendar View - {currentTeam?.name}</h1>
        </div>

        <div className="bg-white rounded-lg shadow">
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
          />
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
