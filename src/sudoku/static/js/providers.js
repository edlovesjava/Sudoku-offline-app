import { assertPuzzlePackage } from "./schemas.js";

const OFFLINE_PACK_FALLBACK = [
  {
    schemaVersion: 1,
    puzzleId: "pack-easy-001",
    grid: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    solution: "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
    difficulty: 100,
    source: "pack",
  },
];

async function tryBrowser(rank) {
  try {
    const browserGenerator = globalThis.__sudokuBrowserGenerator;
    if (typeof browserGenerator !== "function") {
      return null;
    }

    return (await browserGenerator(rank)) ?? null;
  } catch {
    return null;
  }
}

async function tryPack(rank) {
  let pack = null;

  try {
    const response = await fetch("/static/packs/default-pack.json", { cache: "no-store" });
    if (response.ok) {
      pack = await response.json();
    }
  } catch {
    pack = OFFLINE_PACK_FALLBACK;
  }

  if (!Array.isArray(pack) || pack.length === 0) {
    return null;
  }

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of pack) {
    const distance = Math.abs(Number(candidate.difficulty || 0) - rank);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best ?? null;
}

async function tryBackend(rank) {
  const response = await fetch(`/puzzle?rank=${rank}`);
  if (!response.ok) {
    throw new Error("backend provider failed");
  }

  const payload = await response.json();
  return {
    schemaVersion: 1,
    puzzleId: `backend-${Date.now()}`,
    grid: payload.initial_grid,
    solution: payload.solution_key,
    difficulty: Number(payload.difficulty || rank),
    source: "backend",
  };
}

export async function loadPuzzle({ rank }) {
  const local = (await tryPack(rank)) ?? (await tryBrowser(rank));
  if (local) {
    return { package: assertPuzzlePackage(local), source: local.source };
  }

  const remote = await tryBackend(rank);
  return { package: assertPuzzlePackage(remote), source: "backend" };
}
