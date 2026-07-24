const ORIGIN = "https://shuzhi-project-monitor.rslywhj.chatgpt.site";

const worker = {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const originUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN);
    const upstreamHeaders = new Headers(request.headers);

    if (upstreamHeaders.get("origin") === incomingUrl.origin) {
      upstreamHeaders.set("origin", ORIGIN);
    }

    const referer = upstreamHeaders.get("referer");
    if (referer?.startsWith(incomingUrl.origin)) {
      upstreamHeaders.set("referer", referer.replace(incomingUrl.origin, ORIGIN));
    }

    const upstreamRequest = new Request(originUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    const upstreamResponse = await fetch(upstreamRequest);
    const headers = new Headers(upstreamResponse.headers);

    const location = headers.get("location");
    if (location?.startsWith(ORIGIN)) {
      headers.set("location", location.replace(ORIGIN, incomingUrl.origin));
    }

    const getSetCookie = upstreamResponse.headers.getSetCookie?.bind(
      upstreamResponse.headers,
    );
    const setCookies = getSetCookie ? getSetCookie() : [];
    if (setCookies.length > 0) {
      headers.delete("set-cookie");
      for (const cookie of setCookies) {
        headers.append(
          "set-cookie",
          cookie.replace(/Domain=chatgpt\.site/gi, `Domain=${incomingUrl.hostname}`),
        );
      }
    } else {
      const setCookie = headers.get("set-cookie");
      if (setCookie) {
        headers.set(
          "set-cookie",
          setCookie.replace(/Domain=chatgpt\.site/gi, `Domain=${incomingUrl.hostname}`),
        );
      }
    }

    headers.set("x-shuzhi-proxy", "cloudflare-worker");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};

export default worker;
