import { createElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import {
  X,
  Briefcase,
  CheckSquare,
  ListTodo,
  User,
  PlusCircle,
  FolderKanban,
  ChevronDown,
  Layers,
  History,
  AlertCircle,
  Info,
  Loader2,
  LogIn,
  Link2
} from 'lucide-react';
import {
  createAgenda,
  createWorkTask,
  errorMessage
} from '../../services/trackingApi';
import useWorkSelectionData from '../../hooks/useWorkSelectionData';
import {invalidateWorkSelections,workSelectionStore} from '../../services/workSelectionState';
import { formatTrackingClock } from '../../utils/duration';

export default function WorkSelectionDialog({
  onClose,
  onConfirm,
  checkingIn = false,
  linking = false,
  currentSession = null,
  attendanceOnly = false,
  workModeControl = null
}) {
  const [mode, setMode] = useState('ASSIGNED');
  const index=useWorkSelectionData(mode==='CREATE'?'CREATE':'ASSIGNED',!attendanceOnly);
  const agendaData=useWorkSelectionData('agendas',!attendanceOnly);
  const [projectId, setProjectId] = useState(()=>index.value?.projectId||index.value?.projects?.find(p=>p.hasAssignedTasks)?._id||'');
  const projectData=useWorkSelectionData(`project:${projectId}`,!attendanceOnly&&Boolean(projectId)&&!(index.loading&&projectId===index.value?.projectId));
  const options={projects:index.value?.projects||[],tasks:projectData.value?.tasks||[],lists:projectData.value?.lists||[],canCreateTasks:index.value?.canCreateTasks};
  const agendas=agendaData.value?.agendas||[];
  const [moreBusy,setMoreBusy]=useState(false);
  const optionsLoading=!index.value&&index.loading;
  const tasksLoading=Boolean(projectId)&&!projectData.value&&projectData.loading;
  const [agendaId, setAgendaId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [listId, setListId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agendaTitle, setAgendaTitle] = useState('');
  const [creatingAgenda, setCreatingAgenda] = useState(false);
  const [includePrevious, setIncludePrevious] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(crypto.randomUUID());
  const creation = useRef(crypto.randomUUID());
  const heading = useRef(null);
  const saving = useRef(false);

  useEffect(()=>{
    const value=index.value;
    if(!value)return;
    if(!projectId&&value.projects?.length)setProjectId(value.projectId||value.projects[0]._id);
    if(projectId&&!value.projects.some(p=>p._id===projectId)){setProjectId('');setTaskId('');}
  },[index.value,projectId]);
  useEffect(()=>{const items=agendaData.value?.agendas||[];if(!agendaId&&items.length)setAgendaId(items.find(a=>a.title==='Learning')?._id||items[0]._id);},[agendaData.value,agendaId]);
  useEffect(() => {
    const before = document.activeElement;
    heading.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(()=>{setTaskId('');setListId('');},[projectId,index.scope]);
  useEffect(()=>{
    if(!projectData.value)return;
    if(!listId)setListId(projectData.value.lists?.[0]?._id||'');
    if(taskId&&!projectData.value.tasks.some(t=>t._id===taskId))setTaskId('');
  },[projectData.value,taskId,listId]);
  const loadMore=async(store)=>{if(moreBusy)return;setMoreBusy(true);try{await store.loadMore();}catch(e){setError(errorMessage(e));}finally{setMoreBusy(false);}};
  const project = options.projects.find((p) => p._id === projectId);
  const last = currentSession?.segments.at(-1);
  const needsDecision = linking || Boolean(last?.agenda && mode !== 'INDIVIDUAL');

  let rangeStart = last?.startedAt;
  let rangeSeconds = last
    ? Math.max(0, ((last.endedAt ? +new Date(last.endedAt) : Date.now()) - +new Date(last.startedAt)) / 1000)
    : 0;

  for (let i = (currentSession?.segments.length || 0) - 2; i >= 0; i--) {
    const s = currentSession.segments[i];
    if (
      !last?.agenda ||
      s.agenda !== last.agenda ||
      s.description !== last.description ||
      +new Date(s.endedAt) !== +new Date(rangeStart)
    )
      break;
    rangeSeconds += (+new Date(s.endedAt) - +new Date(s.startedAt)) / 1000;
    rangeStart = s.startedAt;
  }

  const valid =
    mode === 'INDIVIDUAL'
      ? agendaId && description.trim()
      : project && (mode === 'CREATE' ? project.canCreate && options.lists.some(l=>l._id===listId) && title.trim() : options.tasks.some(t=>t.assigned&&t._id===taskId));

  const confirm = async (onlyAttendance = false) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (onlyAttendance) {
        if ((await onConfirm(null, operation.current)) !== false) onClose();
        return;
      }
      let selection =
        mode === 'INDIVIDUAL'
          ? { mode, agendaId, description }
          : { mode: 'ASSIGNED', projectId, taskId };

      if (mode === 'CREATE') {
        try {
          const created = await createWorkTask({
            projectId,
            listId,
            title,
            description,
            operationId: creation.current
          });
          selection.taskId = created._id;
        } catch (error) {
          if (!checkingIn) throw error;
          if ((await onConfirm(null, operation.current)) !== false) {
            toast.warning(
              `Attendance is checked in. Task creation failed: ${errorMessage(error)}. Use Start work to retry.`
            );
            onClose();
          }
          return;
        }
      }

      if (needsDecision) selection.includePrevious = includePrevious;
      if ((await onConfirm(selection, operation.current)) !== false) onClose();
    } catch (e) {
      setError(errorMessage(e));
      if([403,404,409].includes(e.response?.status)){invalidateWorkSelections(index.scope,true);index.store.ensure();if(projectId)projectData.store.ensure();agendaData.store.ensure();}
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const requestClose = () => {
    if (!busy && !saving.current) onClose();
  };

  const keyDown = (e) => {
    if (e.key === 'Escape') requestClose();
    if (e.key === 'Tab') {
      const nodes = [...e.currentTarget.querySelectorAll('button:not([disabled]),input,select,textarea')];
      const first = nodes[0];
      const lastNode = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastNode?.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const dialogTitle = linking
    ? 'Link Agenda to Task'
    : checkingIn
    ? attendanceOnly
      ? 'Check In'
      : 'Check In & Work Selection'
    : 'Choose Your Work';

  const dialogSubtitle = checkingIn
    ? attendanceOnly
      ? 'Confirm your shift check-in to get started'
      : 'Confirm your attendance and select a task to track'
    : linking
    ? 'Select an assigned task to attach to your recent tracking session'
    : 'Select an assigned task or individual agenda to start tracking time';

  const assignedTasksCount = options.tasks.filter((t) => t.assigned).length;

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onKeyDown={keyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-selection-title"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'var(--color-card-bg, #ffffff)',
          color: 'var(--color-text-primary, #0f172a)',
          borderColor: 'var(--color-border-default, rgba(0,0,0,0.1))'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 shadow-sm border border-blue-100/60 dark:border-blue-800/40">
              {linking ? (
                <Link2 className="w-5 h-5" />
              ) : checkingIn ? (
                <LogIn className="w-5 h-5" />
              ) : (
                <Briefcase className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2
                ref={heading}
                tabIndex={-1}
                id="work-selection-title"
                className="font-bold text-base text-gray-900 dark:text-gray-100 outline-none"
              >
                {dialogTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{dialogSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={requestClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-4.5 overflow-y-auto flex-1">
          {/* Work Mode Banner */}
          {checkingIn && workModeControl && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Work Mode
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                  (Today&apos;s location)
                </span>
              </div>
              <div className="welcome-check-in-mode text-xs font-medium">
                {workModeControl}
              </div>
            </div>
          )}

          {!attendanceOnly && (
            <>
              {/* Segmented Mode Selector */}
              <div className="flex p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl border border-gray-200/70 dark:border-gray-700/60 gap-1">
                {[
                  ['ASSIGNED', 'Assigned Task', CheckSquare],
                  ['CREATE', 'Create Task', PlusCircle],
                  ['INDIVIDUAL', 'Individual Work', User]
                ]
                  .filter(
                    ([key]) =>
                      (!linking || key !== 'INDIVIDUAL') &&
                      (key !== 'CREATE' || options.canCreateTasks)
                  )
                  .map(([key, label, Icon]) => {
                    const isSelected = mode === key;
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={busy}
                        onClick={() => setMode(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200/80 dark:border-gray-700/80'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40'
                        }`}
                      >
                        {createElement(Icon,{className:'w-3.5 h-3.5 flex-shrink-0'})}
                        <span>{label}</span>
                      </button>
                    );
                  })}
              </div>

              {/* Mode: Individual Work */}
              {mode === 'INDIVIDUAL' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                      Agenda
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <ListTodo className="w-4 h-4" />
                      </div>
                      <select
                        aria-label="Agenda"
                        className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        value={agendaId}
                        onChange={(e) => {
                          if (e.target.value === 'new') {
                            setCreatingAgenda(true);
                            return;
                          }
                          setAgendaId(e.target.value);
                        }}
                      >
                        <option value="">{!agendaData.value&&agendaData.loading?'Loading agendas…':'Choose agenda'}</option>
                        {agendas.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.title}
                          </option>
                        ))}
                        <option value="new">+ Create New Agenda</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {creatingAgenda && (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-3">
                      <label className="block text-xs font-semibold text-blue-900 dark:text-blue-300">
                        New Agenda Title
                      </label>
                      <input
                        aria-label="New agenda title"
                        className="w-full px-3.5 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        maxLength={80}
                        placeholder="e.g. Research, Training, Client Call..."
                        value={agendaTitle}
                        onChange={(e) => setAgendaTitle(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setCreatingAgenda(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy || !agendaTitle.trim()}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const next = await createAgenda(agendaTitle);
                              const store=workSelectionStore(index.scope,'agendas');store.invalidate();await store.reload();
                              setAgendaId(next._id);
                              setCreatingAgenda(false);
                            } catch (e) {
                              setError(errorMessage(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          style={{ color: '#ffffff' }}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                        >
                          Create Agenda
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                      What are you working on? <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      aria-label="What are you working on?"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                      rows={3}
                      maxLength={1000}
                      required
                      placeholder="Briefly describe what you will be working on..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                /* Mode: Assigned Task or Create Task */
                <div className="space-y-4">
                  {/* Project Dropdown */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                      Project
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <select
                        aria-label="Project"
                        className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                      >
                        <option value="">{optionsLoading ? 'Loading projects…' : 'Choose project'}</option>
                        <optgroup label="Projects with tasks assigned to you">
                          {options.projects
                            .filter((p) => p.hasAssignedTasks)
                            .map((p) => (
                              <option value={p._id} key={p._id}>
                                {p.name}
                              </option>
                            ))}
                        </optgroup>
                        {mode === 'CREATE' && (
                          <optgroup label="Other accessible projects">
                            {options.projects
                              .filter((p) => !p.hasAssignedTasks)
                              .map((p) => (
                                <option value={p._id} key={p._id}>
                                  {p.name}
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {mode === 'CREATE' ? (
                    <>
                      {/* Task Title */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                          Task Title <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <PlusCircle className="w-4 h-4" />
                          </div>
                          <input
                            className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            maxLength={200}
                            placeholder="e.g. Implement user authentication"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Project List */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                          Project List
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <Layers className="w-4 h-4" />
                          </div>
                          <select
                            className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                            value={listId}
                            onChange={(e) => setListId(e.target.value)}
                          >
                            {options.lists.map((l) => (
                              <option key={l._id} value={l._id}>
                                {l.title}
                              </option>
                            ))}
                          </select>
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                          Description (optional)
                        </label>
                        <textarea
                          className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                          rows={2}
                          placeholder="Add any relevant notes or details..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                    </>
                  ) : (
                    /* Assigned Task Dropdown */
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Assigned Task
                        </label>
                        {projectId && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                            {assignedTasksCount} task{assignedTasksCount === 1 ? '' : 's'} available
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <select
                          aria-label="Task"
                          className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer disabled:opacity-60"
                          disabled={!projectId || tasksLoading}
                          value={taskId}
                          onChange={(e) => setTaskId(e.target.value)}
                        >
                          <option value="">
                            {tasksLoading ? 'Loading assigned tasks…' : projectId ? 'Choose assigned task' : 'Select a project first'}
                          </option>
                          {options.tasks
                            .filter((t) => t.assigned)
                            .map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.title}
                              </option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>

                      {projectId && !tasksLoading && projectData.value && assignedTasksCount === 0 && (
                        <div className="mt-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <div>
                            <span className="font-semibold">No assigned tasks found</span> in this project.
                            You can choose another project or switch to{' '}
                            <button
                              type="button"
                              onClick={() => setMode('INDIVIDUAL')}
                              className="underline font-semibold hover:text-amber-950 dark:hover:text-amber-100"
                            >
                              Individual Work
                            </button>{' '}
                            above.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!attendanceOnly&&optionsLoading&&<p role="status" className="text-xs opacity-70">Loading available projects…</p>}
              {!attendanceOnly&&index.value&&!options.projects.length&&!index.value.nextProjectCursor&&mode!=='INDIVIDUAL'&&<p className="text-xs opacity-70">No eligible projects. Choose Individual Work to use an agenda.</p>}
              {index.value?.nextProjectCursor&&mode!=='INDIVIDUAL'&&<button type="button" className="text-xs underline" disabled={moreBusy} onClick={()=>loadMore(index.store)}>{moreBusy?'Loading…':'Load more projects'}</button>}
              {projectData.value?.nextTaskCursor&&mode==='ASSIGNED'&&<button type="button" className="text-xs underline" disabled={moreBusy} onClick={()=>loadMore(projectData.store)}>{moreBusy?'Loading…':'Load more tasks'}</button>}
              {(index.error||projectData.error||agendaData.error)&&<div role="alert" className="text-xs text-red-600">{index.error||projectData.error||agendaData.error}<button type="button" className="ml-2 underline" onClick={()=>{index.store.reload();if(projectId)projectData.store.reload();agendaData.store.reload();}}>Retry selections</button></div>}
              {/* Transition Decision Section */}
              {needsDecision && (
                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        Include Previous Work?
                      </h4>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                        <span className="font-semibold">{last?.agendaTitle || 'Individual work'}</span>{' '}
                        — {last?.description || last?.projectName}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                        Affected period:{' '}
                        {rangeStart && new Date(rangeStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        to now ·{' '}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {formatTrackingClock(rangeSeconds)}
                        </span>
                        . Breaks remain separate.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {[
                      [true, 'Yes — Include Previous Work', 'Attach tracked time & screenshots to this task'],
                      [false, 'No — Keep Separate', 'Leave previous tracking on individual agenda']
                    ].map(([value, label, sub]) => {
                      const isChosen = includePrevious === value;
                      return (
                        <label
                          key={label}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            isChosen
                              ? 'border-indigo-500 bg-white dark:bg-gray-900 shadow-sm ring-1 ring-indigo-500/30'
                              : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 hover:bg-white dark:hover:bg-gray-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name="attribution"
                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                            checked={isChosen}
                            onChange={() => setIncludePrevious(value)}
                          />
                          <div className="flex-1 text-xs">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{label}</div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
              <span className="flex-1 font-medium">{error}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            disabled={busy}
            onClick={requestClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            {checkingIn && attendanceOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {busy && attendanceOnly && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                <span>{busy ? 'Checking In…' : 'Check In'}</span>
              </button>
            )}

            {!attendanceOnly && (
              <button
                type="button"
                disabled={busy || !valid || (needsDecision && includePrevious === null)}
                onClick={() => confirm()}
                style={(!busy && valid && (!needsDecision || includePrevious !== null)) ? { color: '#ffffff' } : undefined}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:border disabled:border-gray-200 dark:disabled:border-gray-700 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer flex items-center gap-2"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />}
                <span style={(!busy && valid && (!needsDecision || includePrevious !== null)) ? { color: '#ffffff' } : undefined}>
                  {busy
                    ? 'Saving…'
                    : checkingIn
                    ? 'Check In and Start Tracking'
                    : needsDecision
                    ? 'Confirm Transition'
                    : 'Start Tracking'}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
