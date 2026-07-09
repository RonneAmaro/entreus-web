import { describe, expect, it } from 'vitest'
import { getAdminPendingTotal, type AdminPendingAlerts } from '../../lib/admin-pending-alerts'

describe('admin pending alerts helpers', () => {
  it('includes creator withdrawals in the pending total', () => {
    const counts: AdminPendingAlerts = {
      itacashPurchases: 2,
      creatorWithdrawals: 1,
      ageVerifications: 3,
      reports: 4,
      feedbackReports: 5,
    }

    expect(getAdminPendingTotal(counts)).toBe(15)
  })
})
