// Мост обновления для интерфейса: тот же window.wkUpdater, что в настольной
// программе (desktop/preload.js), но поверх Android-объекта WKNative.
(function () {
  var S = { status: "idle", current: "__CUR__", info: null, progress: 0, error: "",
            latest: "", reached: false, checkedAt: 0, via: "" };
  var subs = [];
  var waiting = [];
  window.__wkPush = function (s) {
    S = s; subs.slice().forEach(function (f) { try { f(s); } catch (e) {} });
    waiting.splice(0).forEach(function (r) { r(s); });
  };
  window.wkUpdater = {
    state: function () { return Promise.resolve(S); },
    // Как и в настольной программе, ответ — когда проверка закончилась (а не
    // «запущена»): ждём следующего состояния от Android. До минуты: своя сеть,
    // потом Диск, потом перебор соседей — честный ответ лучше быстрого.
    check: function () {
      return new Promise(function (res) {
        waiting.push(res); setTimeout(function () { res(S); }, 60000); WKNative.check();
      });
    },
    install: function () { WKNative.install(); return Promise.resolve(S); },
    onState: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  };
})();
