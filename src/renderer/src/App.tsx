import { useEffect, useState } from 'react'
import type { AgentDescriptor, AgentStatusInfo, WorkspaceInfo } from '@shared/types'
import { Welcome } from './components/Welcome'
import { GitInitBanner } from './components/GitInitBanner'
import { AgentSidebar } from './components/AgentSidebar'
import { TerminalPane } from './components/TerminalPane'
import { StatusBar } from './components/StatusBar'
import { emitTermData } from './lib/terminalBus'


export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null | undefined>(undefined)
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, AgentStatusInfo>>({})

  useEffect(() => {
    window.superpi.getWorkspace().then(setWorkspace)
    const offWs = window.superpi.onWorkspaceChanged(setWorkspace)
    const offAgents = window.superpi.onAgentListChanged(setAgents)
    const offData = window.superpi.onTerminalData((id, data) => emitTermData(id, data))
    const offStatus = window.superpi.onStatusChanged((info) =>
      setStatuses((prev) => ({ ...prev, [info.agentId]: info }))
    )
    return () => {
      offWs()
      offAgents()
      offData()
      offStatus()
    }
  }, [])

  // Refetch agents + reset selection whenever the open folder changes.
  useEffect(() => {
    window.superpi.listAgents().then(setAgents)
    setActiveId(null)
  }, [workspace?.path])

  useEffect(() => {
    if (activeId && !agents.some((a) => a.id === activeId)) setActiveId(agents[0]?.id ?? null)
    else if (!activeId && agents.length > 0) setActiveId(agents[0].id)
  }, [agents, activeId])

  let body: JSX.Element
  if (workspace === undefined) {
    body = <div className="flex-1 bg-zinc-950" />
  } else if (workspace === null) {
    body = (
      <div className="flex-1 overflow-hidden">
        <Welcome />
      </div>
    )
  } else if (!workspace.isGit) {
    body = (
      <div className="flex-1 overflow-hidden">
        <GitInitBanner workspace={workspace} />
      </div>
    )
  } else {
    const active = agents.find((a) => a.id === activeId) ?? null
    body = (
      <div className="flex flex-1 overflow-hidden">
        <AgentSidebar
          workspace={workspace}
          agents={agents}
          statuses={statuses}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {active ? (
              <TerminalPane key={active.id} id={active.id} />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500">
                No agent — click +New to launch one in this worktree.
              </div>
            )}
          </div>
          <StatusBar agent={active} info={active ? statuses[active.id] : undefined} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full">
      {body}
    </div>
  )
}