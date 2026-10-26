import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Biểu đồ tần số dạng cột / đoạn thẳng (SVG).
 * - interactive = true: kéo thả mượt (Pointer Events + pointer capture trên SVG gốc),
 *   bấm vào bất kỳ đâu trong cột để đặt nhanh chiều cao, phím ↑ ↓ để chỉnh từng đơn vị.
 * - interactive = false: chỉ hiển thị (dùng để lồng vào các bước của quy trình).
 */

export type ColumnStatus = 'ok' | 'wrong' | null;

export interface FreqChartProps {
  kind: 'bar' | 'line';
  categories: string[];
  values: number[];
  axis: { max: number; step: number; ticks: number[] };
  xAxisLabel: string;
  yAxisLabel: string;
  interactive?: boolean;
  onChange?: (idx: number, value: number) => void;
  statuses?: ColumnStatus[];
  completed?: boolean;
  activeIdx?: number | null;
  onActivate?: (idx: number | null) => void;
  /** Thu nhỏ vừa khung chứa (dùng trong thẻ đề bài hẹp) */
  compact?: boolean;
}

const C = {
  bar: '#6A5BBA',
  barStroke: '#42358F',
  barActive: '#4F41A6',
  ok: '#16A34A',
  okStroke: '#15803D',
  wrong: '#EF4444',
  wrongStroke: '#B91C1C',
  line: '#4F41A6',
  handle: '#F59E0B',
  axis: '#565363',
  grid: '#E2E0E6',
  gridMinor: '#EEEDEA',
  text: '#423F4E',
  label: '#1D1B25',
  muted: '#6F6C7A',
};

