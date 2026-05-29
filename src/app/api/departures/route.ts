import { NextResponse } from "next/server";

// Regex to cleanly parse IETT's AJAX HTML layout:
// <span>(LINE_CODE)</span>\s*<p>(DEST_INFO)<b>\((TIME)\)\s*(REMAINING)</b></p>
const DEPARTURE_REGEX = /<span>([^<]+)<\/span>\s*<p>\s*([^<]+)\s*<b>\(([^)]+)\)\s*([^<]*)<\/b>\s*<\/p>/gi;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stopCode = searchParams.get("stopCode") || "225981";

  try {
    // Fetch live page from official IETT StationInfo AJAX endpoint
    // This bypasses browser CORS entirely since it runs server-side!
    const res = await fetch(`https://iett.istanbul/tr/RouteStation/GetStationInfo?dcode=${stopCode}&langid=1`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 10 }, // Revalidate cache every 10 seconds
    });

    if (!res.ok) {
      return NextResponse.json({ error: "IETT server returned an error" }, { status: 500 });
    }

    const rawHtml = await res.text();
    const html = decodeTurkishQuirks(rawHtml);
    const departures = parseIETTHtml(html);

    return NextResponse.json(departures);
  } catch (error) {
    console.error("IETT Proxy Scraper Error:", error);
    return NextResponse.json({ error: "Failed to scrape IETT data" }, { status: 500 });
  }
}

function decodeTurkishQuirks(text: string): string {
  if (!text) return "";

  // 1. Decode HTML decimal entities (e.g. &#214; -> Ö)
  let decoded = text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  // 2. Fix double-encoded UTF-8 characters
  const doubleEncodedMap: { [key: string]: string } = {
    "Ä°": "İ",
    "Ä±": "ı",
    "Å": "ş",
    "Å": "Ş",
    "Ä": "ğ",
    "Ä": "Ğ",
    "Ã¼": "ü",
    "Ã": "Ü",
    "Ã¶": "ö",
    "Ã": "Ö",
    "Ã§": "ç",
    "Ã": "Ç",
    "Ã ": "à",
    "Ã¢": "â",
    "Ã©": "é",
  };

  for (const [bad, good] of Object.entries(doubleEncodedMap)) {
    decoded = decoded.replaceAll(bad, good);
  }

  // 3. Fix specific broken strings (like replacement characters in known words)
  decoded = decoded.replace(/DENZ/gi, "DENİZ");
  decoded = decoded.replace(/\uFFFD/g, "İ"); // Fallback replacement character to dotted I

  return decoded;
}

function parseIETTHtml(html: string): any[] {
  const departures: any[] = [];
  let match;
  let index = 0;

  // Reset regex index for safety
  DEPARTURE_REGEX.lastIndex = 0;

  while ((match = DEPARTURE_REGEX.exec(html)) !== null) {
    const code = match[1].trim();
    const rawDest = match[2].trim();
    const time = match[3].trim();
    const remainingText = match[4].trim();

    // Clean destination: strip out "DENİZ HARP OKULU  -  " prefix if present
    let destination = rawDest;
    const splitIndex = rawDest.indexOf("-");
    if (splitIndex !== -1) {
      destination = rawDest.substring(splitIndex + 1).trim();
    }

    // Clean and normalize destination casing
    destination = destination
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();

    // Parse minutes remaining
    let secondsRemaining = 0;
    if (remainingText.includes("dk") || remainingText.includes("min")) {
      const mins = parseInt(remainingText, 10);
      if (!isNaN(mins)) {
        secondsRemaining = mins * 60;
      }
    } else if (remainingText === "B" || remainingText === "") {
      // 'B' means scheduled but has not started or signal is lost.
      // Estimate minutes remaining based on scheduled departure time.
      const [hours, minutes] = time.split(":").map(Number);
      const now = new Date();
      
      // Convert current time to Europe/Istanbul (GMT+3) timezone
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const turkeyNow = new Date(utc + (180 * 60 * 1000));
      
      const departureDate = new Date(turkeyNow);
      departureDate.setHours(hours, minutes, 0, 0);

      let diffMs = departureDate.getTime() - turkeyNow.getTime();
      // If estimated departure is in the past by more than 10 mins, assume it is for the next day
      if (diffMs < -600000) {
        departureDate.setDate(departureDate.getDate() + 1);
        diffMs = departureDate.getTime() - turkeyNow.getTime();
      }
      secondsRemaining = Math.round(diffMs / 1000);
    }

    // Determine premium colors dynamically based on line codes
    let color = "#0a84ff"; // Apple Blue default
    if (code.startsWith("KM")) color = "#0a84ff"; // Blue
    else if (code.includes("A")) color = "#af52de"; // Purple
    else if (code.includes("P")) color = "#30d158"; // Green
    else if (code.includes("H")) color = "#ff9f0a"; // Orange
    else if (code.includes("M")) color = "#ff453a"; // Red
    else color = "#64d2ff"; // Cyan

    departures.push({
      id: `${code.toLowerCase()}-${time}-${index++}`,
      routeId: code.toLowerCase(),
      code,
      destination,
      color,
      departureTime: time,
      status: "normal",
      delayMinutes: 0,
      secondsRemaining,
      expectedDepartureTime: time,
    });
  }

  return departures;
}
