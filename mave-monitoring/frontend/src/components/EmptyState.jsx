export function EmptyState({ icon: Icon, title, description, action, actionLabel, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-gray-400" />
        </div>
      )}
      <p className="text-sm font-medium text-gray-600 text-center">{title}</p>
      {description && (
        <p className="text-xs text-gray-400 mt-1.5 text-center max-w-xs">{description}</p>
      )}
      {action && actionLabel && (
        <button onClick={action} className="btn-primary text-sm mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
