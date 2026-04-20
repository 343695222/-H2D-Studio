import { Outlet, Link, useLocation, useParams } from 'react-router-dom';
import './Layout.css';

function Layout() {
  const location = useLocation();
  const params = useParams();

  // Extract projectId from URL for project-scoped nav links
  const projectIdMatch = location.pathname.match(/(?:project|editor|workbench|design-system|design-knowledge)\/([^/]+)/);
  const projectId = projectIdMatch?.[1] || params.id;

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            H2D Studio
          </Link>
          <nav className="nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              项目列表
            </Link>
            {projectId && (
              <Link
                to={`/design-knowledge/${projectId}`}
                className={`nav-link ${location.pathname.startsWith('/design-knowledge/') ? 'active' : ''}`}
              >
                设计知识库
              </Link>
            )}
            <Link
              to="/settings"
              className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
            >
              设置
            </Link>
          </nav>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
