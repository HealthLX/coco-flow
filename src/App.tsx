import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppSidebar from './components/AppSidebar'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import HistoryPage from './pages/HistoryPage'

function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f2f2f2]">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
