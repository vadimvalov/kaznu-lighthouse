import { chromium } from "playwright";
import type { Schedule, Exam } from "../types.js";

export interface ScrapperCredentials {
  username: string;
  password: string;
}

export interface ScrapperResult {
  success: boolean;
  schedule?: Schedule;
  exams?: Exam[];
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
    
    
    // Check if main schedule is essentially empty (no lessons)
    const hasLessons = Object.keys(data).length > 0;
    
    let exams: Exam[] | undefined = undefined; 

    
    if (!hasLessons) {
         // Fallback to exams if no lessons found (or maybe always check? User said "Если недоступно по какой-то причине расписание... проверь еще myexam")
         // "If main schedule unavailable, check exams". Empty schedule might count as unavailable.
         // Let's scrape exams.
         
        const examScheduleLink = "https://univer.kaznu.kz/student/myexam/schedule"; // removed trailing slash 
        await page.goto(examScheduleLink);

        try {
            await page.waitForTimeout(3000); // Give it some time
            // Try waiting for ANY table to ensure page loaded
            try {
                await page.waitForSelector("table", { timeout: 8000 });
            } catch (e) {}

            const examData = await page.evaluate(() => {
                const result: any[] = [];
                const rows = Array.from(document.querySelectorAll("#scheduleList > tbody > tr"));
                let currentDateTimeStr = "";

                for (const row of rows) {
                    const th = row.querySelector("th");
                    if (th) {
                        const text = th.innerText.trim(); 
                        const match = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
                        if (match && match[1] && match[2]) {
                            currentDateTimeStr = `${match[1]} ${match[2]}`;
                        }
                        continue;
                    }

                    if (row.classList.contains("link")) {
                        const tds = row.querySelectorAll("td");
                        if (tds.length < 4) continue;

                        const subject = (tds[0]?.innerText || "").trim();
                        const typeFull = (tds[2]?.innerText || "").trim(); 
                        const roomFull = (tds[3]?.innerText || "").trim();
                        
                        // console.log("Found row:", subject, typeFull); // Debug in browser console, but we want it in node output if possible.
                        // We can't easily get it in node output from evaluate.
                        // We can return debug info.
                        
                        const isExam = typeFull.toLowerCase().includes("экзамен");
                        if (!isExam) continue; 

                        const type = "Экзамен";

                        let room = roomFull;
                        const roomMatch = roomFull.split("Ауд.:");
                        if (roomMatch.length > 1 && roomMatch[1]) {
                            room = roomMatch[1].trim();
                        }

                        if (!currentDateTimeStr) continue;

                        const parts = currentDateTimeStr.split(' ');
                        const datePart = parts[0]!;
                        const timePart = parts[1]!;

                        result.push({
                            subject,
                            date: datePart,
                            time: timePart,
                            room,
                            type
                        });
                    }
                }
                return result;
            });
            
            console.log(`🔍 [ExamScraper] Found ${examData.length} exams`);
            
            if (examData.length > 0) {
                 exams = examData;
            } else {
                 console.log("⚠️ [ExamScraper] No exams found in table.");
            }

        } catch (e) {
            console.warn("Failed to scrape exams or element not found:", e);
            // Don't fail the whole process if exams fail, unless main schedule also failed?
            // "если и тогда не получилось- тогда ошибка"
        }
    }

    await browser.close();

    // If both undefined/empty -> return error or empty schedule?
    // If hasLessons -> success.
    // If !hasLessons && exams -> success (with exams).
    // If !hasLessons && !exams -> fail?
    
    if (!hasLessons && (!exams || exams.length === 0)) {
        return {
             success: false,
             error: "No schedule or exams found" // User: "если и тогда не получилось- тогда ошибка"
        };
    }

    return {
      success: true,
      schedule: data as Schedule, 
      exams // We need to add this property to ScrapperResult interface
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
