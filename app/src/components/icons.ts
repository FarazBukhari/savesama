import type { IconProps } from 'phosphor-react-native';
import type { FC } from 'react';

import { LinkIcon } from 'phosphor-react-native/src/icons/Link';
import { PulseIcon } from 'phosphor-react-native/src/icons/Pulse';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { HardDrivesIcon } from 'phosphor-react-native/src/icons/HardDrives';
import { GearIcon } from 'phosphor-react-native/src/icons/Gear';
import { YoutubeLogoIcon } from 'phosphor-react-native/src/icons/YoutubeLogo';
import { InstagramLogoIcon } from 'phosphor-react-native/src/icons/InstagramLogo';
import { TiktokLogoIcon } from 'phosphor-react-native/src/icons/TiktokLogo';
import { FacebookLogoIcon } from 'phosphor-react-native/src/icons/FacebookLogo';
import { RedditLogoIcon } from 'phosphor-react-native/src/icons/RedditLogo';
import { ThreadsLogoIcon } from 'phosphor-react-native/src/icons/ThreadsLogo';
import { ClipboardTextIcon } from 'phosphor-react-native/src/icons/ClipboardText';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { ShareNetworkIcon } from 'phosphor-react-native/src/icons/ShareNetwork';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { FilmStripIcon } from 'phosphor-react-native/src/icons/FilmStrip';
import { ImageSquareIcon } from 'phosphor-react-native/src/icons/ImageSquare';
import { MusicNotesIcon } from 'phosphor-react-native/src/icons/MusicNotes';
import { ClockCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { ProhibitIcon } from 'phosphor-react-native/src/icons/Prohibit';
import { LinkBreakIcon } from 'phosphor-react-native/src/icons/LinkBreak';
import { HourglassMediumIcon } from 'phosphor-react-native/src/icons/HourglassMedium';
import { CloudSlashIcon } from 'phosphor-react-native/src/icons/CloudSlash';
import { PlugsIcon } from 'phosphor-react-native/src/icons/Plugs';
import { PlugsConnectedIcon } from 'phosphor-react-native/src/icons/PlugsConnected';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { QrCodeIcon } from 'phosphor-react-native/src/icons/QrCode';
import { KeyboardIcon } from 'phosphor-react-native/src/icons/Keyboard';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { DesktopIcon } from 'phosphor-react-native/src/icons/Desktop';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { TerminalIcon } from 'phosphor-react-native/src/icons/Terminal';
import { ArrowSquareOutIcon } from 'phosphor-react-native/src/icons/ArrowSquareOut';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { DotsThreeVerticalIcon } from 'phosphor-react-native/src/icons/DotsThreeVertical';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { PauseIcon } from 'phosphor-react-native/src/icons/Pause';
import { VibrateIcon } from 'phosphor-react-native/src/icons/Vibrate';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';

export const icons = {
  Link: LinkIcon,
  Pulse: PulseIcon,
  Images: ImagesIcon,
  HardDrives: HardDrivesIcon,
  Gear: GearIcon,
  YoutubeLogo: YoutubeLogoIcon,
  InstagramLogo: InstagramLogoIcon,
  TiktokLogo: TiktokLogoIcon,
  FacebookLogo: FacebookLogoIcon,
  ThreadsLogo: ThreadsLogoIcon,
  RedditLogo: RedditLogoIcon,
  ClipboardText: ClipboardTextIcon,
  X: XIcon,
  ArrowCounterClockwise: ArrowCounterClockwiseIcon,
  ArrowsClockwise: ArrowsClockwiseIcon,
  ShareNetwork: ShareNetworkIcon,
  Trash: TrashIcon,
  Info: InfoIcon,
  MagnifyingGlass: MagnifyingGlassIcon,
  FilmStrip: FilmStripIcon,
  ImageSquare: ImageSquareIcon,
  MusicNotes: MusicNotesIcon,
  ClockCounterClockwise: ClockCounterClockwiseIcon,
  Lock: LockIcon,
  Prohibit: ProhibitIcon,
  LinkBreak: LinkBreakIcon,
  HourglassMedium: HourglassMediumIcon,
  CloudSlash: CloudSlashIcon,
  Plugs: PlugsIcon,
  PlugsConnected: PlugsConnectedIcon,
  WarningCircle: WarningCircleIcon,
  CheckCircle: CheckCircleIcon,
  QrCode: QrCodeIcon,
  Keyboard: KeyboardIcon,
  DeviceMobile: DeviceMobileIcon,
  Desktop: DesktopIcon,
  Copy: CopyIcon,
  Terminal: TerminalIcon,
  ArrowSquareOut: ArrowSquareOutIcon,
  ArrowLeft: ArrowLeftIcon,
  DotsThreeVertical: DotsThreeVerticalIcon,
  Camera: CameraIcon,
  Play: PlayIcon,
  Pause: PauseIcon,
  Vibrate: VibrateIcon,
  Plus: PlusIcon,
  Check: CheckIcon,
  CaretRight: CaretRightIcon,
  Eye: EyeIcon,
  EyeSlash: EyeSlashIcon,
  PencilSimple: PencilSimpleIcon,
} satisfies Record<string, FC<IconProps>>;

export type IconName = keyof typeof icons;
