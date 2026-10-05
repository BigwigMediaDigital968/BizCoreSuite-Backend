export interface CalculateLeaveDaysInput {
  startDate: Date;
  endDate: Date;
  durationType?: "full_day" | "first_half" | "second_half";
  branchId?: string;
  workingDays?: number[];
  holidays?: Date[];
}

const normalizeDate = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const dateKey = (date: Date) => normalizeDate(date).toISOString().split("T")[0];

export const calculateLeaveDays = async ({
  startDate,
  endDate,
  durationType = "full_day",
  workingDays = [1, 2, 3, 4, 5], // Default: Monday to Friday
  holidays = [],
}: CalculateLeaveDaysInput): Promise<{ totalDays: number }> => {
  let totalDays = 0;

  const holidaySet = new Set(holidays.map(dateKey));
  const current = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

    const isWorkingDay = workingDays.includes(isoDay);
    const isHoliday = holidaySet.has(dateKey(current));

    if (isWorkingDay && !isHoliday) {
      totalDays += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  if (durationType !== "full_day") {
    totalDays -= 0.5;
  }

  return { totalDays: Math.max(totalDays, 0) };
};
