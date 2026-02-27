import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import DiscoverPage from './pages/DiscoverPage'
import SchemasPage from './pages/SchemasPage'
import TransformsPage from './pages/TransformsPage'

function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f2f2f2]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/discover" replace />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/schemas" element={<SchemasPage />} />
            <Route path="/transforms" element={<TransformsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Layout />
      </AppProvider>
    </BrowserRouter>
  )
}
