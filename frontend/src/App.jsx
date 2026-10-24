
import { BrowserRouter, Routes, Route } from "react-router-dom"
import LandingPage from "./pages/LandingPage"
import DashboardPage from "./pages/DashboardPage"
import BillIntake from "./pages/BillIntake"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/billIntake" element={<BillIntake />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

