"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ROUTES,
  formatTimeHHMM,
  type BusDeparture,
} from "@/lib/schedule";
import { IETTService } from "@/lib/iettService";

// Helper to shift a Date to Europe/Istanbul (GMT+3) timezone representation.
// This ensures that local time functions like getHours() return Turkey time
// regardless of browser or server timezone settings.
function getTurkeyDate(date: Date = new Date()): Date {
  const localOffsetMin = date.getTimezoneOffset(); // in minutes
  const targetOffsetMin = -180; // Turkey is UTC+3 (offset is -180 min in JS Date terms)
  const shiftMs = (localOffsetMin - targetOffsetMin) * 60 * 1000;
  return new Date(date.getTime() + shiftMs);
}

// ─── Live Clock Component (Apple Digital Clock Style) ─────────────────────────
interface LiveClockProps {
  simulatedTime: Date;
}
function LiveClock({ simulatedTime }: LiveClockProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="text-white/20 font-sans tracking-tight text-base font-medium">Yükleniyor...</span>;
  }

  const time = simulatedTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const seconds = String(simulatedTime.getSeconds()).padStart(2, "0");
  const date = simulatedTime.toLocaleDateString("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex items-center gap-2.5 text-right font-sans">
      <span className="text-white/30 text-[10px] font-semibold tracking-wider uppercase hidden sm:inline">
        {date}
      </span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-lg sm:text-xl font-bold text-white tracking-tight tabular-nums">
          {time}
        </span>
        <span className="text-[10px] sm:text-xs text-white/30 font-medium tabular-nums">
          :{seconds}
        </span>
      </div>
    </div>
  );
}

// ─── Countdown Display Component (iOS Premium Pill Design) ─────────────────────
interface CountdownProps {
  secondsRemaining: number;
  status: "normal" | "delayed" | "cancelled";
}
function Countdown({ secondsRemaining, status }: CountdownProps) {
  if (status === "cancelled") {
    return (
      <div className="bg-red-500/10 text-[#ff453a] border border-red-500/15 px-3.5 py-1.5 rounded-full font-bold text-[11px] tracking-wide uppercase text-center min-w-[76px] font-sans">
        İPTAL
      </div>
    );
  }

  const totalMinutes = Math.ceil(secondsRemaining / 60);

  if (totalMinutes <= 0) {
    if (totalMinutes >= -2) {
      return (
        <div className="bg-[#30d158] text-[#000000] px-4 py-1.5 rounded-full font-extrabold text-[11px] tracking-wide uppercase text-center min-w-[80px] font-sans shadow-[0_0_12px_rgba(48,209,88,0.25)] animate-pulse">
          DURAKTA
        </div>
      );
    }
    return (
      <div className="text-white/20 font-semibold text-[11px] tracking-wide uppercase text-center min-w-[76px] font-sans">
        KALKTI
      </div>
    );
  }

  const isUrgent = totalMinutes <= 2;
  const isApproaching = totalMinutes <= 5;

  const badgeColorClass = isUrgent
    ? "bg-red-500/10 text-[#ff453a] border-red-500/15"
    : isApproaching
    ? "bg-orange-500/10 text-[#ff9f0a] border-orange-500/15"
    : "bg-green-500/10 text-[#30d158] border-green-500/15";

  return (
    <div className={`border px-4 py-1.5 rounded-full text-center min-w-[84px] sm:min-w-[90px] flex flex-col justify-center items-center font-sans ${badgeColorClass}`}>
      <span className="text-sm sm:text-base font-extrabold tracking-tight tabular-nums leading-none">
        {totalMinutes}
      </span>
      <span className="text-[8px] uppercase tracking-wider opacity-60 mt-0.5 font-bold">
        DK
      </span>
    </div>
  );
}

