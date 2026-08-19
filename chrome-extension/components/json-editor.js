/**
 * Interactive JSON Editor Component for Message Payloads
 * Supports Code View (with real-time validation, formatting, minification)
 * and Interactive Tree View (collapsible nodes, inline key-value editing, type conversion, node deletion/addition).
 */

export class JsonEditor {
  /**
   * @param {HTMLElement} container - The DOM element to render the editor into
   * @param {Object} options - Configuration options
   * @param {string} options.initialValue - Initial JSON string or plain text
   * @param {Function} options.onChange - Callback fired on content change (value, isValid)
   * @param {boolean} options.readOnly - Read-only mode flag
   */
  constructor(container, options = {}) {
    this.container = container;
    this.value = options.initialValue || '';
    this.onChange = options.onChange || (() => {});
    this.readOnly = options.readOnly || false;

    this.mode = 'code'; // 'code' | 'tree'
    this.parsedData = null;
    this.isValidJson = false;
    this.errorMessage = '';

    this.init();
  }

  init() {
    this.parseCurrentValue();
    this.renderSkeleton();
    this.updateView();
  }

  parseCurrentValue() {
    if (!this.value.trim()) {
      this.parsedData = null;
      this.isValidJson = true; // Empty payload is treated as valid empty
      this.errorMessage = '';
      return;
    }

    try {
      this.parsedData = JSON.parse(this.value);
      this.isValidJson = true;
      this.errorMessage = '';
    } catch (err) {
      this.parsedData = null;
      this.isValidJson = false;
      this.errorMessage = err.message;
    }
  }

  setValue(newValue) {
    this.value = newValue;
    this.parseCurrentValue();
    this.updateView();
  }

