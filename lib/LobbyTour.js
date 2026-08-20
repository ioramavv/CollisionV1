"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

// Vier stappen: welkom (geen doelelement, gewoon gecentreerd), de
// snel-spelen-kaarten, specifiek de "Uitleg"-knop (dát is de belangrijkste
// stap — nieuwe spelers moeten weten waar ze de spelregels leren) en
// tot slot de account-avatar (die legt meteen uit hoe je deze rondleiding
// later nog eens terugvindt). De doel-selectors verwijzen naar
// data-tour-attributen die op de echte knoppen staan (zie
// app/(app)/lobby/page.js voor quickplay/tutorial-card, app/(app)/layout.js
// voor avatar) — DOM-selectors werken prima over componentgrenzen heen,
// dus het maakt niet uit dat de avatarknop in een ander bestand staat.
const STEPS = [
  { id: "welcome", target: null, titleKey: "lobby.tour.step.welcome.title", bodyKey: "lobby.tour.step.welcome.body" },
  { id: "quickplay", target: '[data-tour="quickplay"]', titleKey: "lobby.tour.step.quickplay.title", bodyKey: "lobby.tour.step.quickplay.body" },
  { id: "tutorial", target: '[data-tour="tutorial-card"]', titleKey: "lobby.tour.step.tutorial.title", bodyKey: "lobby.tour.step.tutorial.body" },
  { id: "avatar", target: '[data-tour="avatar"]', titleKey: "lobby.tour.step.avatar.title", bodyKey: "lobby.tour.step.avatar.body" },
];

