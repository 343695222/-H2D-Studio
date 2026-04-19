import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore.ts';
import type { ElementSnapshot, TextSnapshot, Rect } from '../../types/capture.ts';
import './PropertyPanel.css';

// 标签选项
const TAG_OPTIONS = [
  'div', 'span', 'button', 'input', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'img', 'section',
  'header', 'footer', 'nav', 'main', 'form', 'table'
];

// font-weight 选项
const FONT_WEIGHT_OPTIONS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

// border-style 选项
const BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];

// display 选项
const DISPLAY_OPTIONS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'none'];

// flex-direction 选项
const FLEX_DIRECTION_OPTIONS = ['row', 'row-reverse', 'column', 'column-reverse'];

// justify-content 选项
const JUSTIFY_CONTENT_OPTIONS = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];

// align-items 选项
const ALIGN_ITEMS_OPTIONS = ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'];

// text-align 按钮选项已在 ButtonGroup 中内联定义

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({ title, children, defaultExpanded = true }: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <div className="property-section collapsible">
      <h4 onClick={() => setExpanded(!expanded)} className="collapsible-header">
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 16 16" 
          fill="currentColor"
          className={`expand-icon ${expanded ? 'expanded' : ''}`}
        >
          <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
        </svg>
        {title}
      </h4>
      {expanded && <div className="section-content">{children}</div>}
    </div>
  );
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
}

