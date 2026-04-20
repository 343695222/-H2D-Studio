/**
 * KnowledgeManagement — 知识库管理页面
 *
 * 七个分类标签页展示项目知识库内容：
 * 色彩系统、字体规范、间距系统、圆角、阴影、组件模式、布局模式
 *
 * Task 6.1: 只读展示部分
 * Task 6.2: CRUD 操作（编辑、添加、删除、重新扫描）
 */

import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { getKnowledgeBase, apiPut, apiPost, apiDelete } from '../api/client';
import type {
  DesignSystemKnowledge,
  ColorToken,
  TypographyToken,
  SpacingToken,
  BorderRadiusToken,
  ShadowToken,
  ComponentPattern,
  LayoutPattern,
} from './knowledgeTypes';
import './DesignSystem.css';

type KnowledgeTab = 'colors' | 'typography' | 'spacing' | 'borderRadius' | 'shadows' | 'components' | 'layouts';

const TAB_CONFIG: { key: KnowledgeTab; label: string; icon: string }[] = [
  { key: 'colors', label: '色彩系统', icon: '🎨' },
  { key: 'typography', label: '字体规范', icon: '📝' },
  { key: 'spacing', label: '间距系统', icon: '📏' },
  { key: 'borderRadius', label: '圆角', icon: '⬜' },
  { key: 'shadows', label: '阴影', icon: '🌗' },
  { key: 'components', label: '组件模式', icon: '🧩' },
  { key: 'layouts', label: '布局模式', icon: '📐' },
];

/** Maps KnowledgeTab to the backend tokenType path segment */
const TAB_TO_TOKEN_TYPE: Record<KnowledgeTab, string> = {
  colors: 'colors',
  typography: 'typography',
  spacing: 'spacing',
  borderRadius: 'borderRadius',
  shadows: 'shadows',
  components: '', // not editable via token CRUD
  layouts: '',    // not editable via token CRUD
};

/** Tabs that support CRUD (design tokens only) */
const EDITABLE_TABS: KnowledgeTab[] = ['colors', 'typography', 'spacing', 'borderRadius', 'shadows'];

interface ModalState {
  open: boolean;
  mode: 'add' | 'edit';
  tab: KnowledgeTab;
  index: number; // only used in edit mode
  fields: Record<string, string>;
}

const INITIAL_MODAL: ModalState = { open: false, mode: 'add', tab: 'colors', index: -1, fields: {} };

/** Return blank fields for a given tab when adding a new token */
function blankFields(tab: KnowledgeTab): Record<string, string> {
  switch (tab) {
    case 'colors': return { value: '#000000', usage: 'unknown' };
    case 'typography': return { fontSize: '16px', fontWeight: '400', fontFamily: '', lineHeight: '1.5', usage: 'body' };
    case 'spacing': return { value: '8', unit: 'px' };
    case 'borderRadius': return { value: '4px' };
    case 'shadows': return { value: '0 2px 4px rgba(0,0,0,0.1)' };
    default: return {};
  }
}

/** Convert a token object to editable string fields */
function tokenToFields(tab: KnowledgeTab, token: any): Record<string, string> {
  switch (tab) {
    case 'colors': return { value: token.value ?? '', usage: token.usage ?? 'unknown' };
    case 'typography': return {
      fontSize: token.fontSize ?? '', fontWeight: token.fontWeight ?? '',
      fontFamily: token.fontFamily ?? '', lineHeight: token.lineHeight ?? '',
      usage: token.usage ?? 'unknown',
    };
    case 'spacing': return { value: String(token.value ?? ''), unit: token.unit ?? 'px' };
    case 'borderRadius': return { value: token.value ?? '' };
    case 'shadows': return { value: token.value ?? '' };
    default: return {};
  }
}

/** Build the request body from modal fields */
function fieldsToBody(tab: KnowledgeTab, fields: Record<string, string>): Record<string, any> {
  switch (tab) {
    case 'spacing': return { value: Number(fields.value) || 0, unit: fields.unit || 'px' };
    default: return { ...fields };
  }
}

