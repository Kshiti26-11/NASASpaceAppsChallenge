import { BrowserRouter, Routes, Route, NavLink, Link } from 'react-router-dom'
import AnalysisPage from './pages/AnalysisPage'
import AboutPage from './pages/AboutPage'

function NavBar() {
  return (
    <header className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">
          Burning Activity Calendar
        </Link>
      </div>
      <nav className="navbar-right">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
        >
          Analysis
        </NavLink>
        <NavLink
          to="/about"
          className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
        >
          About
        </NavLink>
      </nav>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<AnalysisPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
