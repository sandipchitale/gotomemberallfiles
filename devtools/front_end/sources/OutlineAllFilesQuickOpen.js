// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Sources.OutlineAllFilesQuickOpen = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();
    this._items = [];
    this._active = false;
    this.cache = new WeakMap();
  }

  /**
   * @override
   */
  attach() {
    this._items = [];
    this._active = false;

    const uiSourceCode = this._currentUISourceCode();
    if (uiSourceCode) {
      const canonicalMimeType = uiSourceCode.contentType().canonicalMimeType();
      const uiSourceCodes = Workspace.workspace.uiSourceCodes().slice().filter(uiSourceCode => {
        return canonicalMimeType === uiSourceCode.contentType().canonicalMimeType() && !(/^VM[0-9]+.*/.test(uiSourceCode.name()));
      });
      this._processUiSourceCodes(uiSourceCodes);
    }
  }

  _processUiSourceCodes(uiSourceCodes) {
    const uiSourceCode = uiSourceCodes.pop();
    if (uiSourceCode) {
      const itemsOfUiSourceCode = this.cache.get(uiSourceCode);
      if (itemsOfUiSourceCode) {
        this._items.push(...itemsOfUiSourceCode);
        this._processUiSourceCodes(uiSourceCodes);
      } else {
        function postMessage() {
          this._active = Formatter.formatterWorkerPool().outlineForMimetype(
              uiSourceCode.workingCopy(), uiSourceCode.contentType().canonicalMimeType(),
              this._didBuildOutlineChunk.bind(this, uiSourceCode, uiSourceCodes));
        }
        uiSourceCode.requestContent().then(postMessage.bind(this));
      }
    } else {
      this.refresh();
    }
  }

  /**
   * @param {boolean} isLastChunk
   * @param {!Array<!Formatter.FormatterWorkerPool.OutlineItem>} items
   */
  _didBuildOutlineChunk(uiSourceCode, uiSourceCodes, isLastChunk, items) {
    let file = uiSourceCode.url();
    try {
      file = new URL(file).pathname;
    } catch (e) {
      // bummer
    }
    items.forEach(item => {
      item.file = file;
      item.uiSourceCode = uiSourceCode;
    });
    this._items.push(...items);

    const itemsOfUiSourceCode = this.cache.get(uiSourceCode);
    if (itemsOfUiSourceCode) {
      // add to cached array
      itemsOfUiSourceCode.push(...items);
    } else {
      this.cache.set(uiSourceCode, items);
    }
    if (isLastChunk) {
      // this.refresh();
      this._processUiSourceCodes(uiSourceCodes);
    }
  }

  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._items.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    const item = this._items[itemIndex];
    return item.title + (item.subtitle ? item.subtitle : '');
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    const item = this._items[itemIndex];
    const methodName = query.split('(')[0];
    if (methodName.toLowerCase() === item.title.toLowerCase())
      return 1 / (1 + item.line);
    return -item.line - 1;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    const item = this._items[itemIndex];
    titleElement.textContent = item.title + (item.subtitle ? item.subtitle : '');
    QuickOpen.FilteredListWidget.highlightRanges(titleElement, query);
    subtitleElement.textContent = ':' + item.file + ':' + (item.line + 1);
  }

  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    if (itemIndex === null)
      return;
    const uiSourceCode = this._items[itemIndex].uiSourceCode;
    if (!uiSourceCode)
      return;
    const lineNumber = this._items[itemIndex].line;
    if (!isNaN(lineNumber) && lineNumber >= 0) {
      let uiLocation = new Workspace.UILocation(uiSourceCode, lineNumber, 0);
      const normalizedLocation = Bindings.breakpointManager._debuggerWorkspaceBinding.normalizeUILocation(uiLocation);
      if (normalizedLocation.id() !== uiLocation.id()) {
        Common.Revealer.reveal(normalizedLocation);
      } else {
        Common.Revealer.reveal(uiSourceCode.uiLocation(lineNumber, this._items[itemIndex].column));
      }
    }
  }

  /**
   * @return {?Workspace.UISourceCode}
   */
  _currentUISourceCode() {
    const sourcesView = UI.context.flavor(Sources.SourcesView);
    if (!sourcesView)
      return null;
    return sourcesView.currentUISourceCode();
  }

  /**
   * @override
   * @return {string}
   */
  notFoundText() {
    if (!this._currentUISourceCode())
      return Common.UIString('No file selected.');
    if (!this._active)
      return Common.UIString('Open a JavaScript or CSS file to see symbols');
    return Common.UIString('No results found');
  }
};
