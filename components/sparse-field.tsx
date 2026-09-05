export function SparseField() {
  const dots = [];
  for (let row = 0; row < 14; row += 1) {
    for (let column = 0; column < 27; column += 1) {
      const random = ((row * 79 + column * 37 + row * column * 13) % 103) / 103;
      const density = Math.max(0.025, 0.98 - column / 23);
      if (random > density) continue;
      dots.push(
        <circle
          key={`${row}-${column}`}
          cx={10 + column * 11}
          cy={10 + row * 11}
          r={column < 8 ? 1.3 : 1.15}
          fill="currentColor"
          opacity={0.38 + random * 0.62}
        />,
      );
    }
  }
  return (
    <svg viewBox="0 0 310 172" className="sparse-field" fill="none">
      <g>{dots}</g>
      <circle cx="299" cy="43" r="2.5" fill="var(--red)" />
    </svg>
  );
}
