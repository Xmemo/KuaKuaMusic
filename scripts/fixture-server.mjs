// Local browser-test service only. No real song research or Codex invocation.
import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../server/proxy.mjs";
import {
  persistAnalysis,
  persistDeepDive,
  loadEvidencePackage,
} from "../server/evidenceStore.mjs";
import {
  analysisFixture,
  diveFixture,
} from "../tests/fixtures/music-learning.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "music-browser-fixture-"));
process.env.MUSIC_LEARNING_EVIDENCE_DIR = root;
const app = express();
app.get("/api/music/search", (_req, res) =>
  res.json({
    songs: [{ title: "测试歌曲", artist: "测试艺人", platform: "MANUAL" }],
  }),
);
app.use(
  createApp({
    analyze: async (input) => {
      const value = analysisFixture();
      value.userPerception = input.userPerception || null;
      return persistAnalysis(value);
    },
    deepDive: async (input) =>
      persistDeepDive(
        input.analysisId,
        diveFixture(input.analysisItemId),
        input.question || null,
      ),
    proposeStudio: async (input, { signal }) => {
      await delay(2000, undefined, { signal });
      const pkg = await loadEvidencePackage(input.analysisId);
      const session = pkg.studioSessions.find(
        (s) => s.session.id === input.sessionId,
      ).session;
      return {
        baseRevisionId: input.baseRevisionId,
        code: 's("bd*4,hh*16")._punchcard()',
        playback: session.revisions[session.revisionIndex].playback,
        explanation: "合成测试建议：只增加踩镲密度。",
      };
    },
    health: async () => ({
      ok: true,
      codexAvailable: true,
      codexVersion: "fixture—not a real CLI",
      authentication: "ready",
      projectConfiguration: "loaded",
      musicBrainz: "ready",
      webResearch: "unverified",
      strudelRuntime: "bundled",
      strudelRuntimeVersion: "core-1.2.6/webaudio-1.3.0",
    }),
  }),
);
const server = app.listen(8787, "127.0.0.1", () =>
  console.log("Synthetic browser fixture: http://127.0.0.1:8787"),
);
for (const event of ["SIGINT", "SIGTERM"])
  process.once(event, async () => {
    server.closeAllConnections();
    server.close();
    await fs.rm(root, { recursive: true, force: true });
    process.exit(0);
  });
