import React from 'react';

const LeaveContentContainer = ({ children, className = '' }) => {
  const hasCustomPy = className.includes('!py-') || className.includes('py-');
  const hasCustomPx = className.includes('!px-') || className.includes('px-');
  return (
    <div
      className={`mx-auto w-full max-w-[1600px] ${hasCustomPx ? '' : 'px-4 sm:px-6 lg:px-8'} ${hasCustomPy ? '' : 'py-5 sm:py-6'} ${className}`}
    >
      {children}
    </div>
  );
};

export default LeaveContentContainer;
