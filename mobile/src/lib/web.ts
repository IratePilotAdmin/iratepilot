import * as WebBrowser from "expo-web-browser";

const appUrl = (process.env.EXPO_PUBLIC_APP_URL || "https://www.iratepilot.com").replace(/\/$/, "");

export function buildWebUrl(path: string) {
  return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function openWebPath(path: string) {
  await WebBrowser.openBrowserAsync(buildWebUrl(path), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
