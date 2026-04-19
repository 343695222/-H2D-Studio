import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import ProjectList from './pages/ProjectList.tsx';
import ProjectDetail from './pages/ProjectDetail.tsx';
import Editor from './pages/Editor.tsx';
import Settings from './pages/Settings.tsx';
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
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
