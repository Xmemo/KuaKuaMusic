import express from "express";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import agnesHandler from "../api/agnes/chat.js";
import musicSearchHandler from "../api/music/search.js";
import { getAgentHealth } from "./agentHealth.mjs";
import {
  analyzeSongWithAgent,
  deepDiveWithAgent,
  proposeStudioWithAgent,
} from "./musicLearningAgent.mjs";
import {
  listAnalyses,
  loadEvidencePackage,
  persistStudioSession,
} from "./evidenceStore.mjs";
import { createLocalSecurity } from "./localSecurity.mjs";
import { AppError } from "./errors.mjs";
import { createV2Service } from "./v2/v2Service.mjs";
import { createV3Service } from "./v3/v3Service.mjs";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
export function createApp({
  analyze = analyzeSongWithAgent,
  deepDive = deepDiveWithAgent,
  proposeStudio = proposeStudioWithAgent,
  health = getAgentHealth,
  port = Number(process.env.PROXY_PORT || process.env.PORT || 8787),
  webPort = Number(process.env.WEB_PORT || 3000),
} = {}) {
  const app = express(),
    security = createLocalSecurity({ apiPort: port, webPort }),
    v2 = process.env.MUSIC_V2_ENABLED === "1" ? createV2Service() : null,
    v3 = process.env.MUSIC_V3_ENABLED === "1" ? createV3Service() : null;
  app.disable("x-powered-by");
  app.use(security.boundary);
  app.use(express.json({ limit: "128kb" }));
  app.get("/health", (_req, res) =>
    res.json({ ok: true, mode: "local", schemaVersion: "1.2" }),
  );
  app.get("/api/agent/session", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ token: security.token });
  });
  app.use("/api/agent", security.authorize, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const route = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  app.get(
    "/api/agent/health",
    route(async (_req, res) => res.json(await health())),
  );
  app.get(
    "/api/agent/analyses",
    route(async (_req, res) => res.json(await listAnalyses())),
  );
  app.get(
    "/api/agent/analyses/:analysisId",
    route(async (req, res) =>
      res.json(await loadEvidencePackage(req.params.analysisId)),
    ),
  );
  app.post(
    "/api/agent/analyses/:analysisId/deep-dives/:deepDiveId/studio",
    route(async (req, res) => {
      res.json(
        await persistStudioSession(
          req.params.analysisId,
          req.params.deepDiveId,
          req.body.session,
        ),
      );
    }),
  );
  let active = false;
  const researchRoute = (operation) =>
    route(async (req, res) => {
      if (active)
        throw new AppError(
          "已有研究正在进行，请等待或取消后重试。",
          "AGENT_BUSY",
          409,
        );
      active = true;
      const controller = new AbortController();
      let stage = "starting";
      const stream = req.get("accept")?.includes("text/event-stream");
      if (stream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
      }
      const send = (event, value) => {
        if (!stream || res.destroyed || res.writableEnded) return;
        res.write("event: " + event + "\ndata: " + JSON.stringify(value) + "\n\n");
      };
      const disconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.once("close", disconnect);
      try {
        try {
          const result = await operation(req.body, {
            signal: controller.signal,
            onProgress: (value) => { stage = value.stage || stage; send("progress", value); },
          });
          if (!controller.signal.aborted) {
            if (stream) {
              send("result", result);
              res.end();
            } else res.json(result);
          }
        } catch (error) {
          if (!stream) throw error;
          const known = error instanceof AppError;
          send("error", {
            stage,
            code: known ? error.code : "INTERNAL_ERROR",
            error: known ? error.message : "本机研究服务未能完成请求。",
          });
          res.end();
        }
      } finally {
        active = false;
        res.removeListener("close", disconnect);
      }
    });
  if (v3) {
    app.get(
      "/api/agent/v3/health",
      route(async (req, res) =>
        res.json(await v3.health({ refresh: req.query.refresh === "1" })),
      ),
    );
    app.get(
      "/api/agent/v3/runner",
      route(async (_req, res) => res.json(v3.runner())),
    );
    app.post(
      "/api/agent/v3/analyze",
      researchRoute(async (body, context) =>
        v3.analyze(body, context),
      ),
    );
    app.post(
      "/api/agent/v3/materialize",
      researchRoute(async (body, context) =>
        v3.materialize(body, context),
      ),
    );
  }
  if (v2) {
    app.get("/api/agent/v2/health", route(async (req, res) => res.json(await v2.health({ refresh: req.query.refresh === "1" }))));
    app.get(
      "/api/agent/v2/provider-plan",
      route(async (_req, res) => res.json(v2.providerPlan())),
    );
    app.post(
      "/api/agent/v2/analyze",
      researchRoute(async (body, context) =>
        v2.analyze(body, context),
      ),
    );
    app.post(
      "/api/agent/v2/materialize",
      researchRoute(async (body, context) =>
        v2.materialize(body, context),
      ),
    );
    app.post(
      "/api/agent/v2/listen",
      researchRoute(async (body, context) =>
        v2.listen(body, context),
      ),
    );
    app.post(
      "/api/agent/v2/research",
      researchRoute(async (body, context) =>
        v2.research(body, context),
      ),
    );
    app.post(
      "/api/agent/v2/critic",
      researchRoute(async (body, context) =>
        v2.critic(body, context),
      ),
    );
    app.post(
      "/api/agent/v2/creative",
      researchRoute(async (body, context) =>
        v2.creative(body, context),
      ),
    );
  }
  app.post("/api/agent/analyze", researchRoute(analyze));
  app.post("/api/agent/deep-dive", researchRoute(deepDive));
  app.post("/api/agent/studio/propose", researchRoute(proposeStudio));
  app.all("/api/music/search", musicSearchHandler);
  if (process.env.MUSIC_LEARNING_ENABLE_LEGACY === "1")
    app.all("/api/agnes/chat", agnesHandler);
  app.use((error, _req, res, _next) => {
    if (res.headersSent || res.destroyed) return;
    const known = error instanceof AppError;
    const invalidBody =
      error.type === "entity.too.large" || error.type === "entity.parse.failed";
    res
      .status(known ? error.status : invalidBody ? 400 : 500)
      .json({
        code: known
          ? error.code
          : invalidBody
            ? "INVALID_REQUEST"
            : "INTERNAL_ERROR",
        error: known
          ? error.message
          : invalidBody
            ? "请求内容无效或过大。"
            : "本机服务未能完成请求，请稍后重试。",
      });
    if (!known && !invalidBody)
      console.error("[music-learning]", error.name || "Error");
  });
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PROXY_PORT || process.env.PORT || 8787);
  createApp({ port }).listen(port, "127.0.0.1", () =>
    console.log("[MusicLearning] http://127.0.0.1:" + port),
  );
}
