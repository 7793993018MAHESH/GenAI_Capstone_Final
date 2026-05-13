import { createContext, useContext, useState, useCallback } from 'react'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }) {
  const [repoLoaded, setRepoLoaded] = useState(false)
  const [repoInfo,   setRepoInfo]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('chat')
  const [notification, setNotification] = useState(null)

  // Catalog Page State
  const [catalogTables,  setCatalogTables]  = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogSearch,  setCatalogSearch]  = useState('')
  const [catalogFilter,  setCatalogFilter]  = useState('all')
  const [expandedTables, setExpandedTables] = useState({})
  const [checkResults,   setCheckResults]   = useState({})

  // Chat Page State
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'init',
      role: 'assistant',
      content: "Hello! I'm your Data Engineering AI Assistant. Load a repository to get started, then ask me anything about your pipelines, data catalog, or code quality.",
      sources: []
    }
  ])
  const [chatLoading, setChatLoading] = useState(false)

  // CSV Upload State
  const [csvReport, setCsvReport] = useState(null)

  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 4000)
  }, [])

  return (
    <AppCtx.Provider value={{
      repoLoaded, setRepoLoaded,
      repoInfo, setRepoInfo,
      activeTab, setActiveTab,
      notify, notification,
      catalogTables, setCatalogTables,
      catalogLoading, setCatalogLoading,
      catalogSearch, setCatalogSearch,
      catalogFilter, setCatalogFilter,
      expandedTables, setExpandedTables,
      checkResults, setCheckResults,
      chatMessages, setChatMessages,
      chatLoading, setChatLoading,
      csvReport, setCsvReport,
    }}>
      {children}
    </AppCtx.Provider>
  )
}
