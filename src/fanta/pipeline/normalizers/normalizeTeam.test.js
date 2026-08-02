import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTeam } from "./normalizeTeam.js";

test("normalizeTeam: mappa nome noto -> codice club", () => {
  assert.equal(normalizeTeam({ id: 496, name: "Juventus" }), "JUV");
  assert.equal(normalizeTeam({ id: 489, name: "AC Milan" }), "MIL");
});

test("normalizeTeam: copertura completa Serie A 2024/25 (20 club)", () => {
  const expected = {
    Atalanta: "ATA",
    Bologna: "BOL",
    Cagliari: "CAG",
    Como: "COM",
    Empoli: "EMP",
    Fiorentina: "FIO",
    Genoa: "GEN",
    "Hellas Verona": "VER",
    Inter: "INT",
    Juventus: "JUV",
    Lazio: "LAZ",
    Lecce: "LEC",
    "AC Milan": "MIL",
    Monza: "MON",
    Napoli: "NAP",
    Parma: "PAR",
    Roma: "ROM",
    Torino: "TOR",
    Udinese: "UDI",
    Venezia: "VEN",
  };
  for (const [name, code] of Object.entries(expected)) {
    assert.equal(normalizeTeam({ id: 1, name }), code);
  }
});

test("normalizeTeam: club sconosciuto -> throw esplicito", () => {
  assert.throws(() => normalizeTeam({ id: 999, name: "Squadra Fantasma FC" }), /TEAM_SCONOSCIUTO/);
});

test("normalizeTeam: campo mancante -> throw esplicito", () => {
  assert.throws(() => normalizeTeam(undefined), /TEAM_SCONOSCIUTO/);
  assert.throws(() => normalizeTeam({}), /TEAM_SCONOSCIUTO/);
});
