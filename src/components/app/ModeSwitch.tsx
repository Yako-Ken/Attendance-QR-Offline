/** Compact mode switch for the mobile and tablet top bar. */

import { Icon } from '../ui/Icon'

export type AppMode = 'student' | 'attendance';

export interface ModeSwitchProps {
  readonly mode: AppMode;
  readonly onChange: (mode: AppMode) => void;
  readonly block?: boolean;
}

export function ModeSwitch({ mode, onChange, block = false }: ModeSwitchProps) {
  return (
    <div
      className={`aq-modeswitch${block ? ' aq-modeswitch--block' : ''}`}
      role="tablist"
      aria-label="Mode"
    >
      <button
        type="button"
        role="tab"
        className="aq-modeswitch__opt"
        aria-selected={mode === 'student'}
        aria-current={mode === 'student' ? 'page' : undefined}
        onClick={() => onChange('student')}
      >
        <Icon name="student" size={17} />
        Student
      </button>
      <button
        type="button"
        role="tab"
        className="aq-modeswitch__opt"
        aria-selected={mode === 'attendance'}
        aria-current={mode === 'attendance' ? 'page' : undefined}
        onClick={() => onChange('attendance')}
      >
        <Icon name="scan" size={17} />
        Attendance
      </button>
    </div>
  );
}