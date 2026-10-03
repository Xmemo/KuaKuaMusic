import crypto from "node:crypto";
import { AppError } from "./errors.mjs";
export function createLocalSecurity({ apiPort = 8787, webPort = 3000 } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const hosts = new Set([
    `127.0.0.1:${apiPort}`,
    `localhost:${apiPort}`,
    `127.0.0.1:${webPort}`,
    `localhost:${webPort}`,
  ]);
  const origins = new Set([...hosts].map((host) => "http://" + host));
  const boundary = (req, res, next) => {
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      next(
        new AppError(
          "本机服务只接受当前应用的请求。",
          "LOCAL_ORIGIN_REQUIRED",
          403,
        ),
      );
      return;
    }
    if (req.headers.origin) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Music-Learning-Token",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
  const authorize = (req, _res, next) => {
    const supplied = req.headers["x-music-learning-token"];
    if (
      typeof supplied !== "string" ||
      !/^[0-9a-f]{64}$/.test(supplied) ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    ) {
      next(
        new AppError(
          "本机会话已过期，请刷新页面。",
          "LOCAL_SESSION_REQUIRED",
          401,
        ),
      );
      return;
    }
    next();
  };
  return { token, boundary, authorize };
}
