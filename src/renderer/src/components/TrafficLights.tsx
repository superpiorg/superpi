import { useEffect, useState } from 'react'

const SIZE = 12

interface LightProps {
  color: string
  border: string
  label: string
  icon: JSX.Element
  onClick: () => void
}

function Light({ color, border, label, icon, onClick }: LightProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group flex items-center justify-center rounded-full border"
      style={
        {
          width: SIZE,
          height: SIZE,
          backgroundColor: color,
          borderColor: border,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
    >
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">{icon}</span>
    </button>
  )
}

export function TrafficLights() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.superpi.windowIsMaximized().then(setMaximized)
    return window.superpi.onWindowMaximizedChanged(setMaximized)
  }, [])

  return (
    <div
      className="flex items-center gap-2"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Light
        color="#FF5F57"
        border="#E0443E"
        label="Close"
        onClick={() => window.superpi.windowClose()}
        icon={
          <svg width="6" height="6" viewBox="0 0 6 6">
            <path d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5" stroke="#4A0000" strokeWidth="1" strokeLinecap="round" />
          </svg>
        }
      />
      <Light
        color="#FFBD2E"
        border="#DEA123"
        label="Minimize"
        onClick={() => window.superpi.windowMinimize()}
        icon={
          <svg width="6" height="6" viewBox="0 0 6 6">
            <line x1="1" y1="3" x2="5" y2="3" stroke="#995700" strokeWidth="1" strokeLinecap="round" />
          </svg>
        }
      />
      <Light
        color="#28CA41"
        border="#1EAB33"
        label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => window.superpi.windowMaximize()}
        icon={
          maximized ? (
            <svg width="6" height="6" viewBox="0 0 6 6">
              <rect x="1" y="2" width="4" height="3" rx="0.5" fill="none" stroke="#006500" strokeWidth="1" />
              <line x1="0" y1="1.5" x2="4" y2="1.5" stroke="#006500" strokeWidth="1" />
              <line x1="4" y1="0" x2="4" y2="3" stroke="#006500" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="6" height="6" viewBox="0 0 6 6">
              <rect x="0.5" y="0.5" width="5" height="5" rx="0.5" fill="none" stroke="#006500" strokeWidth="1" />
            </svg>
          )
        }
      />
    </div>
  )
}
