import PermissionCheckbox from './PermissionCheckbox';

export default function RolePermissionChecklist({ categories, permissions, onToggle, onSelectCategory, disabled = false }) {
  return <div className="space-y-4">
    {Object.entries(categories).map(([key, category]) => {
      const count = category.permissions.filter((permission) => permissions[permission.key] === true).length;
      return <fieldset key={key} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-bg-subtle)', borderColor: 'var(--color-border-default)' }}>
        <legend className="px-1 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{category.label}</legend>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{count} of {category.permissions.length} selected</span>
          <PermissionCheckbox compact label={`Select all ${category.label.replace(/^\S+\s/, '')}`}
            checked={count === category.permissions.length} indeterminate={count > 0 && count < category.permissions.length}
            disabled={disabled} onChange={(selected) => onSelectCategory(key, selected)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {category.permissions.map((permission) => <PermissionCheckbox key={permission.key} label={permission.label}
            checked={permissions[permission.key] === true} disabled={disabled} onChange={() => onToggle(permission.key)} />)}
        </div>
      </fieldset>;
    })}
  </div>;
}
