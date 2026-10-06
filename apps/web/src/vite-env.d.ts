/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The one variable that names the environment for the seed and the banner (RR-193); vite.config.ts exposes it. */
  readonly AOS_ENVIRONMENT?: string;
}
