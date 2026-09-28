function assert(condition, message) {
  if (!condition) throw new Error("Evidence integrity error: " + message);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function collectSources(sources, label) {
  assert(Array.isArray(sources), label + " must be an array.");
  const map = new Map();
  for (const source of sources) {
    assert(source && typeof source === "object", label + " contains an invalid source.");
    assert(nonEmptyText(source.id), label + " source.id is required.");
    assert(!map.has(source.id), label + " contains duplicate source id: " + source.id);
    map.set(source.id, source);
  }
  return map;
}

export function validateSongAnalysisIntegrity(analysis) {
  assert(analysis && typeof analysis === "object", "analysis must be an object.");
  const sourceMap = collectSources(analysis.sources, "analysis.sources");
  assert(Array.isArray(analysis.modules), "analysis.modules must be an array.");

  const moduleIds = new Set();
  const claimIds = new Set();

  for (const module of analysis.modules) {
    assert(nonEmptyText(module?.id), "analysis module id is required.");
    assert(!moduleIds.has(module.id), "duplicate module id: " + module.id);
    moduleIds.add(module.id);

    assert(Array.isArray(module.claims), "module.claims must be an array for " + module.id);
    assert(module.claims.length > 0, "module must contain at least one claim: " + module.id);

    for (const claim of module.claims) {
      assert(nonEmptyText(claim?.id), "claim id is required in module " + module.id);
      assert(!claimIds.has(claim.id), "duplicate claim id: " + claim.id);
      claimIds.add(claim.id);

      // V1 does not ingest audio, so the Agent cannot produce measured observations.
      assert(
        claim.kind !== "machine_observation",
        "machine_observation is not allowed in V1 without an audio-analysis engine: " + claim.id,
      );

      assert(Array.isArray(claim.sourceIds), "claim.sourceIds must be an array: " + claim.id);

      if (claim.kind === "external_evidence" && claim.status === "supported") {
        assert(claim.sourceIds.length > 0, "supported external evidence has no source: " + claim.id);
      }

      for (const sourceId of claim.sourceIds) {
        assert(sourceMap.has(sourceId), "claim references missing source " + sourceId + ": " + claim.id);
      }
    }
  }

  for (const source of sourceMap.values()) {
    assert(Array.isArray(source.supports), "source.supports must be an array: " + source.id);
    for (const claimId of source.supports) {
      assert(claimIds.has(claimId), "source " + source.id + " supports missing claim " + claimId);
    }
  }

  return analysis;
}

export function validateDeepDiveIntegrity(deepDive, analysis, expectedAnalysisItemId) {
  assert(deepDive && typeof deepDive === "object", "deepDive must be an object.");
  assert(
    deepDive.analysisItemId === expectedAnalysisItemId,
    "deepDive.analysisItemId does not match the selected item.",
  );

  const analysisSources = collectSources(analysis?.sources || [], "analysis.sources");
  const deepDiveSources = collectSources(deepDive.sources || [], "deepDive.sources");
  const allSources = new Map([...analysisSources, ...deepDiveSources]);

  const requireSourceIds = (ids, label) => {
    assert(Array.isArray(ids), label + " sourceIds must be an array.");
    for (const sourceId of ids) {
      assert(allSources.has(sourceId), label + " references missing source " + sourceId);
    }
  };

  assert(Array.isArray(deepDive.confirmed), "deepDive.confirmed must be an array.");
  for (const item of deepDive.confirmed) {
    assert(nonEmptyText(item?.text), "confirmed item text is required.");
    requireSourceIds(item.sourceIds, "confirmed item");
    assert(item.sourceIds.length > 0, "confirmed song-specific item must have at least one source.");
  }

  assert(Array.isArray(deepDive.sourceSupport), "deepDive.sourceSupport must be an array.");
  for (const item of deepDive.sourceSupport) {
    assert(allSources.has(item.sourceId), "sourceSupport references missing source " + item.sourceId);
  }

  const studio = deepDive.studio;
  assert(studio && typeof studio === "object", "deepDive.studio is required.");

  if (studio.eligible) {
    assert(studio.potential !== "none", "eligible Studio item cannot have potential=none.");
    assert(studio.seed && typeof studio.seed === "object", "eligible Studio item requires a seed.");
    requireSourceIds(studio.seed.sourceIds, "Studio seed");

    if (studio.seed.sourceType === "source_transcription") {
      assert(studio.seed.sourceIds.length > 0, "source_transcription requires at least one source.");
      const hasTranscriptionSource = studio.seed.sourceIds.some((id) => {
        const source = allSources.get(id);
        return source?.sourceType === "score" || source?.sourceType === "transcription";
      });
      assert(
        hasTranscriptionSource,
        "source_transcription requires a score or transcription source.",
      );
    }
  } else {
    assert(studio.potential === "none", "ineligible Studio item must have potential=none.");
    assert(studio.seed === null, "ineligible Studio item must not include a seed.");
  }

  return deepDive;
}
