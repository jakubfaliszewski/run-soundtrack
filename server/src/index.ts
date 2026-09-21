import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { routeRoutes } from "./routes/route.js";
import { spotifyRoutes } from "./routes/spotify.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
});

await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

await app.register(routeRoutes);
await app.register(spotifyRoutes);

app.get("/api/health", async () => ({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "3001", 10);

try {
  await app.listen({ port: PORT, host: "127.0.0.1" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