/** Field labels for the modal form */
const FIELD_LABELS: Record<string, string> = {
  value: '值',
  usage: '用途',
  fontSize: '字号',
  fontWeight: '字重',
  fontFamily: '字体',
  lineHeight: '行高',
  unit: '单位',
};

export default function DesignSystem() {
  const { projectId } = useParams<{ projectId: string }>();
  const [knowledge, setKnowledge] = useState<DesignSystemKnowledge | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('colors');
  const [rescanning, setRescanning] = useState(false);
  const [modal, setModal] = useState<ModalState>(INITIAL_MODAL);
  const [saving, setSaving] = useState(false);

  const loadKnowledge = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    getKnowledgeBase(projectId)
      .then((data: any) => setKnowledge(data))
      .catch((err: any) => console.error('Failed to load knowledge:', err))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { loadKnowledge(); }, [loadKnowledge]);

  /* ---- CRUD handlers ---- */

  const handleRescan = async () => {
    if (!projectId || rescanning) return;
    setRescanning(true);
    try {
      await apiPost(`/knowledge/${projectId}/rescan`);
      loadKnowledge();
    } catch (err: any) {
      console.error('Rescan failed:', err);
    } finally {
      setRescanning(false);
    }
  };

  const openAdd = (tab: KnowledgeTab) => {
    setModal({ open: true, mode: 'add', tab, index: -1, fields: blankFields(tab) });
  };

  const openEdit = (tab: KnowledgeTab, index: number, token: any) => {
    setModal({ open: true, mode: 'edit', tab, index, fields: tokenToFields(tab, token) });
  };

  const closeModal = () => setModal(INITIAL_MODAL);

  const handleSave = async () => {
    if (!projectId || saving) return;
    setSaving(true);
    try {
      const tokenType = TAB_TO_TOKEN_TYPE[modal.tab];
      const body = fieldsToBody(modal.tab, modal.fields);
      if (modal.mode === 'add') {
        await apiPost(`/knowledge/${projectId}/tokens/${tokenType}`, body);
      } else {
        await apiPut(`/knowledge/${projectId}/tokens/${tokenType}/${modal.index}`, body);
      }
      closeModal();
      loadKnowledge();
    } catch (err: any) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tab: KnowledgeTab, index: number) => {
    if (!projectId) return;
    if (!window.confirm('确定要删除该条目吗？')) return;
    try {
      const tokenType = TAB_TO_TOKEN_TYPE[tab];
      await apiDelete(`/knowledge/${projectId}/tokens/${tokenType}/${index}`);
      loadKnowledge();
    } catch (err: any) {
      console.error('Delete failed:', err);
    }
  };

  const setField = (key: string, value: string) => {
    setModal((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  };

  const isEditable = EDITABLE_TABS.includes(activeTab);

  return (
    <div className="design-system-page">
      <div className="ds-header">
        <div className="ds-nav">
          <Link to="/" className="nav-link">项目列表</Link>
          <span className="nav-sep">›</span>
          <Link to={`/project/${projectId}`} className="nav-link">项目详情</Link>
          <span className="nav-sep">›</span>
          <span className="nav-current">知识库管理</span>
        </div>
        <button className="ds-rebuild-btn" disabled={rescanning} onClick={handleRescan}>
          {rescanning ? '扫描中...' : '🔄 重新扫描'}
        </button>
      </div>

      {/* Tab Bar */}
      <div className="km-tabs">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            className={`km-tab ${activeTab === tab.key ? 'km-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="km-tab-icon">{tab.icon}</span>
            <span className="km-tab-label">{tab.label}</span>
            {knowledge && (
              <span className="km-tab-count">{getTabCount(knowledge, tab.key)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Add button for editable tabs */}
      {knowledge && isEditable && (
        <div className="km-tab-actions">
          <button className="km-add-btn" onClick={() => openAdd(activeTab)}>
            ＋ 添加
          </button>
        </div>
      )}

      {/* Content */}
      <div className="ds-content km-content">
        {loading && !knowledge && (
          <div className="ds-loading">正在加载知识库...</div>
        )}

        {knowledge && renderTabContent(knowledge, activeTab, isEditable ? openEdit : undefined, isEditable ? handleDelete : undefined)}

        {!loading && !knowledge && (
          <div className="ds-empty">
            <div className="empty-icon">📊</div>
            <div className="empty-text">
              捕获页面后，知识库将自动从页面中提取设计规范
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {modal.open && (
        <div className="km-modal-overlay" onClick={closeModal}>
          <div className="km-modal" onClick={(e) => e.stopPropagation()}>
            <div className="km-modal-header">
              <span>{modal.mode === 'add' ? '添加条目' : '编辑条目'}</span>
              <button className="km-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="km-modal-body">
              {Object.entries(modal.fields).map(([key, val]) => (
                <label key={key} className="km-modal-field">
                  <span className="km-modal-label">{FIELD_LABELS[key] || key}</span>
                  {key === 'usage' ? (
                    <select value={val} onChange={(e) => setField(key, e.target.value)}>
                      {modal.tab === 'colors' && (
                        <>
                          <option value="primary">主色</option>
                          <option value="secondary">辅助色</option>
                          <option value="accent">强调色</option>
                          <option value="background">背景色</option>
                          <option value="text">文字色</option>
                          <option value="border">边框色</option>
                          <option value="unknown">未分类</option>
                        </>
                      )}
                      {modal.tab === 'typography' && (
                        <>
                          <option value="heading">标题</option>
                          <option value="body">正文</option>
                          <option value="caption">说明文字</option>
                          <option value="label">标签</option>
                          <option value="unknown">未分类</option>
                        </>
                      )}
                    </select>
                  ) : key === 'value' && modal.tab === 'colors' ? (
                    <div className="km-modal-color-row">
                      <input type="color" value={val} onChange={(e) => setField(key, e.target.value)} />
                      <input type="text" value={val} onChange={(e) => setField(key, e.target.value)} />
                    </div>
                  ) : (
                    <input type="text" value={val} onChange={(e) => setField(key, e.target.value)} />
                  )}
                </label>
              ))}
            </div>
            <div className="km-modal-footer">
              <button className="km-modal-cancel" onClick={closeModal}>取消</button>
              <button className="km-modal-save" disabled={saving} onClick={handleSave}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTabCount(knowledge: DesignSystemKnowledge, tab: KnowledgeTab): number {
  switch (tab) {
    case 'colors': return knowledge.colors.length;
    case 'typography': return knowledge.typography.length;
    case 'spacing': return knowledge.spacing.length;
    case 'borderRadius': return knowledge.borderRadius.length;
    case 'shadows': return knowledge.shadows.length;
    case 'components': return knowledge.componentPatterns.length;
    case 'layouts': return knowledge.layoutPatterns.length;
  }
}

function renderTabContent(
  knowledge: DesignSystemKnowledge,
  tab: KnowledgeTab,
  onEdit?: (tab: KnowledgeTab, index: number, token: any) => void,
  onDelete?: (tab: KnowledgeTab, index: number) => void,
) {
  switch (tab) {
    case 'colors': return <ColorsTab colors={knowledge.colors} onEdit={onEdit} onDelete={onDelete} />;
    case 'typography': return <TypographyTab typography={knowledge.typography} onEdit={onEdit} onDelete={onDelete} />;
    case 'spacing': return <SpacingTab spacing={knowledge.spacing} onEdit={onEdit} onDelete={onDelete} />;
    case 'borderRadius': return <BorderRadiusTab borderRadius={knowledge.borderRadius} onEdit={onEdit} onDelete={onDelete} />;
    case 'shadows': return <ShadowsTab shadows={knowledge.shadows} onEdit={onEdit} onDelete={onDelete} />;
    case 'components': return <ComponentsTab components={knowledge.componentPatterns} />;
    case 'layouts': return <LayoutsTab layouts={knowledge.layoutPatterns} />;
  }
}

/* ========== Custom Badge ========== */

function CustomBadge() {
  return <span className="km-custom-badge">自定义</span>;
}

/* ========== Source Pages ========== */

function SourcePages({ pages }: { pages: string[] }) {
  if (!pages || pages.length === 0) return null;
  return (
    <span className="km-source-pages" title={pages.join(', ')}>
      来源 {pages.length} 个页面
    </span>
  );
}

/* ========== Card Action Buttons ========== */

interface CardActionsProps {
  tab: KnowledgeTab;
  index: number;
  token: any;
  onEdit?: (tab: KnowledgeTab, index: number, token: any) => void;
  onDelete?: (tab: KnowledgeTab, index: number) => void;
}

function CardActions({ tab, index, token, onEdit, onDelete }: CardActionsProps) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="km-card-actions">
      {onEdit && <button className="km-edit-btn" title="编辑" onClick={(e) => { e.stopPropagation(); onEdit(tab, index, token); }}>✏️</button>}
      {onDelete && <button className="km-delete-btn" title="删除" onClick={(e) => { e.stopPropagation(); onDelete(tab, index); }}>🗑️</button>}
    </div>
  );
}

/* ========== Colors Tab ========== */

interface TokenTabProps {
  onEdit?: (tab: KnowledgeTab, index: number, token: any) => void;
  onDelete?: (tab: KnowledgeTab, index: number) => void;
}

function ColorsTab({ colors, onEdit, onDelete }: { colors: ColorToken[] } & TokenTabProps) {
  if (colors.length === 0) return <EmptyTab label="色彩" />;
  return (
    <div className="km-list">
      {colors.map((color, i) => (
        <div key={i} className="km-card km-color-card" onClick={() => onEdit?.('colors', i, color)}>
          <div className="km-color-swatch" style={{ backgroundColor: color.value }} />
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-color-value">{color.value}</span>
              {color.isCustom && <CustomBadge />}
            </div>
            <div className="km-card-meta">
              <span className="km-usage-tag">{usageLabel(color.usage)}</span>
              <span className="km-freq">×{color.frequency}</span>
              <SourcePages pages={color.sourcePages} />
            </div>
          </div>
          <CardActions tab="colors" index={i} token={color} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

function usageLabel(usage: string): string {
  const map: Record<string, string> = {
    primary: '主色',
    secondary: '辅助色',
    accent: '强调色',
    background: '背景色',
    text: '文字色',
    border: '边框色',
    unknown: '未分类',
  };
  return map[usage] || usage;
}

/* ========== Typography Tab ========== */

function TypographyTab({ typography, onEdit, onDelete }: { typography: TypographyToken[] } & TokenTabProps) {
  if (typography.length === 0) return <EmptyTab label="字体" />;
  return (
    <div className="km-list">
      {typography.map((typo, i) => (
        <div key={i} className="km-card km-typo-card" onClick={() => onEdit?.('typography', i, typo)}>
          <span className="km-typo-preview" style={{ fontSize: typo.fontSize, fontWeight: Number(typo.fontWeight) || 400 }}>
            Aa
          </span>
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-typo-spec">
                {typo.fontSize} / {typo.fontWeight} / {typo.fontFamily || '默认'}
              </span>
              {typo.isCustom && <CustomBadge />}
            </div>
            <div className="km-card-meta">
              <span className="km-typo-lh">行高: {typo.lineHeight}</span>
              <span className="km-usage-tag">{typoUsageLabel(typo.usage)}</span>
              <span className="km-freq">×{typo.frequency}</span>
              <SourcePages pages={typo.sourcePages} />
            </div>
          </div>
          <CardActions tab="typography" index={i} token={typo} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

function typoUsageLabel(usage: string): string {
  const map: Record<string, string> = {
    heading: '标题',
    body: '正文',
    caption: '说明文字',
    label: '标签',
    unknown: '未分类',
  };
  return map[usage] || usage;
}

/* ========== Spacing Tab ========== */

function SpacingTab({ spacing, onEdit, onDelete }: { spacing: SpacingToken[] } & TokenTabProps) {
  if (spacing.length === 0) return <EmptyTab label="间距" />;
  return (
    <div className="km-list">
      {spacing.map((s, i) => (
        <div key={i} className="km-card km-spacing-card" onClick={() => onEdit?.('spacing', i, s)}>
          <div className="km-spacing-bar" style={{ width: `${Math.min(s.value * 3, 200)}px` }} />
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-spacing-value">{s.value}{s.unit}</span>
              {s.isCustom && <CustomBadge />}
            </div>
            <div className="km-card-meta">
              <span className="km-freq">×{s.frequency}</span>
              <SourcePages pages={s.sourcePages} />
            </div>
          </div>
          <CardActions tab="spacing" index={i} token={s} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

/* ========== BorderRadius Tab ========== */

function BorderRadiusTab({ borderRadius, onEdit, onDelete }: { borderRadius: BorderRadiusToken[] } & TokenTabProps) {
  if (borderRadius.length === 0) return <EmptyTab label="圆角" />;
  return (
    <div className="km-list">
      {borderRadius.map((br, i) => (
        <div key={i} className="km-card km-radius-card" onClick={() => onEdit?.('borderRadius', i, br)}>
          <div className="km-radius-preview" style={{ borderRadius: br.value }} />
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-radius-value">{br.value}</span>
              {br.isCustom && <CustomBadge />}
            </div>
            <div className="km-card-meta">
              <span className="km-freq">×{br.frequency}</span>
              <SourcePages pages={br.sourcePages} />
            </div>
          </div>
          <CardActions tab="borderRadius" index={i} token={br} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

/* ========== Shadows Tab ========== */

function ShadowsTab({ shadows, onEdit, onDelete }: { shadows: ShadowToken[] } & TokenTabProps) {
  if (shadows.length === 0) return <EmptyTab label="阴影" />;
  return (
    <div className="km-list">
      {shadows.map((shadow, i) => (
        <div key={i} className="km-card km-shadow-card" onClick={() => onEdit?.('shadows', i, shadow)}>
          <div className="km-shadow-preview" style={{ boxShadow: shadow.value }} />
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-shadow-value">{shadow.value}</span>
              {shadow.isCustom && <CustomBadge />}
            </div>
            <div className="km-card-meta">
              <span className="km-freq">×{shadow.frequency}</span>
              <SourcePages pages={shadow.sourcePages} />
            </div>
          </div>
          <CardActions tab="shadows" index={i} token={shadow} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

/* ========== Components Tab ========== */

function ComponentsTab({ components }: { components: ComponentPattern[] }) {
  if (components.length === 0) return <EmptyTab label="组件模式" />;
  return (
    <div className="km-list">
      {components.map((comp, i) => (
        <div key={i} className="km-card km-comp-card">
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-comp-name">{comp.name}</span>
              <span className="km-freq">×{comp.frequency}</span>
            </div>
            <div className="km-comp-desc">{comp.description}</div>
            {Object.keys(comp.typicalStyles).length > 0 && (
              <div className="km-comp-styles">
                {Object.entries(comp.typicalStyles).slice(0, 6).map(([prop, val]) => (
                  <span key={prop} className="km-style-tag">{prop}: {String(val)}</span>
                ))}
              </div>
            )}
            <div className="km-card-meta">
              <SourcePages pages={comp.sourcePages} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========== Layouts Tab ========== */

function LayoutsTab({ layouts }: { layouts: LayoutPattern[] }) {
  if (layouts.length === 0) return <EmptyTab label="布局模式" />;
  return (
    <div className="km-list">
      {layouts.map((layout, i) => (
        <div key={i} className="km-card km-layout-card">
          <div className="km-card-body">
            <div className="km-card-header">
              <span className="km-layout-name">{layout.name}</span>
              <span className="km-freq">×{layout.frequency}</span>
            </div>
            <div className="km-layout-desc">{layout.description}</div>
            <div className="km-card-meta">
              <span className="km-layout-dir">方向: {directionLabel(layout.direction)}</span>
              <span className="km-layout-children">子元素: {layout.childCount}</span>
              <SourcePages pages={layout.sourcePages} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function directionLabel(dir: string): string {
  const map: Record<string, string> = { row: '水平', column: '垂直', mixed: '混合' };
  return map[dir] || dir;
}

/* ========== Empty State ========== */

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="km-empty-tab">
      <span>暂无{label}数据</span>
    </div>
  );
}
