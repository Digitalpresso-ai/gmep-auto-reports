import type * as React from 'react';

/** Icon names bundled from Phosphor Icons (Bold). See jwdesign.iconNames. */
export type IconName =
  | 'house' | 'magnifying-glass' | 'bell' | 'gear' | 'user' | 'users' | 'plus' | 'minus' | 'x' | 'check'
  | 'caret-down' | 'caret-up' | 'caret-left' | 'caret-right' | 'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down' | 'arrow-up-right'
  | 'info' | 'warning' | 'warning-circle' | 'check-circle' | 'x-circle' | 'question' | 'dots-three' | 'dots-three-vertical'
  | 'pencil-simple' | 'trash' | 'copy' | 'download-simple' | 'upload-simple' | 'share-network' | 'link' | 'calendar-blank' | 'clock'
  | 'eye' | 'eye-slash' | 'lock-simple' | 'sign-out' | 'funnel' | 'sliders-horizontal' | 'list' | 'squares-four' | 'star' | 'heart'
  | 'image' | 'file-text' | 'folder' | 'paper-plane-tilt' | 'chat-circle' | 'envelope-simple' | 'phone' | 'map-pin' | 'lightning'
  | 'credit-card' | 'chart-bar' | 'globe' | 'sun' | 'moon' | 'arrow-clockwise' | 'plus-circle' | 'bookmark-simple' | 'tag'
  | 'cloud-arrow-up' | 'paperclip' | 'file' | 'folder-open' | 'command' | 'file-pdf' | 'caret-double-left' | 'caret-double-right';
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
/** accent = brand green, info = blue. */
export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

/* Foundations */
export interface IconProps { name: IconName; size?: number | string; label?: string; className?: string; style?: React.CSSProperties }
/** SVG icon painted with currentColor. */
export declare function Icon(props: IconProps): React.ReactElement;
export declare const iconNames: IconName[];

/* Actions */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'weak' | 'outline' | 'ghost' | 'danger' | 'danger-weak';
  size?: ControlSize; loading?: boolean; fullWidth?: boolean; leftIcon?: IconName; rightIcon?: IconName;
}
/** The button. One primary per view. */
export declare function Button(props: ButtonProps): React.ReactElement;
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; label: string; variant?: ButtonProps['variant']; size?: ControlSize }
/** Square icon-only button; label is required. */
export declare function IconButton(props: IconButtonProps): React.ReactElement;
export declare function ButtonGroup(props: { children: React.ReactNode; direction?: 'row' | 'column'; fullWidth?: boolean; className?: string }): React.ReactElement;
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> { external?: boolean }
export declare function Link(props: LinkProps): React.ReactElement;

