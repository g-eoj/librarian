/**
 * Librarian Launcher
 * Orchestrates: Python backend, Fresh frontend
 */

const ROOT_DIR = new URL(".", import.meta.url).pathname;
const API_DIR = `${ROOT_DIR}api`;
const WEB_DIR = `${ROOT_DIR}web`;

// Env vars, shared with the front/backend services
const ENV_SCHEMA_PATH = `${ROOT_DIR}env.schema.json`;

interface EnvVarDef {
  default?: string;
  description: string;
  required: boolean;
  link?: string;
}

interface EnvSchema {
  env: Record<string, EnvVarDef>;
}

async function loadEnvSchema(): Promise<EnvSchema> {
  return JSON.parse(await Deno.readTextFile(ENV_SCHEMA_PATH));
}

function validateEnv(schema: EnvSchema): void {
  const missing = Object.entries(schema.env)
    .filter(([name, def]) => def.required && !Deno.env.get(name))
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}`,
    );
    console.error("\nSet them in your shell or a .env file and retry.");
    Deno.exit(1);
  }
}

// Services config
const CONFIG_PATH = `${ROOT_DIR}librarian.config.json`;

interface Config {
  ports: {
    backend: number;
    frontend: number;
  };
}

const DEFAULT_CONFIG: Config = {
  ports: {
    backend: 8001,
    frontend: 8080,
  },
};

async function loadConfig(): Promise<Config | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(CONFIG_PATH);
  } catch {
    return null; // file not found — use defaults
  }
  const parsed = JSON.parse(text); // parse errors bubble up
  return { ports: { ...DEFAULT_CONFIG.ports, ...(parsed.ports ?? {}) } };
}

// Service utilities
interface ProcessHandle {
  name: string;
  process: Deno.ChildProcess;
}

const processes: ProcessHandle[] = [];

function startBackend(port: number): Deno.ChildProcess {
  console.log(`\nStarting backend on port ${port}...`);
  const cmd = new Deno.Command("uv", {
    args: ["run", "python", "-m", "librarian.server", "--port", String(port)],
    cwd: API_DIR,
    stdout: "piped",
    stderr: "piped",
  });
  return cmd.spawn();
}

function startFrontend(
  port: number,
  backendPort: number,
): Deno.ChildProcess {
  console.log(`Starting frontend on port ${port}...`);
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", "npm:vite", "--port", String(port)],
    cwd: WEB_DIR,
    stdout: "piped",
    stderr: "piped",
    env: {
      ...Deno.env.toObject(),
      BACKEND_URL: `http://localhost:${backendPort}`,
    },
  });
  return cmd.spawn();
}

async function isPortInUse(port: number): Promise<boolean> {
  try {
    const conn = await Deno.connect({ port, hostname: "127.0.0.1" });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function waitForBackend(
  port: number,
  timeoutMs = 60000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/openapi.json`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function streamOutput(name: string, stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n").filter((l) => l.trim())) {
          console.log(`[${name}] ${line}`);
        }
      }
    } catch {
      // Reader errors are non-fatal (process may have exited)
    }
  })();
}

async function shutdown() {
  console.log("\nShutting down...");

  for (const { name, process } of processes) {
    console.log(`Stopping ${name}...`);
    try {
      process.kill("SIGTERM");
    } catch {
      // process may already be dead
    }
  }

  // Wait up to 5 seconds for graceful shutdown, then force kill
  const timeout = setTimeout(() => {
    console.log("Force killing remaining processes...");
    for (const { process } of processes) {
      try {
        process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 5000);

  await Promise.all(
    processes.map(({ process }) => process.status.catch(() => {})),
  );
  clearTimeout(timeout);
}

async function main() {
  console.log("=== Librarian ===\n");
  console.log("Press Ctrl+C to stop.\n");

  const schema = await loadEnvSchema();
  validateEnv(schema);

  const handleSignal = async () => {
    await shutdown();
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", handleSignal);
  Deno.addSignalListener("SIGTERM", handleSignal);

  const config = await loadConfig() ?? DEFAULT_CONFIG;
  const frontendPort = config.ports.frontend;
  const backendPort = config.ports.backend;

  if (await isPortInUse(frontendPort)) {
    console.error(
      `Port ${frontendPort} is already in use. Stop the existing process and retry.`,
    );
    Deno.exit(1);
  }
  const frontend = startFrontend(frontendPort, backendPort);
  processes.push({ name: "frontend", process: frontend });
  streamOutput("frontend", frontend.stdout);
  streamOutput("frontend", frontend.stderr);

  if (!await waitForPort(frontendPort)) {
    console.error("Frontend failed to start within 15 seconds.");
    await shutdown();
    Deno.exit(1);
  }

  if (await isPortInUse(backendPort)) {
    console.error(
      `Port ${backendPort} is already in use. Stop the existing process and retry.`,
    );
    await shutdown();
    Deno.exit(1);
  }
  const backend = startBackend(backendPort);
  processes.push({ name: "backend", process: backend });
  streamOutput("backend", backend.stdout);
  streamOutput("backend", backend.stderr);

  if (!await waitForBackend(backendPort)) {
    console.error(
      "Backend failed to start within 60 seconds. Check [backend] logs above.",
    );
    await shutdown();
    Deno.exit(1);
  }

  // Wait for any process to exit, then shut down all others
  const { handle, status } = await Promise.race(
    processes.map(async (p) => ({ handle: p, status: await p.process.status })),
  );
  if (!status.success) {
    console.error(
      `\n[${handle.name}] exited unexpectedly (code ${status.code}) — check logs above`,
    );
  }
  await shutdown();
  Deno.exit(status.success ? 0 : 1);
}

main();
