import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import ProjectList from './pages/ProjectList.tsx';
import ProjectDetail from './pages/ProjectDetail.tsx';
import Editor from './pages/Editor.tsx';
import Settings from './pages/Settings.tsx';
import Workbench from './pages/Workbench.tsx';
import DesignSystem from './pages/DesignSystem.tsx';
import DesignKnowledgeBase from './pages/DesignKnowledgeBase.tsx';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ProjectList />} />
            <Route path="project/:id" element={<ProjectDetail />} />
            <Route path="editor/:projectId/:pageId" element={<Editor />} />
            <Route path="workbench/:projectId" element={<Workbench />} />
            <Route path="design-system/:projectId" element={<DesignSystem />} />
            <Route path="design-knowledge/:projectId" element={<DesignKnowledgeBase />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
