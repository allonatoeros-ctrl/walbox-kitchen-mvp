// normalizeEvent.js — raw event API-Football -> shape compatibile events.json ({eventId,round,fixtureId,playerId,type,minute}).
// Funzione pura. Eventi sconosciuti non vengono scartati: passano con type "unknown_event" e restano
// deterministici a valle (scoreEngine.js li ignora già via skippedEvents, nessuna modifica al motore).

const EVENT_TYPE_MAP = Object.freeze({
  "Goal|Normal Goal": "goal",
  "Goal|Penalty": "penalty_scored",
  "Goal|Missed Penalty": "penalty_missed",
  "Goal|Own Goal": "own_goal",
  "Card|Yellow Card": "yellow_card",
  "Card|Red Card": "red_card",
});

/**
 * @param {import("../contracts.js").RawApiFootballEvent} raw
 * @param {{fixtureId:string, round:string}} context
 * @returns {Array<{eventId:string, round:string, fixtureId:string, playerId:string, type:string, minute:number}>}
 */
export function normalizeEvent(raw, { fixtureId, round }) {
  if (!fixtureId || !round) {
    throw new Error("EVENTO_MALFORMATO: contesto fixtureId/round mancante");
  }
  if (raw?.type === "subst") {
    return []; // sostituzione: nessun evento fantacalcistico diretto in V1
  }

  const rawPlayerId = raw?.player?.id;
  if (rawPlayerId === null || rawPlayerId === undefined) {
    throw new Error(`EVENTO_MALFORMATO: playerId mancante (fixture ${fixtureId})`);
  }
  const minute = raw?.time?.elapsed;
  if (minute === null || minute === undefined) {
    throw new Error(`EVENTO_MALFORMATO: minuto mancante (fixture ${fixtureId}, player ${rawPlayerId})`);
  }

  const key = `${raw?.type}|${raw?.detail}`;
  const type = EVENT_TYPE_MAP[key] ?? "unknown_event";
  const playerId = `p_${rawPlayerId}`;

  const events = [
    {
      eventId: `evt_${fixtureId}_${minute}_${playerId}_${type}`,
      round,
      fixtureId,
      playerId,
      type,
      minute,
    },
  ];

  const rawAssistId = raw?.assist?.id;
  if (type === "goal" && rawAssistId !== null && rawAssistId !== undefined) {
    const assistPlayerId = `p_${rawAssistId}`;
    events.push({
      eventId: `evt_${fixtureId}_${minute}_${assistPlayerId}_assist`,
      round,
      fixtureId,
      playerId: assistPlayerId,
      type: "assist",
      minute,
    });
  }

  return events;
}
