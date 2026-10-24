/** The token of `merchandise` · PT's interface (PtInterface). Inject it with @Inject(PT). */
export const PT = 'merchandise.pt.Pt';
/**
 * The token of how a PT's approval posts (PtPostingQueue; goods-in 6.6): the composition root provides it, with its
 * decision while no worker composes the posting job (RR-602), queued above a number of rows where one does.
 */
export const PT_POSTING_QUEUE = 'merchandise.pt.PostingQueue';
