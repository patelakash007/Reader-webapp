'use strict';

class MockNode {
  constructor(nodeType, nodeValue = null, tagName = null) {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.tagName = tagName ? tagName.toUpperCase() : null;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this._classSet = new Set();
    this.classList = {
      add: (...values) => values.forEach(value => this._classSet.add(value)),
      remove: (...values) => values.forEach(value => this._classSet.delete(value)),
      contains: value => this._classSet.has(value),
      has: value => this._classSet.has(value),
      toggle: (value, force) => {
        if (force === true) {
          this._classSet.add(value);
          return true;
        }
        if (force === false) {
          this._classSet.delete(value);
          return false;
        }
        if (this._classSet.has(value)) {
          this._classSet.delete(value);
          return false;
        }
        this._classSet.add(value);
        return true;
      }
    };
  }

  get className() {
    return Array.from(this._classSet).join(' ');
  }

  set className(value) {
    this._classSet = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get parentElement() {
    if (this.nodeType === 1) return this;
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get previousSibling() {
    if (!this.parentNode || !Array.isArray(this.parentNode.childNodes)) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index > 0 ? this.parentNode.childNodes[index - 1] : null;
  }

  appendChild(child) {
    if (child.nodeType === 11) {
      const children = [...child.childNodes];
      children.forEach(item => {
        item.parentNode = this;
        this.childNodes.push(item);
      });
      child.childNodes = [];
      return child;
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChild(newChild, oldChild) {
    const index = this.childNodes.indexOf(oldChild);
    if (index === -1) return;
    oldChild.parentNode = null;
    if (newChild.nodeType === 11) {
      const children = [...newChild.childNodes];
      children.forEach(child => { child.parentNode = this; });
      this.childNodes.splice(index, 1, ...children);
      newChild.childNodes = [];
    } else {
      newChild.parentNode = this;
      this.childNodes.splice(index, 1, newChild);
    }
  }

  normalize() {
    for (let i = 0; i < this.childNodes.length; i += 1) {
      const child = this.childNodes[i];
      if (child.nodeType === 3) {
        if (!child.nodeValue) {
          child.parentNode = null;
          this.childNodes.splice(i, 1);
          i -= 1;
          continue;
        }
        while (i + 1 < this.childNodes.length && this.childNodes[i + 1].nodeType === 3) {
          child.nodeValue += this.childNodes[i + 1].nodeValue;
          this.childNodes[i + 1].parentNode = null;
          this.childNodes.splice(i + 1, 1);
        }
      } else if (child.nodeType === 1) {
        child.normalize();
      }
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  closest(selector) {
    const tags = selector.split(',').map(value => value.trim().toUpperCase());
    let current = this;
    while (current) {
      if (current.tagName && tags.includes(current.tagName.toUpperCase())) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const requiredClasses = String(selector || '')
      .split('.')
      .map(part => part.trim())
      .filter(Boolean);
    if (!requiredClasses.length) return [];
    const results = [];
    const visit = node => {
      if (node !== this && node.nodeType === 1) {
        if (requiredClasses.every(cls => node._classSet.has(cls))) {
          results.push(node);
        }
      }
      node.childNodes.forEach(visit);
    };
    visit(this);
    return results;
  }

  get textContent() {
    return this.nodeType === 3 ? (this.nodeValue || '') : this.childNodes.map(child => child.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    if (value !== undefined && value !== null && String(value) !== '') {
      const textNode = new MockNode(3, String(value));
      textNode.parentNode = this;
      this.childNodes.push(textNode);
    }
  }
}

class MockDocument {
  createTextNode(text) {
    return new MockNode(3, text);
  }

  createElement(tag) {
    return new MockNode(1, null, tag);
  }

  createDocumentFragment() {
    return new MockNode(11);
  }

  createTreeWalker(root, _showWhat, filter) {
    const nodes = [];
    const visit = node => {
      if (node.nodeType === 3) {
        const decision = filter && typeof filter.acceptNode === 'function' ? filter.acceptNode(node) : 1;
        if (decision === 1) nodes.push(node);
        return;
      }
      node.childNodes.forEach(visit);
    };
    visit(root);
    let index = -1;
    return {
      currentNode: null,
      nextNode() {
        index += 1;
        this.currentNode = nodes[index] || null;
        return Boolean(this.currentNode);
      }
    };
  }
}

module.exports = { MockDocument, MockNode };
