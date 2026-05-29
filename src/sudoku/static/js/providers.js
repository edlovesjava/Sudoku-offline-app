import { assertPuzzlePackage } from "./schemas.js";

function createFallbackBrowserPuzzle(rank) {
  const solved = "123456789456789123789123456214365897365897214897214365531642978642978531978531642";
  const blanks = rank >= 300 ? 52 : rank >= 150 ? 45 : 38;
  const chars = solved.split("");
  const indices = Array.from({ length: 81 }, (_, i) => i);
  indices.sort(() => Math.random() - 0.5);
  for (let i = 0; i < blanks; i += 1) {
    chars[indices[i]] = "0";
  }

  return {
    schemaVersion: 1,
    puzzleId: `browser-${Date.now()}`,
    grid: chars.join(""),
    solution: solved,
    difficulty: rank,
    source: "browser",
  };
}

async function tryBrowser(rank) {
  try {
    return createFallbackBrowserPuzzle(rank);
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
  const local = (await tryBrowser(rank)) ?? (await tryPack(rank));
  if (local) {
    return { package: assertPuzzlePackage(local), source: local.source };
  }

  const remote = await tryBackend(rank);
  return { package: assertPuzzlePackage(remote), source: "backend" };
}
