import { define } from "../../utils.ts";

const CONFIG_PATH =
  new URL("../../../librarian.config.json", import.meta.url).pathname;

export const handler = define.handlers({
  async GET() {
    try {
      const text = await Deno.readTextFile(CONFIG_PATH);
      return new Response(text, {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Config not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