export const FreqChart: React.FC<FreqChartProps> = ({
  kind,
  categories,
  values,
  axis,
  xAxisLabel,
  yAxisLabel,
  interactive = false,
  onChange,
  statuses,
  completed = false,
  activeIdx = null,
  onActivate,
  compact = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ idx: number; pointerId: number } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Đo bề rộng khung chứa để vẽ đúng kích thước thật (chữ & núm kéo không bị thu nhỏ trên điện thoại)
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState<number>(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setBoxW(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = Math.max(1, categories.length);
  const narrow = boxW > 0 && boxW < 520;
  const colMin = compact ? 40 : narrow ? 54 : 72;
  const pad = { top: 56, right: narrow ? 20 : 28, bottom: 62, left: narrow ? 54 : 62 };
  const minW = pad.left + pad.right + k * colMin;
  const width = compact
    ? Math.max(360, minW)
    : boxW > 0
    ? Math.max(Math.min(boxW, 760), minW)
    : Math.max(600, minW);
  const height = compact ? 300 : narrow ? 330 : 360;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const colW = innerW / k;
  const yMax = axis.max > 0 ? axis.max : 10;
  const baseY = pad.top + innerH;

  const yOf = (v: number) => baseY - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH;
  const xCenter = (i: number) => pad.left + (i + 0.5) * colW;

  /** Chuyển tọa độ màn hình → tọa độ SVG (đúng cả khi SVG bị co giãn / cuộn ngang) */
  const toSvgY = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse()).y;
  };

  const valueFromClient = (clientX: number, clientY: number): number | null => {
    const y = toSvgY(clientX, clientY);
    if (y === null) return null;
    const raw = ((baseY - y) / innerH) * yMax;
    return Math.max(0, Math.min(yMax, Math.round(raw))); // bắt điểm theo từng đơn vị tần số
  };

  const setValue = useCallback(
    (idx: number, v: number) => {
      if (!onChange) return;
      if (values[idx] !== v) onChange(idx, v);
    },
    [onChange, values]
  );

  // ───── Pointer handlers (gắn trên SVG gốc để không mất sự kiện khi phần tử con vẽ lại) ─────
  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    if (!interactive || completed) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragRef.current = { idx, pointerId: e.pointerId };
    setDragIdx(idx);
    onActivate?.(idx);
    const v = valueFromClient(e.clientX, e.clientY);
    if (v !== null) setValue(idx, v);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const v = valueFromClient(e.clientX, e.clientY);
    if (v !== null) setValue(d.idx, v);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setDragIdx(null);
  };

  const handleKeyDown = (idx: number) => (e: React.KeyboardEvent) => {
    if (!interactive || completed) return;
    const cur = values[idx] || 0;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = cur + 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = cur - 1;
    else if (e.key === 'PageUp') next = cur + axis.step;
    else if (e.key === 'PageDown') next = cur - axis.step;
    else if (e.key === 'Home') next = 0;
    if (next !== null) {
      e.preventDefault();
      setValue(idx, Math.max(0, Math.min(yMax, next)));
      onActivate?.(idx);
    }
  };

  // ───── Grid & axis ─────
  const showMinor = axis.step > 1 && yMax <= 40;
  const minorLines: number[] = [];
  if (showMinor) {
    for (let v = 1; v < yMax; v++) if (v % axis.step !== 0) minorLines.push(v);
  }

  const focusIdx = dragIdx ?? (interactive ? activeIdx : null);
  const focusVal = focusIdx !== null && focusIdx !== undefined ? values[focusIdx] || 0 : null;

  const colorFor = (i: number, part: 'fill' | 'stroke') => {
    const st = statuses?.[i];
    if (completed || st === 'ok') return part === 'fill' ? C.ok : C.okStroke;
    if (st === 'wrong') return part === 'fill' ? C.wrong : C.wrongStroke;
    if (part === 'fill') return i === focusIdx ? C.barActive : C.bar;
    return C.barStroke;
  };

  const linePoints = categories.map((_, i) => `${xCenter(i)},${yOf(values[i] || 0)}`).join(' ');
  const animate = dragIdx === null;

  return (
    <div ref={wrapRef} className={compact ? 'w-full' : 'w-full overflow-x-auto pb-1'}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={compact ? '100%' : width}
        height={compact ? undefined : height}
        style={{
          maxWidth: compact ? '100%' : undefined,
          touchAction: interactive ? 'none' : 'auto',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          display: 'block',
        }}
        className="mx-auto max-w-[760px] bg-white rounded-lg"
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? endDrag : undefined}
        onPointerCancel={interactive ? endDrag : undefined}
        onLostPointerCapture={interactive ? endDrag : undefined}
        role="img"
        data-base-y={baseY}
        data-inner-h={innerH}
        aria-label={`Biểu đồ tần số dạng ${kind === 'bar' ? 'cột' : 'đoạn thẳng'}`}
      >
        {/* Minor grid (mỗi đơn vị) */}
        {minorLines.map((v) => (
          <line key={`mn-${v}`} x1={pad.left} x2={pad.left + innerW} y1={yOf(v)} y2={yOf(v)} stroke={C.gridMinor} strokeWidth={1} />
        ))}
        {/* Major grid + nhãn trục đứng */}
        {axis.ticks.map((t) => (
          <g key={`t-${t}`}>
            {t > 0 && <line x1={pad.left} x2={pad.left + innerW} y1={yOf(t)} y2={yOf(t)} stroke={C.grid} strokeDasharray="4 4" />}
            <line x1={pad.left - 5} x2={pad.left} y1={yOf(t)} y2={yOf(t)} stroke={C.axis} strokeWidth={1.5} />
            <text
              x={pad.left - 9}
              y={yOf(t) + 4}
              textAnchor="end"
              fontSize={12}
              fontWeight={focusVal === t ? 800 : 500}
              fill={focusVal === t ? C.barActive : C.muted}
            >
              {t}
            </text>
          </g>
        ))}

        {/* Đường gióng + nhãn giá trị đang kéo trên trục đứng */}
        {interactive && focusIdx !== null && focusIdx !== undefined && focusVal !== null && !completed && (
          <g pointerEvents="none">
            <line
              x1={pad.left}
              x2={xCenter(focusIdx)}
              y1={yOf(focusVal)}
              y2={yOf(focusVal)}
              stroke={C.handle}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <rect x={pad.left - 44} y={yOf(focusVal) - 11} width={36} height={22} rx={6} fill={C.barActive} />
            <text x={pad.left - 26} y={yOf(focusVal) + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
              {focusVal}
            </text>
          </g>
        )}

        {/* Trục */}
        <line x1={pad.left} y1={pad.top - 18} x2={pad.left} y2={baseY} stroke={C.axis} strokeWidth={2} />
        <polygon points={`${pad.left - 5},${pad.top - 14} ${pad.left + 5},${pad.top - 14} ${pad.left},${pad.top - 24}`} fill={C.axis} />
        <line x1={pad.left} y1={baseY} x2={pad.left + innerW + 14} y2={baseY} stroke={C.axis} strokeWidth={2} />
        <polygon
          points={`${pad.left + innerW + 14},${baseY - 5} ${pad.left + innerW + 14},${baseY + 5} ${pad.left + innerW + 24},${baseY}`}
          fill={C.axis}
        />
        <text x={pad.left + 8} y={pad.top - 30} fontSize={12.5} fontWeight={700} fill={C.label}>
          {yAxisLabel}
        </text>
        <text x={pad.left + innerW / 2} y={height - 10} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={C.label}>
          {xAxisLabel}
        </text>

        {/* Nhãn trục ngang */}
        {categories.map((cat, i) => (
          <text
            key={`x-${i}`}
            x={xCenter(i)}
            y={baseY + 20}
            textAnchor="middle"
            fontSize={k > 10 ? 11 : 12.5}
            fontWeight={i === focusIdx ? 800 : 600}
            fill={i === focusIdx ? C.barActive : C.text}
          >
            {cat.length > 14 ? cat.slice(0, 13) + '…' : cat}
            <title>{cat}</title>
          </text>
        ))}

        {/* ───── Cột ───── */}
        {kind === 'bar' &&
          categories.map((cat, i) => {
            const v = values[i] || 0;
            const bw = Math.min(64, colW * 0.56);
            const bx = xCenter(i) - bw / 2;
            const by = yOf(v);
            const bh = baseY - by;
            return (
              <g key={`bar-${i}`}>
                <rect
                  x={bx}
                  y={by}
                  width={bw}
                  height={Math.max(0, bh)}
                  fill={colorFor(i, 'fill')}
                  stroke={colorFor(i, 'stroke')}
                  strokeWidth={1.5}
                  rx={2}
                  style={animate ? { transition: 'y 140ms ease-out, height 140ms ease-out' } : undefined}
                  pointerEvents="none"
                />
                {(v > 0 || !interactive) && (
                  <text
                    x={xCenter(i)}
                    y={by - (interactive && !completed ? 20 : 7)}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={800}
                    fill={statuses?.[i] === 'wrong' ? C.wrongStroke : '#2B245E'}
                    pointerEvents="none"
                  >
                    {v}
                  </text>
                )}
                {interactive && !completed && (
                  <g pointerEvents="none" transform={`translate(${xCenter(i)}, ${by})`}>
                    <rect
                      x={-Math.min(22, bw / 2 + 4)}
                      y={-7}
                      width={Math.min(44, bw + 8)}
                      height={14}
                      rx={7}
                      fill={i === focusIdx || i === hoverIdx ? C.handle : '#FBBF24'}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                    <line x1={-7} x2={7} y1={-2} y2={-2} stroke="#fff" strokeWidth={1.5} />
                    <line x1={-7} x2={7} y1={2} y2={2} stroke="#fff" strokeWidth={1.5} />
                  </g>
                )}
              </g>
            );
          })}

        {/* ───── Đoạn thẳng ───── */}
        {kind === 'line' && (
          <>
            {categories.map((_, i) => (
              <line
                key={`guide-${i}`}
                x1={xCenter(i)}
                x2={xCenter(i)}
                y1={pad.top}
                y2={baseY}
                stroke={C.grid}
                strokeDasharray="2 4"
                pointerEvents="none"
              />
            ))}
            <polyline
              points={linePoints}
              fill="none"
              stroke={completed ? C.ok : C.line}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
            {categories.map((_, i) => {
              const v = values[i] || 0;
              const cy = yOf(v);
              const isFocus = i === focusIdx || i === hoverIdx;
              const fill = completed || statuses?.[i] === 'ok' ? C.ok : statuses?.[i] === 'wrong' ? C.wrong : interactive ? C.handle : C.line;
              return (
                <g key={`pt-${i}`} pointerEvents="none">
                  {interactive && isFocus && !completed && <circle cx={xCenter(i)} cy={cy} r={16} fill={C.handle} opacity={0.18} />}
                  <circle cx={xCenter(i)} cy={cy} r={interactive ? (isFocus ? 10 : 8.5) : 5.5} fill={fill} stroke="#fff" strokeWidth={interactive ? 3 : 2} />
                  {(v > 0 || !interactive) && (
                    <text
                      x={xCenter(i) + (interactive ? 0 : 8)}
                      y={cy - (interactive ? 16 : 9)}
                      textAnchor={interactive ? 'middle' : 'start'}
                      fontSize={13}
                      fontWeight={800}
                      fill={statuses?.[i] === 'wrong' ? C.wrongStroke : '#2B245E'}
                    >
                      {v}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        )}

        {/* ───── Vùng bắt sự kiện: cả cột dọc (bấm/chạm ở đâu trong cột cũng kéo được) ───── */}
        {interactive &&
          !completed &&
          categories.map((cat, i) => (
            <rect
              key={`hit-${i}`}
              x={pad.left + i * colW}
              y={pad.top - 24}
              width={colW}
              height={innerH + 24 + 10}
              fill="transparent"
              style={{ cursor: dragIdx === i ? 'grabbing' : 'ns-resize', outline: 'none' }}
              tabIndex={0}
              role="slider"
              aria-label={`Tần số của ${cat}`}
              aria-valuemin={0}
              aria-valuemax={yMax}
              aria-valuenow={values[i] || 0}
              onPointerDown={handlePointerDown(i)}
              onPointerEnter={() => setHoverIdx(i)}
              onPointerLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              onKeyDown={handleKeyDown(i)}
              onFocus={() => onActivate?.(i)}
            />
          ))}
      </svg>
    </div>
  );
};
