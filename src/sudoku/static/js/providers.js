import { assertPuzzlePackage } from "./schemas.js";

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
  try {
    const response = await fetch("/static/packs/default-pack.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const pack = await response.json();
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
  } catch {
    return null;
  }
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
