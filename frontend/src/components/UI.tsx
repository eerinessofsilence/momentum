import {
  createElement,
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ControlSize = "small" | "regular" | "large";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: ControlSize;
  }
>(function Button(
  { className, variant = "secondary", size = "regular", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("ui-button", `ui-button--${variant}`, `ui-control--${size}`, className)}
      {...props}
    />
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { controlSize?: ControlSize }
>(function Input({ className, controlSize = "large", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx("ui-input", `ui-control--${controlSize}`, className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { controlSize?: ControlSize }
>(function Select({ className, controlSize = "regular", ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cx("ui-select", `ui-control--${controlSize}`, className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { controlSize?: ControlSize }
>(function Textarea({ className, controlSize = "large", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx("ui-textarea", `ui-control--${controlSize}`, className)}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("ui-field", className)}>
      <span className="ui-field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

export function Card({
  as = "section",
  variant = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
  variant?: "default" | "nested" | "interactive";
}) {
  return createElement(
    as,
    { ...props, className: cx("ui-card", `ui-card--${variant}`, className) },
    children
  );
}

export function CardHeader({
  title,
  description,
  trailing,
  level = 2,
  titleId,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  level?: 2 | 3;
  titleId?: string;
  className?: string;
}) {
  return (
    <div className={cx("ui-card-header", className)}>
      <div className="ui-card-header__copy">
        {createElement(`h${level}`, { id: titleId }, title)}
        {description && <p>{description}</p>}
      </div>
      {trailing && <div className="ui-card-header__trailing">{trailing}</div>}
    </div>
  );
}

export function Badge({
  variant = "neutral",
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: "success" | "warning" | "danger" | "neutral" | "accent";
  dot?: boolean;
}) {
  return (
    <span className={cx("ui-badge", `ui-badge--${variant}`, className)} {...props}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  indicator?: boolean;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = "underline",
  className,
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: "underline" | "segmented" | "compact";
  className?: string;
}) {
  return (
    <div
      className={cx("ui-tabs", `ui-tabs--${variant}`, className)}
      role="tablist"
      aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={item.value === value ? "active" : ""}
          key={item.value}
          onClick={() => onChange(item.value)}>
          {item.icon}
          <span>{item.label}</span>
          {item.indicator && <i aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function ListRow({
  leading,
  title,
  description,
  trailing,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("ui-list-row", className)}>
      {leading && <div className="ui-list-row__leading">{leading}</div>}
      <div className="ui-list-row__copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {trailing && <div className="ui-list-row__trailing">{trailing}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("ui-empty-state", compact && "compact", className)}>
      {icon && <span className="ui-empty-state__icon">{icon}</span>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Notice({
  variant = "info",
  icon,
  children,
  className,
}: {
  variant?: "info" | "success" | "warning" | "danger";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("ui-notice", `ui-notice--${variant}`, className)} role={variant === "danger" ? "alert" : undefined}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <span className={cx("ui-spinner", className)} role="status" aria-label={label}>
      <i />
    </span>
  );
}
