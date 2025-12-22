import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Moon, Sun } from 'lucide-react';
import Snowfall from 'react-snowfall';
import useThemeStore from '../store/themeStore';
import NeonSparkText from './NeonSparkText';

const WelcomeHeader = ({ user }) => {
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';
  const [greeting, setGreeting] = useState('');
  const [snowOpacity, setSnowOpacity] = useState(0);
  const handRef = useRef(null);

  // Time-based greeting logic
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Snowfall fade-in effect for dark mode
  useEffect(() => {
    if (isDarkMode) {
      setTimeout(() => setSnowOpacity(1), 500);
    } else {
      setSnowOpacity(0);
    }
  }, [isDarkMode]);

  // Hand shake animation trigger
  const triggerShake = (ms) => {
    const el = handRef.current;
    if (!el) return;
    el.classList.remove('hand-shake');
    el.style.animationDuration = `${ms}ms`;
    // Force reflow
    void el.offsetWidth;
    el.classList.add('hand-shake');
    
    // Clear after duration
    setTimeout(() => {
      if (el) {
        el.classList.remove('hand-shake');
        el.style.animationDuration = '';
      }
    }, ms);
  };

  // Initial hand shake on mount
  useEffect(() => {
    const t = setTimeout(() => triggerShake(5000), 800);
    return () => clearTimeout(t);
  }, []);

  // Dynamic snowflake count based on window width
  const snowflakeCount = typeof window !== 'undefined' && window.innerWidth < 768 ? 40 : 100;

  return (
    <div className={`
      relative rounded-2xl p-8 shadow-2xl overflow-hidden
      transition-all duration-700
      animate-in fade-in slide-in-from-top-4
      ${isDarkMode 
        ? 'bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] border border-indigo-900/40' 
        : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white'}
    `}>
      {/* ==========================================
          LAYER 1: ATMOSPHERE & BACKGROUND FX
          ========================================== */}
      
      {/* DARK MODE SPECIFIC LIGHTING */}
      {isDarkMode && (
        <>
           {/* Deep atmospheric glow from top right (Moon source) */}
           <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-indigo-500/15 rounded-full blur-[100px] pointer-events-none z-0" />
           
           {/* Subtle gradient brightening towards the moon */}
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_50%)] z-0 pointer-events-none" />
        </>
      )}

      {/* GRID PATTERN OVERLAY */}
      <div 
        className={`absolute inset-0 z-0 opacity-20 pointer-events-none transition-opacity duration-500
          ${isDarkMode ? 'bg-[url("/grid-pattern-dark.svg")] opacity-10' : 'bg-[url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")]'}
        `}
      ></div>

      {/* REACT SNOWFALL (DARK MODE ONLY) */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{ opacity: isDarkMode ? snowOpacity : 0 }}
      >
        {isDarkMode && (
          <Snowfall 
            color="#e2e8f0" 
            snowflakeCount={snowflakeCount}
            radius={[0.5, 2.0]} 
            speed={[0.5, 2.0]}
            wind={[-0.5, 1.0]}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
          />
        )}
      </div>

      {/* LIGHTING OVERLAY FOR SNOW (Brightens snow near moon) */}
      {isDarkMode && (
        <div className="absolute -top-10 -right-10 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_70%)] blur-xl mix-blend-overlay z-[1] pointer-events-none" />
      )}

      {/* ==========================================
          LAYER 2: CONTENT & FOREGROUND
          ========================================== */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        
        {/* TEXT SECTION */}
        <div className="flex-1">
          {/* Badge */}
          <div className={`
             inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 
             backdrop-blur-md transition-all duration-300
             ${isDarkMode 
               ? 'bg-indigo-950/40 border border-indigo-500/20 text-indigo-200' 
               : 'bg-white/20 text-white'}
          `}>
             <Sparkles size={18} className={isDarkMode ? 'text-indigo-400' : 'text-white'} />
             <span className="text-sm font-medium tracking-wide">
               {isDarkMode ? 'Evening Flow' : 'Welcome!'}
             </span>
          </div>

          {/* Heading */}
          <h1 className={`
            text-4xl md:text-5xl font-bold mb-3 tracking-tight
            ${isDarkMode ? 'text-white' : 'text-white'}
          `}>
            {greeting},{' '}
            <NeonSparkText 
              text={user?.name?.split(' ')[0] || 'User'} 
              className={isDarkMode ? 'text-indigo-300' : 'text-yellow-200'}
            />
            <span className="text-white">!</span>{' '}
            <span
              ref={handRef}
              className="inline-block hand-emoji cursor-pointer select-none transition-transform hover:scale-110 active:scale-95 origin-bottom-right"
              onMouseEnter={() => triggerShake(3000)}
              role="img" 
              aria-label="wave"
            >
              👋
            </span>
          </h1>

          {/* Subtitle with Frosted Glass */}
          <p className={`
            text-lg max-w-xl leading-relaxed py-2 pl-4 border-l-2
            ${isDarkMode 
              ? 'text-indigo-200/80 border-indigo-500/30 bg-gradient-to-r from-indigo-900/20 to-transparent' 
              : 'text-blue-50 border-white/30'}
          `}>
            Ready to manage your projects and collaborate with your team?
          </p>
        </div>

        {/* MOON ICON (Visual Anchor for Dark Mode) */}
        {isDarkMode && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: -20, rotate: -20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: [0, -10, 0], // Gentle float
              rotate: 0 
            }}
            transition={{ 
              appearance: { duration: 1, delay: 0.5, type: 'spring' },
              y: { duration: 5, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }
            }}
            className="hidden md:block relative mr-8"
          >
             <div className="relative w-32 h-32 flex items-center justify-center">
                
                {/* Moon itself */}
                <Moon 
                  size={80} 
                  className="text-indigo-100 drop-shadow-[0_0_25px_rgba(199,210,254,0.6)] z-20" 
                  strokeWidth={1.5} 
                  fill="currentColor" // Fill helps it look more solid like a moon
                />
                
                {/* Subtle orbit rings */}
                <div className="absolute inset-0 border border-indigo-400/20 rounded-full w-full h-full animate-spin-slow z-10" style={{ animationDuration: '20s' }} />
                <div className="absolute -inset-4 border border-indigo-500/10 rounded-full w-[calc(100%+32px)] h-[calc(100%+32px)] animate-spin-slow z-0" style={{ animationDuration: '30s', animationDirection: 'reverse' }} />
             </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default WelcomeHeader;
