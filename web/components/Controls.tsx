import { Signal, useSignal } from "@preact/signals";
import { ComponentChildren } from "preact";

// ============================================================================
// Layout Components
// ============================================================================

interface ControlSectionProps {
  title?: string;
  open: Signal<boolean>;
  children: ComponentChildren;
}

export function ControlSection({ title, open, children }: ControlSectionProps) {
  return (
    <details
      class="controls-section"
      open={open.value}
      onToggle={(e) => {
        open.value = (e.target as HTMLDetailsElement).open;
      }}
    >
      {title && (
        <summary class="cursor-pointer list-none flex items-center justify-between flex-wrap">
          <h2>{title}</h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-3 h-3 controls-section-chevron"
          >
            <path
              fill-rule="evenodd"
              d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="controls-section-underline" />
        </summary>
      )}
      <div class="controls-section-content space-y-2">{children}</div>
    </details>
  );
}

interface ControlRowProps {
  label?: string;
  description?: string;
  stacked?: boolean;
  children?: ComponentChildren;
}

export function ControlRow(
  { label, description, stacked, children }: ControlRowProps,
) {
  return (
    <div class={`controls-row${stacked ? " stacked" : ""}`}>
      {label && (
        <div>
          <div class="font-light text-sm" style="color: var(--color-muted)">
            {label}
          </div>
          {description && (
            <div
              class="font-light text-xs mt-0.5 max-w-[90%]"
              style="color: var(--color-muted)"
            >
              {description}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// Input Components
// ============================================================================

interface ControlAddButtonProps {
  onAdd: (name: string) => void;
  placeholder?: string;
}

export function ControlAddButton(
  { onAdd, placeholder = "Add group" }: ControlAddButtonProps,
) {
  const name = useSignal("");

  const handleAdd = () => {
    const value = name.value.trim() || placeholder;
    onAdd(value);
    name.value = "";
  };

  return (
    <div
      class="flex items-center rounded-full overflow-hidden outline outline-1 h-9 mb-2 mt-3"
      style="outline-color: var(--color-muted)/10"
    >
      <input
        type="text"
        value={name.value}
        placeholder={placeholder}
        onInput={(e) => {
          name.value = (e.target as HTMLInputElement).value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        class="flex-1 min-w-0 bg-transparent text-xs font-light px-3 focus:outline-none"
        style="color: var(--color-text)"
      />
      <button
        type="button"
        onClick={handleAdd}
        class="h-full px-3 transition-colors"
        style="color: var(--color-accent)"
        title="Add"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-3 h-3"
        >
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
      </button>
    </div>
  );
}

interface ControlInlineAddProps {
  onAdd: (value: string) => void;
  placeholder?: string;
}

export function ControlInlineAdd(
  { onAdd, placeholder = "Add URL" }: ControlInlineAddProps,
) {
  const name = useSignal("");

  const handleAdd = () => {
    const value = name.value.trim();
    if (!value) return;
    onAdd(value);
    name.value = "";
  };

  return (
    <div class="flex items-center gap-1 ml-2 mr-1 mb-3">
      <input
        type="text"
        value={name.value}
        placeholder={placeholder}
        onInput={(e) => {
          name.value = (e.target as HTMLInputElement).value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        class="flex-1 bg-transparent text-xs font-light py-1 focus:outline-none placeholder:opacity-80"
        style={`color: var(--color-text); border-bottom: 1px solid color-mix(in srgb, var(--color-muted) 10%, transparent)`}
      />
    </div>
  );
}

interface ControlToggleProps {
  value: Signal<boolean>;
  onChange?: (value: boolean) => void;
}

export function ControlToggle({ value, onChange }: ControlToggleProps) {
  const handleToggle = () => {
    const newValue = !value.value;
    value.value = newValue;
    onChange?.(newValue);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      class="relative inline-flex h-7 w-9 items-center rounded-full transition-colors"
      style={`background-color: ${
        value.value ? "var(--color-accent)" : "var(--color-muted)"
      }`}
    >
      <span
        class={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          value.value ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

interface ControlNumberInputProps {
  value: Signal<number>;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
}

export function ControlNumberInput(
  { value, min = 1, max = 10, onChange }: ControlNumberInputProps,
) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <select
      value={value.value}
      onChange={(e) => {
        const newValue = parseInt((e.target as HTMLSelectElement).value, 10);
        value.value = newValue;
        onChange?.(newValue);
      }}
      class="w-9 h-7 rounded-full appearance-none text-center text-xs cursor-pointer bg-transparent outline outline-1"
      style="color: var(--color-text); outline-color: var(--color-text)"
    >
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

interface SliderStop {
  label: string;
  value: number;
}

interface ControlNumberSliderProps {
  value: Signal<number>;
  stops: SliderStop[];
  onInput?: (value: number) => void;
}

export function ControlNumberSlider(
  { value, stops, onInput }: ControlNumberSliderProps,
) {
  const index = stops.findIndex((s) => s.value === value.value);
  const currentIndex = index >= 0 ? index : 0;

  return (
    <div>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        value={currentIndex}
        onInput={(e) => {
          const idx = parseInt((e.target as HTMLInputElement).value, 10);
          const newValue = stops[idx].value;
          value.value = newValue;
          onInput?.(newValue);
        }}
        class="mt-3 w-full slider-thumb-svg"
      />
      <div class="text-center">
        <span class="text-xs" style="color: var(--color-muted)">
          {stops[currentIndex].label}
        </span>
      </div>
    </div>
  );
}
