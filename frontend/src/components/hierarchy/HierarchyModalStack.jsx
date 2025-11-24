import React, { Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import CardDetailModal from "../CardDetailModal";
import SubtaskDetailModal from "../SubtaskDetailModal";
import SubtaskNanoModal from "../SubtaskNanoModal";

const themeByType = {
  task: "blue",
  subtask: "purple",
  subtaskNano: "pink"
};

const HierarchyModalStack = ({
  stack = [],
  onCloseAll,
  onCloseToDepth,
  onOpenChild,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onLabelUpdate
}) => {
  if (!stack.length) return null;

  const renderModal = (item, index) => {
    const breadcrumbs = stack.slice(0, index + 1).map((entry) => ({
      id: entry.entityId,
      type: entry.type,
      label: entry.label || entry.initialData?.title || entry.initialData?.name || "Untitled"
    }));

    const handleClose = () => {
      if (index === 0) {
        onCloseAll();
      } else {
        onCloseToDepth(index - 1);
      }
    };

    const commonProps = {
      depth: index,
      breadcrumbs,
      onBreadcrumbNavigate: (targetIndex) => onCloseToDepth(targetIndex),
      onClose: handleClose,
      onLabelUpdate: (label) => onLabelUpdate(item, label),
      theme: themeByType[item.type],
    };

    if (item.type === "task") {
      return (
        <CardDetailModal
          key={`task-${item.entityId}`}
          card={item.initialData}
          onUpdate={(updates) => onUpdateTask(item.entityId, updates)}
          onDelete={() => onDeleteTask(item.entityId)}
          onMoveCard={onMoveTask}
          onOpenChild={(child) => onOpenChild(child, index)}
          {...commonProps}
        />
      );
    }

    if (item.type === "subtask") {
      return (
        <SubtaskDetailModal
          key={`subtask-${item.entityId}`}
          entityId={item.entityId}
          initialData={item.initialData}
          onOpenChild={(child) => onOpenChild(child, index)}
          {...commonProps}
        />
      );
    }

    if (item.type === "subtaskNano") {
      return (
        <SubtaskNanoModal
          key={`nano-${item.entityId}`}
          entityId={item.entityId}
          initialData={item.initialData}
          {...commonProps}
        />
      );
    }

    return null;
  };

  return (
    <AnimatePresence>
      {stack.map((item, index) => (
        <Suspense fallback={null} key={`${item.type}-${item.entityId}-${index}`}>
          {renderModal(item, index)}
        </Suspense>
      ))}
    </AnimatePresence>
  );
};

export default HierarchyModalStack;