/* Forms */
interface FieldBase { label?: React.ReactNode; helper?: React.ReactNode; error?: React.ReactNode; required?: boolean }
export interface TextFieldProps extends FieldBase, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md' | 'lg'; prefix?: React.ReactNode; suffix?: React.ReactNode; leftIcon?: IconName; clearable?: boolean; onClear?: () => void;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;
export declare function SearchField(props: TextFieldProps): React.ReactElement;
export interface TextAreaProps extends FieldBase, React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export declare function TextArea(props: TextAreaProps): React.ReactElement;
export type Option = string | { value: string; label: React.ReactNode; disabled?: boolean };
export interface SelectProps extends FieldBase, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> { size?: 'sm' | 'md' | 'lg'; options: Option[]; placeholder?: string }
export declare function Select(props: SelectProps): React.ReactElement;
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode; description?: React.ReactNode; indeterminate?: boolean }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;
export interface RadioGroupProps { name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: React.ReactNode; direction?: 'column' | 'row'; children: React.ReactNode; className?: string }
export declare function RadioGroup(props: RadioGroupProps): React.ReactElement;
export declare function Radio(props: { value: string; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; className?: string }): React.ReactElement;
export interface SwitchProps { label?: React.ReactNode; description?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; onChange?: (checked: boolean) => void; size?: 'sm' | 'md'; disabled?: boolean; id?: string; className?: string; 'aria-label'?: string }
/** Immediate on/off. */
export declare function Switch(props: SwitchProps): React.ReactElement;
export interface SegmentedControlProps { options: (string | { value: string; label: React.ReactNode; icon?: IconName; disabled?: boolean })[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; size?: 'sm' | 'md' | 'lg'; fullWidth?: boolean; label?: string; className?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;
export interface SliderProps { label?: React.ReactNode; min?: number; max?: number; step?: number; value?: number; defaultValue?: number; onChange?: (value: number) => void; showValue?: boolean; format?: (value: number) => React.ReactNode; disabled?: boolean; id?: string; className?: string }
export declare function Slider(props: SliderProps): React.ReactElement;

/* Data display */
export declare function Badge(props: { tone?: Tone; variant?: 'soft' | 'solid' | 'outline'; size?: 'sm' | 'md'; dot?: boolean; children: React.ReactNode; className?: string }): React.ReactElement;
export declare function Tag(props: { children: React.ReactNode; selected?: boolean; onClick?: () => void; onRemove?: () => void; icon?: IconName; size?: 'sm' | 'md'; disabled?: boolean; className?: string }): React.ReactElement;
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export declare function Avatar(props: { name?: string; src?: string; size?: AvatarSize; status?: 'online' | 'away' | 'offline'; className?: string }): React.ReactElement;
export declare function AvatarGroup(props: { children: React.ReactNode; max?: number; size?: AvatarSize; className?: string }): React.ReactElement;
export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; footer?: React.ReactNode; padding?: 'sm' | 'md' | 'lg'; variant?: 'outline' | 'filled' | 'elevated'; interactive?: boolean; href?: string }
export declare function Card(props: CardProps): React.ReactElement;
export declare function List(props: { header?: React.ReactNode; inset?: boolean; children: React.ReactNode; className?: string }): React.ReactElement;
export interface ListRowProps { title: React.ReactNode; description?: React.ReactNode; leading?: IconName | React.ReactNode; trailing?: React.ReactNode; value?: React.ReactNode; chevron?: boolean; onClick?: () => void; href?: string; disabled?: boolean; className?: string }
export declare function ListRow(props: ListRowProps): React.ReactElement;
export declare function Divider(props: { label?: React.ReactNode; spacing?: number; vertical?: boolean; className?: string }): React.ReactElement;
export interface TableColumn<R = any> { key: string; title: React.ReactNode; width?: number | string; align?: 'left' | 'center' | 'right'; numeric?: boolean; sortable?: boolean; sortValue?: (row: R) => any; render?: (row: R) => React.ReactNode }
export interface TableProps<R = any> { columns: TableColumn<R>[]; rows: R[]; rowKey?: string | ((row: R) => React.Key); selectable?: boolean; selected?: React.Key[]; onSelectChange?: (keys: React.Key[]) => void; density?: 'sm' | 'md' | 'lg'; empty?: React.ReactNode; className?: string }
export declare function Table<R = any>(props: TableProps<R>): React.ReactElement;
export declare function Stat(props: { label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; delta?: string; deltaTone?: 'success' | 'danger' | 'neutral'; caption?: React.ReactNode; className?: string }): React.ReactElement;
export declare function Kbd(props: { children: React.ReactNode; className?: string }): React.ReactElement;
export declare function Tooltip(props: { content: React.ReactNode; placement?: 'top' | 'bottom'; open?: boolean; children: React.ReactNode; className?: string }): React.ReactElement;

/* Feedback */
export declare function Banner(props: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; onClose?: () => void; icon?: IconName; className?: string }): React.ReactElement;
export interface ToastProps { tone?: Tone; message: React.ReactNode; action?: React.ReactNode; onClose?: () => void; open?: boolean; position?: 'top' | 'bottom'; inline?: boolean; className?: string }
export declare function Toast(props: ToastProps): React.ReactElement | null;
export declare function useToast(): { show: (message: React.ReactNode, opts?: { tone?: Tone; action?: React.ReactNode; duration?: number }) => void; node: React.ReactNode };
export declare function Progress(props: { value?: number; max?: number; label?: React.ReactNode; showValue?: boolean; tone?: 'accent' | 'info' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'md'; className?: string }): React.ReactElement;
export declare function Spinner(props: { size?: number; label?: string; className?: string }): React.ReactElement;
export declare function Skeleton(props: { width?: number | string; height?: number | string; radius?: number | string; circle?: boolean; lines?: number; className?: string }): React.ReactElement;
export declare function EmptyState(props: { icon?: IconName; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }): React.ReactElement;

/* Overlays */
export interface ModalProps { open: boolean; onClose?: () => void; title?: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; dismissible?: boolean; className?: string }
export declare function Modal(props: ModalProps): React.ReactElement | null;
export declare function BottomSheet(props: Omit<ModalProps, 'size' | 'dismissible'>): React.ReactElement | null;
export type MenuItem = 'divider' | { divider: true } | { heading: React.ReactNode } | { label: React.ReactNode; icon?: IconName; shortcut?: string; danger?: boolean; disabled?: boolean; checked?: boolean; onSelect?: () => void };
export declare function Menu(props: { trigger: React.ReactElement; items: MenuItem[]; align?: 'start' | 'end'; defaultOpen?: boolean; className?: string }): React.ReactElement;
export declare function Popover(props: { trigger: React.ReactElement; children: React.ReactNode; align?: 'start' | 'end'; defaultOpen?: boolean; width?: number | string; className?: string }): React.ReactElement;

