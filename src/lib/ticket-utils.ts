export function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour ago`
  return `${Math.floor(hrs / 24)} days ago`
}

export const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  open: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-orange-100 text-orange-700",
  closed: "bg-green-100 text-green-700",
}
