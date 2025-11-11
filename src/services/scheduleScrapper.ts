import { chromium } from "playwright";
import type { Schedule } from "../types.js";

export interface ScrapperCredentials {
  username: string;
  password: string;
}

export interface ScrapperResult {
  success: boolean;
  schedule?: Schedule;
  error?: string;
}

export async function scheduleScrapper(
  credentials: ScrapperCredentials
): Promise<ScrapperResult> {
  let browser;

  try {
    browser = await chromium.launch({ headless: false }); // univer не пускает headless
    const page = await browser.newPage();

    await page.goto("https://univer.kaznu.kz/user/login");
    await page.goto("https://univer.kaznu.kz/lang/change/en/");

    await page.waitForSelector('input[type="submit"]', { timeout: 10000 });

    await page.fill('input[type="text"].text', credentials.username);
    await page.fill('input[type="password"].text', credentials.password);

    await page.click('input[type="submit"]');

    await page.waitForTimeout(2000);

    const loginError = await page.$('text="Invalid username or password"');
    if (loginError) {
      await browser.close();
      return {
        success: false,
        error: "Invalid username or password",
      };
    }

    const scheduleLink = "https://univer.kaznu.kz/student/myschedule";
    await page.goto(scheduleLink);

    await page.waitForSelector("table.schedule td", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const result: Record<string, any[]> = {};
      for (const d of days) result[d] = [];

      const rows = Array.from(document.querySelectorAll("table.schedule tr"));

      rows.forEach((row) => {
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) return;

        const timeRaw = tds.item(0).textContent?.trim() ?? "";
        const time = timeRaw.split("-")[0];

        days.forEach((day, i) => {
          const cell = tds.item(i + 1);
          if (!cell) return;

          const txt = cell.textContent.trim();
          if (!txt) return;

          const lines = txt
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);

          let course = lines[0];
          const tripleSpaceIndex = course!.search(/ {3,}/);
          if (tripleSpaceIndex !== -1) {
            course = course!.slice(0, tripleSpaceIndex).trim();
          }

          let lessonType: "lecture" | "seminar" | undefined;
          const typeMatch = course!.match(/\s*\((lecture|seminar)\)\s*$/i);
          if (typeMatch) {
            const found = (typeMatch[1] || "").toLowerCase();
            if (found === "lecture" || found === "seminar") {
              lessonType = found as "lecture" | "seminar";
              course = course!
                .replace(/\s*\((lecture|seminar)\)\s*$/i, "")
                .trim();
            }
          }

          let room = lines.find((l) => l.includes("Hall")) || "";
          room = room
            .replace(/Hall/gi, "")
            .replace(/:/g, "")
            .replace(/\s+/g, " ")
            .trim();

          result[day]!.push({ start_time: time, course, room, lessonType });
        });
      });

      return result;
    });

    for (const day in data) {
      if (data[day]!.length === 0) delete data[day];
    }

    await browser.close();

    return {
      success: true,
      schedule: data as Schedule,
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