/* Navigation */
export interface TabItem { value: string; label: React.ReactNode; icon?: IconName; count?: number; disabled?: boolean }
export declare function Tabs(props: { items: TabItem[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; variant?: 'line' | 'pill'; size?: 'sm' | 'md'; fullWidth?: boolean; className?: string }): React.ReactElement;
export declare function Breadcrumb(props: { items: { label: React.ReactNode; href?: string; onClick?: () => void }[]; className?: string }): React.ReactElement;
export declare function Pagination(props: { page?: number; total: number; onChange?: (page: number) => void; siblings?: number; className?: string }): React.ReactElement;
export declare function Stepper(props: { steps: (string | { label: React.ReactNode; description?: React.ReactNode })[]; current?: number; orientation?: 'horizontal' | 'vertical'; className?: string }): React.ReactElement;
export declare function Accordion(props: { items: { title: React.ReactNode; content: React.ReactNode; value?: string | number }[]; multiple?: boolean; defaultOpen?: (string | number)[]; className?: string }): React.ReactElement;
export declare function AppBar(props: { title?: React.ReactNode; onBack?: () => void; leading?: React.ReactNode; actions?: React.ReactNode; large?: boolean; className?: string }): React.ReactElement;
export interface NavItem { value: string; label: React.ReactNode; icon?: IconName; badge?: React.ReactNode; shortcut?: string; href?: string }
export declare function Sidebar(props: { header?: React.ReactNode; sections: { title?: React.ReactNode; items: NavItem[] }[]; footer?: React.ReactNode; value?: string; onChange?: (value: string) => void; className?: string }): React.ReactElement;
export declare function BottomNav(props: { items: { value: string; label: React.ReactNode; icon: IconName; badge?: boolean }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; className?: string }): React.ReactElement;

/* v2 — dates, files, search, overlays. Dates are 'YYYY-MM-DD' strings; times are 'HH:mm'. */
export type DateString = string;
export type DateRange = [DateString?, DateString?];
export declare function formatDate(date: DateString, style?: 'long' | 'short' | 'dot'): string;
export declare function formatTime(time: string): string;
export declare function formatBytes(bytes: number): string;
export declare function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4;
export interface CalendarProps { mode?: 'single' | 'range'; value?: DateString | DateRange; defaultValue?: DateString | DateRange; onChange?: (value: any) => void; min?: DateString; max?: DateString; isDisabled?: (date: DateString) => boolean; month?: DateString; className?: string }
/** Month grid; arrow keys move, Enter selects. */
export declare function Calendar(props: CalendarProps): React.ReactElement;
export interface DatePickerProps extends FieldBase, CalendarProps { placeholder?: string; size?: 'sm' | 'md' | 'lg'; presets?: { label: string; value: DateString | DateRange }[]; disabled?: boolean; defaultOpen?: boolean; id?: string }
export declare function DatePicker(props: DatePickerProps): React.ReactElement;
export interface TimePickerProps extends FieldBase { value?: string; defaultValue?: string; onChange?: (value: string) => void; step?: number; start?: string; end?: string; placeholder?: string; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; defaultOpen?: boolean; id?: string; className?: string }
export declare function TimePicker(props: TimePickerProps): React.ReactElement;
export interface UploadItem { id: string; name: string; size?: number; type?: string; status?: 'ready' | 'uploading' | 'done' | 'error'; progress?: number; error?: string; file?: File }
export interface FileUploadProps { label?: React.ReactNode; description?: React.ReactNode; accept?: string; multiple?: boolean; maxSize?: number; maxFiles?: number; files?: UploadItem[]; defaultFiles?: UploadItem[]; onFilesChange?: (files: UploadItem[]) => void; onSelect?: (added: UploadItem[]) => void; variant?: 'dropzone' | 'button'; disabled?: boolean; error?: React.ReactNode; className?: string }
/** Drop zone + file list; the consumer performs the upload and updates status/progress. */
export declare function FileUpload(props: FileUploadProps): React.ReactElement;
export type ComboOption = string | { value: string; label: React.ReactNode; description?: React.ReactNode; icon?: IconName; disabled?: boolean };
export interface ComboboxProps extends FieldBase { options: ComboOption[]; value?: string | string[]; defaultValue?: string | string[]; onChange?: (value: any) => void; multiple?: boolean; creatable?: boolean; placeholder?: string; emptyText?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; defaultOpen?: boolean; id?: string; className?: string }
export declare function Combobox(props: ComboboxProps): React.ReactElement;
export interface NumberInputProps extends FieldBase { value?: number; defaultValue?: number; onChange?: (value: number) => void; min?: number; max?: number; step?: number; suffix?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; id?: string; className?: string }
export declare function NumberInput(props: NumberInputProps): React.ReactElement;
export interface PinInputProps { length?: number; value?: string; defaultValue?: string; onChange?: (value: string) => void; onComplete?: (code: string) => void; mask?: boolean; error?: React.ReactNode; disabled?: boolean; label?: string; className?: string }
export declare function PinInput(props: PinInputProps): React.ReactElement;
export interface PasswordFieldProps extends TextFieldProps { showStrength?: boolean }
export declare function PasswordField(props: PasswordFieldProps): React.ReactElement;
export interface DrawerProps { open: boolean; onClose?: () => void; title?: React.ReactNode; description?: React.ReactNode; side?: 'right' | 'left'; width?: number | string; children?: React.ReactNode; footer?: React.ReactNode; className?: string }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;
export interface CommandItem { label: string; icon?: IconName; shortcut?: string; keywords?: string[]; onSelect?: () => void }
export interface CommandPaletteProps { open: boolean; onOpenChange?: (open: boolean) => void; groups: { title?: string; items: CommandItem[] }[]; placeholder?: string; emptyText?: React.ReactNode; hotkey?: boolean; className?: string }
/** ⌘K / Ctrl+K palette. */
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement | null;
export declare function CodeBlock(props: { code: string; language?: string; title?: React.ReactNode; showLineNumbers?: boolean; copyable?: boolean; maxHeight?: number | string; className?: string }): React.ReactElement;
export declare function DescriptionList(props: { items: { term: React.ReactNode; description: React.ReactNode; copyable?: boolean; copyValue?: string }[]; layout?: 'horizontal' | 'vertical'; columns?: number; className?: string }): React.ReactElement;
export interface TreeNode { id: string; label: string; icon?: IconName; meta?: React.ReactNode; children?: TreeNode[] }
export declare function TreeView(props: { items: TreeNode[]; defaultExpanded?: string[]; selected?: string; defaultSelected?: string; onSelect?: (id: string) => void; className?: string }): React.ReactElement;

declare global {
  interface Window {
    jwdesign: {
      Icon: typeof Icon; iconNames: typeof iconNames; Spinner: typeof Spinner;
      Button: typeof Button; IconButton: typeof IconButton; ButtonGroup: typeof ButtonGroup; Link: typeof Link;
      TextField: typeof TextField; SearchField: typeof SearchField; TextArea: typeof TextArea; Select: typeof Select;
      Checkbox: typeof Checkbox; RadioGroup: typeof RadioGroup; Radio: typeof Radio; Switch: typeof Switch;
      SegmentedControl: typeof SegmentedControl; Slider: typeof Slider;
      Badge: typeof Badge; Tag: typeof Tag; Avatar: typeof Avatar; AvatarGroup: typeof AvatarGroup; Card: typeof Card;
      List: typeof List; ListRow: typeof ListRow; Divider: typeof Divider; Table: typeof Table; Stat: typeof Stat; Kbd: typeof Kbd; Tooltip: typeof Tooltip;
      Banner: typeof Banner; Toast: typeof Toast; useToast: typeof useToast; Progress: typeof Progress; Skeleton: typeof Skeleton; EmptyState: typeof EmptyState;
      Modal: typeof Modal; BottomSheet: typeof BottomSheet; Menu: typeof Menu; Popover: typeof Popover;
      Tabs: typeof Tabs; Breadcrumb: typeof Breadcrumb; Pagination: typeof Pagination; Stepper: typeof Stepper; Accordion: typeof Accordion;
      AppBar: typeof AppBar; Sidebar: typeof Sidebar; BottomNav: typeof BottomNav;
      Calendar: typeof Calendar; DatePicker: typeof DatePicker; TimePicker: typeof TimePicker; FileUpload: typeof FileUpload; Combobox: typeof Combobox;
      NumberInput: typeof NumberInput; PinInput: typeof PinInput; PasswordField: typeof PasswordField; Drawer: typeof Drawer; CommandPalette: typeof CommandPalette;
      CodeBlock: typeof CodeBlock; DescriptionList: typeof DescriptionList; TreeView: typeof TreeView;
      formatDate: typeof formatDate; formatTime: typeof formatTime; formatBytes: typeof formatBytes; passwordStrength: typeof passwordStrength;
    };
  }
}
