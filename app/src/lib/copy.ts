import { ApiError } from './api';
import { PLATFORM_NAMES, type Platform } from './links';

export type ErrorAction = 'close' | 'retry' | 'pair' | 'termux' | 'pairAgain';
export type ErrorIconName =
  | 'Prohibit'
  | 'Lock'
  | 'LinkBreak'
  | 'HourglassMedium'
  | 'CloudSlash'
  | 'WarningCircle'
  | 'Plugs';

export interface ErrorCopy {
  icon: ErrorIconName;
  tone: 'err' | 'warn';
  title: string;
  body: string;
  actions: ErrorAction[];
}

interface Ctx {
  platform?: Platform | null;
  serverName?: string;
  hostPort?: string;
}

/** DESIGN.md §13.1: resolve errors in the Preview / Batch sheets. */
export function resolveErrorCopy(err: unknown, ctx: Ctx): ErrorCopy {
  const P = ctx.platform ? PLATFORM_NAMES[ctx.platform] : 'The platform';
  const code = err instanceof ApiError ? err.code : 'offline';
  const message = err instanceof ApiError ? err.message : '';
  switch (code) {
    case 'unsupported_url':
      return {
        icon: 'Prohibit',
        tone: 'err',
        title: "SaveSama can't open this link",
        body: 'It takes links from YouTube, Instagram, TikTok, Facebook, Threads and Reddit.',
        actions: ['close'],
      };
    case 'login_required':
      return {
        icon: 'Lock',
        tone: 'err',
        title: 'This post needs an account',
        body: "It's private, age-restricted or only visible when signed in. SaveSama never signs in, so your accounts stay safe from flags and bans, but it can't open posts like this. Public posts save fine.",
        actions: ['close'],
      };
    case 'not_found':
      return {
        icon: 'LinkBreak',
        tone: 'err',
        title: "This post isn't there",
        body: 'It may have been deleted, or the link is incomplete. Check the link and try again.',
        actions: ['close', 'retry'],
      };
    case 'rate_limited':
      return {
        icon: 'HourglassMedium',
        tone: 'warn',
        title: `${P} is slowing things down`,
        body: 'Too many requests in a short time. Wait a few minutes, then try again.',
        actions: ['close', 'retry'],
      };
    case 'unavailable':
      return {
        icon: 'Prohibit',
        tone: 'err',
        title: "This one can't be saved",
        body: message
          ? message
          : `${P} doesn't offer it as a download. Live streams, region-locked videos and text-only posts can't be saved.`,
        actions: ['close'],
      };
    case 'network':
      return {
        icon: 'CloudSlash',
        tone: 'err',
        title: `Couldn't reach ${P}`,
        body: `Your server is running but couldn't connect to ${P}. Check its internet connection, then try again.`,
        actions: ['close', 'retry'],
      };
    case 'unauthorized':
      return {
        icon: 'Lock',
        tone: 'warn',
        title: 'Pair again',
        body: `${ctx.serverName ?? 'Your server'} no longer accepts SaveSama's key. It may have been reset. Pair again to keep using it.`,
        actions: ['pairAgain'],
      };
    case 'bad_request':
      return {
        icon: 'WarningCircle',
        tone: 'err',
        title: "The server didn't understand that",
        body: 'Updating the app or the server usually fixes this.',
        actions: ['close'],
      };
    case 'timeout':
      return {
        icon: 'HourglassMedium',
        tone: 'warn',
        title: 'This is taking too long',
        body: `${P} is slow to answer. Try again in a moment.`,
        actions: ['close', 'retry'],
      };
    case 'offline':
      return {
        icon: 'Plugs',
        tone: 'err',
        title: "Server isn't answering",
        body: `SaveSama can't reach ${ctx.serverName ?? 'your server'} at ${ctx.hostPort ?? '127.0.0.1:8765'}. On this phone, open Termux and run savesama. On a PC, check it's on and on the same Wi-Fi.`,
        actions: ['termux', 'retry'],
      };
    default:
      return {
        icon: 'WarningCircle',
        tone: 'err',
        title: 'The server hit a problem',
        body: 'Try again. If it keeps happening, update the extractor in the Server tab.',
        actions: ['close', 'retry'],
      };
  }
}

export const NOT_PAIRED: ErrorCopy = {
  icon: 'Plugs',
  tone: 'err',
  title: 'Pair a server first',
  body: 'SaveSama needs your server to read posts. It takes a minute on this phone.',
  actions: ['pair'],
};

export const NO_ITEMS: ErrorCopy = {
  icon: 'Prohibit',
  tone: 'err',
  title: 'Nothing to save here',
  body: 'This post has no photo, video or audio.',
  actions: ['close'],
};

/** Short one-line versions for Batch rows. */
export function shortError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'offline';
  switch (code) {
    case 'login_required':
      return 'Needs an account';
    case 'not_found':
      return "This post isn't there";
    case 'rate_limited':
      return 'Platform is throttling';
    case 'unavailable':
      return "Can't be saved";
    case 'unsupported_url':
      return "SaveSama can't open this link";
    case 'network':
      return "Server couldn't reach the platform";
    case 'offline':
      return "Server isn't answering";
    case 'timeout':
      return 'Took too long';
    default:
      return 'Server error';
  }
}

/** DESIGN.md §13.6: pairing results. */
export function pairErrorCopy(err: unknown, hostPort: string): string {
  const code = err instanceof ApiError ? err.code : 'offline';
  switch (code) {
    case 'unauthorized':
      return "That key wasn't accepted. Copy it again from the server.";
    case 'not_savesama':
      return `Something answered at ${hostPort}, but it isn't a SaveSama server.`;
    case 'api_mismatch':
      return `That server speaks API ${err instanceof ApiError ? err.message : '?'}; this app needs API 1. Update the older one.`;
    default:
      return `No SaveSama server at ${hostPort}. Check it's running and on the same Wi-Fi.`;
  }
}

/** Commands for the in-app Termux guide. Must match docs/SERVER.md §1.2-1.4 exactly. */
export const GUIDE = {
  installPublic:
    'curl -fsSL https://raw.githubusercontent.com/FarazBukhari/savesama/rebuild/server-and-app/server/install-termux.sh | SAVESAMA_REF=rebuild/server-and-app bash',
  installPrivate:
    'pkg install -y gh git && gh auth login && gh auth setup-git && gh repo clone FarazBukhari/savesama ~/savesama -- -b rebuild/server-and-app && bash ~/savesama/server/install-termux.sh',
  start: 'savesama',
  pair: 'savesama pair',
  ffmpeg: 'pkg install ffmpeg',
};

export const FDROID_TERMUX = 'https://f-droid.org/packages/com.termux/';
export const SOURCE_URL = 'https://github.com/FarazBukhari/savesama';
