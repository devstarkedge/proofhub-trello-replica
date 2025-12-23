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

  // Star fade-in effect for dark mode
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
    void el.offsetWidth;
    el.classList.add('hand-shake');
    
    setTimeout(() => {
      if (el) {
        el.classList.remove('hand-shake');
        el.style.animationDuration = '';
      }
    }, ms);
  };

  useEffect(() => {
    const t = setTimeout(() => triggerShake(5000), 800);
    return () => clearTimeout(t);
  }, []);

  // Stars configuration (was snowfall)
  const snowflakeCount = typeof window !== 'undefined' && window.innerWidth < 768 ? 60 : 150;

  return (
    <div className={`
      relative rounded-3xl p-8 shadow-2xl overflow-hidden
      transition-all duration-700
      animate-in fade-in slide-in-from-top-4
      ${isDarkMode 
        ? 'bg-[#0f172a] border border-indigo-900/40' 
        : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white'}
    `}>
      {/* ==========================================
          LAYER 1: DEEP SPACE ATMOSPHERE
          ========================================== */}
      
      {isDarkMode && (
        <>
           {/* Deep Space Background Gradient */}
           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,27,75,0.8),transparent_70%)] z-0" />
           
           {/* Nebula Clouds */}
           <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-purple-900/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse-slow" />
           <div className="absolute bottom-0 left-0 w-[600px] h-[500px] bg-blue-900/10 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
           
           {/* Shooting Stars Container */}
           <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
             <div className="shooting-star" style={{ top: '10%', left: '20%', animationDelay: '0s' }}></div>
             <div className="shooting-star" style={{ top: '25%', left: '70%', animationDelay: '4s' }}></div>
             <div className="shooting-star" style={{ top: '40%', left: '90%', animationDelay: '7s' }}></div>
           </div>
        </>
      )}

      {/* REACT SNOWFALL configured as STARS */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{ opacity: isDarkMode ? snowOpacity : 0 }}
      >
        {isDarkMode && (
          <Snowfall 
            color="#ffffff" 
            snowflakeCount={snowflakeCount}
            radius={[0.5, 1.5]} // Smaller radius for stars
            speed={[0.0, 0.2]} // Very slow movement for stars
            wind={[0, 0.1]}     // Minimal wind
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            opacity={[0.4, 0.9]}
          />
        )}
      </div>

      {/* ==========================================
          LAYER 2: CONTENT & FOREGROUND
          ========================================== */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        
        {/* TEXT SECTION */}
        <div className="flex-1">
          {/* Badge */}
          <div className={`
             inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6
             backdrop-blur-md transition-all duration-300 shadow-lg border
             ${isDarkMode 
               ? 'bg-slate-900/50 border-indigo-500/30 text-indigo-300' 
               : 'bg-white/20 border-white/20 text-white'}
          `}>
             <Sparkles size={16} className={isDarkMode ? 'text-indigo-400' : 'text-white'} />
             <span className="text-xs font-bold uppercase tracking-widest">
               {isDarkMode ? 'Late Night Flow' : 'Welcome'}
             </span>
          </div>

          {/* Heading */}
          <h1 className={`
            text-4xl md:text-5xl font-bold mb-3 tracking-tight
            ${isDarkMode ? 'text-white drop-shadow-lg' : 'text-white'}
          `}>
            {greeting},{' '}
            <div className="inline-block">
              <NeonSparkText 
                text={user?.name?.split(' ')[0] || 'User'} 
                className={isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300' : 'text-yellow-200'}
              />
            </div>
            {' '}
            <span
              ref={handRef}
              className="inline-block hand-emoji cursor-pointer select-none hover:rotate-12 transition-transform duration-300 origin-bottom-right"
              onMouseEnter={() => triggerShake(3000)}
              role="img" 
              aria-label="wave"
            >
              👋
            </span>
          </h1>

          {/* Subtitle */}
          <p className={`
            text-lg max-w-xl leading-relaxed py-2 pl-4 border-l-2
            ${isDarkMode 
              ? 'text-indigo-200/80 border-indigo-500/30 bg-gradient-to-r from-indigo-900/20 to-transparent' 
              : 'text-blue-50 border-white/30'}
          `}>
            Ready to manage your projects and collaborate with your team?
          </p>
        </div>

        {/* REALISTIC MOON (CSS ART) */}
        {isDarkMode && (
          <div className="hidden md:block relative mr-12 perspective-1000">
             {/* Glow behind moon */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl z-0"></div>
             
             {/* The Moon */}
             <div className="moon-container relative w-32 h-32 z-10 animate-float-slow">
                <div className="moon-surface w-full h-full rounded-full overflow-hidden relative shadow-[inset_-10px_-10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(200,200,255,0.4)]">
                  {/* Craters */}
                  <div className="absolute top-[20%] left-[25%] w-6 h-6 rounded-full bg-slate-400/20 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4)]"></div>
                  <div className="absolute top-[60%] left-[60%] w-10 h-10 rounded-full bg-slate-400/20 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.4)]"></div>
                  <div className="absolute top-[35%] left-[65%] w-4 h-4 rounded-full bg-slate-400/30 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.4)]"></div>
                  <div className="absolute bottom-[20%] left-[30%] w-8 h-8 rounded-full bg-slate-400/10 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3)]"></div>
                  
                  {/* Texture Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 opacity-90 mix-blend-overlay"></div>
                </div>
             </div>
          </div>
        )}
      </div>

      <style jsx="true">{`
        .perspective-1000 { perspective: 1000px; }
        
        .moon-surface {
          background: #e2e8f0;
        }

        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
        }
        .animate-float-slow {
          animation: floatSlow 6s ease-in-out infinite;
        }

        @keyframes pulseSlow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
        .animate-pulse-slow {
          animation: pulseSlow 8s ease-in-out infinite;
        }

        /* Shooting Star Animation */
        .shooting-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 10px 2px rgba(255, 255, 255, 0.4);
          opacity: 0;
          animation: shoot 5s linear infinite;
        }
        .shooting-star::before {
          content: '';
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          left: 0;
          width: 80px;
          height: 3px;
          background: linear-gradient(90deg, white, transparent);
        }

        @keyframes shoot {
          0% {
            transform: translate(0, 0) rotate(-45deg);
            opacity: 0;
          }
          5% {
             opacity: 1;
          }
          20% {
            transform: translate(-200px, 200px) rotate(-45deg);
            opacity: 0;
          }
          100% {
            transform: translate(-200px, 200px) rotate(-45deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default WelcomeHeader;
