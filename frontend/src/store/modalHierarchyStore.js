import { create } from "zustand";

const initialState = {
  stack: [],
  currentProject: null,
  currentTask: null,
  currentSubtask: null,
  currentNenoSubtask: null,
  modalType: null,
};

const buildEntry = (payload = {}) => {
  const initialData = payload.initialData || {};
  return {
    type: payload.type,
    entityId: payload.entityId,
    initialData,
    label: payload.label || initialData.title || initialData.name || "Untitled",
  };
};

const deriveHierarchy = (stack = []) => {
  let currentTask = null;
  let currentSubtask = null;
  let currentNenoSubtask = null;
  let modalType = null;

  stack.forEach((entry) => {
    modalType = entry.type;
    if (entry.type === "task") {
      currentTask = entry.initialData;
      currentSubtask = null;
      currentNenoSubtask = null;
    } else if (entry.type === "subtask") {
      currentSubtask = entry.initialData;
      currentNenoSubtask = null;
    } else if (entry.type === "subtaskNano") {
      currentNenoSubtask = entry.initialData;
    }
  });

  return { currentTask, currentSubtask, currentNenoSubtask, modalType };
};

const useModalHierarchyStore = create((set, get) => ({
  ...initialState,
  setProject: (project) => set({ currentProject: project }),
  setActiveItem: (type, data) => {
    if (!type || !data) return;
    const entityId = data._id || data.id;
    set((state) => {
      const stack = state.stack.map((entry) => {
        if (entry.entityId === entityId && entry.type === type) {
          return {
            ...entry,
            initialData: data,
            label: data.title || data.name || entry.label,
          };
        }
        return entry;
      });

      const updates = { modalType: type };
      if (type === "task") {
        updates.currentTask = data;
      } else if (type === "subtask") {
        updates.currentSubtask = data;
      } else if (type === "subtaskNano") {
        updates.currentNenoSubtask = data;
      }

      return { stack, ...updates };
    });
  },
  initializeTaskStack: ({ project, task }) => {
    if (!task) return;
    const entry = buildEntry({
      type: "task",
      entityId: task._id || task.id,
      initialData: task,
      label: task.title,
    });
    set({
      stack: [entry],
      currentProject: project || get().currentProject,
      currentTask: task,
      currentSubtask: null,
      currentNenoSubtask: null,
      modalType: "task",
    });
  },
  pushChild: (child, parentDepth = get().stack.length - 1) => {
    if (!child?.type || !child?.entityId) return;
    const entry = buildEntry(child);
    set((state) => {
      const nextStack = state.stack.slice(0, parentDepth + 1);
      nextStack.push(entry);
      return {
        stack: nextStack,
        ...deriveHierarchy(nextStack),
        currentProject: state.currentProject,
      };
    });
  },
  closeAll: () =>
    set((state) => ({
      ...initialState,
      currentProject: state.currentProject,
    })),
  closeToDepth: (depth) =>
    set((state) => {
      const nextStack = depth < 0 ? [] : state.stack.slice(0, depth + 1);
      return {
        stack: nextStack,
        ...deriveHierarchy(nextStack),
        currentProject: state.currentProject,
      };
    }),
  navigateBreadcrumbLevel: (level) => {
    if (level === "project") {
      get().closeToDepth(-1);
      return;
    }

    if (typeof level === "string") {
      const index = get().stack.findIndex((entry) => entry.type === level);
      if (index >= 0) {
        get().closeToDepth(index);
      }
      return;
    }

    if (typeof level === "number") {
      get().closeToDepth(level);
    }
  },
  updateItemLabel: (entityId, type, label) =>
    set((state) => ({
      stack: state.stack.map((entry) =>
        entry.entityId === entityId && entry.type === type
          ? { ...entry, label }
          : entry
      ),
    })),
  openModalByType: ({ type, entity, parentDepth, project }) => {
    if (!entity) return;
    if (!get().stack.length || type === "task") {
      get().initializeTaskStack({
        project: project || get().currentProject,
        task: entity,
      });
      return;
    }
    get().pushChild(
      {
        type,
        entityId: entity._id || entity.id,
        initialData: entity,
        label: entity.title || entity.name,
      },
      parentDepth ?? get().stack.length - 1
    );
  },
}));

export default useModalHierarchyStore;

