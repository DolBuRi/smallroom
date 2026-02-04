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
