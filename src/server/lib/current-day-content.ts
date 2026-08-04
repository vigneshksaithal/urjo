type CurrentScheduledCompletion = Readonly<{
    scheduledDate: string | null | undefined
    scheduledSlotKey: string | null | undefined
    completionDate: string
    today: string
}>

export const isCurrentScheduledCompletion = (
    input: CurrentScheduledCompletion,
): boolean =>
    input.scheduledDate === input.today &&
    input.completionDate === input.today &&
    typeof input.scheduledSlotKey === 'string' &&
    input.scheduledSlotKey.length > 0
