import { onRequest as __api_search_js_onRequest } from "E:\\Epheia\\dev\\apps\\AI-native-apps\\bsky\\packages\\pwa\\functions\\api\\search.js"

export const routes = [
    {
      routePath: "/api/search",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_search_js_onRequest],
    },
  ]