import React from 'react';

const LeaveContentContainer = ({ children, className = '' }) => (
  <div className={`mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 ${className}`}>
    {children}
  </div>
);

export default LeaveContentContainer;