  getValue() {
    return this.value;
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="json-editor-wrapper">
        <!-- Toolbar Header -->
        <div class="json-editor-toolbar">
          <div class="json-editor-modes">
            <button class="json-btn json-btn-tab active" data-mode="code">Code Editor</button>
            <button class="json-btn json-btn-tab" data-mode="tree">Tree View</button>
          </div>
          
          <div class="json-editor-actions">
            <button class="json-btn json-btn-action" id="jsonBtnFormat" title="Prettify / Format JSON">✨ Format</button>
            <button class="json-btn json-btn-action" id="jsonBtnMinify" title="Minify JSON">⚡ Minify</button>
            <button class="json-btn json-btn-action" id="jsonBtnCopy" title="Copy to clipboard">📋 Copy</button>
          </div>

          <div class="json-status-indicator" id="jsonStatusIndicator">
            <span class="json-status-dot valid"></span> Valid JSON
          </div>
        </div>

        <!-- Error Banner -->
        <div class="json-error-banner" id="jsonErrorBanner" style="display:none;"></div>

        <!-- Main Workspace -->
        <div class="json-editor-body">
          <div class="json-view-code" id="jsonViewCode">
            <textarea class="json-code-input" id="jsonCodeInput" spellcheck="false" placeholder="Enter payload JSON..."></textarea>
          </div>
          <div class="json-view-tree" id="jsonViewTree" style="display:none;"></div>
        </div>
      </div>
    `;

    // Bind Mode Buttons
    const modeBtns = this.container.querySelectorAll('.json-btn-tab');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetMode = e.target.getAttribute('data-mode');
        this.setMode(targetMode);
      });
    });

    // Bind Action Buttons
    const btnFormat = this.container.querySelector('#jsonBtnFormat');
    const btnMinify = this.container.querySelector('#jsonBtnMinify');
    const btnCopy = this.container.querySelector('#jsonBtnCopy');
    const codeInput = this.container.querySelector('#jsonCodeInput');

    btnFormat.addEventListener('click', () => this.formatJson());
    btnMinify.addEventListener('click', () => this.minifyJson());
    btnCopy.addEventListener('click', () => this.copyToClipboard());

    codeInput.addEventListener('input', (e) => {
      this.value = e.target.value;
      this.parseCurrentValue();
      this.updateStatusAndErrors();
      this.onChange(this.value, this.isValidJson);
    });

    if (this.readOnly) {
      codeInput.readOnly = true;
      btnFormat.disabled = true;
      btnMinify.disabled = true;
    }
  }

  setMode(mode) {
    if (mode === 'tree' && !this.isValidJson) {
      this.showTemporaryToast('Cannot switch to Tree View: Invalid JSON payload');
      return;
    }

    this.mode = mode;
    const modeBtns = this.container.querySelectorAll('.json-btn-tab');
    modeBtns.forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const codeView = this.container.querySelector('#jsonViewCode');
    const treeView = this.container.querySelector('#jsonViewTree');

    if (mode === 'code') {
      codeView.style.display = 'block';
      treeView.style.display = 'none';
    } else {
      codeView.style.display = 'none';
      treeView.style.display = 'block';
      this.renderTreeView();
    }
  }

  updateView() {
    const codeInput = this.container.querySelector('#jsonCodeInput');
    if (codeInput) {
      codeInput.value = this.value;
    }

    this.updateStatusAndErrors();

    if (this.mode === 'tree' && this.isValidJson) {
      this.renderTreeView();
    }
  }

  updateStatusAndErrors() {
    const statusInd = this.container.querySelector('#jsonStatusIndicator');
    const errBanner = this.container.querySelector('#jsonErrorBanner');

    if (!this.value.trim()) {
      statusInd.innerHTML = `<span class="json-status-dot empty"></span> Empty Payload`;
      errBanner.style.display = 'none';
      return;
    }

    if (this.isValidJson) {
      statusInd.innerHTML = `<span class="json-status-dot valid"></span> Valid JSON`;
      errBanner.style.display = 'none';
    } else {
      statusInd.innerHTML = `<span class="json-status-dot invalid"></span> Invalid JSON`;
      errBanner.style.display = 'block';
      errBanner.textContent = `Syntax Error: ${this.errorMessage}`;
    }
  }

  formatJson() {
    if (!this.isValidJson || !this.parsedData) return;
    this.value = JSON.stringify(this.parsedData, null, 2);
    this.updateView();
    this.onChange(this.value, true);
  }

  minifyJson() {
    if (!this.isValidJson || !this.parsedData) return;
    this.value = JSON.stringify(this.parsedData);
    this.updateView();
    this.onChange(this.value, true);
  }

  async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.value);
      this.showTemporaryToast('Copied payload to clipboard!');
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }

  showTemporaryToast(msg) {
    const errBanner = this.container.querySelector('#jsonErrorBanner');
    errBanner.style.display = 'block';
    errBanner.className = 'json-error-banner toast';
    errBanner.textContent = msg;

    setTimeout(() => {
      if (this.isValidJson) {
        errBanner.style.display = 'none';
        errBanner.className = 'json-error-banner';
      } else {
        errBanner.className = 'json-error-banner';
        errBanner.textContent = `Syntax Error: ${this.errorMessage}`;
      }
    }, 2500);
  }

  /* =========================================================================
   * Interactive Tree View Rendering & Data Sync
   * ========================================================================= */

  renderTreeView() {
    const treeView = this.container.querySelector('#jsonViewTree');
    treeView.innerHTML = '';

    if (this.parsedData === null || typeof this.parsedData !== 'object') {
      treeView.innerHTML = `
        <div class="json-tree-primitive">
          <span class="json-tree-label">Primitive Root:</span>
          ${this.renderPrimitiveInput(this.parsedData, (val) => {
            this.parsedData = val;
            this.syncFromTreeData();
          })}
        </div>
      `;
      return;
    }

    const rootNode = this.createTreeNode(null, this.parsedData, true);
    treeView.appendChild(rootNode);
  }

  createTreeNode(key, value, isRoot = false) {
    const node = document.createElement('div');
    node.className = `json-tree-node ${isRoot ? 'root' : ''}`;

    const valueType = this.getType(value);

    if (valueType === 'object' || valueType === 'array') {
      const isArray = valueType === 'array';
      const count = isArray ? value.length : Object.keys(value).length;

      const header = document.createElement('div');
      header.className = 'json-tree-header';

      header.innerHTML = `
        <span class="json-tree-toggle">▼</span>
        ${!isRoot && key !== null ? `<span class="json-tree-key">${this.escapeHtml(key)}</span><span class="json-colon">:</span>` : ''}
        <span class="json-tree-type">${isArray ? `Array[${count}]` : `Object{${count}}`}</span>
        ${!this.readOnly && !isRoot ? `<button class="json-btn-delete" title="Delete key">×</button>` : ''}
        ${!this.readOnly ? `<button class="json-btn-add" title="Add item">+ Add</button>` : ''}
      `;

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'json-tree-children';

      // Toggle Collapse
      const toggleBtn = header.querySelector('.json-tree-toggle');
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = childrenContainer.style.display === 'none';
        childrenContainer.style.display = isCollapsed ? 'block' : 'none';
        toggleBtn.textContent = isCollapsed ? '▼' : '▶';
      });

      // Delete Object/Array Node
      const deleteBtn = header.querySelector('.json-btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          node.remove();
          this.syncFromTreeDOM();
        });
      }

      // Add Property / Item
      const addBtn = header.querySelector('.json-btn-add');
      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isArray) {
            value.push("new_item");
          } else {
            let newKey = "newKey";
            let c = 1;
            while (value.hasOwnProperty(newKey)) {
              newKey = `newKey_${c++}`;
            }
            value[newKey] = "value";
          }
          this.syncFromTreeData();
        });
      }

      // Render Children
      if (isArray) {
        value.forEach((item, idx) => {
          childrenContainer.appendChild(this.createTreeNode(idx, item));
        });
      } else {
        Object.keys(value).forEach(k => {
          childrenContainer.appendChild(this.createTreeNode(k, value[k]));
        });
      }

      node.appendChild(header);
      node.appendChild(childrenContainer);
    } else {
      // Leaf Node (Primitive value: string, number, boolean, null)
      const leaf = document.createElement('div');
      leaf.className = 'json-tree-leaf';

      const keySpan = document.createElement('span');
      keySpan.className = 'json-tree-key';
      if (key !== null) {
        if (!this.readOnly) {
          keySpan.innerHTML = `<input type="text" class="json-key-input" value="${this.escapeHtml(key)}">`;
          const keyInput = keySpan.querySelector('input');
          keyInput.addEventListener('change', () => this.syncFromTreeDOM());
        } else {
          keySpan.textContent = key;
        }
      }

      const colonSpan = document.createElement('span');
      colonSpan.className = 'json-colon';
      colonSpan.textContent = ':';

      const valContainer = document.createElement('div');
      valContainer.className = 'json-val-container';
      valContainer.appendChild(this.renderPrimitiveInput(value, () => this.syncFromTreeDOM()));

      leaf.appendChild(keySpan);
      if (key !== null) leaf.appendChild(colonSpan);
      leaf.appendChild(valContainer);

      if (!this.readOnly) {
        const delBtn = document.createElement('button');
        delBtn.className = 'json-btn-delete';
        delBtn.textContent = '×';
        delBtn.title = 'Delete item';
        delBtn.addEventListener('click', () => {
          leaf.remove();
          this.syncFromTreeDOM();
        });
        leaf.appendChild(delBtn);
      }

      node.appendChild(leaf);
    }

    return node;
  }

  renderPrimitiveInput(val, onUpdate) {
    const wrapper = document.createElement('div');
    wrapper.className = 'json-primitive-wrapper';

    const type = this.getType(val);
    const input = document.createElement('input');
    input.className = `json-val-input type-${type}`;

    if (type === 'boolean') {
      const select = document.createElement('select');
      select.className = 'json-val-select type-boolean';
      select.innerHTML = `
        <option value="true" ${val === true ? 'selected' : ''}>true</option>
        <option value="false" ${val === false ? 'selected' : ''}>false</option>
      `;
      select.addEventListener('change', () => onUpdate());
      if (this.readOnly) select.disabled = true;
      wrapper.appendChild(select);
      return wrapper;
    }

    if (type === 'null') {
      input.value = 'null';
      input.disabled = true;
    } else {
      input.value = val !== undefined ? String(val) : '';
    }

    if (this.readOnly) input.readOnly = true;

    input.addEventListener('change', () => onUpdate());
    wrapper.appendChild(input);
    return wrapper;
  }

  syncFromTreeDOM() {
    const treeView = this.container.querySelector('#jsonViewTree');
    const rootNode = treeView.querySelector('.json-tree-node.root');
    if (!rootNode) return;

    this.parsedData = this.buildDataFromDOMNode(rootNode);
    this.value = JSON.stringify(this.parsedData, null, 2);
    this.parseCurrentValue();

    const codeInput = this.container.querySelector('#jsonCodeInput');
    if (codeInput) codeInput.value = this.value;

    this.updateStatusAndErrors();
    this.onChange(this.value, this.isValidJson);
  }

  buildDataFromDOMNode(node) {
    const header = node.querySelector(':scope > .json-tree-header');
    const childrenContainer = node.querySelector(':scope > .json-tree-children');

    if (header && childrenContainer) {
      const typeText = header.querySelector('.json-tree-type').textContent;
      const isArray = typeText.startsWith('Array');
      const childNodes = childrenContainer.querySelectorAll(':scope > .json-tree-node, :scope > .json-tree-leaf');

      if (isArray) {
        const arr = [];
        childNodes.forEach(child => {
          if (child.classList.contains('json-tree-node')) {
            arr.push(this.buildDataFromDOMNode(child));
          } else {
            arr.push(this.getLeafValue(child));
          }
        });
        return arr;
      } else {
        const obj = {};
        childNodes.forEach(child => {
          let key = '';
          if (child.classList.contains('json-tree-node')) {
            const keyEl = child.querySelector(':scope > .json-tree-header > .json-tree-key');
            key = keyEl ? keyEl.textContent : '';
            if (key) obj[key] = this.buildDataFromDOMNode(child);
          } else {
            const keyInput = child.querySelector('.json-key-input');
            key = keyInput ? keyInput.value.trim() : (child.querySelector('.json-tree-key')?.textContent || '');
            if (key) obj[key] = this.getLeafValue(child);
          }
        });
        return obj;
      }
    }

    const leaf = node.querySelector(':scope > .json-tree-leaf');
    if (leaf) return this.getLeafValue(leaf);

    return null;
  }

  getLeafValue(leafEl) {
    const select = leafEl.querySelector('select');
    if (select) {
      return select.value === 'true';
    }

    const input = leafEl.querySelector('.json-val-input');
    if (!input) return null;

    const valStr = input.value.trim();
    if (input.classList.contains('type-null') || valStr === 'null') return null;
    if (!isNaN(valStr) && valStr !== '') return Number(valStr);

    return valStr;
  }

  syncFromTreeData() {
    this.value = JSON.stringify(this.parsedData, null, 2);
    this.parseCurrentValue();
    this.updateView();
    this.onChange(this.value, this.isValidJson);
  }

  getType(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/"/g, "&quot;");
  }
}
