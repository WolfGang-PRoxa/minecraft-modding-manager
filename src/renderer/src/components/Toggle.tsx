/** Interrupteur oui / non. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-7 w-12';
  const knob = size === 'sm' ? 'top-0.5 left-0.5 size-4' : 'top-1 left-1 size-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative ${track} shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-grass-500' : 'bg-ink-600'}`}
    >
      <span className={`absolute ${knob} rounded-full bg-white shadow transition-transform ${checked ? shift : ''}`} />
    </button>
  );
}
