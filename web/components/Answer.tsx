import { marked } from "marked";

export function Answer(props: { answer: string; references: string[] }) {
  const html = marked.parse(props.answer) as string;

  return (
    <>
      <div
        class="answer-prose"
        // Content comes from the trusted local backend; marked does not sanitize HTML
        // deno-lint-ignore react-no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {props.references.length > 0 && (
        <div class="flex flex-col font-light mt-5 px-5 text-sm">
          {props.references.map((ref, refIdx) => (
            <a
              key={refIdx}
              href={ref}
              target="_blank"
              rel="noopener noreferrer"
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("text/plain", ref);
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = "copy";
                }
              }}
              class="link cursor-grab active:cursor-grabbing"
            >
              [{refIdx + 1}] {ref}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
