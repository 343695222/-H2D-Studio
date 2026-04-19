(() => {
  const HOST_ID = "__figma_capture_ext_toolbar__";

  // Detect Firefox in MAIN world via CSS/navigator (browser.runtime.getBrowserInfo
  // is not available in MAIN world, only in content scripts).
  const isFirefox = navigator.userAgent.includes("Firefox");

  // Don't create toolbar twice
  if (document.getElementById(HOST_ID)) return;

  // --- Shadow DOM host ---
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  // --- Styles ---
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }

    .panel {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e1e1e;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
      font-family: "Inter", -apple-system, system-ui, sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      color: rgba(255,255,255,0.9);
      user-select: none;
      animation: slideIn 0.2s ease-out;
      overflow: visible;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* Drag handle */
    .drag-handle {
      display: flex;
      justify-content: center;
      padding: 6px 0 2px;
      cursor: grab;
    }
    .drag-handle:hover .drag-handle-icon { background: rgba(255,255,255,0.3); }
    .drag-handle:active { cursor: grabbing; }
    .drag-handle-icon {
      width: 32px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.15);
      transition: background 0.15s;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px 8px 16px;
    }
    .title {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .close-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      transition: background 0.1s;
    }
    .close-btn:hover { background: rgba(255,255,255,0.1); }
    .close-btn:active { background: rgba(255,255,255,0.15); }

    /* Actions */
    .actions {
      display: flex;
      gap: 6px;
      padding: 0 10px 10px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      height: 34px;
      padding: 0 12px;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.9);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .action-btn:hover { background: rgba(255,255,255,0.13); }
    .action-btn:active { background: rgba(255,255,255,0.18); }
    .action-btn.active {
      background: rgba(13, 153, 255, 0.2);
      color: #0d99ff;
      box-shadow: inset 0 0 0 1px rgba(13, 153, 255, 0.4);
    }
    .action-btn.active svg path { fill: #0d99ff; }
    .action-btn.disabled { opacity: 0.4; pointer-events: none; }
    .action-btn svg { flex-shrink: 0; }

    .chip {
      display: inline-flex;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.5);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-left: auto;
    }

    /* Status text (shown inside footer) */
    .status-text {
      display: none;
      color: rgba(255,255,255,0.5);
      white-space: pre-line;
      text-align: center;
      line-height: 1.4;
    }
    .status-text.animate-in {
      animation: statusIn 0.25s ease-out;
    }
    .status-text.animate-out {
      animation: statusOut 0.2s ease-in forwards;
    }
    .footer.success .status-text { color: #30d158; }

    @keyframes statusIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes statusOut {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-6px); }
    }

    .stop-btn {
      display: none;
      padding: 2px 8px;
      border: none;
      border-radius: 4px;
      background: rgba(255,59,48,0.15);
      color: #ff3b30;
      font: inherit;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .stop-btn.visible { display: inline-flex; }
    .stop-btn:hover { background: rgba(255,59,48,0.25); }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 16px 10px;
      font-size: 11px;
    }
    .footer a {
      display: flex;
      align-items: center;
      gap: 5px;
      color: rgba(255,255,255,0.35);
      text-decoration: none;
      transition: color 0.15s;
    }
    .footer a:hover { color: rgba(255,255,255,0.6); }
    .footer a svg { flex-shrink: 0; fill: currentColor; }

    /* Selection highlight */
    .highlight {
      position: fixed;
      pointer-events: none;
      border: 2px solid #0d99ff;
      border-radius: 3px;
      background: rgba(13, 153, 255, 0.08);
      z-index: 2147483646;
      transition: all 0.05s ease-out;
    }

    /* Mode switch */
    .mode-switch {
      display: flex;
      gap: 4px;
      padding: 0 10px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 8px;
    }
    .mode-btn {
      flex: 1;
      height: 28px;
      padding: 0 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,0.5);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .mode-btn:hover { background: rgba(255,255,255,0.06); }
    .mode-btn.active {
      background: rgba(13, 153, 255, 0.15);
      color: #0d99ff;
    }

    /* H2D Editor section */
    .h2d-section {
      display: none;
      padding: 0 10px 10px;
    }
    .h2d-section.visible { display: block; }

    .h2d-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: rgba(255,255,255,0.5);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff3b30;
      transition: background 0.3s;
    }
    .status-dot.connected { background: #30d158; }

    .h2d-input-group {
      margin-bottom: 10px;
    }
    .h2d-label {
      display: block;
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 4px;
    }
    .h2d-select, .h2d-input {
      width: 100%;
      height: 32px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      color: rgba(255,255,255,0.9);
      font: inherit;
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }
    .h2d-select:focus, .h2d-input:focus {
      border-color: rgba(13, 153, 255, 0.5);
    }
    .h2d-select option {
      background: #1e1e1e;
      color: rgba(255,255,255,0.9);
    }

    .h2d-project-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .h2d-project-row .h2d-select { flex: 1; }
    .h2d-new-btn {
      height: 32px;
      padding: 0 12px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.7);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .h2d-new-btn:hover { background: rgba(255,255,255,0.13); }

    .h2d-actions {
      display: flex;
      gap: 6px;
    }
    .h2d-actions .action-btn {
      flex: 1;
      height: 32px;
      font-size: 11px;
    }

    .h2d-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 16px;
      border-radius: 8px;
      background: rgba(48, 209, 88, 0.9);
      color: #000;
      font-size: 12px;
      font-weight: 500;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
      z-index: 2147483647;
    }
    .h2d-toast.visible { opacity: 1; }
    .h2d-toast.error { background: rgba(255, 59, 48, 0.9); color: #fff; }

    /* New project dialog */
    .h2d-dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2147483648;
    }
    .h2d-dialog-overlay.visible { display: flex; }
    .h2d-dialog {
      width: 280px;
      padding: 16px;
      border-radius: 12px;
      background: #2a2a2a;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .h2d-dialog-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .h2d-dialog-input {
      width: 100%;
      height: 36px;
      padding: 0 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      color: rgba(255,255,255,0.9);
      font: inherit;
      font-size: 13px;
      margin-bottom: 12px;
      box-sizing: border-box;
    }
    .h2d-dialog-input:focus {
      outline: none;
      border-color: rgba(13, 153, 255, 0.5);
    }
    .h2d-dialog-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .h2d-dialog-btn {
      height: 32px;
      padding: 0 14px;
      border: none;
      border-radius: 6px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .h2d-dialog-btn.cancel {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.7);
    }
    .h2d-dialog-btn.cancel:hover { background: rgba(255,255,255,0.13); }
    .h2d-dialog-btn.confirm {
      background: #0d99ff;
      color: #fff;
    }
    .h2d-dialog-btn.confirm:hover { background: #0a7fd4; }
  `;
  shadow.appendChild(style);

  // --- Icons ---
  const SVG_NS = "http://www.w3.org/2000/svg";

  function makeSvg(size: number, viewBox: string, pathData: string[], color?: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", viewBox);
    for (const d of pathData) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", color || "rgba(255,255,255,0.9)");
      svg.appendChild(p);
    }
    return svg;
  }

  const iconPaths: Record<string, string[]> = {
    screen: ["M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H9v2h2a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h2v-2H3.5A1.5 1.5 0 0 1 2 10.5v-7ZM3.5 3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9Z"],
    select: ["M3 2a1 1 0 0 0-1 1v2.5a.5.5 0 0 1-1 0V3a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1H3Zm7.5-1a.5.5 0 0 1 .5-.5H13a2 2 0 0 1 2 2v2.5a.5.5 0 0 1-1 0V3a1 1 0 0 0-1-1h-2.5a.5.5 0 0 1-.5-.5ZM1.5 10a.5.5 0 0 1 .5.5V13a1 1 0 0 0 1 1h2.5a.5.5 0 0 1 0 1H3a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5Zm13 0a.5.5 0 0 1 .5.5V13a2 2 0 0 1-2 2h-2.5a.5.5 0 0 1 0-1H13a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 .5-.5Z"],
    close: ["M3.47 3.47a.75.75 0 0 1 1.06 0L8 6.94l3.47-3.47a.75.75 0 1 1 1.06 1.06L9.06 8l3.47 3.47a.75.75 0 1 1-1.06 1.06L8 9.06l-3.47 3.47a.75.75 0 0 1-1.06-1.06L6.94 8 3.47 4.53a.75.75 0 0 1 0-1.06Z"],
    x: ["M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z"],
    server: ["M4.5 2A2.5 2.5 0 0 0 2 4.5v2A2.5 2.5 0 0 0 4.5 9h7A2.5 2.5 0 0 0 14 6.5v-2A2.5 2.5 0 0 0 11.5 2h-7ZM4.5 11A2.5 2.5 0 0 0 2 13.5v2A2.5 2.5 0 0 0 4.5 18h7a2.5 2.5 0 0 0 2.5-2.5v-2A2.5 2.5 0 0 0 11.5 11h-7ZM5 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
    plus: ["M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z"],
  };

  // --- Build panel ---
  const panel = document.createElement("div");
  panel.className = "panel";

  // Drag handle
  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  const dragIcon = document.createElement("div");
  dragIcon.className = "drag-handle-icon";
  dragHandle.appendChild(dragIcon);

  // Header
  const header = document.createElement("div");
  header.className = "header";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "H2D Capture";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.appendChild(makeSvg(12, "0 0 16 16", iconPaths.close, "rgba(255,255,255,0.5)"));
  closeBtn.addEventListener("click", destroy);

  header.append(title, closeBtn);

  // Actions
  const actions = document.createElement("div");
  actions.className = "actions";

  function makeActionBtn(iconKey: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.appendChild(makeSvg(14, "0 0 16 16", iconPaths[iconKey], "rgba(255,255,255,0.9)"));
    const span = document.createElement("span");
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener("click", onClick);
    return btn;
  }

  const btnScreen = makeActionBtn("screen", "Entire screen", () => capture("body", true));
  const btnSelect = makeActionBtn("select", "Select element", startSelection);

  actions.append(btnScreen, btnSelect);

  // Mode switch
  const modeSwitch = document.createElement("div");
  modeSwitch.className = "mode-switch";

  const btnModeFigma = document.createElement("button");
  btnModeFigma.className = "mode-btn active";
  btnModeFigma.textContent = "复制到 Figma";

  const btnModeH2D = document.createElement("button");
  btnModeH2D.className = "mode-btn";
  btnModeH2D.textContent = "发送到 H2D 编辑器";

  modeSwitch.append(btnModeFigma, btnModeH2D);

  // H2D Editor section
  const h2dSection = document.createElement("div");
  h2dSection.className = "h2d-section";

  // Connection status
  const h2dHeader = document.createElement("div");
  h2dHeader.className = "h2d-header";

  const connectionStatus = document.createElement("div");
  connectionStatus.className = "connection-status";
  const statusDot = document.createElement("span");
  statusDot.className = "status-dot";
  const statusTextH2D = document.createElement("span");
  statusTextH2D.textContent = "未连接";
  connectionStatus.append(statusDot, statusTextH2D);
  h2dHeader.appendChild(connectionStatus);

  // Project selection
  const projectGroup = document.createElement("div");
  projectGroup.className = "h2d-input-group";
  const projectLabel = document.createElement("label");
  projectLabel.className = "h2d-label";
  projectLabel.textContent = "选择项目";
  const projectRow = document.createElement("div");
  projectRow.className = "h2d-project-row";
  const projectSelect = document.createElement("select");
  projectSelect.className = "h2d-select";
  const newProjectBtn = document.createElement("button");
  newProjectBtn.className = "h2d-new-btn";
  newProjectBtn.textContent = "新建";
  projectRow.append(projectSelect, newProjectBtn);
  projectGroup.append(projectLabel, projectRow);

  // Page name input
  const pageNameGroup = document.createElement("div");
  pageNameGroup.className = "h2d-input-group";
  const pageNameLabel = document.createElement("label");
  pageNameLabel.className = "h2d-label";
  pageNameLabel.textContent = "页面名称";
  const pageNameInput = document.createElement("input");
  pageNameInput.className = "h2d-input";
  pageNameInput.type = "text";
  pageNameInput.value = document.title;
  pageNameGroup.append(pageNameLabel, pageNameInput);

  // H2D capture actions
  const h2dActions = document.createElement("div");
  h2dActions.className = "h2d-actions";

  const btnH2dScreen = makeActionBtn("screen", "整页捕获", () => captureToH2D("body"));
  const btnH2dSelect = makeActionBtn("select", "选择元素", startH2DSelection);

  h2dActions.append(btnH2dScreen, btnH2dSelect);

  h2dSection.append(h2dHeader, projectGroup, pageNameGroup, h2dActions);

  // Toast notification
  const toast = document.createElement("div");
  toast.className = "h2d-toast";
  shadow.appendChild(toast);

  // New project dialog
  const dialogOverlay = document.createElement("div");
  dialogOverlay.className = "h2d-dialog-overlay";
  const dialog = document.createElement("div");
  dialog.className = "h2d-dialog";
  const dialogTitle = document.createElement("div");
  dialogTitle.className = "h2d-dialog-title";
  dialogTitle.textContent = "新建项目";
  const dialogInput = document.createElement("input");
  dialogInput.className = "h2d-dialog-input";
  dialogInput.type = "text";
  dialogInput.placeholder = "输入项目名称";
  const dialogActions = document.createElement("div");
  dialogActions.className = "h2d-dialog-actions";
  const dialogCancel = document.createElement("button");
  dialogCancel.className = "h2d-dialog-btn cancel";
  dialogCancel.textContent = "取消";
  const dialogConfirm = document.createElement("button");
  dialogConfirm.className = "h2d-dialog-btn confirm";
  dialogConfirm.textContent = "创建";
  dialogActions.append(dialogCancel, dialogConfirm);
  dialog.append(dialogTitle, dialogInput, dialogActions);
  dialogOverlay.appendChild(dialog);
  shadow.appendChild(dialogOverlay);

  // Footer (doubles as status area)
  const footer = document.createElement("div");
  footer.className = "footer";

  const footerDefault = document.createElement("a");
  footerDefault.href = "https://x.com/romashov";
  footerDefault.target = "_blank";
  footerDefault.rel = "noopener";
  const xLabel = document.createElement("span");
  xLabel.textContent = "Follow me on";
  footerDefault.appendChild(xLabel);
  footerDefault.appendChild(makeSvg(12, "0 0 24 24", iconPaths.x, "currentColor"));

  const statusText = document.createElement("span");
  statusText.className = "status-text";

  const stopBtn = document.createElement("button");
  stopBtn.className = "stop-btn";
  stopBtn.textContent = "Stop";

  footer.append(footerDefault, statusText, stopBtn);

  panel.append(dragHandle, header, actions, modeSwitch, h2dSection, footer);
  shadow.appendChild(panel);

  // --- Drag logic ---
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;
  let hasMoved = false;

  dragHandle.addEventListener("mousedown", (e: MouseEvent) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = panel.getBoundingClientRect();
    panelStartX = rect.left;
    panelStartY = rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newX = panelStartX + dx;
    const newY = panelStartY + dy;

    if (!hasMoved) {
      hasMoved = true;
      panel.style.transform = "none";
    }
    panel.style.left = newX + "px";
    panel.style.top = newY + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // --- Highlight element ---
  const highlight = document.createElement("div");
  highlight.className = "highlight";
  highlight.style.display = "none";
  shadow.appendChild(highlight);

  // --- Mode switching ---
  let currentMode: "figma" | "h2d" = "figma";
  let projects: Array<{ id: string; name: string }> = [];
  let isServerConnected = false;

  // Mode switch handlers
  btnModeFigma.addEventListener("click", () => {
    if (currentMode === "figma") return;
    currentMode = "figma";
    btnModeFigma.classList.add("active");
    btnModeH2D.classList.remove("active");
    h2dSection.classList.remove("visible");
    actions.style.display = "flex";
    stopH2DSelection();
  });

  btnModeH2D.addEventListener("click", () => {
    if (currentMode === "h2d") return;
    currentMode = "h2d";
    btnModeH2D.classList.add("active");
    btnModeFigma.classList.remove("active");
    h2dSection.classList.add("visible");
    actions.style.display = "none";
    checkServerConnection();
  });

  // Check server connection and load projects (direct fetch, runs in MAIN world)
  async function checkServerConnection(): Promise<void> {
    try {
      const res = await fetch("http://127.0.0.1:3200/api/projects");
      const result = await res.json();
      if (result.success || Array.isArray(result.data) || Array.isArray(result)) {
        isServerConnected = true;
        statusDot.classList.add("connected");
        statusTextH2D.textContent = "已连接";
        projects = result.data || result || [];
        updateProjectSelect();
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err) {
      isServerConnected = false;
      statusDot.classList.remove("connected");
      statusTextH2D.textContent = "未连接";
      showToast("无法连接到 H2D 服务 (localhost:3200)", true);
    }
  }

  function updateProjectSelect(): void {
    projectSelect.innerHTML = "";
    if (projects.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "暂无项目";
      projectSelect.appendChild(option);
    } else {
      projects.forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.name;
        projectSelect.appendChild(option);
      });
    }
  }

  // New project dialog
  newProjectBtn.addEventListener("click", () => {
    dialogInput.value = "";
    dialogOverlay.classList.add("visible");
    dialogInput.focus();
  });

  dialogCancel.addEventListener("click", () => {
    dialogOverlay.classList.remove("visible");
  });

  dialogConfirm.addEventListener("click", createNewProject);
  dialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewProject();
    if (e.key === "Escape") dialogOverlay.classList.remove("visible");
  });

  async function createNewProject(): Promise<void> {
    const name = dialogInput.value.trim();
    if (!name) return;

    try {
      const res = await fetch("http://127.0.0.1:3200/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const result = await res.json();

      if (result.success || result.id || result.data?.id) {
        dialogOverlay.classList.remove("visible");
        await checkServerConnection();
        const newId = result.data?.id || result.id;
        if (newId) {
          projectSelect.value = newId;
        }
        showToast("项目创建成功");
      } else {
        throw new Error(result.error || "创建失败");
      }
    } catch (err) {
      showToast("创建项目失败: " + (err as Error).message, true);
    }
  }

  // Toast notification
  function showToast(message: string, isError: boolean = false): void {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    setTimeout(() => {
      toast.classList.remove("visible");
    }, 3000);
  }

  // Capture screenshot using canvas (runs in MAIN world, no chrome API)
  async function captureScreenshot(): Promise<string> {
    try {
      // Use a simple canvas-based approach to capture visible area
      const canvas = document.createElement("canvas");
      const scrollW = document.documentElement.scrollWidth;
      const scrollH = document.documentElement.scrollHeight;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      // Capture at viewport size for performance
      canvas.width = viewW * window.devicePixelRatio;
      canvas.height = viewH * window.devicePixelRatio;
      // Fallback: return empty screenshot (the server still works without it)
      // Full screenshot requires html2canvas or background API bridge
      // For now, dispatch event to ISOLATED world which can use chrome API
      return await captureScreenshotViaBridge();
    } catch (err) {
      // Return empty string as fallback - capture still works without screenshot
      console.warn("Screenshot capture failed, continuing without screenshot", err);
      return "";
    }
  }

  // Bridge to ISOLATED world for screenshot (via CustomEvent)
  function captureScreenshotViaBridge(): Promise<string> {
    return new Promise((resolve) => {
      const callbackId = "h2d-ss-" + Date.now();
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.callbackId === callbackId) {
          window.removeEventListener("h2d-screenshot-result", handler);
          resolve(detail.data || "");
        }
      };
      window.addEventListener("h2d-screenshot-result", handler);
      window.dispatchEvent(new CustomEvent("h2d-screenshot-request", {
        detail: { callbackId }
      }));
      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener("h2d-screenshot-result", handler);
        resolve("");
      }, 8000);
    });
  }

  // Capture to H2D server
  async function captureToH2D(selector: string): Promise<void> {
    if (!isServerConnected) {
      showToast("请先连接到 H2D 服务", true);
      return;
    }

    const projectId = projectSelect.value;
    if (!projectId) {
      showToast("请先选择一个项目", true);
      return;
    }

    if (!window.figma?.capturePage) {
      showToast("Error: capture script not loaded", true);
      return;
    }

    btnH2dScreen.classList.add("disabled");
    btnH2dSelect.classList.add("disabled");
    showToast("正在捕获...");

    // Hide toolbar and highlight before capture
    host.style.display = "none";
    highlight.style.display = "none";

    // Wait for repaint so the hidden toolbar is not captured
    await new Promise(r => setTimeout(r, 100));

    try {
      // Capture DOM and screenshot in parallel
      const [captureTree, screenshot] = await Promise.all([
        window.figma.capturePage(selector),
        captureScreenshot()
      ]);

      showToast("正在发送到 H2D 编辑器...");

      const res = await fetch("http://127.0.0.1:3200/api/capture/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: pageNameInput.value.trim() || document.title,
          url: window.location.href,
          captureTree,
          screenshot,
          description: ""
        })
      });
      const result = await res.json();

      if (result.success) {
        showToast("捕获成功!");
        // Keep toolbar open for further captures
      } else {
        throw new Error(result.error || "发送失败");
      }
    } catch (err) {
      showToast("发送失败: " + (err as Error).message, true);
    } finally {
      // Restore toolbar visibility
      host.style.display = "";
      btnH2dScreen.classList.remove("disabled");
      btnH2dSelect.classList.remove("disabled");
    }
  }

  // H2D element selection
  let h2dSelecting = false;
  let h2dSelectedEl: Element | null = null;

  function startH2DSelection(): void {
    if (h2dSelecting) return;
    h2dSelecting = true;
    btnH2dSelect.classList.add("active");
    document.addEventListener("mousemove", onH2DSelectionMove, true);
    document.addEventListener("click", onH2DSelectionClick, true);
    document.addEventListener("keydown", onH2DSelectionKey, true);
  }

  function stopH2DSelection(): void {
    h2dSelecting = false;
    btnH2dSelect.classList.remove("active");
    highlight.style.display = "none";
    h2dSelectedEl = null;
    document.removeEventListener("mousemove", onH2DSelectionMove, true);
    document.removeEventListener("click", onH2DSelectionClick, true);
    document.removeEventListener("keydown", onH2DSelectionKey, true);
  }

  function onH2DSelectionMove(e: MouseEvent): void {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    h2dSelectedEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = rect.top + "px";
    highlight.style.left = rect.left + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
  }

  function onH2DSelectionClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const el = h2dSelectedEl;
    stopH2DSelection();

    if (el) {
      const tempId = "__h2d_cap_" + Math.random().toString(36).slice(2, 10);
      const hadId = el.id;
      el.id = tempId;
      captureToH2D(`#${tempId}`).finally(() => {
        if (hadId) el.id = hadId;
        else el.removeAttribute("id");
      });
    }
  }

  function onH2DSelectionKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      stopH2DSelection();
    }
  }

  // --- Capture logic ---
  let captureAborted = false;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  async function capture(selector: string, autoDestroy: boolean = true): Promise<void> {
    if (!window.figma?.capturePage) {
      showStatus("Error: capture script not loaded", false);
      return;
    }

    captureAborted = false;
    setLoading(true);
    showStatus("Capturing...", false);

    // Show stop button after 5 seconds
    stopTimer = setTimeout(() => {
      if (!captureAborted) stopBtn.classList.add("visible");
    }, 5000);

    // Firefox: navigator.clipboard.write() requires user activation. Since the
    // click event is still on the stack here (before any await), we create a
    // ClipboardItem with a pending Promise<Blob> now. Firefox holds the write
    // transaction open until the promise resolves.
    let ffClipboard: {
      resolve: (b: Blob) => void;
      reject: (e: unknown) => void;
      writePromise: Promise<void>;
    } | null = null;
    if (isFirefox) {
      let resolve!: (b: Blob) => void;
      let reject!: (e: unknown) => void;
      const blobPromise = new Promise<Blob>((res, rej) => { resolve = res; reject = rej; });
      const writePromise = navigator.clipboard.write([new ClipboardItem({ "text/html": blobPromise })]);
      ffClipboard = { resolve, reject, writePromise };
    }

    try {
      const json = await window.figma.capturePage(selector);
      if (captureAborted) {
        ffClipboard?.reject(new Error("aborted"));
        return;
      }

      showStatus("Copying to clipboard...", false);
      if (ffClipboard) {
        ffClipboard.resolve(await window.figma.wrapForClipboard!(json));
        await ffClipboard.writePromise;
      } else {
        await window.figma.writeToClipboard!(json);
      }

      showStatus("Copied to clipboard", true);
      setTimeout(() => {
        if (captureAborted) return;
        showStatus("Now paste into Figma canvas", true);
        if (autoDestroy) setTimeout(destroy, 3000);
      }, 3000);
    } catch (err) {
      if (!captureAborted) {
        showStatus("Error: " + ((err as Error).message || String(err)), false);
      }
      ffClipboard?.reject(err);
      setLoading(false);
    } finally {
      clearStopTimer();
    }
  }

  stopBtn.addEventListener("click", () => {
    captureAborted = true;
    clearStopTimer();
    stopBtn.classList.remove("visible");
    showStatus("Capture stopped", false);
    setLoading(false);
    setTimeout(() => {
      if (statusText.textContent === "Capture stopped") {
        hideStatus();
      }
    }, 3000);
  });

  function clearStopTimer(): void {
    if (stopTimer !== null) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    stopBtn.classList.remove("visible");
  }

  function showStatus(text: string, success: boolean): void {
    footerDefault.style.display = "none";
    statusText.classList.remove("animate-out");
    statusText.textContent = text;
    statusText.style.display = "inline";
    footer.classList.toggle("success", !!success);
    // Re-trigger animate-in
    statusText.classList.remove("animate-in");
    void statusText.offsetWidth;
    statusText.classList.add("animate-in");
  }

  function hideStatus(): void {
    statusText.classList.remove("animate-in");
    statusText.classList.add("animate-out");
    statusText.addEventListener("animationend", () => {
      statusText.classList.remove("animate-out");
      statusText.style.display = "none";
      statusText.textContent = "";
      stopBtn.classList.remove("visible");
      footer.classList.remove("success");
      footerDefault.style.display = "";
    }, { once: true });
  }

  function setLoading(loading: boolean): void {
    btnScreen.classList.toggle("disabled", loading);
    btnSelect.classList.toggle("disabled", loading);
  }

  // --- Element selection ---
  let selecting = false;
  let selectedEl: Element | null = null;

  function startSelection(): void {
    if (selecting) return;
    selecting = true;
    btnSelect.classList.add("active");
    document.addEventListener("mousemove", onSelectionMove, true);
    document.addEventListener("click", onSelectionClick, true);
    document.addEventListener("keydown", onSelectionKey, true);
  }

  function stopSelection(): void {
    selecting = false;
    btnSelect.classList.remove("active");
    highlight.style.display = "none";
    selectedEl = null;
    document.removeEventListener("mousemove", onSelectionMove, true);
    document.removeEventListener("click", onSelectionClick, true);
    document.removeEventListener("keydown", onSelectionKey, true);
  }

  function onSelectionMove(e: MouseEvent): void {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    selectedEl = el;
    const rect = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = rect.top + "px";
    highlight.style.left = rect.left + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
  }

  function onSelectionClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const el = selectedEl;
    stopSelection();

    if (el) {
      const tempId = "__figcap_" + Math.random().toString(36).slice(2, 10);
      const hadId = el.id;
      el.id = tempId;
      capture(`#${tempId}`).finally(() => {
        if (hadId) el.id = hadId;
        else el.removeAttribute("id");
      });
    }
  }

  function onSelectionKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      stopSelection();
      hideStatus();
    }
  }

  // --- Cleanup ---
  function destroy(): void {
    stopSelection();
    stopH2DSelection();
    host.remove();
  }

  // Close on Escape
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && !selecting) destroy();
  });
})();
