"use client";

import { useEffect, useState } from "react";
import { Check, Download, Share2, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function MobileInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncBrowserState = () => {
      const navigatorStandalone = Boolean((navigator as NavigatorWithStandalone).standalone);
      setIsInstalled(displayMode.matches || navigatorStandalone);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    };
    const animationFrame = window.requestAnimationFrame(syncBrowserState);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener("change", syncBrowserState);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener("change", syncBrowserState);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  }

  if (isInstalled) {
    return (
      <div className="border border-emerald-700 bg-emerald-950 p-6 text-white sm:p-8" role="status">
        <Check className="h-7 w-7" />
        <h2 className="mt-5 text-2xl font-semibold">iRatePilot is installed.</h2>
        <p className="mt-3 leading-7 text-emerald-100">Open it from your home screen for a focused, full-screen travel experience.</p>
      </div>
    );
  }

  return (
    <div className="border border-black bg-white p-6 sm:p-8">
      <Smartphone className="h-7 w-7" />
      <h2 className="mt-5 text-2xl font-semibold">Add iRatePilot to your phone</h2>
      <p className="mt-3 leading-7 text-neutral-600">No app store is required. Installation uses your browser and takes only a few seconds.</p>

      {installPrompt ? (
        <button type="button" onClick={install} className="btn-primary mt-7 w-full sm:w-auto">
          <Download className="h-4 w-4" /> Install iRatePilot
        </button>
      ) : (
        <div className="mt-7 border-t border-neutral-200 pt-6">
          <div className="flex gap-4">
            <Share2 className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <strong>{isIos ? "On iPhone or iPad" : "Install from your browser menu"}</strong>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {isIos
                  ? "In Safari, tap Share, then choose Add to Home Screen and confirm Add."
                  : "Open the browser menu and choose Install app or Add to Home screen. If the option is missing, refresh after the page finishes loading."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
