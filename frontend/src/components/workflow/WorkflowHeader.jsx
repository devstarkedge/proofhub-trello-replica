import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Filter, Users, Pencil, FileText, Crown, Shield, User as UserIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu';
import Avatar from '../Avatar';
import WorkflowMenu from './WorkflowMenu';

const WorkflowHeader = memo(({
  board,
  user,
  searchQuery,
  onSearchChange,
  onFilterToggle,
  activeFilterCount,
  onNavigateBack,
  onEditProject,
  onDownloadCSV,
  onShowFields,
  onTrash,
  onRecurringTasks,
  onArchiveToggle,
  showArchived,
}) => {
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const getRoleIcon = useCallback((role) => {
    switch (role) {
      case 'admin': return <Crown size={14} className="text-yellow-500" />;
      case 'manager': return <Shield size={14} className="text-blue-500" />;
      default: return <UserIcon size={14} className="text-gray-500" />;
    }
  }, []);

  const getRoleLabel = useCallback((role) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      default: return 'Member';
    }
  }, []);

  return (
    <header className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg relative z-30">
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onNavigateBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white flex-shrink-0"
            >
              <ArrowLeft size={22} />
            </motion.button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md">
                  {board.name}
                </h1>
                {board.description && (
                  <FileText size={14} className="text-white/60 flex-shrink-0 hidden sm:block" title="Description available" />
                )}
                {isAdmin && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onEditProject}
                    className="p-1.5 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-colors flex-shrink-0"
                    title="Edit Project"
                  >
                    <Pencil size={15} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={onSearchChange}
                className="pl-9 pr-4 py-2 w-48 lg:w-56 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-lg transition-all"
              />
            </div>

            {/* Filter icon button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onFilterToggle}
              className="relative p-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors backdrop-blur-lg border border-white/20"
              title="Filters"
            >
              <Filter size={18} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg ring-2 ring-purple-900">
                  {activeFilterCount}
                </span>
              )}
            </motion.button>

            {/* Team Members */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-lg border border-white/20 transition-colors"
                >
                  <Users size={16} className="text-white" />
                  <span className="text-white text-sm font-medium">{board.members?.length || 0}</span>
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 bg-white/95 backdrop-blur-lg border border-white/20">
                {board.members && board.members.length > 0 ? (
                  board.members.map((member) => (
                    <DropdownMenuItem key={member._id} className="flex items-center gap-3 px-3 py-3">
                      <Avatar
                        src={member.avatar}
                        name={member.name}
                        role={member.role}
                        size="md"
                        showBadge={true}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{member.name || 'Unknown'}</span>
                          {getRoleIcon(member.role)}
                        </div>
                        <span className="text-xs text-gray-500 truncate">{member.email || ''}</span>
                        <span className="text-xs text-blue-600 font-medium">{getRoleLabel(member.role)}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="text-center text-gray-500">
                    No members assigned
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 3-Dot Enterprise Menu */}
            <WorkflowMenu
              onDownloadCSV={onDownloadCSV}
              onShowFields={onShowFields}
              onTrash={onTrash}
              onRecurringTasks={onRecurringTasks}
              onArchiveToggle={onArchiveToggle}
              showArchived={showArchived}
            />
          </div>
        </div>
      </div>
    </header>
  );
});

WorkflowHeader.displayName = 'WorkflowHeader';
export default WorkflowHeader;