function NumberInput({ label, value, onChange, suffix = 'px', min }: NumberInputProps) {
  return (
    <div className="property-field number-field">
      <label>{label}</label>
      <div className="number-input-wrapper">
        <input
          type="number"
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorInput({ label, value, onChange }: ColorInputProps) {
  const colorValue = value || '#000000';
  
  return (
    <div className="property-field color-field">
      <label>{label}</label>
      <div className="color-input-wrapper">
        <input
          type="color"
          value={colorValue.startsWith('#') ? colorValue : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SelectInput({ label, value, options, onChange }: SelectInputProps) {
  return (
    <div className="property-field select-field">
      <label>{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TextInput({ label, value, onChange, placeholder }: TextInputProps) {
  return (
    <div className="property-field text-field">
      <label>{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

interface DirectionalInputProps {
  label: string;
  values: { top: string; right: string; bottom: string; left: string };
  onChange: (values: { top: string; right: string; bottom: string; left: string }) => void;
}

function DirectionalInput({ label, values, onChange }: DirectionalInputProps) {
  const handleChange = (key: keyof typeof values, value: string) => {
    onChange({ ...values, [key]: value });
  };
  
  const handleUnifiedChange = (value: string) => {
    onChange({ top: value, right: value, bottom: value, left: value });
  };
  
  return (
    <div className="property-field directional-field">
      <label>{label}</label>
      <div className="directional-inputs">
        <input
          type="text"
          value={values.top}
          onChange={(e) => handleChange('top', e.target.value)}
          placeholder="top"
          className="dir-input top"
          title="Top"
        />
        <input
          type="text"
          value={values.right}
          onChange={(e) => handleChange('right', e.target.value)}
          placeholder="right"
          className="dir-input right"
          title="Right"
        />
        <input
          type="text"
          value={values.bottom}
          onChange={(e) => handleChange('bottom', e.target.value)}
          placeholder="bottom"
          className="dir-input bottom"
          title="Bottom"
        />
        <input
          type="text"
          value={values.left}
          onChange={(e) => handleChange('left', e.target.value)}
          placeholder="left"
          className="dir-input left"
          title="Left"
        />
      </div>
      <input
        type="text"
        value={values.top === values.right && values.right === values.bottom && values.bottom === values.left ? values.top : ''}
        onChange={(e) => handleUnifiedChange(e.target.value)}
        placeholder="统一设置 (如: 10px)"
        className="unified-input"
      />
    </div>
  );
}

interface ButtonGroupProps {
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  onChange: (value: string) => void;
}

function ButtonGroup({ value, options, onChange }: ButtonGroupProps) {
  return (
    <div className="button-group">
      {options.map(opt => (
        <button
          key={opt.value}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
          title={opt.label}
        >
          {opt.icon || opt.label}
        </button>
      ))}
    </div>
  );
}

export function PropertyPanel() {
  const { 
    selectedNodeIds, 
    findNodeById, 
    updateNodeStyles, 
    updateNodeText,
    updateNodeTag,
    updateNodeRect,
    setShowAIPanel
  } = useEditorStore();
  
  // 只处理单选情况
  const selectedNode = selectedNodeIds.length === 1 
    ? findNodeById(selectedNodeIds[0]) 
    : null;
  
  // 多选提示
  if (selectedNodeIds.length > 1) {
    return (
      <div className="property-panel">
        <div className="property-panel-header">
          <h3>属性</h3>
        </div>
        <div className="property-panel-content">
          <div className="multi-selection-info">
            <p>已选择 {selectedNodeIds.length} 个组件</p>
            <p className="hint">多选时无法显示属性</p>
          </div>
        </div>
      </div>
    );
  }
  
  // 无选中提示
  if (!selectedNode) {
    return (
      <div className="property-panel">
        <div className="property-panel-header">
          <h3>属性</h3>
        </div>
        <div className="property-panel-content">
          <div className="no-selection">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
            <p>请选择一个组件</p>
            <p className="hint">点击画布或图层树中的组件</p>
          </div>
        </div>
      </div>
    );
  }
  
  const isTextNode = selectedNode.nodeType === 3;
  const nodeId = selectedNode.id;
  const { rect } = selectedNode;
  
  // ElementNode 的样式处理
  const elementNode = isTextNode ? null : selectedNode as ElementSnapshot;
  const styles = elementNode?.styles || {};
  
  // 解析方向性值 (padding/margin)
  const parseDirectionalValue = (value: string | undefined) => {
    if (!value) return { top: '', right: '', bottom: '', left: '' };
    const parts = value.split(/\s+/);
    if (parts.length === 1) {
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    } else if (parts.length === 2) {
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    } else if (parts.length === 4) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }
    return { top: value, right: value, bottom: value, left: value };
  };
  
  const handleStyleChange = (property: string, value: string) => {
    updateNodeStyles(nodeId, { [property]: value });
  };
  
  const handleRectChange = (updates: Partial<Rect>) => {
    updateNodeRect(nodeId, updates);
  };
  
  const handleTextChange = (content: string) => {
    updateNodeText(nodeId, content);
  };
  
  const handleTagChange = (tag: string) => {
    updateNodeTag(nodeId, tag);
  };
  
  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h3>属性</h3>
        {isTextNode ? (
          <span className="node-type-badge text">文本</span>
        ) : (
          <span className="node-type-badge element">元素</span>
        )}
      </div>
      
      <div className="property-panel-content">
        {/* 基本信息区 */}
        <CollapsibleSection title="基本信息" defaultExpanded={true}>
          <div className="property-field readonly-field">
            <label>节点ID</label>
            <div className="copyable-value" onClick={() => copyToClipboard(nodeId)}>
              <code>{nodeId.substring(0, 12)}...</code>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
              </svg>
            </div>
          </div>
          
          {!isTextNode && (
            <SelectInput
              label="标签类型"
              value={elementNode?.tag || 'div'}
              options={TAG_OPTIONS}
              onChange={handleTagChange}
            />
          )}
          <button
            className="btn btn-sm ai-edit-btn"
            onClick={() => setShowAIPanel(true)}
            title="使用 AI 助手编辑此元素"
          >
            🤖 AI 编辑此元素
          </button>
        </CollapsibleSection>
        
        {/* 位置与尺寸区 */}
        <CollapsibleSection title="位置与尺寸" defaultExpanded={true}>
          <div className="property-row-grid">
            <NumberInput
              label="X"
              value={rect.x}
              onChange={(v) => handleRectChange({ x: v })}
            />
            <NumberInput
              label="Y"
              value={rect.y}
              onChange={(v) => handleRectChange({ y: v })}
            />
          </div>
          <div className="property-row-grid">
            <NumberInput
              label="宽度"
              value={rect.width}
              onChange={(v) => handleRectChange({ width: v })}
              min={0}
            />
            <NumberInput
              label="高度"
              value={rect.height}
              onChange={(v) => handleRectChange({ height: v })}
              min={0}
            />
          </div>
        </CollapsibleSection>
        
        {/* 文本节点: 文本内容 */}
        {isTextNode && (
          <CollapsibleSection title="文本内容" defaultExpanded={true}>
            <textarea
              className="text-content-textarea"
              value={(selectedNode as TextSnapshot).text}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={4}
            />
          </CollapsibleSection>
        )}
        
        {/* 样式编辑区 - 仅元素节点 */}
        {!isTextNode && (
          <>
            {/* 文字样式 */}
            <CollapsibleSection title="文字样式" defaultExpanded={true}>
              <ColorInput
                label="颜色"
                value={styles.color || ''}
                onChange={(v) => handleStyleChange('color', v)}
              />
              <div className="property-row-grid">
                <NumberInput
                  label="字号"
                  value={parseFloat(styles.fontSize) || 0}
                  onChange={(v) => handleStyleChange('fontSize', `${v}px`)}
                />
                <SelectInput
                  label="字重"
                  value={styles.fontWeight || 'normal'}
                  options={FONT_WEIGHT_OPTIONS}
                  onChange={(v) => handleStyleChange('fontWeight', v)}
                />
              </div>
              <TextInput
                label="字体"
                value={styles.fontFamily || ''}
                onChange={(v) => handleStyleChange('fontFamily', v)}
                placeholder="Arial, sans-serif"
              />
              <div className="property-field">
                <label>对齐</label>
                <ButtonGroup
                  value={styles.textAlign || 'left'}
                  options={[
                    { value: 'left', label: '左', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg> },
                    { value: 'center', label: '中', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm2 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg> },
                    { value: 'right', label: '右', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg> },
                    { value: 'justify', label: '两端', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg> },
                  ]}
                  onChange={(v) => handleStyleChange('textAlign', v)}
                />
              </div>
              <NumberInput
                label="行高"
                value={parseFloat(styles.lineHeight) || 0}
                onChange={(v) => handleStyleChange('lineHeight', `${v}`)}
                suffix=""
              />
            </CollapsibleSection>
            
            {/* 背景 */}
            <CollapsibleSection title="背景" defaultExpanded={false}>
              <ColorInput
                label="背景色"
                value={styles.backgroundColor || ''}
                onChange={(v) => handleStyleChange('backgroundColor', v)}
              />
            </CollapsibleSection>
            
            {/* 边框 */}
            <CollapsibleSection title="边框" defaultExpanded={false}>
              <div className="property-row-grid">
                <NumberInput
                  label="边框宽度"
                  value={parseFloat(styles.borderWidth) || 0}
                  onChange={(v) => handleStyleChange('borderWidth', `${v}px`)}
                />
                <SelectInput
                  label="边框样式"
                  value={styles.borderStyle || 'none'}
                  options={BORDER_STYLE_OPTIONS}
                  onChange={(v) => handleStyleChange('borderStyle', v)}
                />
              </div>
              <ColorInput
                label="边框颜色"
                value={styles.borderColor || ''}
                onChange={(v) => handleStyleChange('borderColor', v)}
              />
              <NumberInput
                label="圆角"
                value={parseFloat(styles.borderRadius) || 0}
                onChange={(v) => handleStyleChange('borderRadius', `${v}px`)}
              />
            </CollapsibleSection>
            
            {/* 间距 */}
            <CollapsibleSection title="间距" defaultExpanded={false}>
              <DirectionalInput
                label="内边距 (padding)"
                values={parseDirectionalValue(styles.padding)}
                onChange={(vals) => {
                  const value = `${vals.top} ${vals.right} ${vals.bottom} ${vals.left}`.trim();
                  handleStyleChange('padding', value);
                }}
              />
              <DirectionalInput
                label="外边距 (margin)"
                values={parseDirectionalValue(styles.margin)}
                onChange={(vals) => {
                  const value = `${vals.top} ${vals.right} ${vals.bottom} ${vals.left}`.trim();
                  handleStyleChange('margin', value);
                }}
              />
            </CollapsibleSection>
            
            {/* 布局 */}
            <CollapsibleSection title="布局" defaultExpanded={false}>
              <SelectInput
                label="显示方式"
                value={styles.display || 'block'}
                options={DISPLAY_OPTIONS}
                onChange={(v) => handleStyleChange('display', v)}
              />
              
              {styles.display === 'flex' && (
                <>
                  <SelectInput
                    label="排列方向"
                    value={styles.flexDirection || 'row'}
                    options={FLEX_DIRECTION_OPTIONS}
                    onChange={(v) => handleStyleChange('flexDirection', v)}
                  />
                  <SelectInput
                    label="主轴对齐"
                    value={styles.justifyContent || 'flex-start'}
                    options={JUSTIFY_CONTENT_OPTIONS}
                    onChange={(v) => handleStyleChange('justifyContent', v)}
                  />
                  <SelectInput
                    label="交叉轴对齐"
                    value={styles.alignItems || 'stretch'}
                    options={ALIGN_ITEMS_OPTIONS}
                    onChange={(v) => handleStyleChange('alignItems', v)}
                  />
                  <TextInput
                    label="间距 (gap)"
                    value={styles.gap || ''}
                    onChange={(v) => handleStyleChange('gap', v)}
                    placeholder="10px"
                  />
                </>
              )}
            </CollapsibleSection>
          </>
        )}
        
        {/* 文本节点的文字样式 */}
        {isTextNode && (
          <CollapsibleSection title="文字样式" defaultExpanded={true}>
            <ColorInput
              label="颜色"
              value={styles.color || ''}
              onChange={(v) => handleStyleChange('color', v)}
            />
            <div className="property-row-grid">
              <NumberInput
                label="字号"
                value={parseFloat(styles.fontSize) || 0}
                onChange={(v) => handleStyleChange('fontSize', `${v}px`)}
              />
              <SelectInput
                label="字重"
                value={styles.fontWeight || 'normal'}
                options={FONT_WEIGHT_OPTIONS}
                onChange={(v) => handleStyleChange('fontWeight', v)}
              />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
