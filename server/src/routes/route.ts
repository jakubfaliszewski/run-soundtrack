import { FastifyInstance } from "fastify";
import { parseGpx } from "../services/gpxParser.js";
import { buildTimedRoute, buildSoundtrack, buildRunPlan } from "../services/soundtrackEngine.js";
import { RunPlan } from "../types/domain.js";

export async function routeRoutes(app: FastifyInstance) {
  /**
   * POST /api/routes/parse
   * Accepts multipart GPX file upload.
   * Returns parsed Route.
   */
  app.post("/api/routes/parse", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file uploaded." });
    }

    const ext = data.filename.split(".").pop()?.toLowerCase();
    if (ext !== "gpx") {
      return reply.status(400).send({ error: "Only .gpx files are accepted." });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const xmlText = Buffer.concat(chunks).toString("utf-8");

    try {
      const route = parseGpx(xmlText);
      return reply.send({ route });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not parse this GPX file.";
      return reply.status(422).send({ error: message });
    }
  });

  /**
   * POST /api/soundtrack
   * Calculates a timed route and soundtrack given route + runPlan + tracks.
   */
  app.post("/api/soundtrack", async (request, reply) => {
    const body = request.body as {
      route?: unknown;
      runPlan?: Partial<RunPlan>;
      tracks?: unknown;
    };

    if (!body.route || !body.runPlan || !body.tracks) {
      return reply.status(400).send({ error: "Missing route, runPlan, or tracks." });
    }

    try {
      const route = body.route as import("../types/domain.js").Route;
      const runPlan = body.runPlan as RunPlan;
      const tracks = body.tracks as import("../types/domain.js").Track[];

      const timedRoute = buildTimedRoute(route, runPlan);
      const soundtrack = buildSoundtrack({ route, timedRoute, tracks });

      return reply.send({ timedRoute, soundtrack });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Calculation failed.";
      return reply.status(422).send({ error: message });
    }
  });
}
