import * as React from "react";
import { useState, useRef, useEffect } from "react";

const TooltipProvider = ({ children, delayDuration = 200 }) => {
  return (
    <div className="relative inline-flex">
      {children}
    </div>
  );
};

const Tooltip = ({ children }) => {
  return <>{children}</>;
};

const TooltipTrigger = React.forwardRef(({ children, asChild, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { ref, ...props });
  }
  return (
    <span ref={ref} {...props}>
      {children}
    </span>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef(({ 
  children, 
  className = "", 
  side = "top",
  sideOffset = 4,
  ...props 
}, ref) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef(null);

  useEffect(() => {
    const parent = ref?.current?.parentElement;
    if (!parent) return;

    const trigger = parent.querySelector('[data-tooltip-trigger]');
    if (!trigger) return;

    const showTooltip = () => setIsVisible(true);
    const hideTooltip = () => setIsVisible(false);

    trigger.addEventListener('mouseenter', showTooltip);
    trigger.addEventListener('mouseleave', hideTooltip);
    trigger.addEventListener('focus', showTooltip);
    trigger.addEventListener('blur', hideTooltip);

    return () => {
      trigger.removeEventListener('mouseenter', showTooltip);
      trigger.removeEventListener('mouseleave', hideTooltip);
      trigger.removeEventListener('focus', showTooltip);
      trigger.removeEventListener('blur', hideTooltip);
    };
  }, [ref]);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`
        absolute z-[9999] px-3 py-1.5 text-xs font-medium text-white 
        bg-gray-900 rounded-lg shadow-lg whitespace-nowrap
        transition-opacity duration-200
        ${positionClasses[side] || positionClasses.top}
        ${isVisible ? 'opacity-100 visible' : 'opacity-0 invisible'}
        ${className}
      `}
      {...props}
    >
      {children}
      <div 
        className={`absolute w-2 h-2 bg-gray-900 rotate-45 ${
          side === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
          side === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
          side === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
          'right-full top-1/2 -translate-y-1/2 -mr-1'
        }`}
      />
    </div>
  );
});
TooltipContent.displayName = "TooltipContent";

// Simple hover tooltip component that's easier to use
const SimpleTooltip = ({ children, content, side = "top", className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div 
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      ref={triggerRef}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`
            absolute z-[9999] px-3 py-1.5 text-xs font-medium text-white 
            bg-gray-900 rounded-lg shadow-lg whitespace-nowrap
            animate-in fade-in-0 zoom-in-95 duration-200
            ${positionClasses[side] || positionClasses.top}
            ${className}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
};

export { 
  Tooltip, 
  TooltipTrigger, 
  TooltipContent, 
  TooltipProvider,
  SimpleTooltip 
};
