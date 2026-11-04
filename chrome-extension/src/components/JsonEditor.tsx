import React, { useState, useCallback, useRef, useEffect } from 'react';
import './JsonEditor.css';

export interface JsonEditorProps {
  initialValue?: string;
  onChange?: (value: string, isValid: boolean) => void;
  readOnly?: boolean;
}

export interface ParsedJsonStringWrapper {
  __isJsonString: true;
  data: any;
}

export function isJsonStringWrapper(val: any): val is ParsedJsonStringWrapper {
  return val !== null && typeof val === 'object' && val.__isJsonString === true;
}

export function tryParseJsonString(val: any): { isJson: boolean; parsed: any } {
  if (typeof val !== 'string') return { isJson: false, parsed: null };
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        return { isJson: true, parsed };
      }
    } catch {
      // Not valid JSON
    }
  }
  return { isJson: false, parsed: null };
}

export function wrapRecursiveJson(data: any): any {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'string') {
        const check = tryParseJsonString(item);
        if (check.isJson) {
          return {
            __isJsonString: true,
            data: wrapRecursiveJson(check.parsed),
          };
        }
      }
      return wrapRecursiveJson(item);
    });
  }

  if (typeof data === 'object') {
    if (data.__isJsonString) {
      return {
        __isJsonString: true,
        data: wrapRecursiveJson(data.data),
      };
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'string') {
        const check = tryParseJsonString(val);
        if (check.isJson) {
          result[key] = {
            __isJsonString: true,
            data: wrapRecursiveJson(check.parsed),
          };
          continue;
        }
      }
      result[key] = wrapRecursiveJson(val);
    }
    return result;
  }

  if (typeof data === 'string') {
    const check = tryParseJsonString(data);
    if (check.isJson) {
      return {
        __isJsonString: true,
        data: wrapRecursiveJson(check.parsed),
      };
    }
  }

  return data;
}

export function unwrapRecursiveJson(data: any): any {
  if (data === null || data === undefined) return data;

  if (isJsonStringWrapper(data)) {
    const unwrappedChild = unwrapRecursiveJson(data.data);
    return JSON.stringify(unwrappedChild);
  }

  if (Array.isArray(data)) {
    return data.map(item => unwrapRecursiveJson(item));
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      result[key] = unwrapRecursiveJson(val);
    }
    return result;
  }

  return data;
}

export function countEmbeddedJson(data: any): number {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  if (isJsonStringWrapper(data)) {
    count += 1;
    count += countEmbeddedJson(data.data);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      count += countEmbeddedJson(item);
    }
  } else {
    for (const val of Object.values(data)) {
      count += countEmbeddedJson(val);
    }
  }
  return count;
}

interface ParseResult {
  parsedData: any;
  isValidJson: boolean;
  errorMessage: string;
  embeddedCount: number;
}

function parseJson(str: string): ParseResult {
  if (!str || !str.trim()) {
    return { parsedData: null, isValidJson: true, errorMessage: '', embeddedCount: 0 };
  }
  try {
    const raw = JSON.parse(str);
    const parsedData = wrapRecursiveJson(raw);
    const embeddedCount = countEmbeddedJson(parsedData);
    return { parsedData, isValidJson: true, errorMessage: '', embeddedCount };
  } catch (err: any) {
    return { parsedData: null, isValidJson: false, errorMessage: err.message, embeddedCount: 0 };
  }
}

