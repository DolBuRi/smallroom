import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '정보 없음';

  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, now.getTime() - past.getTime());

  if (diff < 60000) return '1분 미만';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(diff / 2592000000);

  if (months > 0) return `${months}달 전`;
  if (days > 0) return `${days}일 전`;

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}시간 ${remainingMinutes}분 전`;
    }
    return `${hours}시간 전`;
  }

  return `${minutes}분 전`;
}

export const getCurrentWeek = () => {
  const now = new Date();
  // 수요일 오전 9시 리셋을 위해 9시간을 뺍니다.
  const adjusted = new Date(now.getTime() - (9 * 60 * 60 * 1000));

  // 해당 주의 수요일 날짜를 찾습니다.
  const day = adjusted.getDay(); // 0(일) ~ 6(토)
  const diffToWed = 3 - day;
  const wednesday = new Date(adjusted);
  wednesday.setDate(adjusted.getDate() + diffToWed);

  const year = wednesday.getFullYear();
  const month = wednesday.getMonth() + 1;

  // 해당 월의 첫 번째 날
  const firstDay = new Date(year, wednesday.getMonth(), 1);
  // 일요일 시작 기준 몇 번째 주인지 계산
  const week = Math.floor((wednesday.getDate() + firstDay.getDay() - 1) / 7) + 1;

  return `${month}월 ${week}주차`;
};
