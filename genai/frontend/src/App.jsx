import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Layout/Sidebar'
import Topbar from './components/Layout/Topbar'
import Notification from './components/Common/Notification'
import ChatPage from './components/Chat/ChatPage'
import CatalogPage from './components/Catalog/CatalogPage'
import LineagePage from './components/Lineage/LineagePage'
import HealthPage from './components/Health/HealthPage'
import AgentPage from './components/Agent/AgentPage'
import DataQualityPage from './components/DataQuality/DataQualityPage'

const PAGES = {
  chat:       ChatPage,
  catalog:    CatalogPage,
  lineage:    LineagePage,
  health:     HealthPage,
  agent:      AgentPage,
  dataquality: DataQualityPage,
}

function Layout() {
  const { activeTab } = useApp()
  const Page = PAGES[activeTab] || ChatPage
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Topbar />
        <main style={{ flex:1, overflow:'hidden' }}>
          <Page />
        </main>
      </div>
      <Notification />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}
