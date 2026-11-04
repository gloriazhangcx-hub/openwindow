const LUMA_EVENT_HOSTS = new Set(["luma.com", "lu.ma"]);

export function isValidLumaEventUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathSegments = url.pathname.split("/").filter(Boolean);

    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      LUMA_EVENT_HOSTS.has(hostname) &&
      pathSegments.length === 1 &&
      /^[a-z0-9-]+$/i.test(pathSegments[0]);
  } catch {
    return false;
  }
}
