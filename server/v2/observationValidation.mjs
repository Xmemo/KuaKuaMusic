import { invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";

export function validateMusicObservation(document, { durationSec = document.timeline?.durationSec } = {}) {
  validateContract("v2-music-observation", document);
  invariant(Number.isFinite(durationSec) && durationSec > 0, "Listen 需要本地音频的有效时长。");
  const range = (item) => invariant(Number.isFinite(item.startSec) && Number.isFinite(item.endSec) &&
    item.startSec >= 0 && item.endSec >= item.startSec && item.endSec <= durationSec,
  "Listen 时间范围必须位于实际音频内，并且结束时间不得早于开始时间。");
  const unique = (items) => {
    const ids = new Set();
    for (const item of items) {
      invariant(item.id.trim() && !ids.has(item.id), "Listen ID 不能为空或重复。");
      ids.add(item.id);
    }
  };
  unique(document.timeline.sections); unique(document.observations); unique(document.notableMoments);
  invariant(document.timeline.durationSec !== null && Math.abs(document.timeline.durationSec - durationSec) <= 1,
    "Listen 时间轴必须使用实际音频时长。");
  for (const section of document.timeline.sections) range(section);
  for (const observation of document.observations) {
    if (observation.precision === "global") invariant(observation.startSec === null && observation.endSec === null,
      "全局观察不能声称精确的时间定位。");
    else range(observation);
  }
  const byId = new Map(document.observations.map((item) => [item.id, item]));
  for (const moment of document.notableMoments) {
    range(moment);
    invariant(moment.observationIds.length > 0, "显著时刻必须引用听觉观察。");
    for (const id of moment.observationIds) invariant(byId.has(id), "显著时刻引用了不存在的听觉观察。");
    invariant(moment.observationIds.some((id) => {
      const item = byId.get(id);
      return item.precision !== "global" && item.startSec <= moment.startSec && item.endSec >= moment.endSec;
    }), "显著时刻必须由覆盖该时间范围的局部观察支持。");
  }
  return document;
}

export function validateTimedCue(cue, observation) {
  const duration = observation?.timeline?.durationSec;
  invariant(Number.isFinite(duration) && cue.startSec >= 0 && cue.endSec <= duration,
    "精确时间听歌线索必须位于实际音频内。");
  const local = observation.observations.filter((item) => cue.observationIds.includes(item.id) &&
    item.precision === "time_localized" && Number.isFinite(item.startSec) && Number.isFinite(item.endSec));
  invariant(local.length > 0, "精确时间听歌线索必须引用具有时间定位的 Audio Observation。");
  const intervals = local.map((item) => [item.startSec, item.endSec]).sort((a, b) => a[0] - b[0]);
  let coveredUntil = cue.startSec;
  for (const [start, end] of intervals) {
    if (start > coveredUntil + 0.5) break;
    coveredUntil = Math.max(coveredUntil, end);
  }
  invariant(coveredUntil >= cue.endSec, "听歌线索的时间范围超出了引用观察的覆盖范围。");
}
