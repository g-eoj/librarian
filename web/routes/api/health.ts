import { define } from "../../utils.ts";

const ENV_SCHEMA_PATH =
  new URL("../../../env.schema.json", import.meta.url).pathname;

interface EnvVarDef {
  description: string;
  required: boolean;
  default?: string;
  link?: string;
}

export const handler = define.handlers({
  async GET() {
    let schema: Record<string, EnvVarDef> = {};
    try {
      const text = await Deno.readTextFile(ENV_SCHEMA_PATH);
      schema = JSON.parse(text).env;
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not load env schema" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const env: Record<
      string,
      { set: boolean; required: boolean; description: string; link?: string }
    > = {};
    for (const [name, config] of Object.entries(schema)) {
      env[name] = {
        set: Deno.env.get(name) !== undefined,
        required: config.required,
        description: config.description,
        ...(config.link ? { link: config.link } : {}),
      };
    }

    const model = Deno.env.get("VLLM_MODEL_NAME") ?? null;

    return new Response(JSON.stringify({ env, model }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
