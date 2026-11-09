import { Router } from "express";

// The health check answers one question: "is the API up?"
// Hosting providers and uptime monitors call it to decide whether to restart the server.
// It has no business rules, so it skips the controller/service/repository layers.
export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
