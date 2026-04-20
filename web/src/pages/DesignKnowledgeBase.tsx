/**
 * DesignKnowledgeBase — 设计知识库管理页面
 *
 * 三个分类标签页：组件模板、交互模式、设计原则
 * 顶部搜索栏按名称和描述模糊搜索
 * 每个分类支持列表展示、添加、编辑、删除
 *
 * Task 9.1
 * Requirements: 3.7, 3.8
 */

import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import './DesignKnowledgeBase.css';

/* ========== Types (mirrors server/src/types.ts) ========== */

interface ComponentTemplate {
  id: string;
  name: string;
  description: string;
  applicableScenes: string[];
  htmlTemplate: string;
  previewImagePath?: string;
  createdAt: string;
  updatedAt: string;
}

interface InteractionPattern {
  id: string;
  name: string;
  description: string;
  triggerCondition: string;
  interactionFlow: string;
  applicableComponents: string[];
  createdAt: string;
  updatedAt: string;
}

interface DesignPrinciple {
  id: string;
  name: string;
  description: string;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

interface DesignKnowledgeData {
  projectId: string;
  componentTemplates: ComponentTemplate[];
  interactionPatterns: InteractionPattern[];
  designPrinciples: DesignPrinciple[];
  updatedAt: string;
}

type DKBTab = 'components' | 'interactions' | 'principles';

const TAB_CONFIG: { key: DKBTab; label: string; icon: string }[] = [
  { key: 'components', label: '组件模板', icon: '🧩' },
  { key: 'interactions', label: '交互模式', icon: '🔄' },
  { key: 'principles', label: '设计原则', icon: '📐' },
];

/* ========== Modal State ========== */

interface ModalState {
  open: boolean;
  mode: 'add' | 'edit';
  tab: DKBTab;
  editId: string;
  // Component fields
  name: string;
  description: string;
  applicableScenes: string;      // comma-separated
  htmlTemplate: string;
  previewImagePath: string;
  // Interaction fields
  triggerCondition: string;
  interactionFlow: string;
  applicableComponents: string;  // comma-separated
  // Principle fields
  rules: string[];
}

const BLANK_MODAL: ModalState = {
  open: false,
  mode: 'add',
  tab: 'components',
  editId: '',
  name: '',
  description: '',
  applicableScenes: '',
  htmlTemplate: '',
  previewImagePath: '',
  triggerCondition: '',
  interactionFlow: '',
  applicableComponents: '',
  rules: [''],
};

/* ========== Main Component ========== */

export default function DesignKnowledgeBase() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<DesignKnowledgeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DKBTab>('components');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DesignKnowledgeData | null>(null);
  const [modal, setModal] = useState<ModalState>(BLANK_MODAL);
  const [saving, setSaving] = useState(false);

  const basePath = `/design-knowledge/${projectId}`;

