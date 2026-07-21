import React from 'react';

const AnalyticsEntityLink = ({ href, className = '', children, ariaLabel }) => {
  if (!href) return <span className={className}>{children}</span>;
  return <a
    className={`analytics-entity-link ${className}`.trim()}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={ariaLabel}
    onClick={(event) => event.stopPropagation()}
  >{children}</a>;
};

export default AnalyticsEntityLink;
