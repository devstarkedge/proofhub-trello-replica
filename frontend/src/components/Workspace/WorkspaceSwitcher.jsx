import React, { useContext, useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Settings, Check, Loader } from 'lucide-react';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import useThemeStore from '../../store/themeStore';

const CreateWorkspaceWizard = lazy(() => import('./CreateWorkspaceWizard/CreateWorkspaceWizard'));
const WorkspaceOnboardingChecklist = lazy(() => import('./WorkspaceOnboardingChecklist'));

/**
 * The one and only workspace switcher in the app — lives where the app
 * logo used to sit (top-left of the sidebar, desktop and mobile). No other
 * component should render a workspace picker; Header.jsx and Sidebar.jsx's
 * nav list intentionally have theirs removed in favor of this.
 *
 * Icon behavior: a workspace with no custom icon shows the full FlowTask
 * lockup (unchanged default). The moment a workspace uploads a custom icon,
 * this swaps to [icon] + workspace name — matching Slack/Notion-style
 * per-workspace branding without needing a separate "default workspace
 * icon" asset (the FlowTask mark IS the default).
 */
const WorkspaceIcon = ({ icon, size, alt }) => {
  if (!icon?.url) return null;
  if (icon.isSvg) {
    return (
      <img
        src={icon.url}
        alt={alt}
        loading="lazy"
        style={{ width: size, height: size }}
        className="rounded-xl object-contain flex-shrink-0"
      />
    );
  }
  const srcSet = [
    icon.smallUrl && `${icon.smallUrl} 64w`,
    icon.mediumUrl && `${icon.mediumUrl} 128w`,
    icon.largeUrl && `${icon.largeUrl} 256w`,
  ].filter(Boolean).join(', ');

  return (
    <img
      src={icon.mediumUrl || icon.url}
      srcSet={srcSet || undefined}
      sizes={`${size}px`}
      alt={alt}
      loading="lazy"
      style={{ width: size, height: size }}
      className="rounded-xl object-contain flex-shrink-0 bg-gray-100 dark:bg-gray-800"
    />
  );
};

const WorkspaceSwitcher = ({ compact = false, onNavigate = () => {} }) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { workspaces, currentWorkspace, switchWorkspace } = useContext(WorkspaceContext);
  const { effectiveMode } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Authenticated users from the "Create Workspace" flow (e.g. from NoWorkspacePage
  // or if redirected after login from somewhere that set this flag) auto-open the
  // wizard once the switcher mounts without requiring the user to find it manually.
  useEffect(() => {
    if (sessionStorage.getItem('flowtask_pending_action') === 'create-workspace') {
      sessionStorage.removeItem('flowtask_pending_action');
      setShowCreateModal(true);
    }
  }, []);

  const handleSwitch = async (workspace) => {
    if (workspace._id === currentWorkspace?._id) {
      setOpen(false);
      return;
    }
    setSwitchingId(workspace._id);
    try {
      await switchWorkspace(workspace);
      setOpen(false);
    } catch (error) {
      console.error('Error switching workspace:', error);
    } finally {
      setSwitchingId(null);
    }
  };

  const goToSettings = () => {
    setOpen(false);
    onNavigate();
    navigate('/workspace-settings');
  };

  const hasCustomIcon = !!currentWorkspace?.icon?.url;
  const iconSize = compact ? 32 : 40;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-xl transition-colors hover:bg-gray-500/5 px-1 py-1"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {hasCustomIcon ? (
          <>
            <WorkspaceIcon icon={currentWorkspace.icon} size={iconSize} alt={currentWorkspace.name} />
            <div className="flex flex-col items-start min-w-0 flex-1 text-left">
              <span className={`font-bold truncate w-full ${compact ? 'text-sm' : 'text-base'}`} style={{ color: 'var(--color-text-primary)' }}>
                {currentWorkspace.name}
              </span>
              {!compact && (
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>FlowTask</span>
              )}
            </div>
          </>
        ) : (
          <img
            src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
            alt="FlowTask"
            className={compact ? 'h-9 w-auto object-contain' : 'h-14 w-auto object-contain'}
            style={{ filter: effectiveMode === 'dark' ? 'brightness(1.1)' : 'none' }}
          />
        )}
        <ChevronDown
          size={16}
          className="flex-shrink-0"
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-72 rounded-2xl shadow-2xl z-[60] overflow-hidden border"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}
          >
            {/* Current workspace */}
            {currentWorkspace && (
              <div className="p-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
                {hasCustomIcon ? (
                  <WorkspaceIcon icon={currentWorkspace.icon} size={36} alt={currentWorkspace.name} />
                ) : (
                  <img
                    src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
                    alt="FlowTask"
                    className="h-9 w-auto object-contain"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {currentWorkspace.name}
                  </div>
                  <div className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
                    {currentWorkspace.role || user?.role}
                  </div>
                </div>
              </div>
            )}

            {/* Switch workspace */}
            {workspaces.length > 1 && (
              <div className="p-2 border-b max-h-56 overflow-y-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--color-text-muted)' }}>
                  Switch Workspace
                </p>
                {workspaces.map((workspace) => {
                  const isCurrent = currentWorkspace?._id === workspace._id;
                  return (
                    <button
                      key={workspace._id}
                      onClick={() => handleSwitch(workspace)}
                      disabled={switchingId === workspace._id}
                      className="w-full text-left px-2 py-2 rounded-xl text-sm transition-colors flex items-center gap-3 disabled:opacity-60 hover:bg-gray-500/10"
                      style={{ color: isCurrent ? '#10b981' : 'var(--color-text-primary)', fontWeight: isCurrent ? 600 : 400 }}
                    >
                      {workspace.icon?.url ? (
                        <WorkspaceIcon icon={workspace.icon} size={28} alt={workspace.name} />
                      ) : (
                        <img
                          src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
                          alt=""
                          className="h-6 w-auto object-contain"
                        />
                      )}
                      <span className="flex-1 truncate">{workspace.name}</span>
                      {switchingId === workspace._id ? (
                        <Loader size={14} className="animate-spin" />
                      ) : isCurrent ? (
                        <Check size={14} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={goToSettings}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors hover:bg-gray-500/10"
                style={{ color: 'var(--color-text-primary)' }}
              >
                <Settings size={16} style={{ color: 'var(--color-text-muted)' }} />
                Workspace Settings
              </button>
              <button
                onClick={() => { setOpen(false); setShowCreateModal(true); }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors hover:bg-gray-500/10"
                style={{ color: '#10b981' }}
              >
                <Plus size={16} />
                Create Workspace
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <CreateWorkspaceWizard
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setShowOnboarding(true)}
        />
        <WorkspaceOnboardingChecklist isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </Suspense>
    </div>
  );
};

export default WorkspaceSwitcher;
