import { useId } from 'react';
import PermissionCheckbox from './PermissionCheckbox';

const COLUMN_CLASSES = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };

export default function ResourceActionToggleGrid({ actions = [], effective, onToggle, accentColor = '#7c3aed', disabled = false, columns = 3 }) {
  const hintId = useId();
  const viewAction = actions.find((action) => action.key === 'view');
  const needsView = Boolean(viewAction) && effective?.view !== true;
  return (
    <div>
      <div className={`grid grid-cols-1 ${COLUMN_CLASSES[columns] || COLUMN_CLASSES[3]} gap-2`} aria-describedby={needsView ? hintId : undefined}>
        {actions.map(({ key, label }) => {
          const needsPrerequisite = needsView && key !== 'view';
          return <PermissionCheckbox key={key} label={label} checked={effective?.[key] === true}
            disabled={disabled || needsPrerequisite} accentColor={accentColor}
            description={needsPrerequisite ? `Requires ${viewAction.label.toLowerCase()}` : undefined}
            onChange={(nextValue) => onToggle(key, nextValue, viewAction?.key)} />;
        })}
      </div>
      {needsView && <p id={hintId} className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Select “{viewAction.label}” to enable the other permissions.</p>}
    </div>
  );
}