  const loadData = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    apiGet<DesignKnowledgeData>(basePath)
      .then(setData)
      .catch((err) => console.error('Failed to load design knowledge:', err))
      .finally(() => setLoading(false));
  }, [projectId, basePath]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ---- Search ---- */

  useEffect(() => {
    if (!projectId || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      apiGet<DesignKnowledgeData>(`${basePath}/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, projectId, basePath]);

  const displayData = searchQuery.trim() ? searchResults : data;

  /* ---- Tab counts ---- */

  function getCount(tab: DKBTab): number {
    if (!displayData) return 0;
    switch (tab) {
      case 'components': return displayData.componentTemplates.length;
      case 'interactions': return displayData.interactionPatterns.length;
      case 'principles': return displayData.designPrinciples.length;
    }
  }

  /* ---- CRUD handlers ---- */

  const openAdd = (tab: DKBTab) => {
    setModal({ ...BLANK_MODAL, open: true, mode: 'add', tab });
  };

  const openEditComponent = (item: ComponentTemplate) => {
    setModal({
      ...BLANK_MODAL,
      open: true,
      mode: 'edit',
      tab: 'components',
      editId: item.id,
      name: item.name,
      description: item.description,
      applicableScenes: item.applicableScenes.join(', '),
      htmlTemplate: item.htmlTemplate,
      previewImagePath: item.previewImagePath || '',
    });
  };

  const openEditInteraction = (item: InteractionPattern) => {
    setModal({
      ...BLANK_MODAL,
      open: true,
      mode: 'edit',
      tab: 'interactions',
      editId: item.id,
      name: item.name,
      description: item.description,
      triggerCondition: item.triggerCondition,
      interactionFlow: item.interactionFlow,
      applicableComponents: item.applicableComponents.join(', '),
    });
  };

  const openEditPrinciple = (item: DesignPrinciple) => {
    setModal({
      ...BLANK_MODAL,
      open: true,
      mode: 'edit',
      tab: 'principles',
      editId: item.id,
      name: item.name,
      description: item.description,
      rules: item.rules.length > 0 ? [...item.rules] : [''],
    });
  };

  const closeModal = () => setModal(BLANK_MODAL);

  const handleSave = async () => {
    if (!projectId || saving) return;
    setSaving(true);
    try {
      const { tab, mode, editId } = modal;
      let endpoint = '';
      let body: Record<string, any> = {};

      if (tab === 'components') {
        endpoint = `${basePath}/components`;
        body = {
          name: modal.name,
          description: modal.description,
          applicableScenes: modal.applicableScenes.split(',').map((s) => s.trim()).filter(Boolean),
          htmlTemplate: modal.htmlTemplate,
          previewImagePath: modal.previewImagePath || undefined,
        };
      } else if (tab === 'interactions') {
        endpoint = `${basePath}/interactions`;
        body = {
          name: modal.name,
          description: modal.description,
          triggerCondition: modal.triggerCondition,
          interactionFlow: modal.interactionFlow,
          applicableComponents: modal.applicableComponents.split(',').map((s) => s.trim()).filter(Boolean),
        };
      } else {
        endpoint = `${basePath}/principles`;
        body = {
          name: modal.name,
          description: modal.description,
          rules: modal.rules.filter((r) => r.trim()),
        };
      }

      if (mode === 'add') {
        await apiPost(endpoint, body);
      } else {
        await apiPut(`${endpoint}/${editId}`, body);
      }
      closeModal();
      loadData();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tab: DKBTab, id: string) => {
    if (!projectId) return;
    if (!window.confirm('确定要删除该条目吗？')) return;
    try {
      const segment = tab === 'components' ? 'components' : tab === 'interactions' ? 'interactions' : 'principles';
      await apiDelete(`${basePath}/${segment}/${id}`);
      loadData();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  /* ---- Rule list helpers ---- */

  const setRule = (index: number, value: string) => {
    setModal((prev) => {
      const rules = [...prev.rules];
      rules[index] = value;
      return { ...prev, rules };
    });
  };

  const addRule = () => {
    setModal((prev) => ({ ...prev, rules: [...prev.rules, ''] }));
  };

  const removeRule = (index: number) => {
    setModal((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  /* ---- Render ---- */

  return (
    <div className="dkb-page">
      {/* Header */}
      <div className="dkb-header">
        <div className="ds-nav">
          <Link to="/" className="nav-link">项目列表</Link>
          <span className="nav-sep">›</span>
          <Link to={`/project/${projectId}`} className="nav-link">项目详情</Link>
          <span className="nav-sep">›</span>
          <span className="nav-current">设计知识库</span>
        </div>
        <div className="dkb-search">
          <input
            className="dkb-search-input"
            type="text"
            placeholder="搜索名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="dkb-tabs">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            className={`dkb-tab ${activeTab === tab.key ? 'dkb-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="dkb-tab-count">{getCount(tab.key)}</span>
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="dkb-tab-actions">
        <button className="dkb-add-btn" onClick={() => openAdd(activeTab)}>
          ＋ 添加
        </button>
      </div>

      {/* Content */}
      <div className="dkb-content">
        {loading && !data && <div className="dkb-loading">正在加载设计知识库...</div>}

        {displayData && activeTab === 'components' && (
          <ComponentsTab
            items={displayData.componentTemplates}
            onEdit={openEditComponent}
            onDelete={(id) => handleDelete('components', id)}
          />
        )}
        {displayData && activeTab === 'interactions' && (
          <InteractionsTab
            items={displayData.interactionPatterns}
            onEdit={openEditInteraction}
            onDelete={(id) => handleDelete('interactions', id)}
          />
        )}
        {displayData && activeTab === 'principles' && (
          <PrinciplesTab
            items={displayData.designPrinciples}
            onEdit={openEditPrinciple}
            onDelete={(id) => handleDelete('principles', id)}
          />
        )}

        {!loading && !data && (
          <div className="dkb-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <div>设计知识库为空，点击"添加"开始创建</div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="dkb-modal-overlay" onClick={closeModal}>
          <div className="dkb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dkb-modal-header">
              <span>
                {modal.mode === 'add' ? '添加' : '编辑'}
                {modal.tab === 'components' ? '组件模板' : modal.tab === 'interactions' ? '交互模式' : '设计原则'}
              </span>
              <button className="dkb-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="dkb-modal-body">
              {/* Common fields */}
              <label className="dkb-modal-field">
                <span className="dkb-modal-label">名称</span>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="dkb-modal-field">
                <span className="dkb-modal-label">描述</span>
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal((p) => ({ ...p, description: e.target.value }))}
                />
              </label>

              {/* Component-specific fields */}
              {modal.tab === 'components' && (
                <>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">适用场景</span>
                    <input
                      type="text"
                      value={modal.applicableScenes}
                      onChange={(e) => setModal((p) => ({ ...p, applicableScenes: e.target.value }))}
                    />
                    <span className="dkb-modal-hint">多个场景用逗号分隔</span>
                  </label>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">HTML/CSS 模板</span>
                    <textarea
                      value={modal.htmlTemplate}
                      onChange={(e) => setModal((p) => ({ ...p, htmlTemplate: e.target.value }))}
                    />
                  </label>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">预览图路径</span>
                    <input
                      type="text"
                      value={modal.previewImagePath}
                      onChange={(e) => setModal((p) => ({ ...p, previewImagePath: e.target.value }))}
                    />
                  </label>
                </>
              )}

              {/* Interaction-specific fields */}
              {modal.tab === 'interactions' && (
                <>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">触发条件</span>
                    <input
                      type="text"
                      value={modal.triggerCondition}
                      onChange={(e) => setModal((p) => ({ ...p, triggerCondition: e.target.value }))}
                    />
                  </label>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">交互流程</span>
                    <textarea
                      value={modal.interactionFlow}
                      onChange={(e) => setModal((p) => ({ ...p, interactionFlow: e.target.value }))}
                    />
                  </label>
                  <label className="dkb-modal-field">
                    <span className="dkb-modal-label">适用组件</span>
                    <input
                      type="text"
                      value={modal.applicableComponents}
                      onChange={(e) => setModal((p) => ({ ...p, applicableComponents: e.target.value }))}
                    />
                    <span className="dkb-modal-hint">多个组件用逗号分隔</span>
                  </label>
                </>
              )}

              {/* Principle-specific fields */}
              {modal.tab === 'principles' && (
                <div className="dkb-modal-field">
                  <span className="dkb-modal-label">规则列表</span>
                  <div className="dkb-rules-editor">
                    {modal.rules.map((rule, i) => (
                      <div key={i} className="dkb-rule-row">
                        <input
                          type="text"
                          value={rule}
                          placeholder={`规则 ${i + 1}`}
                          onChange={(e) => setRule(i, e.target.value)}
                        />
                        {modal.rules.length > 1 && (
                          <button className="dkb-rule-remove" onClick={() => removeRule(i)}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="dkb-rule-add" onClick={addRule}>＋ 添加规则</button>
                  </div>
                </div>
              )}
            </div>
            <div className="dkb-modal-footer">
              <button className="dkb-modal-cancel" onClick={closeModal}>取消</button>
              <button className="dkb-modal-save" disabled={saving || !modal.name.trim()} onClick={handleSave}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ========== Components Tab ========== */

function ComponentsTab({
  items,
  onEdit,
  onDelete,
}: {
  items: ComponentTemplate[];
  onEdit: (item: ComponentTemplate) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <div className="dkb-empty"><span>暂无组件模板</span></div>;
  return (
    <div className="dkb-list">
      {items.map((item) => (
        <div key={item.id} className="dkb-card" onClick={() => onEdit(item)}>
          {item.previewImagePath ? (
            <img className="dkb-preview-img" src={item.previewImagePath} alt={item.name} />
          ) : (
            <div className="dkb-preview-placeholder">🧩</div>
          )}
          <div className="dkb-card-body">
            <div className="dkb-card-header">
              <span className="dkb-card-name">{item.name}</span>
            </div>
            <div className="dkb-card-desc">{item.description}</div>
            {item.applicableScenes.length > 0 && (
              <div className="dkb-tags">
                {item.applicableScenes.map((scene, i) => (
                  <span key={i} className="dkb-tag">{scene}</span>
                ))}
              </div>
            )}
          </div>
          <CardActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        </div>
      ))}
    </div>
  );
}

/* ========== Interactions Tab ========== */

function InteractionsTab({
  items,
  onEdit,
  onDelete,
}: {
  items: InteractionPattern[];
  onEdit: (item: InteractionPattern) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <div className="dkb-empty"><span>暂无交互模式</span></div>;
  return (
    <div className="dkb-list">
      {items.map((item) => (
        <div key={item.id} className="dkb-card" onClick={() => onEdit(item)}>
          <div className="dkb-card-body">
            <div className="dkb-card-header">
              <span className="dkb-card-name">{item.name}</span>
            </div>
            <div className="dkb-card-desc">{item.description}</div>
            {item.triggerCondition && (
              <div className="dkb-trigger">
                <strong>触发条件：</strong>{item.triggerCondition}
              </div>
            )}
            {item.applicableComponents.length > 0 && (
              <div className="dkb-tags">
                {item.applicableComponents.map((comp, i) => (
                  <span key={i} className="dkb-tag">{comp}</span>
                ))}
              </div>
            )}
          </div>
          <CardActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        </div>
      ))}
    </div>
  );
}

/* ========== Principles Tab ========== */

function PrinciplesTab({
  items,
  onEdit,
  onDelete,
}: {
  items: DesignPrinciple[];
  onEdit: (item: DesignPrinciple) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <div className="dkb-empty"><span>暂无设计原则</span></div>;
  return (
    <div className="dkb-list">
      {items.map((item) => (
        <div key={item.id} className="dkb-card" onClick={() => onEdit(item)}>
          <div className="dkb-card-body">
            <div className="dkb-card-header">
              <span className="dkb-card-name">{item.name}</span>
            </div>
            <div className="dkb-card-desc">{item.description}</div>
            {item.rules.length > 0 && (
              <div className="dkb-rules">
                {item.rules.map((rule, i) => (
                  <div key={i} className="dkb-rule">{rule}</div>
                ))}
              </div>
            )}
          </div>
          <CardActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        </div>
      ))}
    </div>
  );
}

/* ========== Card Actions ========== */

function CardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="dkb-card-actions">
      <button className="dkb-edit-btn" title="编辑" onClick={(e) => { e.stopPropagation(); onEdit(); }}>✏️</button>
      <button className="dkb-del-btn" title="删除" onClick={(e) => { e.stopPropagation(); onDelete(); }}>🗑️</button>
    </div>
  );
}
