// Public interface of the inbox module (module-map 4.8). Other code imports only from here.
export { InboxModule } from './inbox.module.js';
export { APPROVAL_ELIGIBILITY, INBOX_IDENTITY, inboxConsumers, inboxJobKinds } from './jobs/consumers.js';
export { WORK_ITEM_ROUTING_ACTION_TYPE, workItemRoutingApprovals } from './commands/routing.js';
export { Inbox, INBOX } from './inbox.js';
export type { InboxInterface, ItemActor, ItemOwner, PublishedItem } from './inbox.js';
export { announceItems, WORK_ITEM_RECORD_TYPE, workItemChanged } from './events.js';
