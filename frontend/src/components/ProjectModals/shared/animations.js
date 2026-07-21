export const drawerVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { 
    x: 0, 
    opacity: 1,
    transition: { type: 'spring', damping: 30, stiffness: 300 } 
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } }
};

export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};
