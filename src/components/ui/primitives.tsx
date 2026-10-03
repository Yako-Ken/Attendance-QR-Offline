/** Accessible primitives: dialog/sheet, fields, notices, toasts, empty states. */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from './Icon'
import type { Toast } from '../../types/app'

/* -------------------------------------------------------------------------- */
/* Dialog — bottom sheet on small screens, centred modal from 40rem           */
/* -------------------------------------------------------------------------- */

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly tone?: 'default' | 'warn';
  readonly wide?: boolean;
  readonly onClose?: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function Dialog({
  open,
  title,
  description,
  tone = 'default',
  wide = false,
  onClose,
  children,
  footer,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || panel === null) return;
      const items = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="aq-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`aq-dialog${wide ? ' aq-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="aq-dialog__grab" aria-hidden="true" />
        <div className="aq-dialog__head">
          <div>
            <h2 className="aq-dialog__title" id={titleId}>
              {title}
            </h2>
            {description !== undefined ? (
              <p className="aq-dialog__sub" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          {onClose !== undefined ? (
            <button
              type="button"
              className="aq-iconbtn aq-dialog__close"
              onClick={onClose}
              aria-label="Close"
            >
              <Icon name="x" size={18} />
            </button>
          ) : null}
        </div>
        <div className="aq-dialog__body">{children}</div>
        {footer !== undefined ? <div className="aq-dialog__foot">{footer}</div> : null}
        {tone === 'warn' ? <span className="aq-sr">Warning</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

export interface FieldProps {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, error, hint, required = false, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className="aq-field">
      <label className="aq-label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy: describedBy === '' ? undefined : describedBy, invalid: error !== undefined })}
      {error !== undefined ? (
        <p className="aq-field__err" id={errorId} role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
      {hint !== undefined ? (
        <p className="aq-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Notice / empty state                                                       */
/* -------------------------------------------------------------------------- */

export interface NoticeProps {
  readonly tone?: 'default' | 'accent' | 'warn' | 'danger';
  readonly icon?: IconName;
  readonly title?: string;
  readonly children: ReactNode;
}

export function Notice({ tone = 'default', icon = 'info', title, children }: NoticeProps) {
  return (
    <div className={`aq-notice aq-notice--${tone}`}>
      <Icon name={icon} size={18} className="aq-notice__icon" />
      <div>
        {title !== undefined ? <p className="aq-notice__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  readonly icon?: IconName;
  readonly title: string;
  readonly children?: ReactNode;
}

export function EmptyState({ icon = 'inbox', title, children }: EmptyStateProps) {
  return (
    <div className="aq-empty">
      <div className="aq-empty__icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </div>
      <p className="aq-empty__title">{title}</p>
      {children !== undefined ? <div className="aq-empty__body">{children}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export interface ToastListProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<Toast['tone'], IconName> = {
  ok: 'checkCircle',
  warn: 'alert',
  danger: 'alertCircle',
  info: 'info',
};

export function ToastList({ toasts, onDismiss }: ToastListProps) {
  const dismiss = useCallback((id: string) => onDismiss(id), [onDismiss]);
  if (toasts.length === 0) return null;

  return (
    <div className="aq-toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`aq-toast aq-toast--${toast.tone}`}
          role={toast.tone === 'danger' ? 'alert' : 'status'}
        >
          <Icon name={TOAST_ICONS[toast.tone]} size={18} className="aq-toast__icon" />
          <div className="aq-toast__body">
            <p className="aq-toast__title">{toast.title}</p>
            {toast.text !== undefined ? <p className="aq-toast__text">{toast.text}</p> : null}
            {toast.action !== undefined ? (
              <div className="aq-toast__action">
                <button
                  type="button"
                  className="aq-btn aq-btn--sm aq-btn--quiet"
                  onClick={() => {
                    toast.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="aq-iconbtn aq-dialog__close"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric                                                                     */
/* -------------------------------------------------------------------------- */

export interface MetricProps {
  readonly value: number;
  readonly label: string;
  readonly alert?: boolean;
}

export function Metric({ value, label, alert = false }: MetricProps) {
  return (
    <div className={`aq-metric${alert && value > 0 ? ' aq-metric--alert' : ''}`}>
      <span className="aq-metric__v">{value}</span>
      <span className="aq-metric__k">{label}</span>
    </div>
  );
}