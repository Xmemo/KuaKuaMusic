import { invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";

export function removeUnsupportedNotableMoments(document, { durationSec }) {
  const ids = document.notableMoments.map((moment) => moment.id);
  if (new Set(ids).size !== ids.length) return document;

  const observations = new Map(
    document.observations.map((item) => [item.id, item]),
  );
  const kept = [];
  let removed = 0;
  for (const moment of document.notableMoments) {
    const structurallyValid =
      moment.id.trim() &&
      Number.isFinite(moment.startSec) &&
      Number.isFinite(moment.endSec) &&
      moment.startSec >= 0 &&
      moment.endSec >= moment.startSec &&
      moment.endSec <= durationSec;
    if (!structurallyValid) {
      kept.push(moment);
      continue;
    }

    const supported = moment.observationIds.some((id) => {
      const observation = observations.get(id);
      return (
        observation &&
        observation.precision !== "global" &&
        observation.startSec <= moment.startSec &&
        observation.endSec >= moment.endSec
      );
    });
    if (supported) kept.push(moment);
    else removed++;
  }

  if (!removed) return document;
  return {
    ...document,
    notableMoments: kept,
    uncertainties: [
      ...document.uncertainties,
      {
        topic: "other",
        text: `已忽略 ${removed} 条缺少局部观察依据的显著时刻。`,
      },
    ],
  };
}

export function stripTimestampsFromGlobalObservations(document) {
  let stripped = 0;
  const observations = document.observations.map((observation) => {
    if (
      observation.precision !== "global" ||
      (observation.startSec === null && observation.endSec === null)
    ) {
      return observation;
    }
    stripped++;
    return { ...observation, startSec: null, endSec: null };
  });
  if (!stripped) return document;
  return {
    ...document,
    observations,
    uncertainties: [
      ...document.uncertainties,
      {
        topic: "other",
        text: `已清除 ${stripped} 条全局观察的时间范围；这些内容只作为整体听感，不作为局部时间依据。`,
      },
    ],
  };
}

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

export function validateTimedCue(
  cue,
  observation,
  durationSec = observation?.timeline?.durationSec,
) {
  invariant(Number.isFinite(cue.startSec) && Number.isFinite(cue.endSec) &&
    cue.startSec >= 0 && cue.endSec >= cue.startSec,
  "精确时间听歌线索必须提供有效的非负时间范围。");
  if (Number.isFinite(durationSec)) invariant(cue.endSec <= durationSec,
    "精确时间听歌线索必须位于实际音频内。");
}
