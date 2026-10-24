// The reads a change of a GRN's PT makes stale (goods-in 5.8, 6.7; S2-F04-T02, S2-F09-T01): the GRN's PT, the Receive
// Goods inbox, which says what the delivery waits for, and My work, where its approval waits. One list for every
// command on a PT (code review 8 of stage 2).
export const PT_READS = ['readGrnPt', 'readReceivingInbox', 'listMyWork'] as const;
