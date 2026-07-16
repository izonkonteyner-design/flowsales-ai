import type { MetadataRoute } from "next";

const routes = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
  "/leads",
  "/customers",
  "/products",
  "/quotes",
  "/tasks",
  "/calendar",
  "/notifications",
  "/ai",
  "/reports",
  "/billing",
  "/team",
  "/permissions",
  "/audit-logs",
  "/api-layer",
  "/settings",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://flowsales.ai";

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
