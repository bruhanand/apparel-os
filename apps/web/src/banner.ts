import { environmentBanner } from './shell/environment';

/** This build's environment banner, from AOS_ENVIRONMENT as it was when the app was built (RR-193). */
export const banner = environmentBanner(import.meta.env.AOS_ENVIRONMENT);
