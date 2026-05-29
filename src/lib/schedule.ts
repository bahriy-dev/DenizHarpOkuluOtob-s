// Mock schedule data for "Deniz Harp Okulu" bus stop
// In production, this would come from IETT/IBB Open Data API

export interface RouteStop {
  name: string;
  offset: number; // Minutes from route start
}

export interface BusRoute {
  id: string;
  code: string;
  destination: string;
  color: string;
  stops: RouteStop[];
  ourStopIndex: number; // Index of "Deniz Harp Okulu" in stops
}

export interface BusDeparture {
  id: string;
  routeId: string;
  code: string;
  destination: string;
  color: string;
  departureTime: string; // Base departure time HH:mm format
  status: "normal" | "delayed" | "cancelled";
  delayMinutes: number;
  stops: RouteStop[];
  ourStopIndex: number;
}

// Route stops including "Deniz Harp Okulu"
// "Deniz Harp Okulu" is the reference stop (offset will be used to track progress)
export const ROUTES: BusRoute[] = [
  {
    id: "km12",
    code: "KM12",
    destination: "Kartal Metro",
    color: "#3B82F6",
    ourStopIndex: 2,
    stops: [
      { name: "Tuzla Depo", offset: 0 },
      { name: "Tuzla Marina", offset: 3 },
      { name: "Deniz Harp Okulu", offset: 7 },
      { name: "Tuzla Belediyesi", offset: 12 },
      { name: "Tuzla Devlet Hastanesi", offset: 17 },
      { name: "İçmeler Metro", offset: 22 },
      { name: "Pendik Köprüsü", offset: 32 },
      { name: "Kartal Metro", offset: 40 },
    ],
  },
  {
    id: "130a",
    code: "130A",
    destination: "Kadıköy",
    color: "#8B5CF6",
    ourStopIndex: 1,
    stops: [
      { name: "Tuzla Depo", offset: 0 },
      { name: "Deniz Harp Okulu", offset: 5 },
      { name: "Tuzla Belediyesi", offset: 10 },
      { name: "İçmeler", offset: 15 },
      { name: "Kaynarca", offset: 22 },
      { name: "Pendik YHT", offset: 27 },
      { name: "Kartal Metro", offset: 35 },
      { name: "Maltepe", offset: 43 },
      { name: "Bostancı", offset: 52 },
      { name: "Kadıköy", offset: 65 },
    ],
  },
  {
    id: "130t",
    code: "130T",
    destination: "Tuzla İçmeler",
    color: "#10B981",
    ourStopIndex: 2,
    stops: [
      { name: "Tuzla Depo", offset: 0 },
      { name: "Tuzla Marina", offset: 4 },
      { name: "Deniz Harp Okulu", offset: 8 },
      { name: "Tuzla İstasyon", offset: 13 },
      { name: "Tuzla Devlet Hastanesi", offset: 18 },
      { name: "İçmeler Köprüsü", offset: 23 },
    ],
  },
  {
    id: "132h",
    code: "132H",
    destination: "Pendik YHT",
    color: "#F59E0B",
    ourStopIndex: 5,
    stops: [
      { name: "Sabiha Gökçen", offset: 0 },
      { name: "Pendik YHT", offset: 15 },
      { name: "Pendik Metro", offset: 20 },
      { name: "İçmeler", offset: 28 },
      { name: "Tuzla Belediyesi", offset: 33 },
      { name: "Deniz Harp Okulu", offset: 38 },
      { name: "Pendik Merkez (Ring)", offset: 48 },
    ],
  },
  {
    id: "131m",
    code: "131M",
    destination: "Maltepe",
    color: "#EF4444",
    ourStopIndex: 1,
    stops: [
      { name: "Tuzla Depo", offset: 0 },
      { name: "Deniz Harp Okulu", offset: 6 },
      { name: "Tuzla", offset: 11 },
      { name: "İçmeler", offset: 16 },
      { name: "Esenyalı", offset: 21 },
      { name: "Güzelyalı", offset: 26 },
      { name: "Pendik Merkez", offset: 32 },
      { name: "Maltepe", offset: 45 },
    ],
  },
  {
    id: "km22",
    code: "KM22",
    destination: "Kartal Metro",
    color: "#06B6D4",
    ourStopIndex: 2,
    stops: [
      { name: "Tuzla Depo", offset: 0 },
      { name: "Tuzla Marina", offset: 4 },
      { name: "Deniz Harp Okulu", offset: 8 },
      { name: "Tuzla Belediyesi", offset: 13 },
      { name: "İçmeler Metro", offset: 18 },
      { name: "Kartal Metro", offset: 30 },
    ],
  },
];

// Generate a full day of departures based on typical IETT frequencies
export function generateDailySchedule(): BusDeparture[] {
  const departures: BusDeparture[] = [];

  const schedules: { route: BusRoute; startHour: number; endHour: number; intervalMin: number }[] = [
    { route: ROUTES[0], startHour: 6, endHour: 23, intervalMin: 12 },  // KM12
    { route: ROUTES[1], startHour: 6, endHour: 23, intervalMin: 15 },  // 130A
    { route: ROUTES[2], startHour: 7, endHour: 22, intervalMin: 20 },  // 130T
    { route: ROUTES[3], startHour: 6, endHour: 22, intervalMin: 18 },  // 132H
    { route: ROUTES[4], startHour: 7, endHour: 21, intervalMin: 25 },  // 131M
    { route: ROUTES[5], startHour: 6, endHour: 23, intervalMin: 14 },  // KM22
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

  return departures.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
}

export const ALL_DEPARTURES = generateDailySchedule();

/**
 * Returns upcoming departures from simulated time.
 */
export function getUpcomingDepartures(
  referenceTimeStr: string,
  count: number = 12
): BusDeparture[] {
  // Return departures starting from the simulated reference time
  const upcoming = ALL_DEPARTURES.filter((d) => d.departureTime >= referenceTimeStr);
  return upcoming.slice(0, count);
}

/**
 * Calculate seconds remaining until departure, relative to simulated time.
 */
export function getSecondsUntil(departureTime: string, now: Date, delayMinutes: number = 0): number {
  const [hours, minutes] = departureTime.split(":").map(Number);
  const departure = new Date(now);
  departure.setHours(hours, minutes + delayMinutes, 0, 0);

  // If the departure hour is smaller than the current hour, it might be for the next day,
  // but since we only simulate a single day from 06:00 to 23:00, we keep it simple.
  const diffMs = departure.getTime() - now.getTime();
  return Math.round(diffMs / 1000);
}

/**
 * Format a Date object to HH:MM format.
 */
export function formatTimeHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
