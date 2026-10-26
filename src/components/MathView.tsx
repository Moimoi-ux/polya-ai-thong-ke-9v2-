import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { normalizeTables } from '../shared/problemText.ts';

interface MathViewProps {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Renders text containing LaTeX math ($...$ or $$...$$), Markdown tables,
 * and preserves proper Vietnamese decimal numbers and linebreaks.
 */
export const MathView: React.FC<MathViewProps> = ({ content, className = '', inline = false }) => {
  if (!content) return null;

  if (inline) {
    return <span className={`math-view inline ${className}`}>{renderInlineMath(content)}</span>;
  }

  // Tách lại bảng bị dồn trên một dòng (lỗi thường gặp khi AI chép đề) rồi mới phân tích
  const lines = normalizeTables(content).split('\n');
  const renderedElements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  const splitCells = (rowLine: string) => {
    const t = rowLine.trim();
    const inner = t.replace(/^\|/, '').replace(/\|$/, '');
    return inner.split('|').map((c) => c.trim());
  };
  const isSeparator = (rowLine: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(rowLine.trim());

  const flushTable = (keyPrefix: number) => {
    if (tableBuffer.length > 0) {
      const hasHeader = tableBuffer.length >= 2 && isSeparator(tableBuffer[1]);
      const header = hasHeader ? splitCells(tableBuffer[0]) : null;
      const bodyRows = (hasHeader ? tableBuffer.slice(2) : tableBuffer).filter((r) => !isSeparator(r)).map(splitCells);
      const colCount = Math.max(header?.length || 0, ...bodyRows.map((r) => r.length));
      const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, colCount - cells.length)).fill('')];
      renderedElements.push(
        <div key={`table-${keyPrefix}`} className="overflow-x-auto my-3 max-w-full">
          <table className="border-collapse border border-blue-300 bg-white text-sm">
            {header && (
              <thead>
                <tr className="bg-blue-100 text-blue-950">
                  {pad(header).map((col, idx) => (
                    <th key={idx} className={`border border-blue-300 px-3 py-2 text-center font-semibold ${idx === 0 ? 'text-left bg-blue-200/70' : ''}`}>
                      {renderInlineMath(col)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((cells, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                  {pad(cells).map((col, cIdx) =>
                    cIdx === 0 ? (
                      <th key={cIdx} scope="row" className="border border-blue-300 px-3 py-2 text-left font-semibold text-blue-950 bg-blue-50">
                        {renderInlineMath(col)}
                      </th>
                    ) : (
                      <td key={cIdx} className="border border-blue-300 px-3 py-2 text-center text-slate-800">
                        {renderInlineMath(col)}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableBuffer = [];
      inTable = false;
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableBuffer.push(trimmed);
    } else {
      if (inTable) {
        flushTable(lineIdx);
      }
      if (trimmed.startsWith('### ')) {
        renderedElements.push(
          <h3 key={lineIdx} className="text-base font-bold text-blue-900 mt-3 mb-1">
            {renderInlineMath(trimmed.replace('### ', ''))}
          </h3>
        );
      } else if (trimmed.startsWith('## ')) {
        renderedElements.push(
          <h2 key={lineIdx} className="text-lg font-bold text-blue-900 mt-4 mb-2">
            {renderInlineMath(trimmed.replace('## ', ''))}
          </h2>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        renderedElements.push(
          <li key={lineIdx} className="ml-5 list-disc text-slate-700 my-0.5">
            {renderInlineMath(trimmed.substring(2))}
          </li>
        );
      } else if (trimmed.length > 0) {
        renderedElements.push(
          <div key={lineIdx} className="my-1.5 leading-relaxed text-slate-800">
            {renderInlineMath(trimmed)}
          </div>
        );
      } else {
        renderedElements.push(<div key={lineIdx} className="h-2" />);
      }
    }
  });

  if (inTable) {
    flushTable(lines.length);
  }

  return <div className={`math-view text-sm md:text-base ${className}`}>{renderedElements}</div>;
};

/**
 * Parses LaTeX $...$ or $$...$$ formulas inside a string
 */
function renderInlineMath(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match $$...$$ or $...$
  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderBold(text.substring(lastIndex, match.index), `t${lastIndex}`));
    }

    const formulaWithDelimiters = match[0];
    const isBlock = formulaWithDelimiters.startsWith('$$');
    const formula = isBlock
      ? formulaWithDelimiters.slice(2, -2)
      : formulaWithDelimiters.slice(1, -1);

    try {
      const html = katex.renderToString(formula, {
        displayMode: isBlock,
        throwOnError: false,
      });
      parts.push(
        <span
          key={match.index}
          className={isBlock ? 'block my-2 text-center' : 'inline-block mx-0.5'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      parts.push(formulaWithDelimiters);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...renderBold(text.substring(lastIndex), `t${lastIndex}`));
  }

  return parts;
}

/** Hiển thị **chữ đậm** kiểu Markdown */
function renderBold(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text.includes('**')) return [text];
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.substring(last, m.index));
    out.push(<strong key={`${keyPrefix}-b${m.index}`}>{m[1]}</strong>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.substring(last));
  return out;
}
