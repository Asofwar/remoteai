window.__installPreviewXhr = () => {
  class PreviewXhr extends EventTarget {
    static UNSENT = 0; static OPENED = 1; static HEADERS_RECEIVED = 2; static LOADING = 3; static DONE = 4;
    UNSENT = 0; OPENED = 1; HEADERS_RECEIVED = 2; LOADING = 3; DONE = 4;
    readyState = 0; status = 0; statusText = ''; response = null; responseText = ''; responseType = '';
    responseURL = ''; timeout = 0; withCredentials = false; upload = new EventTarget();
    onreadystatechange = null; onload = null; onerror = null; onabort = null; onloadend = null;
    headers = new Headers(); responseHeaders = new Headers(); cancelled = false;
    open(method, url, asynchronous = true) {
      if (!asynchronous) throw new Error('Synchronous requests are unavailable in preview');
      this.method = method; this.url = url; this.readyState = 1; this.emit('readystatechange');
    }
    setRequestHeader(name, value) { this.headers.append(name, value); }
    getResponseHeader(name) { return this.responseHeaders.get(name); }
    getAllResponseHeaders() { return [...this.responseHeaders].map(([key, value]) => `${key}: ${value}\r\n`).join(''); }
    overrideMimeType() {}
    abort() { this.cancelled = true; this.readyState = 0; this.emit('abort'); this.emit('loadend'); }
    emit(type) { const event = new Event(type); this.dispatchEvent(event); this['on' + type]?.(event); }
    async send(body) {
      try {
        const response = await fetch(this.url, { method: this.method, headers: this.headers, body });
        if (this.cancelled) return;
        this.status = response.status; this.statusText = response.statusText; this.responseURL = response.url;
        this.responseHeaders = response.headers; this.readyState = 2; this.emit('readystatechange');
        if (this.responseType === 'arraybuffer') this.response = await response.arrayBuffer();
        else if (this.responseType === 'blob') this.response = await response.blob();
        else {
          this.responseText = await response.text();
          this.response = this.responseType === 'json' ? JSON.parse(this.responseText) : this.responseText;
        }
        this.readyState = 4; this.emit('readystatechange'); this.emit('load');
      } catch { this.readyState = 4; this.emit('readystatechange'); this.emit('error'); }
      finally { this.emit('loadend'); }
    }
  }
  window.XMLHttpRequest = PreviewXhr;
};
