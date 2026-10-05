const VARIABLE_MAP = Object.freeze({
  tempo: { operations: ["fast", "slow"], visualHints: ["punchcard"] },
  rhythmic_density: {
    operations: ["sequence", "subdivision", "fast"],
    visualHints: ["punchcard"],
  },
  subdivision: {
    operations: ["sequence", "subdivision", "fast"],
    visualHints: ["punchcard"],
  },
  syncopation: {
    operations: ["sequence", "offset"],
    visualHints: ["punchcard"],
  },
  layer_entry: {
    operations: ["stack", "add_remove_layer"],
    visualHints: ["pianoroll", "scope"],
  },
  register: {
    operations: ["note", "octave_range"],
    visualHints: ["pianoroll", "pitchwheel"],
  },
  motif_repetition: {
    operations: ["note_sequence", "repeat"],
    visualHints: ["pianoroll"],
  },
  harmonic_rhythm: {
    operations: ["chord_pattern", "sequence"],
    visualHints: ["pianoroll"],
  },
  texture_density: {
    operations: ["stack", "layer_count"],
    visualHints: ["scope"],
  },
  filter_motion: {
    operations: ["filter"],
    visualHints: ["spectrum"],
  },
  timbre_brightness: {
    operations: ["filter", "synthesis_parameters"],
    visualHints: ["spectrum"],
  },
});

export function creativeBlueprintToStrudelPlan(blueprint) {
  if (!blueprint?.studioEligible) {
    return {
      eligible: false,
      sourceType: "learning_reconstruction",
      blueprintId: blueprint?.blueprintId || null,
      sourceObservationIds: blueprint?.sourceObservationIds || [],
      sourceInterpretationIds: blueprint?.sourceInterpretationIds || [],
      variables: [],
      visualHints: [],
      reason: "当前分析没有足够可操作的音乐机制进入 Studio。",
    };
  }

  const variables = blueprint.variables
    .map((variable) => {
      const support = VARIABLE_MAP[variable.type];
      return support
        ? {
            id: variable.id,
            type: variable.type,
            baseline: variable.baseline,
            variation: variable.variation,
            sourceObservationIds: variable.sourceObservationIds,
            operations: support.operations,
            visualHints: support.visualHints,
          }
        : null;
    })
    .filter(Boolean);

  const visualHints = [
    ...new Set(variables.flatMap((variable) => variable.visualHints)),
  ];

  return {
    eligible: variables.length > 0,
    sourceType: "learning_reconstruction",
    blueprintId: blueprint.blueprintId,
    sourceObservationIds: blueprint.sourceObservationIds,
    sourceInterpretationIds: blueprint.sourceInterpretationIds,
    variables,
    visualHints,
    reason:
      variables.length > 0
        ? "Blueprint 已映射为 Strudel 可表达的教学变量；尚未声称为原曲精确转录。"
        : "Blueprint 没有当前 Strudel Adapter 支持的变量。",
  };
}

export const strudelVariableCapabilities = VARIABLE_MAP;