// ─── Departure Card Component (iOS Grouped List Row Design) ───────────────────
interface DepartureCardProps {
  departure: BusDeparture & { secondsRemaining: number; expectedDepartureTime: string };
  index: number;
}
function DepartureCard({ departure, index }: DepartureCardProps) {
  const isCancelled = departure.status === "cancelled";
  const isDelayed = departure.status === "delayed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 30, delay: index * 0.03 }}
      className={`
        relative overflow-hidden rounded-2xl border border-white/[0.04]
        bg-[#1c1c1e] px-4 py-3.5 sm:px-5 sm:py-4.5
        flex items-center justify-between gap-4 transition-all duration-200
        ${isCancelled ? "opacity-35" : "hover:bg-[#2c2c2e] hover:scale-[1.01] active:scale-[0.99]"}
      `}
    >
      {/* Route brand accent accent dot */}
      <div
        className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-full"
        style={{ backgroundColor: departure.color }}
      />

      {/* Left side: Route Badge & Destination */}
      <div className="flex items-center gap-4 min-w-0 flex-1 pl-3.5">
        {/* Route App-Icon style Badge */}
        <div
          className="flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-12.5 sm:h-12.5 rounded-xl font-extrabold text-sm sm:text-base tracking-tight shadow-sm font-sans"
          style={{
            backgroundColor: `${departure.color}15`,
            color: departure.color,
            border: `1px solid ${departure.color}30`,
          }}
        >
          {departure.code}
        </div>

        {/* Destination & Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white text-[15px] sm:text-[16px] font-bold tracking-tight truncate leading-snug font-sans">
              {departure.destination}
            </h3>
            {isDelayed && (
              <span className="text-[8px] bg-orange-500/10 text-[#ff9f0a] border border-orange-500/15 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                +{departure.delayMinutes} MIN
              </span>
            )}
          </div>
          <p className="text-[#8e8e93] text-[11px] sm:text-xs font-medium mt-0.5 tabular-nums font-sans">
            Planlanan: {departure.departureTime}
            {isDelayed && ` • Beklenen: ${departure.expectedDepartureTime}`}
          </p>
        </div>
      </div>

      {/* Right side: iOS Pill Countdown */}
      <div className="flex-shrink-0">
        <Countdown secondsRemaining={departure.secondsRemaining} status={departure.status} />
      </div>
    </motion.div>
  );
}

