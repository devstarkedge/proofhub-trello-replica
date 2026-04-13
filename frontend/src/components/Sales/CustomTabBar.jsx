import React, { useMemo, useState, useRef, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Lock, Users, Globe, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import useSalesStore from '../../store/salesStore';
import AuthContext from '../../context/AuthContext';

/* ── Section Divider ── */
const Divider = ({ label }) => (
  <div className="flex items-center gap-2 px-2 shrink-0">
    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
    {label && (
      <span className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-bold select-none whitespace-nowrap">
        {label}
      </span>
    )}
  </div>
);

/* ── Portal context menu — renders at document.body to escape z-index/overflow clipping ── */
const TabContextMenu = ({ tab, anchorRect, onEdit, onDelete, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.right - 160, window.innerWidth - 168);

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
      style={{ position: 'fixed', top, left, width: 160, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl py-1 text-sm"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); onEdit(tab); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" /> Edit
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); onDelete(tab._id); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
    </motion.div>,
    document.body
  );
};

/* ── Single Custom Tab Chip ── */
const TabChip = ({ tab, isActive, onClick, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const dotBtnRef = useRef(null);

  const VisIcon = tab.visibility === 'private' ? Lock : tab.visibility === 'team' ? Users : Globe;

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = dotBtnRef.current?.getBoundingClientRect();
    if (rect) { setAnchorRect(rect); setMenuOpen(true); }
  };

  return (
    <div className="relative shrink-0 group">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 pl-3.5 pr-2 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
          isActive
            ? tab.isWatchTab
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-400/30 scale-[1.02]'
              : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-400/30 scale-[1.02]'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
        }`}
      >
        {tab.isWatchTab && <Bell className="w-3 h-3" />}
        <VisIcon className="w-3 h-3 opacity-60" />
        <span className="max-w-[120px] truncate">{tab.name}</span>

        {tab.isWatchTab && tab.unreadMatches > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
            {tab.unreadMatches > 99 ? '99+' : tab.unreadMatches}
          </span>
        )}

        {tab.approvalStatus === 'pending' && (
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Pending approval" />
        )}

        <span
          ref={dotBtnRef}
          onClick={openMenu}
          className={`ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
            isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </span>
      </button>

      <AnimatePresence>
        {menuOpen && anchorRect && (
          <TabContextMenu
            tab={tab}
            anchorRect={anchorRect}
            onEdit={onEdit}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Main CustomTabBar ── */
const CustomTabBar = ({ onEditTab, onDeleteTab }) => {
  const { user } = useContext(AuthContext);
  const {
    savedTabs, activeTabId, activateTab, deactivateTab,
    permissions,
  } = useSalesStore();

  const isAdmin = permissions?.isAdmin || user?.role === 'admin';
  const userId = user?._id || user?.id;

  const myTabs = useMemo(
    () => savedTabs.filter((t) => t.ownerId === userId && !t.isWatchTab && t.approvalStatus !== 'ignored'),
    [savedTabs, userId]
  );
  const sharedTabs = useMemo(
    () => savedTabs.filter(
      (t) => t.ownerId !== userId && !t.isWatchTab && t.approvalStatus === 'approved'
    ),
    [savedTabs, userId]
  );
  const watchTabs = useMemo(
    () => savedTabs.filter((t) => t.isWatchTab && t.approvalStatus !== 'ignored' && (t.ownerId === userId || t.approvalStatus === 'approved')),
    [savedTabs, userId]
  );
  const pendingTabs = useMemo(
    () => isAdmin ? savedTabs.filter((t) => t.approvalStatus === 'pending' && t.ownerId !== userId) : [],
    [savedTabs, isAdmin, userId]
  );

  const hasTabs = myTabs.length > 0 || sharedTabs.length > 0 || watchTabs.length > 0 || pendingTabs.length > 0;
  if (!hasTabs) return null;

  const handleTabClick = (tab) => {
    if (activeTabId === tab._id) {
      deactivateTab();
    } else {
      activateTab(tab);
    }
  };

  return (
    <div className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm border-b border-gray-200/40 dark:border-gray-700/40">
      <div className="px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
        {myTabs.length > 0 && (
          <>
            <Divider label="My Views" />
            {myTabs.map((tab) => (
              <TabChip
                key={tab._id}
                tab={tab}
                isActive={activeTabId === tab._id}
                onClick={() => handleTabClick(tab)}
                onEdit={onEditTab}
                onDelete={onDeleteTab}
              />
            ))}
          </>
        )}

        {sharedTabs.length > 0 && (
          <>
            <Divider label="Shared" />
            {sharedTabs.map((tab) => (
              <TabChip
                key={tab._id}
                tab={tab}
                isActive={activeTabId === tab._id}
                onClick={() => handleTabClick(tab)}
                onEdit={onEditTab}
                onDelete={onDeleteTab}
              />
            ))}
          </>
        )}

        {watchTabs.length > 0 && (
          <>
            <Divider label="Watch" />
            {watchTabs.map((tab) => (
              <TabChip
                key={tab._id}
                tab={tab}
                isActive={activeTabId === tab._id}
                onClick={() => handleTabClick(tab)}
                onEdit={onEditTab}
                onDelete={onDeleteTab}
              />
            ))}
          </>
        )}

        {pendingTabs.length > 0 && (
          <>
            <Divider label="Pending" />
            {pendingTabs.map((tab) => (
              <TabChip
                key={tab._id}
                tab={tab}
                isActive={activeTabId === tab._id}
                onClick={() => handleTabClick(tab)}
                onEdit={onEditTab}
                onDelete={onDeleteTab}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default CustomTabBar;
