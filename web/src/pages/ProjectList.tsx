import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore.ts';
import { useWebSocket } from '../hooks/useWebSocket.ts';
import Loading from '../components/Loading.tsx';
import './ProjectList.css';

function ProjectList() {
  const { projects, loading, error, fetchProjects, createProject, deleteProject } = useProjectStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const navigate = useNavigate();

  // WebSocket 实时更新
  useWebSocket((message) => {
    if (message.type === 'project:created') {
      // 刷新项目列表
      fetchProjects();
    }
    
    if (message.type === 'project:deleted') {
      // 刷新项目列表
      fetchProjects();
    }
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const project = await createProject(newProjectName.trim(), newProjectDesc.trim());
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      // 创建成功后跳转到项目详情
      navigate(`/project/${project.id}`);
    } catch {
      // Error is handled in store
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个项目吗？')) return;
    try {
      await deleteProject(id);
    } catch {
      // Error is handled in store
    }
  };

  if (loading && projects.length === 0) {
    return <Loading />;
  }

  return (
    <div className="project-list">
      <div className="page-header">
        <h1 className="page-title">项目列表</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          新建项目
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => useProjectStore.getState().clearError()}>×</button>
        </div>
      )}

      <div className="project-grid">
        {/* 新建项目卡片 */}
        <div className="project-card create-card" onClick={() => setShowCreateModal(true)}>
          <div className="create-card-content">
            <div className="create-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <span className="create-text">新建项目</span>
          </div>
        </div>

        {/* 项目卡片 */}
        {projects.map((project) => (
          <div key={project.id} className="project-card">
            <Link to={`/project/${project.id}`} className="project-link">
              <h3 className="project-name">{project.name}</h3>
              <p className="project-desc">{project.description || '暂无描述'}</p>
              <div className="project-meta">
                <span className="page-count">{project.pageCount} 个页面</span>
                <div className="time-meta">
                  <span>创建于 {new Date(project.createdAt).toLocaleDateString()}</span>
                  <span>更新于 {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
            <button
              className="btn btn-icon btn-delete"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete(project.id);
              }}
              title="删除项目"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="empty-hint">
          <p>点击上方"新建项目"开始创建您的第一个项目</p>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建项目</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="name">项目名称 *</label>
                <input
                  id="name"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="输入项目名称"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">描述</label>
                <textarea
                  id="description"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="输入项目描述（可选）"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectList;