// ─── Main Departure Board (Apple iOS Dashboard Style) ─────────────────────────
export default function DepartureBoard() {
  // Hydration safety
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Simulated Time state (Starts from actual GMT+3 current local time)
  const [simulatedTime, setSimulatedTime] = useState<Date>(() => {
    return getTurkeyDate(new Date());
  });
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const lastRealTimeRef = useRef<number>(Date.now());

  // API Loading & Base Schedules States
  const [baseDepartures, setBaseDepartures] = useState<BusDeparture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedAtSimTime, setFetchedAtSimTime] = useState<Date | null>(null);

  const fetchDepartures = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await IETTService.getDeparturesForStop("225981", simulatedTime);
      console.log("%c=== İETT API CANLI VERİ AKIŞI ===", "color: #30d158; font-weight: bold; font-size: 12px;");
      console.log(`Durak: Deniz Harp Okulu (225981)`);
      console.log(`Sorgu Saati (GMT+3): ${simulatedTime.toLocaleTimeString("tr-TR")}`);
      console.log(`Gelen Sefer Sayısı: ${data.length}`);
      console.log("Sefer Verileri (İlk 3 Araç):", JSON.parse(JSON.stringify(data.slice(0, 3))));
      console.log("=================================");
      setBaseDepartures(data);
      setFetchedAtSimTime(new Date(simulatedTime.getTime()));
    } catch (err) {
      console.error("IETT API Fetch Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [simulatedTime]);

  useEffect(() => {
    fetchDepartures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run on mount!

  const handleRefresh = () => {
    fetchDepartures();
  };

  // 1. Simulation clock tick in real-time
  useEffect(() => {
    lastRealTimeRef.current = Date.now();
    const tick = () => {
      const nowReal = Date.now();
      const deltaRealMs = nowReal - lastRealTimeRef.current;
      lastRealTimeRef.current = nowReal;

      setSimulatedTime((prev) => {
        const nextTimeMs = prev.getTime() + deltaRealMs * simSpeed;
        const nextDate = new Date(nextTimeMs);

        // Wrap around if it goes beyond 23:59, reset to 06:00
        const currentHours = nextDate.getHours();
        if (currentHours >= 24 || currentHours < 6) {
          nextDate.setHours(6, 0, 0, 0);
        }
        return nextDate;
      });
    };

    const interval = setInterval(tick, 1000); // 1s tick for clean ticking clock
    return () => clearInterval(interval);
  }, [simSpeed]);

  // 2. Process all departures (base + custom, apply modifications)
  const activeDepartures = useMemo(() => {
    return baseDepartures.map((dep) => {
      let secondsRemaining = 0;

      if (fetchedAtSimTime && typeof dep.secondsRemaining === "number") {
        // Real-time calculation: live traffic remaining seconds minus elapsed simulation time
        const elapsedSec = Math.round((simulatedTime.getTime() - fetchedAtSimTime.getTime()) / 1000);
        secondsRemaining = Math.max(-180, dep.secondsRemaining - elapsedSec);
      } else {
        // Fallback to static schedule calculation
        const [hours, minutes] = dep.departureTime.split(":").map(Number);
        const departureDate = new Date(simulatedTime);
        departureDate.setHours(hours, minutes, 0, 0);

        const diffMs = departureDate.getTime() - simulatedTime.getTime();
        secondsRemaining = Math.round(diffMs / 1000);
      }

      // Compute expected departure time relative to simulated time
      const expectedDate = new Date(simulatedTime.getTime() + secondsRemaining * 1000);
      const expectedDepartureTime = formatTimeHHMM(expectedDate);

      return {
        ...dep,
        secondsRemaining,
        expectedDepartureTime,
      };
    });
  }, [simulatedTime, baseDepartures, fetchedAtSimTime]);

  // 3. Filter and Sort departures
  const filteredDepartures = useMemo(() => {
    return activeDepartures
      .filter((dep) => {
        // Keep departed buses for up to 2 minutes
        if (dep.secondsRemaining < -120) return false;
        return true;
      })
      .sort((a, b) => a.secondsRemaining - b.secondsRemaining)
      .slice(0, 8); // Show up to 8 next departures
  }, [activeDepartures]);

  return (
    <main className="min-h-dvh flex flex-col bg-[#000000] text-[#f4f4f7] selection:bg-white/10 relative overflow-hidden font-sans antialiased">
      {/* ─── HEADER (iOS Navigation Bar Design) ─────────────────────────────────── */}
      <header className="flex-shrink-0 px-4 pt-6 pb-4 sm:px-6 sm:pt-8 bg-[#000000] border-b border-white/[0.04]">
        <div className="max-w-xl mx-auto flex items-end justify-between gap-4">
          
          {/* iOS Large Navigation Title Style */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#30d158] shadow-[0_0_6px_#30d158] animate-pulse" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#8e8e93]">
                Deniz Harp Okulu
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1 leading-none font-sans">
              Kalkış Saatleri
            </h1>
          </div>

          {/* Clock & Action Container */}
          <div className="flex-shrink-0 flex items-center gap-3 bg-[#1c1c1e] p-1.5 rounded-2xl border border-white/[0.04] shadow-sm">
            <LiveClock simulatedTime={simulatedTime} />
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] disabled:opacity-50 border border-white/[0.03] transition-all cursor-pointer shadow-sm"
              title="Yenile"
            >
              <svg
                className={`w-3.5 h-3.5 text-[#30d158] ${isLoading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ─── DEPARTURES LIST (iOS Grouped List View) ───────────────────────────── */}
      <section className="flex-1 px-4 py-4 sm:px-6 overflow-y-auto bg-[#000000]">
        <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
          
          {/* iOS Grouped List Header Label */}
          <div className="flex items-center justify-between px-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#8e8e93]">
            <span>Yaklaşan Seferler</span>
            <span className="font-mono text-[9px] tracking-normal font-semibold">DURAK: 225981</span>
          </div>

          {/* Grouped Cards Stack */}
          {!mounted || isLoading ? (
            <div className="space-y-3 sm:space-y-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-2xl border border-white/[0.03] bg-[#1c1c1e] px-4 py-5 flex items-center justify-between gap-4 animate-pulse"
                >
                  <div className="flex items-center gap-3.5 flex-1">
                    <div className="w-11 h-11 sm:w-12.5 sm:h-12.5 rounded-xl bg-white/[0.02]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-white/[0.03] rounded w-1/3" />
                      <div className="h-3 bg-white/[0.02] rounded w-1/4" />
                    </div>
                  </div>
                  <div className="w-16 h-9 bg-white/[0.02] rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredDepartures.length === 0 ? (
            <div className="text-center py-20 bg-[#1c1c1e] border border-white/[0.03] rounded-2xl">
              <div className="text-3xl mb-3">🌙</div>
              <p className="text-[#8e8e93] text-sm font-semibold tracking-tight">
                Şu an aktif sefer bulunmuyor
              </p>
              <p className="text-white/20 text-xs mt-1">
                Planlanmış seferlerin kalkış saatleri geçmiş olabilir.
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredDepartures.map((departure, index) => (
                  <DepartureCard
                    key={departure.id}
                    departure={departure}
                    index={index}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      {/* ─── SIMPLE FOOTER (iOS Tab Bar spacing inspired) ──────────────────────── */}
      <footer className="flex-shrink-0 border-t border-white/[0.04] bg-[#000000] py-4 px-4 pb-6 sm:pb-8">
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-[#8e8e93] font-semibold tracking-wide uppercase">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] shadow-[0_0_4px_#30d158]" />
            <span>İETT Yolcu Bilgi Sistemi • Aktif</span>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4 text-[#8e8e93] normal-case">
            <a
              href="https://instagram.com/bahriyiilmaz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              <span>@bahriyiilmaz</span>
            </a>

            <a
              href="https://github.com/bahriy-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.193 22 16.44 22 12.017 22 6.484 17.522 2 12 2z" />
              </svg>
              <span>bahriy-dev</span>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
