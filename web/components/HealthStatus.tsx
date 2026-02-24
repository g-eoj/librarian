import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { backendPort } from "../utils/appState.ts";

interface EnvVarStatus {
  set: boolean;
  required: boolean;
  description: string;
  link?: string;
}

interface ServiceHealth {
  vllm: boolean;
  vllm_url: string;
}

interface HealthState {
  env: Record<string, EnvVarStatus> | null;
  backendOk: boolean | null;
  services: ServiceHealth | null;
  model: string | null;
}

function Dot({ ok }: { ok: boolean | null }) {
  const color = ok === true
    ? "var(--color-accent)"
    : ok === false
    ? "var(--color-danger)"
    : "var(--color-muted)";
  return (
    <span
      style={`display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${color}; flex-shrink: 0; margin-top: 1px`}
    />
  );
}

function computeOverallHealth(h: HealthState): boolean | null {
  if (h.env === null || h.backendOk === null) return null;
  const envOk = Object.values(h.env).every((v) => !v.required || v.set);
  if (!envOk || !h.backendOk) return false;
  if (h.services?.vllm === false) return false;
  return true;
}

export function HealthStatus() {
  const health = useSignal<HealthState>({
    env: null,
    backendOk: null,
    services: null,
    model: null,
  });
  const open = useSignal(false);

  const fetchHealth = async () => {
    health.value = { env: null, backendOk: null, services: null, model: null };

    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        health.value = {
          ...health.value,
          env: data.env,
          model: data.model ?? null,
        };
      }
    } catch { /* frontend health endpoint may not exist */ }

    try {
      const res = await fetch(
        `http://localhost:${backendPort.value}/api/health`,
      );
      if (res.ok) {
        health.value = {
          ...health.value,
          backendOk: true,
          services: await res.json(),
        };
      } else {
        health.value = { ...health.value, backendOk: false };
      }
    } catch {
      health.value = { ...health.value, backendOk: false };
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const overall = computeOverallHealth(health.value);

  const vllmOk = health.value.backendOk === false
    ? false
    : health.value.services?.vllm ?? null;

  const summary = overall === true
    ? null
    : overall === null
    ? "checking…"
    : health.value.backendOk === false
    ? "backend unreachable"
    : health.value.services?.vllm === false
    ? "vLLM unreachable"
    : "env error";

  return (
    <>
      <div style="margin-bottom: 10px; padding-left: 1px; min-width: 0">
        {summary && (
          <button
            type="button"
            onClick={() => (open.value = true)}
            style="font-size: 11px; font-weight: 300; color: var(--color-danger); background: none; border: none; padding: 0; cursor: pointer"
          >
            {summary}
          </button>
        )}
        {!summary && health.value.model && (
          <span
            style="font-size: 11px; font-weight: 300; color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block"
            title={health.value.model}
          >
            {health.value.model}
          </span>
        )}
      </div>

      {open.value && (
        <div
          style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6)"
          onClick={() => (open.value = false)}
        >
          <div
            style="background: var(--bg-page); border: 1px solid rgba(63,63,70,0.5); border-radius: 12px; padding: 24px; min-width: 300px; max-width: 420px; width: 100%; margin: 20px; max-height: 80vh; overflow-y: auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px">
              <span style="color: var(--color-accent); font-weight: 300; font-size: 14px">
                Health
              </span>
              <div style="display: flex; align-items: center; gap: 12px">
                <button
                  type="button"
                  onClick={fetchHealth}
                  style="color: var(--color-muted); font-size: 12px; font-weight: 300; background: none; border: none; cursor: pointer; padding: 0"
                >
                  refresh
                </button>
                <button
                  type="button"
                  onClick={() => (open.value = false)}
                  style="color: var(--color-muted); background: none; border: none; cursor: pointer; padding: 0; line-height: 1"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    style="width: 14px; height: 14px"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Services */}
            <div style="margin-bottom: 16px">
              <div style="color: var(--color-muted); font-size: 11px; font-weight: 300; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px">
                Services
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 300">
                  <Dot ok={health.value.backendOk} />
                  <span style="color: var(--color-muted)">Backend</span>
                  <span
                    style={`color: ${
                      health.value.backendOk === true
                        ? "var(--color-accent)"
                        : health.value.backendOk === false
                        ? "var(--color-danger)"
                        : "var(--color-muted)"
                    }`}
                  >
                    {health.value.backendOk === null
                      ? "checking…"
                      : health.value.backendOk
                      ? "reachable"
                      : "unreachable"}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 300">
                  <Dot ok={vllmOk} />
                  <span style="color: var(--color-muted)">vLLM</span>
                  {health.value.services !== null && (
                    <span
                      style={`color: ${
                        health.value.services.vllm
                          ? "var(--color-accent)"
                          : "var(--color-danger)"
                      }`}
                    >
                      {health.value.services.vllm ? "reachable" : "unreachable"}
                    </span>
                  )}
                  {health.value.backendOk === false && (
                    <span style="color: var(--color-muted)">unknown</span>
                  )}
                  {health.value.backendOk === null &&
                    health.value.services === null && (
                    <span style="color: var(--color-muted)">checking…</span>
                  )}
                </div>
              </div>
            </div>

            {/* Environment */}
            <div>
              <div style="color: var(--color-muted); font-size: 11px; font-weight: 300; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px">
                Environment
              </div>
              {health.value.env === null
                ? (
                  <span style="color: var(--color-muted); font-size: 12px; font-weight: 300">
                    checking…
                  </span>
                )
                : (
                  <div style="display: flex; flex-direction: column; gap: 8px">
                    {Object.entries(health.value.env).map(([name, info]) => (
                      <div
                        key={name}
                        style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 300"
                      >
                        <Dot
                          ok={info.set ? true : info.required ? false : null}
                        />
                        {!info.set && info.link
                          ? (
                            <a
                              href={info.link}
                              target="_blank"
                              rel="noopener"
                              class="link"
                            >
                              {name}
                            </a>
                          )
                          : (
                            <span
                              style={`color: ${
                                !info.set && info.required
                                  ? "var(--color-danger)"
                                  : "var(--color-muted)"
                              }`}
                            >
                              {name}
                            </span>
                          )}
                        <span
                          style={`color: ${
                            info.set
                              ? "var(--color-accent)"
                              : info.required
                              ? "var(--color-danger)"
                              : "var(--color-muted)"
                          }`}
                        >
                          {info.set
                            ? "set"
                            : info.required
                            ? "missing"
                            : "not set"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
