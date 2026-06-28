import type { WorktreeGraph as Graph } from '@shared/types'

const MAX_DOTS = 4
const DX = 14
const BASE_X = 10
const BASE_Y = 20
const MAIN_Y = 8
const WT_Y = 32
const STROKE = '#52525b'
const DOT = '#a1a1aa'
const BASE = '#71717a'
const HEAD = '#34d399'

/** Compact horizontal graph of the worktree branch vs main: a shared merge-base
 * node, main's commits fanning up, the branch's commits fanning down to HEAD. */
export function WorktreeGraph({ graph }: { graph: Graph }) {
  const { ahead, behind, mainBranch } = graph
  const aheadN = ahead.length
  const aheadDots = Math.min(aheadN, MAX_DOTS)
  const behindDots = Math.min(behind, MAX_DOTS)

  if (aheadN === 0 && behind === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>
          in sync with <span className="text-zinc-300">{mainBranch}</span>
        </span>
      </div>
    )
  }

  const mainTipX = behindDots > 0 ? BASE_X + behindDots * DX : BASE_X
  const wtTipX = aheadDots > 0 ? BASE_X + aheadDots * DX : BASE_X
  const width = Math.max(mainTipX, wtTipX) + 52
  const mainDots = Array.from({ length: behindDots }, (_, i) => BASE_X + (i + 1) * DX)
  const wtDots = Array.from({ length: aheadDots }, (_, i) => BASE_X + (i + 1) * DX)

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={40} className="shrink-0">
        {behindDots > 0 && (
          <>
            <polyline
              fill="none"
              stroke={STROKE}
              strokeWidth={1.5}
              points={`${BASE_X},${BASE_Y} ${BASE_X + DX / 2},${MAIN_Y} ${mainTipX},${MAIN_Y}`}
            />
            {mainDots.map((x, i) => (
              <circle key={`m${i}`} cx={x} cy={MAIN_Y} r={2.5} fill={DOT} />
            ))}
          </>
        )}
        {aheadDots > 0 && (
          <>
            <polyline
              fill="none"
              stroke={STROKE}
              strokeWidth={1.5}
              points={`${BASE_X},${BASE_Y} ${BASE_X + DX / 2},${WT_Y} ${wtTipX},${WT_Y}`}
            />
            {wtDots.map((x, i) => (
              <circle
                key={`w${i}`}
                cx={x}
                cy={WT_Y}
                r={2.5}
                fill={i === wtDots.length - 1 ? HEAD : DOT}
              />
            ))}
          </>
        )}
        <circle cx={BASE_X} cy={BASE_Y} r={2.5} fill={BASE} />
        <text x={mainTipX + 6} y={MAIN_Y + 3} fontSize={8} fill={DOT}>
          {mainBranch}
        </text>
        <text x={wtTipX + 6} y={WT_Y + 3} fontSize={8} fill={HEAD}>
          HEAD
        </text>
      </svg>
      <div className="flex flex-col leading-tight text-[10px]">
        {aheadN > 0 && <span className="text-emerald-400">{aheadN} ahead</span>}
        {behind > 0 && <span className="text-zinc-400">{behind} behind</span>}
      </div>
    </div>
  )
}
