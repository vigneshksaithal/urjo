import { isMeasurementId } from '../../shared/measurement-contract'

export const createContentId = (postId: string, puzzleInstanceId: string): string => {
    const contentId = `${postId}_${puzzleInstanceId}`
    if (!isMeasurementId(contentId)) {
        throw new Error('Unable to create a safe measurement content ID')
    }
    return contentId
}
