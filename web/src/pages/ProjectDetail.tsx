import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore.ts';
import { apiPost, apiGet } from '../api/client.ts';
import { useWebSocket } from '../hooks/useWebSocket.ts';
import Loading from '../components/Loading.tsx';
import AgentPanel from '../components/agent/AgentPanel.tsx';
import './ProjectDetail.css';

interface Skill {
  name: string;
  title: string;
  description?: string;
}

interface PageWithKnowledge {
  id: string;
  name: string;
  url: string;
  capturedAt: string;
  screenshotPath: string;
  hasEdited: boolean;
  knowledgeSummary?: PageKnowledgeSummary;
}

interface PageKnowledgeSummary {
  documentTitle: string;
  topComponents: Array<{ tag: string; id?: string; className?: string }>;
  visibleText: string;
  mainStyles: {
    primaryColors: string[];
    fontFamilies: string[];
    spacingRange: { min: number; max: number };
  };
  layoutType: 'flex' | 'grid' | 'block' | 'mixed';
  componentStats: {
    total: number;
    byTag: Record<string, number>;
  };
}

function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, pages, loading, error, fetchProject, fetchPages, deleteProject, deletePage } = useProjectStore();
  const [isGeneratingPRD, setIsGeneratingPRD] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PRD Dialog states
  const [showPRDDialog, setShowPRDDialog] = useState(false);
  const [prdRequirement, setPrdRequirement] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [prdContent, setPrdContent] = useState<string | null>(null);
  const [prdError, setPrdError] = useState<string | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);

  // 截图加载错误处理
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const handleImageError = useCallback((pageId: string) => {
    setFailedImages(prev => new Set(prev).add(pageId));
  }, []);

  // WebSocket 实时更新
  useWebSocket((message) => {
    if (!id) return;
    
    if (message.type === 'page:captured' && message.data.projectId === id) {
      fetchPages(id);
      setToastMessage(`新页面已捕获: ${message.data.pageName}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
    
    if (message.type === 'page:deleted' && message.data.projectId === id) {
      fetchPages(id);
    }
    
    if (message.type === 'page:updated' && message.data.projectId === id) {
      fetchPages(id);
    }
  });

  useEffect(() => {
    if (id) {
      fetchProject(id);
      fetchPages(id);
    }
  }, [id, fetchProject, fetchPages]);

  // Fetch skills when dialog opens
  useEffect(() => {
    if (showPRDDialog) {
      apiGet<{ skills: Skill[] }>('/skills')
        .then(data => setSkills(data.skills || []))
        .catch(() => setSkills([]));
    }
  }, [showPRDDialog]);

  const openPRDDialog = () => {
    setPrdRequirement('');
    setSelectedSkill('');
    setPrdError(null);
    setShowPRDDialog(true);
  };

  const closePRDDialog = () => {
    setShowPRDDialog(false);
    setPrdError(null);
  };

  const handleGeneratePRD = async () => {
    if (!id || !prdRequirement.trim()) return;
    
    // Check if AI is configured
    try {
      const settings = await apiGet<{ ai?: { apiKey?: string } }>('/settings');
      if (!settings.ai?.apiKey) {
        setPrdError('请先在设置页面配置 AI API Key');
        return;
      }
    } catch {
      setPrdError('请先在设置页面配置 AI API Key');
      return;
    }

    setIsGeneratingPRD(true);
    setPrdError(null);
    
    try {
      const result = await apiPost<{ markdown: string }>(`/ai/generate-prd`, { 
        projectId: id, 
        requirement: prdRequirement.trim(),
        skillName: selectedSkill || undefined
      });
      setPrdContent(result.markdown);
      setShowPRDDialog(false);
      setToastMessage('PRD 生成成功！');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成 PRD 失败';
      setPrdError(errorMsg);
    } finally {
      setIsGeneratingPRD(false);
    }
  };

  // Simple Markdown renderer
  const renderMarkdown = (markdown: string): string => {
    return markdown
      .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/<li>(.*)<\/li>/gims, '<ul><li>$1</li></ul>')
      .replace(/\n\n/gim, '</p><p>')
      .replace(/\n/gim, '<br>');
  };

  const handleDeleteProject = async () => {
    if (!id || !confirm('确定要删除这个项目吗？此操作不可恢复。')) return;
    setIsDeletingProject(true);
    try {
      await deleteProject(id);
      navigate('/');
    } catch {
      setIsDeletingProject(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (!id || !confirm('确定要删除这个页面吗？')) return;
    try {
      await deletePage(id, pageId);
    } catch {
      // Error handled in store
    }
  };

  // 提取域名
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  // 计算项目知识库汇总
  const getProjectKnowledgeSummary = () => {
    const typedPages = pages as PageWithKnowledge[];
    const totalComponents = typedPages.reduce((sum, page) => 
      sum + (page.knowledgeSummary?.componentStats?.total || 0), 0);
    const totalTextLength = typedPages.reduce((sum, page) => 
      sum + (page.knowledgeSummary?.visibleText?.length || 0), 0);
    const layoutTypes = new Set(typedPages.map(page => page.knowledgeSummary?.layoutType).filter(Boolean));
    
    return {
      totalComponents,
      totalTextLength,
      layoutTypes: Array.from(layoutTypes) as string[],
      pageCount: typedPages.length
    };
  };

  if (loading && !currentProject) {
    return <Loading />;
  }

  if (error || !currentProject) {
    return (
      <div className="error-container">
        <p>{error || '项目不存在'}</p>
        <Link to="/" className="btn btn-primary">
          返回项目列表
        </Link>
      </div>
    );
  }

  const knowledgeSummary = getProjectKnowledgeSummary();

  return (
    <div className="project-detail">
      {/* Toast 提示 */}
      {toastMessage && (
        <div className="toast-notification">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          {toastMessage}
        </div>
      )}

      {/* PRD Dialog */}
      {showPRDDialog && (
        <div className="prd-dialog-overlay" onClick={(e) => e.target === e.currentTarget && closePRDDialog()}>
          <div className="prd-dialog">
            <h3 className="prd-dialog-title">生成 PRD 文档</h3>
            
            <div className="prd-dialog-content">
              <div className="prd-form-group">
                <label className="prd-form-label">需求描述</label>
                <textarea
                  className="prd-form-textarea"
                  placeholder="描述你想要的产品功能，例如：基于已捕获的页面，生成一个完整的竞拍工作台PRD"
                  value={prdRequirement}
                  onChange={(e) => setPrdRequirement(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="prd-form-group">
                <label className="prd-form-label">选择 Skill（可选）</label>
                <select
                  className="prd-form-select"
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                >
                  <option value="">默认模板</option>
                  {skills.map((skill) => (
                    <option key={skill.name} value={skill.name}>
                      {skill.title || skill.name}
                    </option>
                  ))}
                </select>
              </div>

              {prdError && (
                <div className="prd-error-message">
                  {prdError}
                </div>
              )}
            </div>

            <div className="prd-dialog-actions">
              <button className="prd-dialog-btn cancel" onClick={closePRDDialog}>
                取消
              </button>
              <button 
                className="prd-dialog-btn confirm" 
                onClick={handleGeneratePRD}
                disabled={isGeneratingPRD || !prdRequirement.trim()}
              >
                {isGeneratingPRD ? (
                  <>
                    <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20"></circle>
                    </svg>
                    生成中...
                  </>
                ) : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 返回按钮 */}
      <div className="back-nav">
        <Link to="/" className="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回项目列表
        </Link>
      </div>

      {/* 顶部区域 */}
      <div className="detail-header">
        <div className="header-content">
          <h1 className="detail-title">{currentProject.name}</h1>
          <p className="detail-description">
            {currentProject.description || '暂无描述'}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowAgentPanel(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            AI 产品助手
          </button>
          <button
            className="btn btn-secondary"
            onClick={openPRDDialog}
            disabled={isGeneratingPRD || pages.length === 0}
          >
            {isGeneratingPRD ? (
              <>
                <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20"></circle>
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                快速生成 PRD
              </>
            )}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDeleteProject}
            disabled={isDeletingProject}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            删除项目
          </button>
        </div>
      </div>

      {/* 项目知识库总结 */}
      {pages.length > 0 && (
        <div className="knowledge-summary-section">
          <div className="section-header">
            <h2>项目知识库</h2>
          </div>
          <div className="knowledge-summary-card">
            <div className="knowledge-stat">
              <span className="knowledge-stat-value">{knowledgeSummary.pageCount}</span>
              <span className="knowledge-stat-label">页面</span>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-value">{knowledgeSummary.totalComponents}</span>
              <span className="knowledge-stat-label">组件</span>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-value">{Math.round(knowledgeSummary.totalTextLength / 100)}字</span>
              <span className="knowledge-stat-label">文本</span>
            </div>
            <div className="knowledge-stat">
              <span className="knowledge-stat-value">{knowledgeSummary.layoutTypes.length > 0 ? knowledgeSummary.layoutTypes.join(', ') : '未知'}</span>
              <span className="knowledge-stat-label">布局</span>
            </div>
          </div>
        </div>
      )}

      {/* PRD 展示区域 */}
      {prdContent && (
        <div className="prd-section">
          <div className="section-header">
            <h2>PRD 文档</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setPrdContent(null)}>
              关闭
            </button>
          </div>
          <div 
            className="prd-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(prdContent) }}
          />
        </div>
      )}

      {/* 页面网格 */}
      <div className="pages-section">
        <div className="section-header">
          <h2>已捕获页面</h2>
          <span className="page-count-badge">{pages.length} 个页面</span>
        </div>

        {pages.length > 0 ? (
          <div className="pages-grid">
            {(pages as PageWithKnowledge[]).map((page) => (
              <div key={page.id} className="page-card">
                <Link to={`/editor/${currentProject.id}/${page.id}`} className="page-card-link">
                  <div className="page-screenshot">
                    {failedImages.has(page.id) || !page.screenshotPath ? (
                      <div className="page-screenshot-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="9" y1="9" x2="15" y2="9"></line>
                          <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                        <span>无预览</span>
                      </div>
                    ) : (
                      <img
                        src={page.screenshotPath}
                        alt={page.name}
                        loading="lazy"
                        onError={() => handleImageError(page.id)}
                      />
                    )}
                  </div>
                  <div className="page-info">
                    <h3 className="page-name">{page.name}</h3>
                    <p className="page-url" title={page.url}>
                      {getDomain(page.url)}
                    </p>
                    {/* 知识库摘要 */}
                    {page.knowledgeSummary && (
                      <div className="page-knowledge">
                        <span className="knowledge-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="9" y1="9" x2="15" y2="9"></line>
                            <line x1="9" y1="15" x2="15" y2="15"></line>
                          </svg>
                          {page.knowledgeSummary.componentStats?.total || 0} 组件
                        </span>
                        <span className="knowledge-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                          {Math.round((page.knowledgeSummary.visibleText?.length || 0) / 100)}字
                        </span>
                        <span className="knowledge-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          </svg>
                          {page.knowledgeSummary.layoutType || '未知'}
                        </span>
                      </div>
                    )}
                    <div className="page-meta">
                      <span className="capture-time">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        {new Date(page.capturedAt).toLocaleDateString()}
                      </span>
                      {page.hasEdited && <span className="edited-badge">已编辑</span>}
                    </div>
                  </div>
                </Link>
                <div className="page-actions">
                  <Link
                    to={`/editor/${currentProject.id}/${page.id}`}
                    className="btn btn-sm btn-secondary"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    编辑
                  </Link>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleDeletePage(page.id)}
                    title="删除页面"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-pages">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="9" x2="15" y2="9"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            </div>
            <p className="empty-title">暂无页面</p>
            <p className="empty-desc">请使用浏览器插件捕获页面</p>
          </div>
        )}
      </div>

      {/* Agent Panel */}
      <AgentPanel
        projectId={id || ''}
        projectName={currentProject?.name || ''}
        pages={pages?.map((p: any) => ({ id: p.id, name: p.name, url: p.url })) || []}
        isOpen={showAgentPanel}
        onClose={() => setShowAgentPanel(false)}
      />

      {/* 提示区域 */}
      <div className="plugin-hint">
        <div className="hint-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <div className="hint-content">
          <p className="hint-title">提示</p>
          <p className="hint-text">
            安装 H2D Capture 浏览器插件，在目标网页上点击插件图标即可捕获页面到此项目
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProjectDetail;
