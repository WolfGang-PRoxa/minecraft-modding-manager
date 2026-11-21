// Curseur de l'intervalle entre deux vérifications automatiques (de 1 minute à 6 heures, par crans). Le réglage est
// enregistré peu après le dernier mouvement, pas à chaque cran franchi pendant le glissement.
import { useEffect, useRef, useState } from 'react';
import { CHECK_MINUTE_STEPS, formatCheckInterval, formatEvery, nearestCheckStep } from '../../../shared/autoUpdate';

const SAVE_DELAY_MS = 400;

export function CheckInterval({
  label,
  minutes,
  onChange,
  disabled = false,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(() => nearestCheckStep(minutes));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(minutes);
  // Réglage changé ailleurs (ou enregistré) : le curseur le suit.
  useEffect(() => {
    if (minutes !== saved.current && !timer.current) setStep(nearestCheckStep(minutes));
    saved.current = minutes;
  }, [minutes]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = CHECK_MINUTE_STEPS[step];
  const move = (next: number) => {
    setStep(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saved.current = CHECK_MINUTE_STEPS[next];
      onChange(CHECK_MINUTE_STEPS[next]);
    }, SAVE_DELAY_MS);
  };

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-baseline justify-between gap-4 text-xs">
        <span className="text-ink-300">{label}</span>
        <span className="font-medium text-ink-100 tabular-nums">{formatEvery(value)}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={formatCheckInterval(value)}
        min={0}
        max={CHECK_MINUTE_STEPS.length - 1}
        step={1}
        value={step}
        disabled={disabled}
        onChange={(e) => move(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer accent-grass-500 disabled:cursor-not-allowed"
      />
      <div className="mt-0.5 flex justify-between text-[11px] text-ink-500">
        <span>1 minute</span>
        <span>6 heures</span>
      </div>
    </div>
  );
}
