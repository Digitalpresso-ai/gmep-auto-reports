/* jwdesign UI — domain-agnostic component library. React 18 from window.React. */
import ICONS from './icons.json';

declare const window: any;
const React = window.React;
const { useState, useEffect, useRef, useId, useCallback, createContext, useContext } = React;

type Node = any;
const cx = (...a: any[]) => a.filter(Boolean).join(' ');
const portal = (el: Node) => (window.ReactDOM && window.ReactDOM.createPortal && typeof document !== 'undefined' ? window.ReactDOM.createPortal(el, document.body) : el);

/* ───────────────────────── Icon ───────────────────────── */
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 20, label, className, style }: { name: IconName; size?: number | string; label?: string; className?: string; style?: any }) {
  const paths: string[] = (ICONS as any)[name] || [];
  return (
    <svg className={cx('jw-icon', className)} width={size} height={size} viewBox="0 0 256 256" fill="currentColor"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={style}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
export const iconNames = Object.keys(ICONS);

/* ───────────────────────── Spinner ───────────────────────── */
export function Spinner({ size = 20, label = '불러오는 중', className }: { size?: number; label?: string; className?: string }) {
  return (
    <span className={cx('jw-spinner', className)} role="status" aria-label={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
        <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* ───────────────────────── Button ───────────────────────── */
export type ButtonVariant = 'primary' | 'secondary' | 'weak' | 'outline' | 'ghost' | 'danger' | 'danger-weak';
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export function Button({ variant = 'secondary', size = 'md', loading = false, fullWidth = false, leftIcon, rightIcon, className, children, disabled, type = 'button', ...rest }: any) {
  const iconSize = size === 'xs' || size === 'sm' ? 16 : 20;
  return (
    <button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('jw-btn', 'jw-btn--' + variant, 'jw-btn--' + size, fullWidth && 'jw-btn--full', loading && 'is-loading', className)}>
      {loading && <span className="jw-btn__spinner"><Spinner size={iconSize} label="처리 중" /></span>}
      <span className="jw-btn__content">
        {leftIcon && <Icon name={leftIcon} size={iconSize} />}
        {children != null && <span className="jw-btn__label">{children}</span>}
        {rightIcon && <Icon name={rightIcon} size={iconSize} />}
      </span>
    </button>
  );
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', className, ...rest }: any) {
  const iconSize = size === 'xs' || size === 'sm' ? 16 : size === 'xl' ? 24 : 20;
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('jw-btn', 'jw-iconbtn', 'jw-btn--' + variant, 'jw-btn--' + size, className)}>
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

export function ButtonGroup({ children, direction = 'row', fullWidth = false, className }: any) {
  return <div className={cx('jw-btngroup', 'jw-btngroup--' + direction, fullWidth && 'jw-btngroup--full', className)}>{children}</div>;
}

export function Link({ children, className, external, ...rest }: any) {
  return (
    <a {...rest} className={cx('jw-link', className)} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}{external && <Icon name="arrow-up-right" size="0.95em" />}
    </a>
  );
}

/* ───────────────────────── Form fields ───────────────────────── */
function FieldShell({ id, label, required, helper, error, children, className, counter }: any) {
  return (
    <div className={cx('jw-field', error && 'is-invalid', className)}>
      {label && (
        <label className="jw-field__label" htmlFor={id}>
          {label}{required && <span className="jw-field__req" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {(error || helper || counter) && (
        <div className="jw-field__foot">
          {error ? (
            <p className="jw-field__msg jw-field__msg--error" id={id + '-msg'}><Icon name="warning-circle" size={14} />{error}</p>
          ) : helper ? (
            <p className="jw-field__msg" id={id + '-msg'}>{helper}</p>
          ) : <span />}
          {counter}
        </div>
      )}
    </div>
  );
}

export function TextField({ label, helper, error, required, size = 'md', prefix, suffix, leftIcon, clearable, onClear, className, id, value, defaultValue, onChange, ...rest }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [inner, setInner] = useState(defaultValue ?? '');
  const v = value !== undefined ? value : inner;
  const handle = (e: any) => { if (value === undefined) setInner(e.target.value); onChange && onChange(e); };
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div className={cx('jw-input', 'jw-input--' + size, rest.disabled && 'is-disabled')}>
        {leftIcon && <Icon name={leftIcon} size={size === 'sm' ? 16 : 20} className="jw-input__icon" />}
        {prefix && <span className="jw-input__affix">{prefix}</span>}
        <input id={fid} {...rest} value={v} onChange={handle} required={required}
          aria-invalid={error ? true : undefined} aria-describedby={error || helper ? fid + '-msg' : undefined} />
        {clearable && v && !rest.disabled && (
          <button type="button" className="jw-input__clear" aria-label="지우기"
            onClick={() => { if (value === undefined) setInner(''); onClear && onClear(); }}>
            <Icon name="x-circle" size={18} />
          </button>
        )}
        {suffix && <span className="jw-input__affix">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

export function SearchField({ placeholder = '검색', size = 'md', ...rest }: any) {
  return <TextField {...rest} size={size} type="search" leftIcon="magnifying-glass" clearable placeholder={placeholder} className={cx('jw-search', rest.className)} />;
}

export function TextArea({ label, helper, error, required, rows = 4, maxLength, className, id, value, defaultValue, onChange, ...rest }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [inner, setInner] = useState(defaultValue ?? '');
  const v = value !== undefined ? value : inner;
  const handle = (e: any) => { if (value === undefined) setInner(e.target.value); onChange && onChange(e); };
  const counter = maxLength ? <span className="jw-field__count">{String(v).length} / {maxLength}</span> : null;
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className} counter={counter}>
      <div className={cx('jw-input', 'jw-input--area', rest.disabled && 'is-disabled')}>
        <textarea id={fid} rows={rows} maxLength={maxLength} {...rest} value={v} onChange={handle}
          aria-invalid={error ? true : undefined} aria-describedby={error || helper ? fid + '-msg' : undefined} />
      </div>
    </FieldShell>
  );
}

export function Select({ label, helper, error, required, size = 'md', options = [], placeholder, className, id, ...rest }: any) {
  const autoId = useId();
  const fid = id || autoId;
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div className={cx('jw-input', 'jw-input--' + size, 'jw-select', rest.disabled && 'is-disabled')}>
        <select id={fid} required={required} aria-invalid={error ? true : undefined} {...rest}>
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((o: any) => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
        <Icon name="caret-down" size={16} className="jw-select__caret" />
      </div>
    </FieldShell>
  );
}

export function Checkbox({ label, description, indeterminate = false, className, id, ...rest }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const ref = useRef(null);
  useEffect(() => { if (ref.current) (ref.current as any).indeterminate = indeterminate; }, [indeterminate]);
  return (
    <label className={cx('jw-check', rest.disabled && 'is-disabled', className)} htmlFor={fid}>
      <span className="jw-check__box">
        <input ref={ref} id={fid} type="checkbox" {...rest} />
        <span className="jw-check__mark" aria-hidden="true">
          <Icon name={indeterminate ? 'minus' : 'check'} size={14} />
        </span>
      </span>
      {(label || description) && (
        <span className="jw-check__text">
          {label && <span className="jw-check__label">{label}</span>}
          {description && <span className="jw-check__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}

const RadioCtx = createContext(null as any);
export function RadioGroup({ name, value, defaultValue, onChange, label, direction = 'column', children, className }: any) {
  const autoName = useId();
  const [inner, setInner] = useState(defaultValue);
  const v = value !== undefined ? value : inner;
  const set = (nv: any) => { if (value === undefined) setInner(nv); onChange && onChange(nv); };
  return (
    <RadioCtx.Provider value={{ name: name || autoName, value: v, set }}>
      <fieldset className={cx('jw-radiogroup', 'jw-radiogroup--' + direction, className)} role="radiogroup">
        {label && <legend className="jw-field__label">{label}</legend>}
        <div className="jw-radiogroup__items">{children}</div>
      </fieldset>
    </RadioCtx.Provider>
  );
}
export function Radio({ value, label, description, disabled, className }: any) {
  const ctx = useContext(RadioCtx) || { name: undefined, value: undefined, set: () => {} };
  const id = useId();
  return (
    <label className={cx('jw-check', 'jw-radio', disabled && 'is-disabled', className)} htmlFor={id}>
      <span className="jw-check__box">
        <input id={id} type="radio" name={ctx.name} value={value} disabled={disabled}
          checked={ctx.value !== undefined ? ctx.value === value : undefined} onChange={() => ctx.set(value)} />
        <span className="jw-check__mark" aria-hidden="true" />
      </span>
      {(label || description) && (
        <span className="jw-check__text">
          {label && <span className="jw-check__label">{label}</span>}
          {description && <span className="jw-check__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({ label, description, checked, defaultChecked, onChange, size = 'md', disabled, className, id, ...rest }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [inner, setInner] = useState(!!defaultChecked);
  const on = checked !== undefined ? checked : inner;
  const toggle = () => { if (checked === undefined) setInner(!on); onChange && onChange(!on); };
  return (
    <label className={cx('jw-switch', 'jw-switch--' + size, disabled && 'is-disabled', className)} htmlFor={fid}>
      {(label || description) && (
        <span className="jw-check__text">
          {label && <span className="jw-check__label">{label}</span>}
          {description && <span className="jw-check__desc">{description}</span>}
        </span>
      )}
      <button {...rest} id={fid} type="button" role="switch" aria-checked={on} disabled={disabled} onClick={toggle} className="jw-switch__track">
        <span className="jw-switch__thumb" />
      </button>
    </label>
  );
}

export function SegmentedControl({ options = [], value, defaultValue, onChange, size = 'md', fullWidth = false, label, className }: any) {
  const opts = options.map((o: any) => (typeof o === 'string' ? { value: o, label: o } : o));
  const [inner, setInner] = useState(defaultValue ?? (opts[0] && opts[0].value));
  const v = value !== undefined ? value : inner;
  const idx = Math.max(0, opts.findIndex((o: any) => o.value === v));
  const set = (nv: any) => { if (value === undefined) setInner(nv); onChange && onChange(nv); };
  return (
    <div role="radiogroup" aria-label={label} className={cx('jw-seg', 'jw-seg--' + size, fullWidth && 'jw-seg--full', className)}
      style={{ ['--jw-seg-n' as any]: opts.length, ['--jw-seg-i' as any]: idx }}>
      <span className="jw-seg__thumb" aria-hidden="true" />
      {opts.map((o: any) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === v} disabled={o.disabled}
          className={cx('jw-seg__item', o.value === v && 'is-active')} onClick={() => set(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, min = 0, max = 100, step = 1, value, defaultValue, onChange, showValue = true, format, disabled, className, id }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [inner, setInner] = useState(defaultValue ?? min);
  const v = value !== undefined ? value : inner;
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <div className={cx('jw-slider', disabled && 'is-disabled', className)}>
      {(label || showValue) && (
        <div className="jw-slider__head">
          {label && <label className="jw-field__label" htmlFor={fid}>{label}</label>}
          {showValue && <span className="jw-slider__value">{format ? format(v) : v}</span>}
        </div>
      )}
      <input id={fid} type="range" min={min} max={max} step={step} value={v} disabled={disabled}
        style={{ ['--jw-pct' as any]: pct + '%' }}
        onChange={(e: any) => { const n = Number(e.target.value); if (value === undefined) setInner(n); onChange && onChange(n); }} />
    </div>
  );
}

/* ───────────────────────── Display ───────────────────────── */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', dot = false, children, className }: any) {
  return (
    <span className={cx('jw-badge', 'jw-badge--' + tone, 'jw-badge--' + variant, 'jw-badge--' + size, className)}>
      {dot && <span className="jw-badge__dot" aria-hidden="true" />}{children}
    </span>
  );
}

export function Tag({ children, selected, onClick, onRemove, icon, size = 'md', disabled, className }: any) {
  const interactive = !!onClick;
  const El: any = interactive ? 'button' : 'span';
  return (
    <El type={interactive ? 'button' : undefined} aria-pressed={interactive ? !!selected : undefined} disabled={interactive ? disabled : undefined}
      onClick={onClick} className={cx('jw-tag', 'jw-tag--' + size, selected && 'is-selected', interactive && 'is-interactive', className)}>
      {icon && <Icon name={icon} size={14} />}
      {selected && interactive && !icon && <Icon name="check" size={14} />}
      <span>{children}</span>
      {onRemove && (
        <span role="button" tabIndex={0} aria-label="삭제" className="jw-tag__remove"
          onClick={(e: any) => { e.stopPropagation(); onRemove(); }}
          onKeyDown={(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}>
          <Icon name="x" size={12} />
        </span>
      )}
    </El>
  );
}

const AV_TONES = ['blue', 'green', 'orange', 'red', 'gray'];
export function Avatar({ name = '', src, size = 'md', status, className }: any) {
  const initials = name.trim() ? (/[가-힣]/.test(name) ? name.trim().slice(-2) : name.trim().split(/\s+/).map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()) : '';
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const tone = AV_TONES[h % AV_TONES.length];
  return (
    <span className={cx('jw-avatar', 'jw-avatar--' + size, 'jw-avatar--' + tone, className)} role="img" aria-label={name || '사용자'}>
      {src ? <img src={src} alt="" /> : initials ? <span>{initials}</span> : <Icon name="user" size="55%" />}
      {status && <span className={cx('jw-avatar__status', 'jw-avatar__status--' + status)} aria-hidden="true" />}
    </span>
  );
}
export function AvatarGroup({ children, max = 4, size = 'md', className }: any) {
  const items = React.Children.toArray(children);
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className={cx('jw-avatargroup', className)}>
      {shown.map((c: any, i: number) => React.cloneElement(c, { key: i, size }))}
      {rest > 0 && <span className={cx('jw-avatar', 'jw-avatar--' + size, 'jw-avatar--more')}><span>+{rest}</span></span>}
    </span>
  );
}

export function Card({ title, description, action, footer, padding = 'md', variant = 'outline', interactive = false, children, className, ...rest }: any) {
  const El: any = interactive && rest.href ? 'a' : interactive ? 'button' : 'div';
  return (
    <El {...rest} className={cx('jw-card', 'jw-card--' + variant, 'jw-card--p-' + padding, interactive && 'is-interactive', className)}>
      {(title || action) && (
        <div className="jw-card__head">
          <div>
            {title && <h3 className="jw-card__title">{title}</h3>}
            {description && <p className="jw-card__desc">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children != null && <div className="jw-card__body">{children}</div>}
      {footer && <div className="jw-card__foot">{footer}</div>}
    </El>
  );
}

export function List({ header, children, inset = false, className }: any) {
  return (
    <section className={cx('jw-list', inset && 'jw-list--inset', className)}>
      {header && <h4 className="jw-list__header">{header}</h4>}
      <ul role="list">{React.Children.map(children, (c: any) => c && <li>{c}</li>)}</ul>
    </section>
  );
}
export function ListRow({ title, description, leading, trailing, value, chevron = false, onClick, href, disabled, className }: any) {
  const El: any = href ? 'a' : onClick ? 'button' : 'div';
  const lead = typeof leading === 'string' ? <span className="jw-row__iconwrap"><Icon name={leading as any} size={20} /></span> : leading;
  return (
    <El href={href} onClick={onClick} disabled={El === 'button' ? disabled : undefined} type={El === 'button' ? 'button' : undefined}
      className={cx('jw-row', (onClick || href) && 'is-interactive', disabled && 'is-disabled', className)}>
      {lead && <span className="jw-row__lead">{lead}</span>}
      <span className="jw-row__main">
        <span className="jw-row__title">{title}</span>
        {description && <span className="jw-row__desc">{description}</span>}
      </span>
      {(value != null || trailing || chevron) && (
        <span className="jw-row__trail">
          {value != null && <span className="jw-row__value">{value}</span>}
          {trailing}
          {chevron && <Icon name="caret-right" size={16} className="jw-row__chev" />}
        </span>
      )}
    </El>
  );
}

export function Divider({ label, spacing = 16, vertical = false, className }: any) {
  if (vertical) return <span className={cx('jw-divider--v', className)} role="separator" aria-orientation="vertical" />;
  return label
    ? <div className={cx('jw-divider', 'jw-divider--label', className)} role="separator" style={{ margin: spacing + 'px 0' }}><span>{label}</span></div>
    : <hr className={cx('jw-divider', className)} style={{ margin: spacing + 'px 0' }} />;
}

export function Table({ columns = [], rows = [], rowKey, selectable = false, selected, onSelectChange, density = 'md', empty, className }: any) {
  const keyOf = (r: any, i: number) => (rowKey ? (typeof rowKey === 'function' ? rowKey(r) : r[rowKey]) : i);
  const [inner, setInner] = useState([] as any[]);
  const sel: any[] = selected !== undefined ? selected : inner;
  const setSel = (s: any[]) => { if (selected === undefined) setInner(s); onSelectChange && onSelectChange(s); };
  const all = rows.length > 0 && sel.length === rows.length;
  const [sort, setSort] = useState(null as any);
  let data = rows;
  if (sort) {
    const col = columns.find((c: any) => c.key === sort.key);
    data = [...rows].sort((a: any, b: any) => {
      const av = col && col.sortValue ? col.sortValue(a) : a[sort.key];
      const bv = col && col.sortValue ? col.sortValue(b) : b[sort.key];
      return (av > bv ? 1 : av < bv ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1);
    });
  }
  return (
    <div className={cx('jw-table-wrap', className)}>
      <table className={cx('jw-table', 'jw-table--' + density)}>
        <thead>
          <tr>
            {selectable && <th className="jw-table__sel"><Checkbox aria-label="전체 선택" checked={all} indeterminate={sel.length > 0 && !all}
              onChange={() => setSel(all ? [] : rows.map(keyOf))} /></th>}
            {columns.map((c: any) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align || 'left' }}
                aria-sort={sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortable ? (
                  <button type="button" className="jw-table__sort" onClick={() => setSort(sort && sort.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' })}>
                    {c.title}<Icon name={sort && sort.key === c.key && sort.dir === 'desc' ? 'caret-down' : 'caret-up'} size={12} className={sort && sort.key === c.key ? '' : 'is-idle'} />
                  </button>
                ) : c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="jw-table__empty">{empty || '표시할 항목이 없어요'}</td></tr>}
          {data.map((r: any, i: number) => {
            const k = keyOf(r, i);
            const on = sel.includes(k);
            return (
              <tr key={k} className={on ? 'is-selected' : undefined}>
                {selectable && <td className="jw-table__sel"><Checkbox aria-label="행 선택" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== k) : [...sel, k])} /></td>}
                {columns.map((c: any) => <td key={c.key} style={{ textAlign: c.align || 'left' }} className={c.numeric ? 'is-num' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, unit, delta, deltaTone, caption, className }: any) {
  const tone = deltaTone || (typeof delta === 'string' && delta.trim().startsWith('-') ? 'danger' : 'success');
  return (
    <div className={cx('jw-stat', className)}>
      <span className="jw-stat__label">{label}</span>
      <span className="jw-stat__value">{value}{unit && <span className="jw-stat__unit">{unit}</span>}</span>
      {(delta || caption) && (
        <span className="jw-stat__foot">
          {delta && <span className={cx('jw-stat__delta', 'jw-stat__delta--' + tone)}><Icon name={tone === 'danger' ? 'arrow-down' : 'arrow-up'} size={12} />{String(delta).replace(/^[-+]/, '')}</span>}
          {caption && <span className="jw-stat__caption">{caption}</span>}
        </span>
      )}
    </div>
  );
}

export function Kbd({ children, className }: any) {
  return <kbd className={cx('jw-kbd', className)}>{children}</kbd>;
}

export function Tooltip({ content, placement = 'top', children, open: forced, className }: any) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const show = forced !== undefined ? forced : open;
  return (
    <span className={cx('jw-tooltip-anchor', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-describedby={show ? id : undefined}>
      {children}
      <span role="tooltip" id={id} className={cx('jw-tooltip', 'jw-tooltip--' + placement, show && 'is-open')}>{content}</span>
    </span>
  );
}

/* ───────────────────────── Feedback ───────────────────────── */
const TONE_ICON: any = { neutral: 'info', accent: 'info', info: 'info', success: 'check-circle', warning: 'warning', danger: 'warning-circle' };
export function Banner({ tone = 'info', title, children, action, onClose, icon, className }: any) {
  return (
    <div className={cx('jw-banner', 'jw-banner--' + tone, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon || TONE_ICON[tone]} size={20} className="jw-banner__icon" />
      <div className="jw-banner__main">
        {title && <p className="jw-banner__title">{title}</p>}
        {children && <div className="jw-banner__body">{children}</div>}
        {action && <div className="jw-banner__action">{action}</div>}
      </div>
      {onClose && <IconButton icon="x" label="닫기" size="xs" onClick={onClose} className="jw-banner__close" />}
    </div>
  );
}

export function Toast({ tone = 'neutral', message, action, onClose, open = true, position = 'bottom', inline = false, className }: any) {
  if (!open) return null;
  const el = (
    <div className={cx('jw-toast', 'jw-toast--' + tone, !inline && 'jw-toast--float', !inline && 'jw-toast--' + position, className)} role="status" aria-live="polite">
      {tone !== 'neutral' && <Icon name={TONE_ICON[tone]} size={20} className="jw-toast__icon" />}
      <span className="jw-toast__msg">{message}</span>
      {action && <span className="jw-toast__action">{action}</span>}
      {onClose && <button type="button" className="jw-toast__close" aria-label="닫기" onClick={onClose}><Icon name="x" size={16} /></button>}
    </div>
  );
  return inline ? el : portal(el);
}
/* Imperative toast queue: useToast() → { show(message, opts), node } */
export function useToast() {
  const [items, setItems] = useState([] as any[]);
  const show = useCallback((message: any, opts: any = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs: any[]) => [...xs, { id, message, ...opts }]);
    setTimeout(() => setItems((xs: any[]) => xs.filter((x) => x.id !== id)), opts.duration || 3000);
  }, []);
  const node = portal(
    <div className="jw-toast-stack" aria-live="polite">
      {items.map((t: any) => <Toast key={t.id} inline tone={t.tone} message={t.message} action={t.action} />)}
    </div>
  );
  return { show, node };
}

export function Progress({ value, max = 100, label, showValue = false, tone = 'accent', size = 'md', className }: any) {
  const indeterminate = value == null;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cx('jw-progress', 'jw-progress--' + size, 'jw-progress--' + tone, indeterminate && 'is-indeterminate', className)}>
      {(label || showValue) && (
        <div className="jw-progress__head">
          {label && <span>{label}</span>}
          {showValue && !indeterminate && <span className="jw-progress__value">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="jw-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={indeterminate ? undefined : value}>
        <div className="jw-progress__bar" style={{ transform: indeterminate ? undefined : `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius, circle = false, lines, className }: any) {
  if (lines) return (
    <div className={cx('jw-skel-lines', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => <span key={i} className="jw-skel" style={{ width: i === lines - 1 ? '60%' : '100%', height }} />)}
    </div>
  );
  return <span className={cx('jw-skel', className)} aria-hidden="true" style={{ width: circle ? height : width, height, borderRadius: circle ? '9999px' : radius }} />;
}

export function EmptyState({ icon = 'folder', title, description, action, className }: any) {
  return (
    <div className={cx('jw-empty', className)}>
      <span className="jw-empty__icon"><Icon name={icon} size={28} /></span>
      <p className="jw-empty__title">{title}</p>
      {description && <p className="jw-empty__desc">{description}</p>}
      {action && <div className="jw-empty__action">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Overlays ───────────────────────── */
function useEsc(open: boolean, onClose: any) {
  useEffect(() => {
    if (!open || !onClose) return;
    const h = (e: any) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
}
function useFocusIn(open: boolean, ref: any) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const prev = document.activeElement as any;
    const el = ref.current.querySelector('[data-autofocus]');
    (el || ref.current).focus({ preventScroll: true });
    return () => { prev && prev.focus && prev.focus({ preventScroll: true }); };
  }, [open]);
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true, className }: any) {
  const ref = useRef(null);
  useEsc(open, dismissible ? onClose : null);
  useFocusIn(open, ref);
  const id = useId();
  if (!open) return null;
  return portal(
    <div className="jw-overlay" onMouseDown={(e: any) => { if (dismissible && e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} tabIndex={-1}
        className={cx('jw-modal', 'jw-modal--' + size, className)}>
        {(title || onClose) && (
          <div className="jw-modal__head">
            {title && <h2 id={id} className="jw-modal__title">{title}</h2>}
            {onClose && dismissible && <IconButton icon="x" label="닫기" size="sm" onClick={onClose} className="jw-modal__close" />}
          </div>
        )}
        {description && <p className="jw-modal__desc">{description}</p>}
        {children && <div className="jw-modal__body">{children}</div>}
        {footer && <div className="jw-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function BottomSheet({ open, onClose, title, description, children, footer, className }: any) {
  const ref = useRef(null);
  useEsc(open, onClose);
  useFocusIn(open, ref);
  const id = useId();
  if (!open) return null;
  return portal(
    <div className="jw-overlay jw-overlay--sheet" onMouseDown={(e: any) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} tabIndex={-1} className={cx('jw-sheet', className)}>
        <span className="jw-sheet__grip" aria-hidden="true" />
        {title && <h2 id={id} className="jw-sheet__title">{title}</h2>}
        {description && <p className="jw-sheet__desc">{description}</p>}
        {children && <div className="jw-sheet__body">{children}</div>}
        {footer && <div className="jw-sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Menu({ trigger, items = [], align = 'start', defaultOpen = false, className }: any) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEsc(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const h = (e: any) => { if (ref.current && !(ref.current as any).contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const onKey = (e: any) => {
    const els = Array.from((ref.current as any).querySelectorAll('.jw-menu__item:not(:disabled)')) as any[];
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (els[(i + 1) % els.length] || els[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (els[(i - 1 + els.length) % els.length] || els[0]).focus(); }
  };
  return (
    <span ref={ref} className={cx('jw-menu-anchor', className)} onKeyDown={onKey}>
      {React.cloneElement(trigger, { onClick: () => setOpen(!open), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div role="menu" className={cx('jw-menu', 'jw-menu--' + align)}>
          {items.map((it: any, i: number) => it === 'divider' || it.divider
            ? <div key={i} className="jw-menu__sep" role="separator" />
            : it.heading ? <div key={i} className="jw-menu__heading">{it.heading}</div>
            : (
              <button key={i} type="button" role="menuitem" disabled={it.disabled}
                className={cx('jw-menu__item', it.danger && 'is-danger')}
                onClick={() => { setOpen(false); it.onSelect && it.onSelect(); }}>
                {it.icon && <Icon name={it.icon} size={16} />}
                <span className="jw-menu__label">{it.label}</span>
                {it.shortcut && <span className="jw-menu__kbd">{it.shortcut}</span>}
                {it.checked && <Icon name="check" size={16} className="jw-menu__check" />}
              </button>
            ))}
        </div>
      )}
    </span>
  );
}

export function Popover({ trigger, children, align = 'start', defaultOpen = false, width = 280, className }: any) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEsc(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const h = (e: any) => { if (ref.current && !(ref.current as any).contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <span ref={ref} className={cx('jw-menu-anchor', className)}>
      {React.cloneElement(trigger, { onClick: () => setOpen(!open), 'aria-expanded': open })}
      {open && <div role="dialog" className={cx('jw-popover', 'jw-menu--' + align)} style={{ width }}>{children}</div>}
    </span>
  );
}

/* ───────────────────────── Navigation ───────────────────────── */
export function Tabs({ items = [], value, defaultValue, onChange, variant = 'line', size = 'md', fullWidth = false, className }: any) {
  const [inner, setInner] = useState(defaultValue ?? (items[0] && items[0].value));
  const v = value !== undefined ? value : inner;
  const set = (nv: any) => { if (value === undefined) setInner(nv); onChange && onChange(nv); };
  const ref = useRef(null);
  const onKey = (e: any) => {
    const i = items.findIndex((t: any) => t.value === v);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (n == null) return;
    const t = items[(n + items.length) % items.length];
    set(t.value);
    const btn = (ref.current as any).querySelectorAll('[role=tab]')[(n + items.length) % items.length];
    btn && btn.focus();
  };
  return (
    <div ref={ref} role="tablist" onKeyDown={onKey} className={cx('jw-tabs', 'jw-tabs--' + variant, 'jw-tabs--' + size, fullWidth && 'jw-tabs--full', className)}>
      {items.map((t: any) => (
        <button key={t.value} role="tab" type="button" aria-selected={t.value === v} tabIndex={t.value === v ? 0 : -1} disabled={t.disabled}
          className={cx('jw-tab', t.value === v && 'is-active')} onClick={() => set(t.value)}>
          {t.icon && <Icon name={t.icon} size={16} />}{t.label}
          {t.count != null && <span className="jw-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Breadcrumb({ items = [], className }: any) {
  return (
    <nav aria-label="현재 위치" className={cx('jw-crumbs', className)}>
      <ol>
        {items.map((it: any, i: number) => (
          <li key={i}>
            {i > 0 && <Icon name="caret-right" size={12} className="jw-crumbs__sep" />}
            {i === items.length - 1 ? <span aria-current="page">{it.label}</span> : <a href={it.href || '#'} onClick={it.onClick}>{it.label}</a>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, total, onChange, siblings = 1, className }: any) {
  const [inner, setInner] = useState(page || 1);
  const p = page !== undefined && onChange ? page : inner;
  const go = (n: number) => { if (n < 1 || n > total) return; setInner(n); onChange && onChange(n); };
  const nums: any[] = [];
  const lo = Math.max(2, p - siblings), hi = Math.min(total - 1, p + siblings);
  nums.push(1);
  if (lo > 2) nums.push('…l');
  for (let i = lo; i <= hi; i++) nums.push(i);
  if (hi < total - 1) nums.push('…r');
  if (total > 1) nums.push(total);
  return (
    <nav aria-label="페이지" className={cx('jw-pages', className)}>
      <IconButton icon="caret-left" label="이전 페이지" size="sm" disabled={p <= 1} onClick={() => go(p - 1)} />
      {nums.map((n) => typeof n === 'string'
        ? <span key={n} className="jw-pages__gap">…</span>
        : <button key={n} type="button" aria-current={n === p ? 'page' : undefined} className={cx('jw-pages__num', n === p && 'is-active')} onClick={() => go(n)}>{n}</button>)}
      <IconButton icon="caret-right" label="다음 페이지" size="sm" disabled={p >= total} onClick={() => go(p + 1)} />
    </nav>
  );
}

export function Stepper({ steps = [], current = 0, orientation = 'horizontal', className }: any) {
  return (
    <ol className={cx('jw-stepper', 'jw-stepper--' + orientation, className)}>
      {steps.map((s: any, i: number) => {
        const st = i < current ? 'done' : i === current ? 'current' : 'todo';
        const label = typeof s === 'string' ? s : s.label;
        return (
          <li key={i} className={'is-' + st} aria-current={st === 'current' ? 'step' : undefined}>
            <span className="jw-stepper__dot">{st === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="jw-stepper__text">
              <span className="jw-stepper__label">{label}</span>
              {s.description && <span className="jw-stepper__desc">{s.description}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Accordion({ items = [], multiple = false, defaultOpen = [], className }: any) {
  const [open, setOpen] = useState(defaultOpen as any[]);
  const uid = useId().replace(/:/g, '');
  const toggle = (k: any) => setOpen(open.includes(k) ? open.filter((x: any) => x !== k) : multiple ? [...open, k] : [k]);
  return (
    <div className={cx('jw-accordion', className)}>
      {items.map((it: any, i: number) => {
        const k = it.value ?? i;
        const on = open.includes(k);
        const id = uid + '-p' + i;
        return (
          <div key={k} className={cx('jw-acc', on && 'is-open')}>
            <h3 className="jw-acc__h">
              <button type="button" aria-expanded={on} aria-controls={id} onClick={() => toggle(k)} className="jw-acc__btn">
                <span>{it.title}</span>
                <span className="jw-acc__sign" aria-hidden="true" />
              </button>
            </h3>
            <div id={id} role="region" hidden={!on} className="jw-acc__panel">{it.content}</div>
          </div>
        );
      })}
    </div>
  );
}

export function AppBar({ title, onBack, leading, actions, large = false, className }: any) {
  return (
    <header className={cx('jw-appbar', large && 'jw-appbar--large', className)}>
      <div className="jw-appbar__row">
        <div className="jw-appbar__lead">
          {onBack && <IconButton icon="caret-left" label="뒤로" onClick={onBack} />}
          {leading}
        </div>
        {!large && title && <h1 className="jw-appbar__title">{title}</h1>}
        <div className="jw-appbar__actions">{actions}</div>
      </div>
      {large && title && <h1 className="jw-appbar__large">{title}</h1>}
    </header>
  );
}

export function Sidebar({ header, sections = [], footer, value, onChange, className }: any) {
  const [inner, setInner] = useState(value);
  const v = value !== undefined && onChange ? value : inner;
  return (
    <nav className={cx('jw-sidebar', className)} aria-label="주 메뉴">
      {header && <div className="jw-sidebar__head">{header}</div>}
      <div className="jw-sidebar__body">
        {sections.map((s: any, si: number) => (
          <div key={si} className="jw-sidebar__section">
            {s.title && <p className="jw-sidebar__title">{s.title}</p>}
            {s.items.map((it: any) => (
              <a key={it.value} href={it.href || '#'} aria-current={it.value === v ? 'page' : undefined}
                className={cx('jw-navitem', it.value === v && 'is-active')}
                onClick={(e: any) => { if (!it.href) e.preventDefault(); setInner(it.value); onChange && onChange(it.value); }}>
                {it.icon && <Icon name={it.icon} size={18} />}
                <span className="jw-navitem__label">{it.label}</span>
                {it.badge != null && <span className="jw-navitem__badge">{it.badge}</span>}
                {it.shortcut && <span className="jw-navitem__kbd">{it.shortcut}</span>}
              </a>
            ))}
          </div>
        ))}
      </div>
      {footer && <div className="jw-sidebar__foot">{footer}</div>}
    </nav>
  );
}

export function BottomNav({ items = [], value, defaultValue, onChange, className }: any) {
  const [inner, setInner] = useState(defaultValue ?? (items[0] && items[0].value));
  const v = value !== undefined ? value : inner;
  return (
    <nav className={cx('jw-bottomnav', className)} aria-label="하단 메뉴">
      {items.map((it: any) => (
        <button key={it.value} type="button" aria-current={it.value === v ? 'page' : undefined}
          className={cx('jw-bottomnav__item', it.value === v && 'is-active')}
          onClick={() => { if (value === undefined) setInner(it.value); onChange && onChange(it.value); }}>
          <span className="jw-bottomnav__icon"><Icon name={it.icon} size={24} />{it.badge && <span className="jw-bottomnav__dot" />}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ═══════════════════════ v2 additions ═══════════════════════ */

function useOutside(ref: any, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: any) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
}
function useControlled(value: any, defaultValue: any, onChange?: any) {
  const [inner, setInner] = useState(defaultValue);
  const v = value !== undefined ? value : inner;
  const set = (nv: any) => { if (value === undefined) setInner(nv); onChange && onChange(nv); };
  return [v, set];
}

/* ───────── date utils (values are 'YYYY-MM-DD' strings) ───────── */
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export function formatDate(s: string, style: 'long' | 'short' | 'dot' = 'long') {
  if (!s) return '';
  const d = fromISO(s);
  if (style === 'dot') return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
  if (style === 'short') return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}
const addDays = (s: string, n: number) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };

/* ───────── Calendar ───────── */
export function Calendar({ mode = 'single', value, defaultValue, onChange, min, max, isDisabled, month: monthProp, className }: any) {
  const [v, setV] = useControlled(value, defaultValue ?? (mode === 'range' ? [] : ''), onChange);
  const today = toISO(new Date());
  const anchor = (mode === 'range' ? (v && v[0]) : v) || monthProp || today;
  const [view, setView] = useState(anchor.slice(0, 7) + '-01');
  const [focus, setFocus] = useState(anchor);
  const [hover, setHover] = useState(null as any);
  const grid = useRef(null);
  const first = fromISO(view);
  const startOffset = first.getDay();
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(`${view.slice(0, 8)}${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const disabled = (s: string) => (min && s < min) || (max && s > max) || (isDisabled && isDisabled(s));
  const move = (n: number) => { const d = fromISO(view); d.setMonth(d.getMonth() + n); setView(toISO(d)); };
  const [rs, re] = mode === 'range' ? [v && v[0], v && v[1]] : [null, null];
  const pick = (s: string) => {
    if (disabled(s)) return;
    setFocus(s);
    if (mode === 'single') return setV(s);
    if (!rs || (rs && re)) return setV([s]);
    return setV(s < rs ? [s, rs] : [rs, s]);
  };
  const onKey = (e: any) => {
    const m: any = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (m[e.key] != null) {
      e.preventDefault();
      const n = addDays(focus, m[e.key]);
      setFocus(n);
      if (n.slice(0, 7) !== view.slice(0, 7)) setView(n.slice(0, 8) + '01');
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(focus); }
  };
  useEffect(() => {
    const el = grid.current && (grid.current as any).querySelector(`[data-date="${focus}"]`);
    if (el && (grid.current as any).contains(document.activeElement)) el.focus();
  }, [focus, view]);
  const endPreview = rs && !re ? hover : re;
  return (
    <div className={cx('jw-cal', className)}>
      <div className="jw-cal__head">
        <IconButton icon="caret-left" label="이전 달" size="sm" onClick={() => move(-1)} />
        <span className="jw-cal__title" aria-live="polite">{first.getFullYear()}년 {first.getMonth() + 1}월</span>
        <IconButton icon="caret-right" label="다음 달" size="sm" onClick={() => move(1)} />
      </div>
      <div className="jw-cal__grid" role="grid" ref={grid} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {WEEK.map((w, i) => <span key={w} role="columnheader" className={cx('jw-cal__wd', i === 0 && 'is-sun', i === 6 && 'is-sat')}>{w}</span>)}
        {cells.map((s, i) => {
          if (!s) return <span key={'e' + i} />;
          const lo = rs && endPreview ? (rs < endPreview ? rs : endPreview) : null;
          const hi = rs && endPreview ? (rs < endPreview ? endPreview : rs) : null;
          const sel = mode === 'single' ? s === v : s === rs || s === re;
          const inRange = lo && hi && s > lo && s < hi;
          const dow = i % 7;
          return (
            <button key={s} type="button" role="gridcell" data-date={s} tabIndex={s === focus ? 0 : -1}
              aria-selected={sel || undefined} aria-current={s === today ? 'date' : undefined} disabled={disabled(s)}
              onClick={() => pick(s)} onMouseEnter={() => setHover(s)}
              className={cx('jw-cal__day', sel && 'is-selected', inRange && 'is-inrange', lo && s === lo && hi !== lo && 'is-start', hi && s === hi && hi !== lo && 'is-end',
                s === today && 'is-today', dow === 0 && 'is-sun', dow === 6 && 'is-sat')}>
              <span>{Number(s.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── DatePicker ───────── */
export function DatePicker({ defaultOpen = false, label, helper, error, required, mode = 'single', value, defaultValue, onChange, placeholder, size = 'md', min, max, isDisabled, presets, disabled, className, id }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [v, setV] = useControlled(value, defaultValue ?? (mode === 'range' ? [] : ''), onChange);
  const [open, setOpen] = useState(!!defaultOpen);
  const ref = useRef(null);
  useOutside(ref, open, () => setOpen(false));
  useEsc(open, () => setOpen(false));
  const text = mode === 'range'
    ? (v && v[0] ? `${formatDate(v[0], 'dot')} – ${v[1] ? formatDate(v[1], 'dot') : ''}` : '')
    : (v ? formatDate(v) : '');
  const onPick = (nv: any) => { setV(nv); if (mode === 'single' || (nv && nv.length === 2)) setOpen(false); };
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div ref={ref} className="jw-menu-anchor jw-picker">
        <button id={fid} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-invalid={error ? true : undefined}
          className={cx('jw-input', 'jw-input--' + size, 'jw-picker__trigger', disabled && 'is-disabled', open && 'is-open')} onClick={() => setOpen(!open)}>
          <Icon name="calendar-blank" size={size === 'sm' ? 16 : 20} className="jw-input__icon" />
          <span className={cx('jw-picker__value', !text && 'is-placeholder')}>{text || placeholder || (mode === 'range' ? '기간 선택' : '날짜 선택')}</span>
        </button>
        {open && (
          <div role="dialog" aria-label={mode === 'range' ? '기간 선택' : '날짜 선택'} className="jw-popover jw-picker__pop">
            {presets && (
              <div className="jw-picker__presets">
                {presets.map((p: any) => <Tag key={p.label} size="sm" onClick={() => { setV(p.value); setOpen(false); }}>{p.label}</Tag>)}
              </div>
            )}
            <Calendar mode={mode} value={v} onChange={onPick} min={min} max={max} isDisabled={isDisabled} />
          </div>
        )}
      </div>
    </FieldShell>
  );
}

/* ───────── TimePicker ───────── */
export function formatTime(t: string) {
  if (!t) return '';
  const [H, M] = t.split(':').map(Number);
  return `${H < 12 ? '오전' : '오후'} ${H % 12 === 0 ? 12 : H % 12}:${pad(M)}`;
}
export function TimePicker({ defaultOpen = false, label, helper, error, required, value, defaultValue, onChange, step = 30, start = '00:00', end = '23:59', placeholder = '시간 선택', size = 'md', disabled, className, id }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [v, setV] = useControlled(value, defaultValue ?? '', onChange);
  const [open, setOpen] = useState(!!defaultOpen);
  const ref = useRef(null);
  const list = useRef(null);
  useOutside(ref, open, () => setOpen(false));
  useEsc(open, () => setOpen(false));
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const times: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  useEffect(() => {
    if (open && list.current) { const box = list.current as any; const el = box.querySelector('.is-selected'); if (el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2; }
  }, [open]);
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div ref={ref} className="jw-menu-anchor jw-picker">
        <button id={fid} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
          className={cx('jw-input', 'jw-input--' + size, 'jw-picker__trigger', disabled && 'is-disabled', open && 'is-open')} onClick={() => setOpen(!open)}>
          <Icon name="clock" size={size === 'sm' ? 16 : 20} className="jw-input__icon" />
          <span className={cx('jw-picker__value', !v && 'is-placeholder')}>{v ? formatTime(v) : placeholder}</span>
        </button>
        {open && (
          <div ref={list} role="listbox" className="jw-menu jw-picker__times">
            {times.map((t) => (
              <button key={t} type="button" role="option" aria-selected={t === v} className={cx('jw-menu__item', t === v && 'is-selected')}
                onClick={() => { setV(t); setOpen(false); }}>
                <span className="jw-menu__label">{formatTime(t)}</span>
                {t === v && <Icon name="check" size={16} className="jw-menu__check" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}

/* ───────── FileUpload ───────── */
export function formatBytes(n: number) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + 'MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + 'GB';
}
const fileIcon = (name: string, type?: string) => (/^image\//.test(type || '') || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(name) ? 'image' : /\.pdf$/i.test(name) ? 'file-pdf' : /\.(txt|md|docx?|hwp|hwpx)$/i.test(name) ? 'file-text' : 'file');
export function FileUpload({ label, description, accept, multiple = true, maxSize, maxFiles, files, defaultFiles, onFilesChange, onSelect, variant = 'dropzone', disabled, error, className }: any) {
  const [list, setList] = useControlled(files, defaultFiles ?? [], onFilesChange);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const id = useId();
  const add = (fl: any) => {
    const arr = Array.from(fl || []) as any[];
    const next = arr.slice(0, maxFiles ? Math.max(0, maxFiles - list.length) : undefined).map((f) => ({
      id: Math.random().toString(36).slice(2), name: f.name, size: f.size, type: f.type, file: f,
      status: maxSize && f.size > maxSize ? 'error' : 'ready',
      error: maxSize && f.size > maxSize ? `${formatBytes(maxSize)}보다 큰 파일은 올릴 수 없어요` : undefined,
    }));
    const merged = multiple ? [...list, ...next] : next.slice(0, 1);
    setList(merged);
    onSelect && onSelect(next.filter((x) => x.status !== 'error'));
  };
  const remove = (fid: string) => setList(list.filter((f: any) => f.id !== fid));
  const open = () => input.current && (input.current as any).click();
  const hidden = <input ref={input} id={id} type="file" hidden accept={accept} multiple={multiple} disabled={disabled} onChange={(e: any) => { add(e.target.files); e.target.value = ''; }} />;
  return (
    <div className={cx('jw-upload', className)}>
      {label && <label className="jw-field__label" htmlFor={id}>{label}</label>}
      {variant === 'button' ? (
        <div className="jw-upload__btnrow">
          <Button variant="outline" leftIcon="paperclip" onClick={open} disabled={disabled}>파일 첨부</Button>
          {description && <span className="jw-upload__hint">{description}</span>}
          {hidden}
        </div>
      ) : (
        <div role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
          className={cx('jw-drop', drag && 'is-drag', disabled && 'is-disabled', error && 'is-invalid')}
          onClick={() => !disabled && open()}
          onKeyDown={(e: any) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
          onDragOver={(e: any) => { e.preventDefault(); if (!disabled) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e: any) => { e.preventDefault(); setDrag(false); if (!disabled) add(e.dataTransfer.files); }}>
          <span className="jw-drop__icon"><Icon name="cloud-arrow-up" size={24} /></span>
          <p className="jw-drop__title">{drag ? '여기에 놓으면 올라가요' : <>파일을 끌어다 놓거나 <span className="jw-drop__link">선택</span>해 주세요</>}</p>
          {description && <p className="jw-drop__desc">{description}</p>}
          {hidden}
        </div>
      )}
      {error && <p className="jw-field__msg jw-field__msg--error"><Icon name="warning-circle" size={14} />{error}</p>}
      {list.length > 0 && (
        <ul className="jw-files" role="list">
          {list.map((f: any) => (
            <li key={f.id} className={cx('jw-file', f.status === 'error' && 'is-error')}>
              <span className="jw-file__icon"><Icon name={fileIcon(f.name, f.type) as any} size={20} /></span>
              <div className="jw-file__main">
                <div className="jw-file__row">
                  <span className="jw-file__name" title={f.name}>{f.name}</span>
                  <span className="jw-file__meta">
                    {f.status === 'uploading' ? `${Math.round(f.progress || 0)}%` : formatBytes(f.size || 0)}
                  </span>
                </div>
                {f.status === 'uploading' && <Progress value={f.progress || 0} size="sm" />}
                {f.status === 'error' && <span className="jw-file__err">{f.error || '올리지 못했어요'}</span>}
              </div>
              {f.status === 'done' && <Icon name="check-circle" size={20} className="jw-file__ok" label="완료" />}
              <IconButton icon={f.status === 'uploading' ? 'x' : 'trash'} label={f.status === 'uploading' ? '업로드 취소' : '삭제'} size="sm" onClick={() => remove(f.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── Combobox ───────── */
export function Combobox({ defaultOpen = false, label, helper, error, required, options = [], value, defaultValue, onChange, multiple = false, placeholder = '검색해서 선택', emptyText = '일치하는 항목이 없어요', creatable = false, size = 'md', disabled, className, id }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const opts = options.map((o: any) => (typeof o === 'string' ? { value: o, label: o } : o));
  const [v, setV] = useControlled(value, defaultValue ?? (multiple ? [] : ''), onChange);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!!defaultOpen);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  useOutside(ref, open, () => setOpen(false));
  const labelOf = (val: any) => (opts.find((o: any) => o.value === val) || { label: val }).label;
  const selected = (val: any) => (multiple ? (v || []).includes(val) : v === val);
  const filtered = opts.filter((o: any) => !q || String(o.label).toLowerCase().includes(q.toLowerCase()) || String(o.value).toLowerCase().includes(q.toLowerCase()));
  const canCreate = creatable && q.trim() && !opts.some((o: any) => String(o.label) === q.trim());
  const items = canCreate ? [...filtered, { value: q.trim(), label: `“${q.trim()}” 추가`, create: true }] : filtered;
  const choose = (o: any) => {
    if (!o || o.disabled) return;
    if (multiple) setV(selected(o.value) ? v.filter((x: any) => x !== o.value) : [...(v || []), o.value]);
    else { setV(o.value); setOpen(false); }
    setQ('');
  };
  const onKey = (e: any) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.min(active + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open) choose(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !q && multiple && v.length) setV(v.slice(0, -1));
  };
  useEffect(() => setActive(0), [q]);
  const listId = fid + '-list';
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div ref={ref} className="jw-menu-anchor jw-picker">
        <div className={cx('jw-input', 'jw-input--' + size, 'jw-combo', multiple && 'jw-combo--multi', disabled && 'is-disabled')} onClick={() => { (inputRef.current as any).focus(); setOpen(true); }}>
          {multiple && (v || []).map((val: any) => <Tag key={val} size="sm" onRemove={() => setV(v.filter((x: any) => x !== val))}>{labelOf(val)}</Tag>)}
          <input ref={inputRef} id={fid} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" disabled={disabled}
            aria-activedescendant={open && items[active] ? `${fid}-o${active}` : undefined}
            value={open || multiple ? q : (v ? String(labelOf(v)) : q)} placeholder={multiple && v.length ? '' : (!multiple && v ? String(labelOf(v)) : placeholder)}
            onChange={(e: any) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
          <Icon name="caret-down" size={16} className="jw-select__caret jw-combo__caret" />
        </div>
        {open && (
          <div id={listId} role="listbox" aria-multiselectable={multiple || undefined} className="jw-menu jw-combo__list">
            {items.length === 0 && <div className="jw-combo__empty">{emptyText}</div>}
            {items.map((o: any, i: number) => (
              <div key={o.value + (o.create ? '+' : '')} id={`${fid}-o${i}`} role="option" aria-selected={selected(o.value)} aria-disabled={o.disabled || undefined}
                className={cx('jw-menu__item', i === active && 'is-active', o.disabled && 'is-disabled')}
                onMouseEnter={() => setActive(i)} onMouseDown={(e: any) => { e.preventDefault(); choose(o); }}>
                {o.create ? <Icon name="plus" size={16} /> : o.icon ? <Icon name={o.icon} size={16} /> : null}
                <span className="jw-menu__label">{o.label}{o.description && <span className="jw-combo__desc">{o.description}</span>}</span>
                {selected(o.value) && <Icon name="check" size={16} className="jw-menu__check" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}

/* ───────── NumberInput ───────── */
export function NumberInput({ label, helper, error, required, value, defaultValue, onChange, min = -Infinity, max = Infinity, step = 1, suffix, size = 'md', disabled, className, id }: any) {
  const autoId = useId();
  const fid = id || autoId;
  const [v, setV] = useControlled(value, defaultValue ?? 0, onChange);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <FieldShell id={fid} label={label} required={required} helper={helper} error={error} className={className}>
      <div className={cx('jw-input', 'jw-input--' + size, 'jw-number', disabled && 'is-disabled')}>
        <button type="button" className="jw-number__btn" aria-label="줄이기" disabled={disabled || v <= min} onClick={() => setV(clamp(v - step))}><Icon name="minus" size={16} /></button>
        <input id={fid} type="text" inputMode="decimal" role="spinbutton" aria-valuenow={v} aria-valuemin={isFinite(min) ? min : undefined} aria-valuemax={isFinite(max) ? max : undefined}
          disabled={disabled} value={v} onChange={(e: any) => { const n = Number(e.target.value.replace(/[^\d.-]/g, '')); if (!isNaN(n)) setV(clamp(n)); }}
          onKeyDown={(e: any) => { if (e.key === 'ArrowUp') { e.preventDefault(); setV(clamp(v + step)); } if (e.key === 'ArrowDown') { e.preventDefault(); setV(clamp(v - step)); } }} />
        {suffix && <span className="jw-input__affix">{suffix}</span>}
        <button type="button" className="jw-number__btn" aria-label="늘리기" disabled={disabled || v >= max} onClick={() => setV(clamp(v + step))}><Icon name="plus" size={16} /></button>
      </div>
    </FieldShell>
  );
}

/* ───────── PinInput ───────── */
export function PinInput({ length = 6, value, defaultValue, onChange, onComplete, mask = false, error, disabled, label = '인증번호', className }: any) {
  const [v, setV] = useControlled(value, defaultValue ?? '', onChange);
  const refs = useRef([] as any[]);
  const set = (nv: string) => { nv = nv.replace(/\D/g, '').slice(0, length); setV(nv); if (nv.length === length && onComplete) onComplete(nv); };
  const chars = Array.from({ length }, (_, i) => v[i] || '');
  return (
    <div className={cx('jw-pin', error && 'is-invalid', className)} role="group" aria-label={label}>
      <div className="jw-pin__boxes">
        {chars.map((c, i) => (
          <input key={i} ref={(el) => (refs.current[i] = el)} className={cx('jw-pin__box', c && 'is-filled')} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
            type={mask ? 'password' : 'text'} maxLength={1} value={c} disabled={disabled} aria-label={`${label} ${i + 1}번째 자리`} aria-invalid={error ? true : undefined}
            onChange={(e: any) => {
              const d = e.target.value.replace(/\D/g, '');
              if (!d) return;
              const nv = (v.slice(0, i) + d + v.slice(i + d.length)).slice(0, length);
              set(nv);
              const nxt = refs.current[Math.min(i + d.length, length - 1)]; nxt && nxt.focus();
            }}
            onKeyDown={(e: any) => {
              if (e.key === 'Backspace') { e.preventDefault(); if (v[i]) set(v.slice(0, i) + v.slice(i + 1)); else if (i > 0) { set(v.slice(0, i - 1) + v.slice(i)); refs.current[i - 1].focus(); } }
              if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1].focus();
              if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1].focus();
            }}
            onPaste={(e: any) => { e.preventDefault(); set(e.clipboardData.getData('text')); const n = refs.current[Math.min(length - 1, e.clipboardData.getData('text').length)]; n && n.focus(); }}
            onFocus={(e: any) => e.target.select()} />
        ))}
      </div>
      {error && <p className="jw-field__msg jw-field__msg--error"><Icon name="warning-circle" size={14} />{error}</p>}
    </div>
  );
}

/* ───────── PasswordField ───────── */
export function passwordStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return pw ? Math.max(1, Math.min(4, s)) : 0;
}
export function PasswordField({ showStrength = false, value, defaultValue, onChange, ...rest }: any) {
  const [show, setShow] = useState(false);
  const [v, setV] = useControlled(value, defaultValue ?? '', undefined);
  const lvl = passwordStrength(v);
  const names = ['', '약함', '보통', '좋음', '강함'];
  return (
    <div className="jw-password">
      <TextField {...rest} type={show ? 'text' : 'password'} value={v} autoComplete={rest.autoComplete || 'current-password'}
        onChange={(e: any) => { setV(e.target.value); onChange && onChange(e); }}
        suffix={<button type="button" className="jw-input__clear" aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={show} onClick={() => setShow(!show)}><Icon name={show ? 'eye-slash' : 'eye'} size={18} /></button>} />
      {showStrength && v && (
        <div className={cx('jw-strength', 'jw-strength--' + lvl)} aria-live="polite">
          <div className="jw-strength__bars">{[1, 2, 3, 4].map((i) => <span key={i} className={i <= lvl ? 'is-on' : ''} />)}</div>
          <span className="jw-strength__label">보안 수준 {names[lvl]}</span>
        </div>
      )}
    </div>
  );
}

/* ───────── Drawer ───────── */
export function Drawer({ open, onClose, title, description, side = 'right', width = 440, children, footer, className }: any) {
  const ref = useRef(null);
  useEsc(open, onClose);
  useFocusIn(open, ref);
  const id = useId();
  if (!open) return null;
  return portal(
    <div className={cx('jw-overlay', 'jw-overlay--drawer', 'jw-overlay--' + side)} onMouseDown={(e: any) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} tabIndex={-1} className={cx('jw-drawer', 'jw-drawer--' + side, className)} style={{ width }}>
        <div className="jw-drawer__head">
          <div>
            {title && <h2 id={id} className="jw-drawer__title">{title}</h2>}
            {description && <p className="jw-drawer__desc">{description}</p>}
          </div>
          {onClose && <IconButton icon="x" label="닫기" size="sm" onClick={onClose} />}
        </div>
        <div className="jw-drawer__body">{children}</div>
        {footer && <div className="jw-drawer__foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── CommandPalette ───────── */
export function CommandPalette({ open, onOpenChange, groups = [], placeholder = '무엇을 할까요?', emptyText = '일치하는 명령이 없어요', hotkey = true, className }: any) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  useEffect(() => {
    if (!hotkey || !onOpenChange) return;
    const h = (e: any) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, hotkey, onOpenChange]);
  useEsc(open, () => onOpenChange && onOpenChange(false));
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);
  const match = (it: any) => !q || [it.label, ...(it.keywords || [])].join(' ').toLowerCase().includes(q.toLowerCase());
  const fg = groups.map((g: any) => ({ ...g, items: g.items.filter(match) })).filter((g: any) => g.items.length);
  const flat = fg.flatMap((g: any) => g.items);
  const run = (it: any) => { onOpenChange && onOpenChange(false); it && it.onSelect && it.onSelect(); };
  useEffect(() => { const box = listRef.current as any; const el = box && box.querySelector('.is-active'); if (!el) return; if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 8; else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 8; }, [active]);
  if (!open) return null;
  let idx = -1;
  return portal(
    <div className="jw-overlay jw-overlay--cmd" onMouseDown={(e: any) => { if (e.target === e.currentTarget && onOpenChange) onOpenChange(false); }}>
      <div role="dialog" aria-modal="true" aria-label="명령 팔레트" className={cx('jw-cmd', className)}>
        <div className="jw-cmd__search">
          <Icon name="magnifying-glass" size={20} className="jw-input__icon" />
          <input autoFocus role="combobox" aria-expanded="true" aria-controls="jw-cmd-list" placeholder={placeholder} value={q}
            onChange={(e: any) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e: any) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(active + 1, flat.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); run(flat[active]); }
            }} />
          <Kbd>Esc</Kbd>
        </div>
        <div id="jw-cmd-list" role="listbox" ref={listRef} className="jw-cmd__list">
          {flat.length === 0 && <div className="jw-combo__empty">{emptyText}</div>}
          {fg.map((g: any) => (
            <div key={g.title} role="group" aria-label={g.title}>
              {g.title && <div className="jw-menu__heading">{g.title}</div>}
              {g.items.map((it: any) => { idx++; const i = idx; return (
                <div key={it.label} role="option" aria-selected={i === active} className={cx('jw-menu__item', 'jw-cmd__item', i === active && 'is-active')}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e: any) => { e.preventDefault(); run(it); }}>
                  {it.icon && <Icon name={it.icon} size={18} />}
                  <span className="jw-menu__label">{it.label}</span>
                  {it.shortcut && <span className="jw-cmd__keys">{String(it.shortcut).split(' ').map((k: string) => <Kbd key={k}>{k}</Kbd>)}</span>}
                </div>
              ); })}
            </div>
          ))}
        </div>
        <div className="jw-cmd__foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> 이동</span><span><Kbd>↵</Kbd> 실행</span><span><Kbd>⌘</Kbd><Kbd>K</Kbd> 열기·닫기</span>
        </div>
      </div>
    </div>
  );
}

/* ───────── CodeBlock ───────── */
export function CodeBlock({ code = '', language, title, showLineNumbers = false, copyable = true, maxHeight, className }: any) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(code); } catch (e) { /* no clipboard */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const lines = String(code).replace(/\n$/, '').split('\n');
  return (
    <div className={cx('jw-code', className)}>
      {(title || language || copyable) && (
        <div className="jw-code__head">
          <span className="jw-code__title">{title || language}</span>
          {copyable && <button type="button" className="jw-code__copy" onClick={copy} aria-live="polite"><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? '복사했어요' : '복사'}</button>}
        </div>
      )}
      <pre className="jw-code__pre" style={{ maxHeight }}><code>
        {lines.map((l, i) => <span key={i} className="jw-code__line">{showLineNumbers && <span className="jw-code__ln" aria-hidden="true">{i + 1}</span>}{l || ' '}{'\n'}</span>)}
      </code></pre>
    </div>
  );
}

/* ───────── DescriptionList ───────── */
export function DescriptionList({ items = [], layout = 'horizontal', columns = 1, className }: any) {
  const [copied, setCopied] = useState(null as any);
  return (
    <dl className={cx('jw-dl', 'jw-dl--' + layout, className)} style={{ ['--jw-dl-cols' as any]: columns }}>
      {items.map((it: any, i: number) => (
        <div key={i} className="jw-dl__item">
          <dt>{it.term}</dt>
          <dd>
            <span>{it.description}</span>
            {it.copyable && (
              <button type="button" className="jw-dl__copy" aria-label={`${it.term} 복사`}
                onClick={() => { try { navigator.clipboard.writeText(String(it.copyValue ?? it.description)); } catch (e) { /* */ } setCopied(i); setTimeout(() => setCopied(null), 1400); }}>
                <Icon name={copied === i ? 'check' : 'copy'} size={14} />
              </button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── TreeView ───────── */
export function TreeView({ items = [], defaultExpanded = [], selected, defaultSelected, onSelect, className }: any) {
  const [exp, setExp] = useState(defaultExpanded as any[]);
  const [sel, setSel] = useControlled(selected, defaultSelected, onSelect);
  const [focus, setFocus] = useState(items[0] && items[0].id);
  const ref = useRef(null);
  const visible: any[] = [];
  const walk = (nodes: any[], depth: number, parent: any) => nodes.forEach((n) => { visible.push({ ...n, depth, parent }); if (n.children && exp.includes(n.id)) walk(n.children, depth + 1, n.id); });
  walk(items, 0, null);
  const toggle = (id: any) => setExp(exp.includes(id) ? exp.filter((x: any) => x !== id) : [...exp, id]);
  const onKey = (e: any) => {
    const i = visible.findIndex((n) => n.id === focus); const n = visible[i]; if (!n) return;
    const go = (id: any) => { e.preventDefault(); setFocus(id); const el = (ref.current as any).querySelector(`[data-id="${id}"]`); el && el.focus(); };
    if (e.key === 'ArrowDown' && visible[i + 1]) go(visible[i + 1].id);
    else if (e.key === 'ArrowUp' && visible[i - 1]) go(visible[i - 1].id);
    else if (e.key === 'ArrowRight' && n.children) { e.preventDefault(); if (!exp.includes(n.id)) toggle(n.id); else if (visible[i + 1]) go(visible[i + 1].id); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (n.children && exp.includes(n.id)) toggle(n.id); else if (n.parent != null) go(n.parent); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.children ? toggle(n.id) : setSel(n.id); }
  };
  return (
    <div ref={ref} role="tree" className={cx('jw-tree', className)} onKeyDown={onKey}>
      {visible.map((n) => {
        const open = exp.includes(n.id);
        return (
          <div key={n.id} data-id={n.id} role="treeitem" aria-level={n.depth + 1} aria-expanded={n.children ? open : undefined} aria-selected={sel === n.id}
            tabIndex={n.id === focus ? 0 : -1} className={cx('jw-tree__item', sel === n.id && 'is-selected')} style={{ paddingLeft: 8 + n.depth * 20 }}
            onClick={() => { setFocus(n.id); n.children ? toggle(n.id) : setSel(n.id); }}>
            <span className={cx('jw-tree__caret', open && 'is-open', !n.children && 'is-leaf')}><Icon name="caret-right" size={12} /></span>
            <Icon name={n.icon || (n.children ? (open ? 'folder-open' : 'folder') : fileIcon(n.label))} size={18} className="jw-tree__icon" />
            <span className="jw-tree__label">{n.label}</span>
            {n.meta != null && <span className="jw-tree__meta">{n.meta}</span>}
          </div>
        );
      })}
    </div>
  );
}
