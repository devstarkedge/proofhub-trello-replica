import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const buildProjectWorkflowPath = (departmentId, projectId) => {
  if (!departmentId || !projectId) return null;

  return `/workflow/${encodeURIComponent(String(departmentId))}/${encodeURIComponent(String(projectId))}`;
};

const ProjectWorkflowLink = ({
  departmentId,
  projectId,
  children,
  className = '',
  style = {},
  defaultColor = 'var(--color-text-primary)',
  hoverColor = 'var(--color-primary)',
  title,
  ariaLabel,
  stopPropagation = false,
  onClick,
  underlineOnHover = true
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const to = buildProjectWorkflowPath(departmentId, projectId);
  const isInteractive = Boolean(to);
  const isActive = isHovered || isFocused;
  const resolvedTitle = title ?? (typeof children === 'string' ? children : undefined);

  const baseStyle = {
    color: isInteractive && isActive ? hoverColor : defaultColor,
    textDecoration: isInteractive && isActive && underlineOnHover ? 'underline' : 'none',
    textUnderlineOffset: '0.2em',
    transition: 'color 160ms ease, text-decoration-color 160ms ease, box-shadow 160ms ease',
    cursor: isInteractive ? 'pointer' : 'default',
    borderRadius: '0.25rem',
    boxShadow: isFocused ? '0 0 0 2px rgba(59, 130, 246, 0.22)' : 'none',
    ...style
  };

  if (!isInteractive) {
    return (
      <span className={className} style={baseStyle} title={resolvedTitle}>
        {children}
      </span>
    );
  }

  const handleClick = (event) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    onClick?.(event);
  };

  return (
    <Link
      to={to}
      className={`inline-block max-w-full align-baseline focus:outline-none ${className}`.trim()}
      style={baseStyle}
      title={resolvedTitle}
      aria-label={ariaLabel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
};

export default ProjectWorkflowLink;