// De avatarknop bestaat dubbel in de DOM (desktop-zijbalk én mobiele
// kopbalk — via CSS is er steeds maar één zichtbaar); pak de eerste met een
// echte afmeting i.p.v. blind het eerste treffer (die kan in dit thema/
// schermformaat net de onzichtbare zijn, met een lege bounding rect).
function findVisibleTarget(selector) {
  const els = document.querySelectorAll(selector);
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

const BUBBLE_WIDTH = 320;
const GAP = 14;
const SPOT_PAD = 10;

export default function LobbyTour({ open, onFinish }) {
  const t = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);

  const step = STEPS[stepIndex];

  const measureNow = useCallback(() => {
    if (!step?.target) return null;
    const el = findVisibleTarget(step.target);
    return el ? el.getBoundingClientRect() : null;
  }, [step]);

  // React's aanbevolen "tijdens het renderen bijstellen"-patroon (zelfde
  // idee als prevPathname in app/(app)/layout.js) i.p.v. setState meteen
  // synchroon in een effect aanroepen: terug naar stap 1 zodra de
  // rondleiding opnieuw opengaat.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setStepIndex(0);
  }

  // Zelfde patroon voor het opnieuw meten van het doelelement zodra de stap
  // (of open/dicht) wisselt — measureKey is null zolang dicht, anders de
  // stapindex, dus elke wijziging daarin triggert een nieuwe meting.
  const measureKey = open ? stepIndex : null;
  const [prevMeasureKey, setPrevMeasureKey] = useState(measureKey);
  if (measureKey !== prevMeasureKey) {
    setPrevMeasureKey(measureKey);
    setRect(open ? measureNow() : null);
  }

  // Ván-buitenaf-komende wijzigingen (resize/scroll) horen wél in een
  // effect thuis — setState gebeurt hier alleen binnen de listener-callback,
  // niet synchroon in de effect-body zelf.
  useEffect(() => {
    if (!open) return;
    function handleChange() { setRect(measureNow()); }
    window.addEventListener("resize", handleChange);
    // capture: true, want scrollen kan ook binnen een geneste container
    // gebeuren (bv. de partijenlijst), niet alleen op window zelf.
    window.addEventListener("scroll", handleChange, true);
    return () => {
      window.removeEventListener("resize", handleChange);
      window.removeEventListener("scroll", handleChange, true);
    };
  }, [open, measureNow]);

  // Scrollt het gemarkeerde element in beeld als het (bv. onderaan een
  // lange partijenlijst) buiten het scherm valt. Puur een externe DOM-
  // actie (geen setState), dus hier wél gewoon in een effect.
  useEffect(() => {
    if (!open || !step?.target) return;
    findVisibleTarget(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, step]);

  if (!open) return null;

  const isLast = stepIndex === STEPS.length - 1;

  function handleNext() {
    if (isLast) onFinish();
    else setStepIndex((i) => i + 1);
  }

  const spot = rect
    ? {
        top: rect.top - SPOT_PAD,
        left: rect.left - SPOT_PAD,
        width: rect.width + SPOT_PAD * 2,
        height: rect.height + SPOT_PAD * 2,
      }
    : null;

  // Tekstwolk onder het gemarkeerde element als daar ruimte voor is, anders
  // erboven — zodat 'ie nooit half buiten beeld valt.
  const spaceBelow = spot ? window.innerHeight - (spot.top + spot.height) : 0;
  const showBelow = !spot || spaceBelow > 160;
  const bubbleLeft = spot
    ? Math.min(Math.max(spot.left, 12), Math.max(12, window.innerWidth - 12 - BUBBLE_WIDTH))
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      {/* Onzichtbare laag die de hele viewport afvangt — zonder deze zou
          alleen het gedimde gebied buiten de spot niets tegenhouden en kon
          je per ongeluk knoppen ónder de rondleiding aanklikken. Klikken
          waar dan ook (ook op het gemarkeerde element zelf) gaat gewoon naar
          de volgende stap. */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "auto" }} onClick={handleNext} />
      {/* Verduisterde achtergrond met een "uitgesneden" plek rond het
          gemarkeerde element — een box-shadow-spotlight-truc (geen SVG-mask
          nodig). Puur visueel (pointerEvents: none), het echte klikken-
          afvangen gebeurt door de laag hierboven. Zonder doelelement
          (welkomststap) is de hele pagina gewoon gedimd. */}
      <div
        style={{
          position: "fixed",
          pointerEvents: "none",
          ...(spot
            ? {
                top: spot.top, left: spot.left, width: spot.width, height: spot.height,
                borderRadius: 14,
                boxShadow: "0 0 0 9999px rgba(10, 8, 5, 0.72)",
                border: "2px solid var(--accent)",
              }
            : { inset: 0, background: "rgba(10, 8, 5, 0.72)" }),
        }}
      />
      <div
        role="dialog"
        aria-label={t(step.titleKey)}
        className="panel"
        style={{
          position: "fixed",
          width: `min(90vw, ${BUBBLE_WIDTH}px)`,
          ...(spot
            ? {
                left: bubbleLeft,
                ...(showBelow ? { top: spot.top + spot.height + GAP } : { top: Math.max(12, spot.top - GAP) , transform: "translateY(-100%)" }),
              }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }),
          background: "var(--callout-bg)",
          color: "var(--callout-text)",
          boxShadow: "0 10px 32px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 91,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--callout-text)", margin: 0 }}>
            {t(step.titleKey)}
          </h2>
          <button
            className="btn btn-icon"
            style={{ color: "var(--callout-text)", flexShrink: 0 }}
            onClick={onFinish}
            aria-label={t("lobby.tour.skip")}
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-sm" style={{ color: "var(--callout-text)", margin: 0 }}>
          {t(step.bodyKey)}
        </p>
        <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
          <span className="text-xs mono" style={{ color: "var(--callout-text)", opacity: 0.75 }}>
            {t("lobby.tour.stepOf", { current: stepIndex + 1, total: STEPS.length })}
          </span>
          <button className="btn btn-solid" onClick={handleNext}>
            {isLast ? t("lobby.tour.done") : t("lobby.tour.next")}
            {!isLast && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
