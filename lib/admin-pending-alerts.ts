export type AdminPendingAlerts = {
  itacashPurchases: number
  creatorWithdrawals: number
  ageVerifications: number
  reports: number
  feedbackReports: number
}

export type AdminPendingAlertKey = keyof AdminPendingAlerts

export const emptyAdminPendingAlerts: AdminPendingAlerts = {
  itacashPurchases: 0,
  creatorWithdrawals: 0,
  ageVerifications: 0,
  reports: 0,
  feedbackReports: 0,
}

export function getAdminPendingTotal(counts: AdminPendingAlerts) {
  return (
    counts.itacashPurchases +
    counts.creatorWithdrawals +
    counts.ageVerifications +
    counts.reports +
    counts.feedbackReports
  )
}
