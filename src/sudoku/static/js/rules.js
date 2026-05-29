function digitSetFromValues(values) {
  const used = new Set();
  for (const value of values) {
    if (Number.isInteger(value) && value >= 1 && value <= 9) {
      used.add(value);
    }
  }
  return used;
}

export function getCellCandidates(board, row, col) {
  if (!Array.isArray(board) || board.length !== 9) {
    return [];
  }
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) {
    return [];
  }

  const cell = board[row]?.[col] || null;
  if (!cell || cell.fixed || Number.isInteger(cell.value)) {
    return [];
  }

  const rowValues = board[row].map((entry) => entry?.value ?? null);
  const colValues = board.map((entry) => entry?.[col]?.value ?? null);

  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  const boxValues = [];
  for (let r = boxRowStart; r < boxRowStart + 3; r += 1) {
    for (let c = boxColStart; c < boxColStart + 3; c += 1) {
      boxValues.push(board[r]?.[c]?.value ?? null);
    }
  }

  const used = digitSetFromValues([...rowValues, ...colValues, ...boxValues]);
  const candidates = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    if (!used.has(digit)) {
      candidates.push(digit);
    }
  }

  return candidates;
}

export function buildCandidateHint({ board, row, col }) {
  const candidates = getCellCandidates(board, row, col);
  const cellId = `R${row + 1}C${col + 1}`;

  const rowValues = board[row]?.map((entry) => entry?.value ?? null) ?? [];
  const colValues = board.map((entry) => entry?.[col]?.value ?? null);

  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  const boxValues = [];
  for (let r = boxRowStart; r < boxRowStart + 3; r += 1) {
    for (let c = boxColStart; c < boxColStart + 3; c += 1) {
      boxValues.push(board[r]?.[c]?.value ?? null);
    }
  }

  const describeElimination = (label, values) => {
    const used = [...digitSetFromValues(values)].sort((a, b) => a - b);
    const eliminated = used.length > 0 ? used.join(", ") : "none";
    return `${label} eliminates ${eliminated}`;
  };

  const eliminationText = [
    describeElimination("row", rowValues),
    describeElimination("column", colValues),
    describeElimination("box", boxValues),
  ].join("; ");

  if (candidates.length === 0) {
    return {
      candidates,
      text: `${cellId}: no legal candidates because ${eliminationText}.`,
    };
  }

  return {
    candidates,
    text: `${cellId} Candidates: ${candidates.join(", ")} because ${eliminationText}.`,
  };
}
