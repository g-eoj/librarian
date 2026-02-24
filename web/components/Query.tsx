export function Query(props: { query?: string | null }) {
  return (
    <div
      class="flex font-light gap-2 mt-8 text-lg"
      style="color: var(--color-text)"
    >
      <span>⟩</span>
      {props.query && <span>{props.query}</span>}
    </div>
  );
}
