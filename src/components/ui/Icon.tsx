/**
 * Inline icon set.
 *
 * Drawn here rather than pulled from an icon font or CDN so the application has
 * no remote dependency and no extra request. One consistent grid: 24x24 viewBox,
 * 1.75 stroke, round caps and joins.
 */

import type { SVGProps } from 'react'

export type IconName =
  | 'student'
  | 'scan'
  | 'check'
  | 'checkCircle'
  | 'alert'
  | 'alertCircle'
  | 'info'
  | 'x'
  | 'camera'
  | 'cameraOff'
  | 'stop'
  | 'refresh'
  | 'edit'
  | 'note'
  | 'trash'
  | 'users'
  | 'download'
  | 'share'
  | 'clock'
  | 'shield'
  | 'chevron'
  | 'arrowLeft'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'plus'
  | 'search'
  | 'lock'
  | 'wifiOff'
  | 'inbox';

const PATHS: Record<IconName, string> = {
  student: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 4v6M9 13h6',
  scan: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16',
  check: 'M4 12.5 9 17.5 20 6.5',
  checkCircle: 'M21 11.5v1a9.5 9.5 0 1 1-5.6-8.7M21 5.5 12 14.5l-2.5-2.5',
  alert: 'M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01',
  alertCircle: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M12 7.5v5.5M12 16.5h.01',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M12 11v5.5M12 7.5h.01',
  x: 'M6 6l12 12M18 6L6 18',
  camera: 'M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.3-2h7l1.3 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  cameraOff: 'M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.3-2h7l1.3 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19h-3M3 3l18 18M9.5 12.8a3.5 3.5 0 0 0 4.7 4.8',
  stop: 'M7 7h10v10H7z',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17zM14 6.5l3.5 3.5',
  note: 'M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12h7M9 15.5h7M9 19h4',
  trash: 'M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6',
  users: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.5 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M17.5 14.5a6 6 0 0 1 4 5.5',
  download: 'M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16',
  share: 'M12 15V4M8 7.5 12 3.5l4 4M5 13.5v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M12 7v5.5l3.5 2',
  shield: 'M12 3 4.5 6v6c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z',
  chevron: 'm9 5 7 7-7 7',
  arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5',
  monitor: 'M3.5 5h17v10h-17zM8.5 20h7M12 15v5',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M16.5 16.5 21 21',
  lock: 'M6.5 10.5h11v9h-11zM9 10.5V7.5a3 3 0 0 1 6 0v3',
  wifiOff: 'M3 3l18 18M8.5 16.5a4 4 0 0 1 5 0M5 12.5a9 9 0 0 1 3.5-2.2M19 12.5a9 9 0 0 0-5.5-2.6M2 8.5A14 14 0 0 1 7 5.6M22 8.5a14 14 0 0 0-7-3.3M12 20h.01',
  inbox: 'M3.5 13.5h5l1.5 3h4l1.5-3h5M3.5 13.5 6 4.5h12l2.5 9v6h-17z',
};

const FILLED = new Set<IconName>(['stop']);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: IconName;
  readonly size?: number;
  readonly title?: string;
}

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title === undefined ? 'presentation' : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title !== undefined ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}