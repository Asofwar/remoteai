export const PREVIEW_NETWORK_BUSY = 'codex-port-preview:busy';
export const PREVIEW_NETWORK_IDLE = 'codex-port-preview:idle';

// Navigation events cover document resources; this also observes requests made after the page loads.
// Install at both document start and end because early injection can be skipped by Android WebView.
export const PREVIEW_NETWORK_SCRIPT = `
(function () {
  if (window.__codexPortPreviewActivity) return;
  window.__codexPortPreviewActivity = true;
  var pending = 0;
  function report(active) {
    try {
      window.ReactNativeWebView.postMessage(active ? '${PREVIEW_NETWORK_BUSY}' : '${PREVIEW_NETWORK_IDLE}');
    } catch (_) { /* Activity reporting must never interrupt the website's requests. */ }
  }
  function begin() {
    if (++pending === 1) report(true);
    var finished = false;
    return function () {
      if (finished) return;
      finished = true;
      if (--pending === 0) report(false);
    };
  }
  var fetch = window.fetch;
  if (typeof fetch === 'function') window.fetch = function () {
    var finish = begin();
    try {
      return fetch.apply(this, arguments).then(function (response) {
        finish();
        return response;
      }, function (error) {
        finish();
        throw error;
      });
    } catch (error) { finish(); throw error; }
  };
  if (!window.XMLHttpRequest) return;
  var send = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.send = function () {
    var request = this;
    var finish = begin();
    function end() {
      request.removeEventListener('loadend', end);
      finish();
    }
    request.addEventListener('loadend', end);
    try { return send.apply(request, arguments); }
    catch (error) { end(); throw error; }
  };
})();
true;
`;
