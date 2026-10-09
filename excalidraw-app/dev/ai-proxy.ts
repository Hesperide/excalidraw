import type { ProxyOptions } from "vite";

/** Browser requests stay on the preview's origin, never the viewer's localhost. */
export const devAIProxy: ProxyOptions = {
  target: "http://127.0.0.1:3016",
  rewrite: (path) => path.replace(/^\/api\/ai/, ""),
  bypass: (request) => {
    const origin = request.headers.origin;
    if (
      origin &&
      origin !== `http://${request.headers.host}` &&
      origin !== `https://${request.headers.host}`
    ) {
      return false;
    }
    // Only after checking the browser's actual origin, identify this local proxy
    // to the loopback service. This also works on dynamically named preview URLs.
    if (origin) {
      request.headers.origin = "http://localhost:3000";
    }
  },
};
