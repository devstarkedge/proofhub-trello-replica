import React from 'react';
import WeeklyReport from '../../components/Finance/WeeklyReport';
import SummaryCards from '../../components/Finance/SummaryCards';

/**
 * WeeklyTab - Weekly Reports page wrapper
 */
const WeeklyTab = () => {
  return (
    <div>
      {/* Summary Cards */}
      <SummaryCards filters={{}} onCardClick={() => {}} />
      
      {/* Weekly Report */}
      <WeeklyReport viewType="users" />
    </div>
  );
};

export default WeeklyTab;
