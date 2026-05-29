import { ROUTES, type BusDeparture, type BusRoute } from "./schedule";

/**
 * Enterprise IETT API Service Layer
 * 
 * This service handles all public transport data operations.
 * It is built using async/await promises so it mimics a real-world remote API fetch.
 * When you acquire access to a live IBB or IETT REST API in the future,
 * you only need to swap the implementation inside these methods to point to your real endpoints!
 */
export class IETTService {
  private static SIMULATED_LATENCY_MS = 600; // Realistic API network delay

  /**
   * Helper to introduce network latency simulation
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetches active departures for a given stop code.
   * 
   * @param stopCode The target stop code (e.g., "225981" for Deniz Harp Okulu)
   * @param referenceTime The base simulated time to calculate upcoming departures
   * @returns List of active upcoming departures
   */
  public static async getDeparturesForStop(
    stopCode: string,
    referenceTime: Date
  ): Promise<BusDeparture[]> {
    // Introduce minimal latency for visual smooth load transitions
    await this.delay(200);

    try {
      // Fetch live real-world IETT departures from our server-side API proxy
      const res = await fetch(`/api/departures?stopCode=${stopCode}`);
      if (res.ok) {
        const liveDepartures = await res.json();
        if (Array.isArray(liveDepartures) && liveDepartures.length > 0) {
          console.log(`%c[İETT Service] Live real-world data loaded successfully for Stop: ${stopCode}`, "color: #30d158; font-weight: bold;");
          return liveDepartures;
        }
      }
      console.warn("[İETT Service] Live API returned empty or invalid structure. Falling back to mock schedules.");
    } catch (error) {
      console.warn("[İETT Service] Live API fetch failed. Falling back to mock schedules:", error);
    }

    // --- FALLBACK MOCK SCHEDULES GENERATOR ---
    // This runs if you are offline or if the IETT server has issues
    // Upcoming departures (starting from current reference time)
    const allDepartures = this.generateDynamicSchedules();
    const upcoming = allDepartures.filter((d) => {
      const [depHours, depMinutes] = d.departureTime.split(":").map(Number);
      const depTotalMin = depHours * 60 + depMinutes;
      const refTotalMin = referenceTime.getHours() * 60 + referenceTime.getMinutes();
      return depTotalMin >= refTotalMin - 2;
    });

    return upcoming.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }

  /**
   * Fetches full route and stop details for a specific route code.
   * 
   * @param routeId The route identifier (e.g., "km12")
   * @returns The requested route details
   */
  public static async getRouteDetails(routeId: string): Promise<BusRoute | null> {
    await this.delay(this.SIMULATED_LATENCY_MS);
    const route = ROUTES.find((r) => r.id === routeId);
    return route || null;
  }

  /**
   * Dynamically generates the daily schedule (from 06:00 to 23:30)
   * 
   * Swappable with a real GET /api/schedules call in production.
   */
  private static generateDynamicSchedules(): BusDeparture[] {
    const departures: BusDeparture[] = [];

    const schedules: { route: BusRoute; startHour: number; endHour: number; intervalMin: number }[] = [
      { route: ROUTES[0], startHour: 6, endHour: 23, intervalMin: 12 },  // KM12 (Kartal Metro)
      { route: ROUTES[1], startHour: 6, endHour: 23, intervalMin: 15 },  // 130A (Kadıköy)
      { route: ROUTES[2], startHour: 7, endHour: 22, intervalMin: 20 },  // 130T (Tuzla İçmeler)
      { route: ROUTES[3], startHour: 6, endHour: 22, intervalMin: 18 },  // 132H (Pendik YHT)
      { route: ROUTES[4], startHour: 7, endHour: 21, intervalMin: 25 },  // 131M (Maltepe)
      { route: ROUTES[5], startHour: 6, endHour: 23, intervalMin: 14 },  // KM22 (Kartal Metro)
    ];

    for (const sched of schedules) {
      let currentMinute = 0;
      for (let hour = sched.startHour; hour <= sched.endHour; hour++) {
        while (currentMinute < 60) {
          const timeStr = `${String(hour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
          departures.push({
            id: `${sched.route.id}-${timeStr}`,
            routeId: sched.route.id,
            code: sched.route.code,
            destination: sched.route.destination,
            color: sched.route.color,
            departureTime: timeStr,
            status: "normal",
            delayMinutes: 0,
            stops: sched.route.stops,
            ourStopIndex: sched.route.ourStopIndex,
          });
          currentMinute += sched.intervalMin;
        }
        currentMinute = currentMinute - 60;
      }
    }

    return departures;
  }
}
