// Keep confirmation links on the professional portal, including legacy root redirects.
(function () {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const callback = hash.has("access_token") || hash.has("error") || query.has("token_hash") || query.has("code") || query.has("error");
  if (callback && !/\/barbeiros(?:\.html)?\/?$/.test(window.location.pathname)) {
    const target = new URL("barbeiros.html", window.location.href);
    target.search = window.location.search;
    target.hash = window.location.hash;
    window.location.replace(target.href);
  }
}());