export default function JsonEditor({ initialValue = '', onChange, readOnly = false }: JsonEditorProps) {
  const [mode, setMode] = useState<'code' | 'tree'>('code');
  const [value, setValue] = useState(initialValue);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  const parseResult = parseJson(value);
  const { parsedData, isValidJson, errorMessage, embeddedCount } = parseResult;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const updateValue = useCallback((newValue: string) => {
    setValue(newValue);
    const result = parseJson(newValue);
    if (onChangeRef.current) {
      onChangeRef.current(newValue, result.isValidJson);
    }
  }, []);

  const handleSetMode = useCallback((targetMode: 'code' | 'tree') => {
    if (targetMode === 'tree' && !isValidJson) {
      showToast('Cannot switch to Tree View: Invalid JSON payload');
      return;
    }
    setMode(targetMode);
  }, [isValidJson]);

  const handleFormat = useCallback(() => {
    if (!isValidJson || parsedData === null) return;
    const unwrapped = unwrapRecursiveJson(parsedData);
    updateValue(JSON.stringify(unwrapped, null, 2));
  }, [isValidJson, parsedData, updateValue]);

  const handleMinify = useCallback(() => {
    if (!isValidJson || parsedData === null) return;
    const unwrapped = unwrapRecursiveJson(parsedData);
    updateValue(JSON.stringify(unwrapped));
  }, [isValidJson, parsedData, updateValue]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Copied payload to clipboard!');
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }, [value]);

  function showToast(msg: string) {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateValue(e.target.value);
  }, [updateValue]);

  const handleTreeChange = useCallback((newData: any) => {
    const unwrapped = unwrapRecursiveJson(newData);
    const newValue = JSON.stringify(unwrapped, null, 2);
    updateValue(newValue);
  }, [updateValue]);

  let statusDotClass = 'json-status-dot valid';
  let statusText = 'Valid JSON';
  if (!value.trim()) {
    statusDotClass = 'json-status-dot empty';
    statusText = 'Empty Payload';
  } else if (!isValidJson) {
    statusDotClass = 'json-status-dot invalid';
    statusText = 'Invalid JSON';
  } else if (embeddedCount > 0) {
    statusText = `Valid JSON (${embeddedCount} nested JSON string${embeddedCount > 1 ? 's' : ''} parsed)`;
  }

  return (
    <div className="json-editor-wrapper">
      <div className="json-editor-toolbar">
        <div className="json-editor-modes">
          <button
            className={`json-btn json-btn-tab ${mode === 'code' ? 'active' : ''}`}
            onClick={() => handleSetMode('code')}
          >
            Code Editor
          </button>
          <button
            className={`json-btn json-btn-tab ${mode === 'tree' ? 'active' : ''}`}
            onClick={() => handleSetMode('tree')}
          >
            Tree View
          </button>
        </div>

        <div className="json-editor-actions">
          <button
            className="json-btn json-btn-action"
            onClick={handleFormat}
            disabled={readOnly}
            title="Prettify / Format JSON"
          >
            ✨ Format
          </button>
          <button
            className="json-btn json-btn-action"
            onClick={handleMinify}
            disabled={readOnly}
            title="Minify JSON"
          >
            ⚡ Minify
          </button>
          <button
            className="json-btn json-btn-action"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            📋 Copy
          </button>
        </div>

        <div className="json-status-indicator">
          <span className={statusDotClass}></span> {statusText}
        </div>
      </div>

      {toastMessage ? (
        <div className="json-error-banner toast">{toastMessage}</div>
      ) : (!isValidJson && value.trim()) ? (
        <div className="json-error-banner">Syntax Error: {errorMessage}</div>
      ) : null}

      <div className="json-editor-body">
        {mode === 'code' ? (
          <div className="json-view-code">
            <textarea
              className="json-code-input"
              spellCheck="false"
              placeholder="Enter payload JSON..."
              value={value}
              onChange={handleCodeChange}
              readOnly={readOnly}
            />
          </div>
        ) : (
          <div className="json-view-tree">
            {parsedData !== null && typeof parsedData === 'object' ? (
              <TreeNode
                nodeKey={null}
                value={parsedData}
                isRoot={true}
                readOnly={readOnly}
                onUpdate={handleTreeChange}
              />
            ) : (
              <div className="json-tree-primitive">
                <span className="json-tree-label">Primitive Root:</span>
                <PrimitiveInput
                  value={parsedData}
                  readOnly={readOnly}
                  onChange={(val) => handleTreeChange(val)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  nodeKey: string | number | null;
  value: any;
  isRoot: boolean;
  readOnly: boolean;
  onUpdate: (newValue: any) => void;
  onKeyChange?: (newKey: string) => void;
  onDelete?: () => void;
}

function TreeNode({ nodeKey, value, isRoot, readOnly, onUpdate, onKeyChange, onDelete }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);

  const isWrapped = isJsonStringWrapper(value);
  const targetData = isWrapped ? value.data : value;
  const isArray = Array.isArray(targetData);

  const handleToggleRaw = useCallback(() => {
    if (!isRawMode) {
      const unwrapped = unwrapRecursiveJson(targetData);
      setRawText(JSON.stringify(unwrapped, null, 2));
      setRawError(null);
      setIsRawMode(true);
    } else {
      setIsRawMode(false);
    }
  }, [isRawMode, targetData]);

  const handleApplyRawText = useCallback(() => {
    try {
      const parsed = JSON.parse(rawText);
      const wrapped = wrapRecursiveJson(parsed);
      if (isWrapped) {
        onUpdate({ ...value, data: wrapped });
      } else {
        onUpdate(wrapped);
      }
      setIsRawMode(false);
      setRawError(null);
    } catch (err: any) {
      setRawError(err.message || 'Invalid JSON syntax');
    }
  }, [rawText, isWrapped, value, onUpdate]);

  if (!isWrapped && typeof targetData !== 'object') {
    return (
      <TreeLeaf
        nodeKey={nodeKey}
        value={value}
        readOnly={readOnly}
        onValueChange={(newVal) => onUpdate(newVal)}
        onKeyChange={onKeyChange}
        onDelete={onDelete}
      />
    );
  }

  const entries: [string | number, any][] = isArray
    ? (targetData as any[]).map((v, i) => [i, v])
    : Object.entries(targetData || {});
  const count = entries.length;

  const handleChildUpdate = (childKey: string | number, newChildValue: any) => {
    let newTarget: any;
    if (isArray) {
      newTarget = [...targetData];
      newTarget[childKey as number] = newChildValue;
    } else {
      newTarget = { ...targetData, [childKey]: newChildValue };
    }
    if (isWrapped) {
      onUpdate({ ...value, data: newTarget });
    } else {
      onUpdate(newTarget);
    }
  };

  const handleChildDelete = (childKey: string | number) => {
    let newTarget: any;
    if (isArray) {
      newTarget = (targetData as any[]).filter((_, i) => i !== childKey);
    } else {
      newTarget = { ...targetData };
      delete newTarget[childKey];
    }
    if (isWrapped) {
      onUpdate({ ...value, data: newTarget });
    } else {
      onUpdate(newTarget);
    }
  };

  const handleChildKeyChange = (oldKey: string | number, newKey: string) => {
    if (isArray || oldKey === newKey || !newKey) return;
    const newTarget: Record<string, any> = {};
    for (const [k, v] of Object.entries(targetData)) {
      if (k === oldKey) {
        newTarget[newKey] = v;
      } else {
        newTarget[k] = v;
      }
    }
    if (isWrapped) {
      onUpdate({ ...value, data: newTarget });
    } else {
      onUpdate(newTarget);
    }
  };

  const handleAdd = () => {
    let newTarget: any;
    if (isArray) {
      newTarget = [...targetData, 'new_item'];
    } else {
      newTarget = { ...targetData };
      let newKey = 'newKey';
      let c = 1;
      while (Object.prototype.hasOwnProperty.call(newTarget, newKey)) {
        newKey = `newKey_${c++}`;
      }
      newTarget[newKey] = 'value';
    }
    if (isWrapped) {
      onUpdate({ ...value, data: newTarget });
    } else {
      onUpdate(newTarget);
    }
  };

  const handleAddJson = () => {
    const newJsonNode: ParsedJsonStringWrapper = {
      __isJsonString: true,
      data: { status: 'active' },
    };
    let newTarget: any;
    if (isArray) {
      newTarget = [...targetData, newJsonNode];
    } else {
      newTarget = { ...targetData };
      let newKey = 'payload';
      let c = 1;
      while (Object.prototype.hasOwnProperty.call(newTarget, newKey)) {
        newKey = `payload_${c++}`;
      }
      newTarget[newKey] = newJsonNode;
    }
    if (isWrapped) {
      onUpdate({ ...value, data: newTarget });
    } else {
      onUpdate(newTarget);
    }
  };

  return (
    <div className={`json-tree-node ${isRoot ? 'root' : ''} ${isWrapped ? 'embedded-node' : ''}`}>
      <div className="json-tree-header">
        <span
          className="json-tree-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </span>

        {!isRoot && nodeKey !== null && (
          <>
            <span className="json-tree-key">
              {!readOnly && onKeyChange ? (
                <input
                  type="text"
                  className="json-key-input"
                  defaultValue={String(nodeKey)}
                  onBlur={(e) => {
                    const k = e.target.value.trim();
                    if (k && k !== String(nodeKey)) {
                      onKeyChange(k);
                    }
                  }}
                />
              ) : (
                String(nodeKey)
              )}
            </span>
            <span className="json-colon">:</span>
          </>
        )}

        {isWrapped && (
          <span
            className="json-badge-embedded"
            title="Embedded JSON string — parsed recursively for editing"
          >
            {'{JSON String}'}
          </span>
        )}

        <span className="json-tree-type">
          {isArray ? `Array[${count}]` : `Object{${count}}`}
        </span>

        {isWrapped && (
          <button
            className="json-btn-pill"
            title="Toggle between parsed tree structure and raw escaped string"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleRaw();
            }}
          >
            {isRawMode ? '🌳 Tree' : '📝 Raw'}
          </button>
        )}

        {!readOnly && !isRoot && onDelete && (
          <button
            className="json-btn-delete"
            title="Delete this property"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
        )}

        {!readOnly && !isRawMode && (
          <>
            <button
              className="json-btn-add"
              title="Add a field or item"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
            >
              + Add
            </button>
            <button
              className="json-btn-add-json"
              title="Add a nested JSON message (embedded JSON string)"
              onClick={(e) => {
                e.stopPropagation();
                handleAddJson();
              }}
            >
              + Add JSON
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        isRawMode ? (
          <div className="json-tree-raw-editor">
            <textarea
              className="json-raw-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              spellCheck={false}
              placeholder="Enter valid JSON string..."
            />
            <div className="json-raw-actions">
              <button
                className="json-btn json-btn-action"
                onClick={handleApplyRawText}
                title="Apply changes to Tree view"
              >
                ✓ Apply to Tree
              </button>
              <button
                className="json-btn"
                onClick={() => setIsRawMode(false)}
              >
                Cancel
              </button>
              {rawError && (
                <span className="json-raw-error">{rawError}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="json-tree-children">
            {entries.map(([key, childValue]) => {
              if (isJsonStringWrapper(childValue)) {
                return (
                  <TreeNode
                    key={isArray ? key : String(key)}
                    nodeKey={key}
                    value={childValue}
                    isRoot={false}
                    readOnly={readOnly}
                    onUpdate={(newChild) => handleChildUpdate(key, newChild)}
                    onKeyChange={(newKey) => handleChildKeyChange(key, newKey)}
                    onDelete={() => handleChildDelete(key)}
                  />
                );
              }
              const childType = getType(childValue);
              if (childType === 'object' || childType === 'array') {
                return (
                  <TreeNode
                    key={isArray ? key : String(key)}
                    nodeKey={key}
                    value={childValue}
                    isRoot={false}
                    readOnly={readOnly}
                    onUpdate={(newChild) => handleChildUpdate(key, newChild)}
                    onKeyChange={(newKey) => handleChildKeyChange(key, newKey)}
                    onDelete={() => handleChildDelete(key)}
                  />
                );
              }
              return (
                <TreeLeaf
                  key={isArray ? key : String(key)}
                  nodeKey={key}
                  value={childValue}
                  readOnly={readOnly}
                  onValueChange={(newVal) => handleChildUpdate(key, newVal)}
                  onKeyChange={(newKey) => handleChildKeyChange(key, newKey)}
                  onDelete={() => handleChildDelete(key)}
                />
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

interface TreeLeafProps {
  nodeKey: string | number | null;
  value: any;
  readOnly: boolean;
  onValueChange: (newValue: any) => void;
  onKeyChange?: (newKey: string) => void;
  onDelete?: () => void;
}

function TreeLeaf({ nodeKey, value, readOnly, onValueChange, onKeyChange, onDelete }: TreeLeafProps) {
  const currentType = getType(value);
  const jsonCheck = typeof value === 'string' ? tryParseJsonString(value) : { isJson: false, parsed: null };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === 'string') {
      onValueChange(String(value ?? ''));
    } else if (selected === 'number') {
      onValueChange(0);
    } else if (selected === 'boolean') {
      onValueChange(true);
    } else if (selected === 'null') {
      onValueChange(null);
    } else if (selected === 'object') {
      onValueChange({ newKey: 'value' });
    } else if (selected === 'array') {
      onValueChange(['item']);
    } else if (selected === 'json_msg') {
      onValueChange({
        __isJsonString: true,
        data: { status: 'active' },
      });
    }
  };

  const handleParseAsJson = () => {
    if (jsonCheck.isJson) {
      onValueChange({
        __isJsonString: true,
        data: wrapRecursiveJson(jsonCheck.parsed),
      });
    }
  };

  return (
    <div className="json-tree-leaf">
      {nodeKey !== null && (
        <>
          <span className="json-tree-key">
            {!readOnly && onKeyChange ? (
              <input
                type="text"
                className="json-key-input"
                defaultValue={String(nodeKey)}
                onBlur={(e) => {
                  const newKey = e.target.value.trim();
                  if (newKey && newKey !== String(nodeKey) && onKeyChange) {
                    onKeyChange(newKey);
                  }
                }}
              />
            ) : (
              String(nodeKey)
            )}
          </span>
          <span className="json-colon">:</span>
        </>
      )}

      <div className="json-val-container">
        <PrimitiveInput
          value={value}
          readOnly={readOnly}
          onChange={onValueChange}
        />

        {!readOnly && (
          <select
            className="json-type-select"
            value={currentType}
            onChange={handleTypeChange}
            title="Convert value type"
          >
            <option value="string">str</option>
            <option value="number">num</option>
            <option value="boolean">bool</option>
            <option value="null">null</option>
            <option value="object">obj</option>
            <option value="array">arr</option>
            <option value="json_msg">json</option>
          </select>
        )}

        {jsonCheck.isJson && !readOnly && (
          <button
            className="json-btn-parse"
            title="This string contains valid JSON! Click to parse into structured tree view"
            onClick={handleParseAsJson}
          >
            ⚡ Parse JSON
          </button>
        )}
      </div>

      {!readOnly && onDelete && (
        <button
          className="json-btn-delete"
          title="Delete item"
          onClick={onDelete}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface PrimitiveInputProps {
  value: any;
  readOnly: boolean;
  onChange?: (newValue: any) => void;
}

function PrimitiveInput({ value, readOnly, onChange }: PrimitiveInputProps) {
  const type = getType(value);

  if (type === 'boolean') {
    return (
      <div className="json-primitive-wrapper">
        <select
          className="json-val-select type-boolean"
          defaultValue={String(value)}
          disabled={readOnly}
          onChange={(e) => {
            if (onChange) onChange(e.target.value === 'true');
          }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }

  if (type === 'null') {
    return (
      <div className="json-primitive-wrapper">
        <input
          className="json-val-input type-null"
          value="null"
          disabled
        />
      </div>
    );
  }

  return (
    <div className="json-primitive-wrapper">
      <input
        className={`json-val-input type-${type}`}
        defaultValue={value !== undefined ? String(value) : ''}
        readOnly={readOnly}
        onBlur={(e) => {
          if (!onChange) return;
          const valStr = e.target.value.trim();
          if (valStr === 'null') {
            onChange(null);
          } else if (!isNaN(Number(valStr)) && valStr !== '') {
            onChange(Number(valStr));
          } else {
            onChange(valStr);
          }
        }}
      />
    </div>
  );
}

function getType(val: any): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  if (isJsonStringWrapper(val)) return 'json_string';
  return typeof val;
}
