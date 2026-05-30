import { assertPuzzlePackage } from "./schemas.js";
import { generateBrowserPuzzle } from "./generator.js";

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
    if (globalThis.__sudokuDebug?.disableBrowserProvider) {
      return null;
    }

    return generateBrowserPuzzle(rank);
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
  const providers = [
    { source: "pack", load: () => tryPack(rank) },
    { source: "browser", load: () => tryBrowser(rank) },
    { source: "backend", load: () => tryBackend(rank) },
  ];

  let lastError = null;
  for (const provider of providers) {
    try {
      const candidate = await provider.load();
      if (!candidate) {
        continue;
      }

      const pkg = assertPuzzlePackage(candidate);
      return { package: pkg, source: candidate.source || provider.source };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("all puzzle providers failed");
}
